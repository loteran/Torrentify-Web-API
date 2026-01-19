#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const axios = require('axios');
const qs = require('querystring');
const fg = require('fast-glob');
const stringSimilarity = require('string-similarity');

// ---------------------- CONFIG ----------------------
const DEST_DIR = '/data/torrent';
const CACHE_DIR = '/data/cache_tmdb';

// Hardlink mapping: source_prefix -> hardlink_dir
// Format: "/data/films:/data/hardlinks,/data/films2:/data/hardlinks2"
const HARDLINK_MAPPING = (() => {
  const mapping = process.env.HARDLINK_MAPPING || '';
  const result = [];
  if (mapping) {
    mapping.split(',').forEach(pair => {
      const [source, dest] = pair.split(':').map(s => s.trim());
      if (source && dest) {
        result.push({ source, dest });
      }
    });
  }
  return result;
})();

const ENABLE_FILMS = process.env.ENABLE_FILMS === 'true';
const ENABLE_SERIES = process.env.ENABLE_SERIES === 'true';
const ENABLE_ANIMES_FILMS = process.env.ENABLE_ANIMES_FILMS !== 'false';
const ENABLE_ANIMES_SERIES = process.env.ENABLE_ANIMES_SERIES !== 'false';
const ENABLE_JEUX = process.env.ENABLE_JEUX === 'true';

const MEDIA_CONFIG = [
  // Films
  ENABLE_FILMS && {
    name: 'films',
    source: '/data/films',
    dest: path.join(DEST_DIR, 'films'),
    type: 'movie'
  },
  ENABLE_FILMS && fs.existsSync('/data/films2') && {
    name: 'films',
    source: '/data/films2',
    dest: path.join(DEST_DIR, 'films'),
    type: 'movie'
  },
  // Séries
  ENABLE_SERIES && {
    name: 'series',
    source: '/data/series',
    dest: path.join(DEST_DIR, 'series'),
    type: 'tv'
  },
  ENABLE_SERIES && fs.existsSync('/data/series2') && {
    name: 'series',
    source: '/data/series2',
    dest: path.join(DEST_DIR, 'series'),
    type: 'tv'
  },
  // Animes Films
  ENABLE_ANIMES_FILMS && fs.existsSync('/data/Animes_films') && {
    name: 'animes_films',
    source: '/data/Animes_films',
    dest: path.join(DEST_DIR, 'animes_films'),
    type: 'movie'
  },
  ENABLE_ANIMES_FILMS && fs.existsSync('/data/Animes_films2') && {
    name: 'animes_films',
    source: '/data/Animes_films2',
    dest: path.join(DEST_DIR, 'animes_films'),
    type: 'movie'
  },
  // Animes Séries
  ENABLE_ANIMES_SERIES && fs.existsSync('/data/Animes_series') && {
    name: 'animes_series',
    source: '/data/Animes_series',
    dest: path.join(DEST_DIR, 'animes_series'),
    type: 'tv'
  },
  ENABLE_ANIMES_SERIES && fs.existsSync('/data/Animes_series2') && {
    name: 'animes_series',
    source: '/data/Animes_series2',
    dest: path.join(DEST_DIR, 'animes_series'),
    type: 'tv'
  },
  // Jeux
  ENABLE_JEUX && fs.existsSync('/data/jeux') && {
    name: 'jeux',
    source: '/data/jeux',
    dest: path.join(DEST_DIR, 'jeux'),
    type: 'game'
  },
  ENABLE_JEUX && fs.existsSync('/data/jeux2') && {
    name: 'jeux',
    source: '/data/jeux2',
    dest: path.join(DEST_DIR, 'jeux'),
    type: 'game'
  }
].filter(Boolean);

const TRACKERS = (process.env.TRACKERS || '').split(',').map(t => t.trim()).filter(Boolean);
const TMDB_API_KEY = process.env.TMDB_API_KEY;
const PARALLEL_JOBS = Math.max(1, parseInt(process.env.PARALLEL_JOBS || '1', 10));

if (!TRACKERS.length) {
  console.error('❌ Aucun tracker défini');
  process.exit(1);
}
if (!TMDB_API_KEY) {
  console.error('❌ TMDB_API_KEY non défini');
  process.exit(1);
}
if (!MEDIA_CONFIG.length) {
  console.error('❌ Aucun type de média activé (ENABLE_FILMS / ENABLE_SERIES)');
  process.exit(1);
}

const VIDEO_EXT = ['mkv','mp4','avi','mov','flv','wmv','m4v'];
const GAME_EXT = ['iso','bin','cue','img','nrg','mdf','mds','ccd','sub','exe','sfc','smc','nes','gb','gba','gbc','gg','n64','z64','nds','3ds','cia','xci','nsp','gcm','wbfs','wad','rvz','chd','pbp','pkg','vpk','rom','zip','7z','rar'];
if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });

// ---------------------- STATS ----------------------
let processed = 0;
let skipped = 0;
let tmdbFound = 0;
let tmdbMissing = 0;
const startTime = Date.now();

// ---------------------- UTIL ----------------------
const safeName = name => name.replace(/ /g, '.');
const cleanTitle = title => title.replace(/[^a-zA-Z0-9 ]/g, '').trim();
const fileExistsAndNotEmpty = (filePath) => {
  try {
    const stats = fs.statSync(filePath);
    return stats.size > 0;
  } catch {
    return false;
  }
};

function execAsync(cmd, args = []) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    let err = '';

    p.stdout.on('data', d => out += d);
    p.stderr.on('data', d => err += d);

    p.on('close', code => {
      if (code === 0) resolve(out);
      else reject(new Error(err || `Commande échouée: ${cmd}`));
    });
  });
}

function formatDuration(ms) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m ${s % 60}s`;
}

/**
 * Find the hardlink directory for a given source path
 * @param {string} sourcePath - Source file path
 * @returns {string|null} - Hardlink directory or null if not found
 */
function getHardlinkDir(sourcePath) {
  for (const mapping of HARDLINK_MAPPING) {
    if (sourcePath.startsWith(mapping.source)) {
      return mapping.dest;
    }
  }
  return null;
}

/**
 * Create hard links for files in a directory, preserving subdirectory structure
 * @param {string} torrentName - Name of the torrent (will be the folder name)
 * @param {object[]} files - Array of file objects with path property
 * @param {function} log - Logging function
 * @param {string} sourceBaseDir - Base directory to calculate relative paths from (optional)
 * @returns {string|null} - Path to hardlink directory or null if disabled
 */
function createHardLinks(torrentName, files, log = console.log, sourceBaseDir = null) {
  if (HARDLINK_MAPPING.length === 0 || files.length === 0) {
    return null;
  }

  // Determine hardlink directory based on first file's source path
  const hardlinkBaseDir = getHardlinkDir(files[0].path);
  if (!hardlinkBaseDir) {
    log(`⚠️ Pas de mapping hardlink pour: ${files[0].path}`, 'warn');
    return null;
  }

  const hardlinkFolder = path.join(hardlinkBaseDir, torrentName);

  // If no sourceBaseDir provided, find common parent directory
  if (!sourceBaseDir) {
    // Find the common parent directory of all files
    const dirs = files.map(f => path.dirname(f.path));
    sourceBaseDir = dirs.reduce((common, dir) => {
      while (!dir.startsWith(common)) {
        common = path.dirname(common);
      }
      return common;
    }, dirs[0]);
  }

  try {
    // Create the hardlink folder
    if (!fs.existsSync(hardlinkFolder)) {
      fs.mkdirSync(hardlinkFolder, { recursive: true });
      log(`📁 Dossier hardlinks créé: ${hardlinkFolder}`);
    }

    let created = 0;
    let skipped = 0;

    for (const file of files) {
      const sourcePath = file.path;
      // Calculate relative path from source base directory to preserve structure
      const relativePath = path.relative(sourceBaseDir, sourcePath);
      const destPath = path.join(hardlinkFolder, relativePath);
      const destDir = path.dirname(destPath);

      try {
        // Create subdirectory structure if needed
        if (!fs.existsSync(destDir)) {
          fs.mkdirSync(destDir, { recursive: true });
        }

        if (fs.existsSync(destPath)) {
          // Check if it's already a hardlink to the same file
          const sourceStats = fs.statSync(sourcePath);
          const destStats = fs.statSync(destPath);
          if (sourceStats.ino === destStats.ino) {
            skipped++;
            continue;
          }
          // Remove existing file if different
          fs.unlinkSync(destPath);
        }

        // Create hard link
        fs.linkSync(sourcePath, destPath);
        created++;
      } catch (linkError) {
        log(`⚠️ Impossible de créer le hardlink pour ${relativePath}: ${linkError.message}`, 'warn');
      }
    }

    log(`🔗 Hardlinks créés: ${created} nouveaux, ${skipped} existants dans ${hardlinkFolder}`);
    return hardlinkFolder;

  } catch (error) {
    log(`❌ Erreur création hardlinks: ${error.message}`, 'error');
    return null;
  }
}

async function runPythonGuessit(filePath) {
  try {
    // Use venv python where guessit is installed
    const pythonPath = '/opt/venv/bin/python3';
    const out = await execAsync(pythonPath, ['-c', `
import json
from guessit import guessit
f = guessit("${filePath}")
print(json.dumps({'title': f.get('title',''), 'year': f.get('year','')}))
    `]);
    return JSON.parse(out);
  } catch (e) {
    console.error('Guessit error:', e.message);
    return { title: path.parse(filePath).name, year: '' };
  }
}

async function searchTMDb(title, year, language) {
  const query = qs.escape(cleanTitle(title));
  const url = `https://api.themoviedb.org/3/search/movie?api_key=${TMDB_API_KEY}&query=${query}&language=${language}`;

  try {
    const res = await axios.get(url);
    if (!res.data.results?.length) return null;

    let results = res.data.results;
    if (year) {
      const filtered = results.filter(r => r.release_date?.startsWith(year.toString()));
      if (filtered.length) results = filtered;
    }

    let best = null;
    let bestScore = 0;

    for (const r of results) {
      const score = stringSimilarity.compareTwoStrings(
        cleanTitle(title).toLowerCase(),
        (r.title || '').toLowerCase()
      );
      if (score > bestScore) {
        best = r;
        bestScore = score;
      }
    }
    return best;
  } catch {
    return null;
  }
}

async function getCachedMovie(title, year, language) {
  const key = safeName(`${title}_${year}_${language}`).toLowerCase();
  const file = path.join(CACHE_DIR, key + '.json');

  if (fs.existsSync(file)) {
    try { return JSON.parse(fs.readFileSync(file)); } catch {}
  }

  const movie = await searchTMDb(title, year, language);
  if (movie) fs.writeFileSync(file, JSON.stringify(movie, null, 2));
  return movie;
}

function getMktorrentL(file) {
  const size = fs.statSync(file).size;
  if (size < 512 * 1024 * 1024) return 20;
  if (size < 1 * 1024 ** 3) return 21;
  if (size < 2 * 1024 ** 3) return 22;
  if (size < 4 * 1024 ** 3) return 23;
  return 24;
}

// ---------------------- PROCESS ----------------------
async function processFile(file, index, total, destBase) {
  const nameNoExt = path.parse(file).name;
  const safeFolder = safeName(nameNoExt);
  const outDir = path.join(destBase, safeFolder);

  const nfo = path.join(outDir, `${safeFolder}.nfo`);
  const torrent = path.join(outDir, `${safeFolder}.torrent`);
  const txt = path.join(outDir, `${safeFolder}.txt`);

  if (fileExistsAndNotEmpty(nfo) && fileExistsAndNotEmpty(torrent) && fileExistsAndNotEmpty(txt)) {
    skipped++;
    console.log(`⏭️ Déjà traité : ${path.basename(file)}`);
    return;
  }

  console.log(`📊 Traitement ${index}/${total} → ${path.basename(file)}`);

  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  if (!fileExistsAndNotEmpty(nfo)) {
    let mediadata = await execAsync('mediainfo', [file]);
    mediadata = mediadata.replace(
      /^Complete name\s*:.*$/m,
      `Complete name : ${path.basename(file)}`
    );

    fs.writeFileSync(nfo, `
============================================================
Release Name : ${nameNoExt}
Added On    : ${new Date().toISOString().replace('T',' ').split('.')[0]}
============================================================

${mediadata}

============================================================
Generated by torrentify
============================================================
`.trim());
  }

  if (!fileExistsAndNotEmpty(torrent)) {
    // Remove empty torrent file if exists
    if (fs.existsSync(torrent)) fs.unlinkSync(torrent);

    console.log(`🔧 Création du torrent (peut prendre plusieurs minutes)...`);
    const trackers = TRACKERS.flatMap(t => ['-a', t]);
    await execAsync('mktorrent', [
      '-l', getMktorrentL(file).toString(),
      '-p',
      ...trackers,
      '-o', torrent,
      file
    ]);
    console.log(`✅ Torrent créé`);
  }

  if (!fileExistsAndNotEmpty(txt)) {
    const guess = await runPythonGuessit(file);

    const movie =
      await getCachedMovie(guess.title, guess.year, 'en-US') ||
      await getCachedMovie(guess.title, guess.year, 'fr-FR') ||
      await getCachedMovie(guess.title, '', 'en-US');

    if (movie?.id) {
      tmdbFound++;
      fs.writeFileSync(txt, `ID TMDB : ${movie.id}\n`);
    } else {
      tmdbMissing++;
      fs.writeFileSync(txt, `TMDb non trouvé\n`);
      console.log(`⚠️ TMDb non trouvé : ${guess.title}`);
    }
  }

  processed++;
}

// ---------------------- PARALLEL ----------------------
async function runWithLimit(files, limit, destBase) {
  let index = 0;
  const running = new Set();

  for (const file of files) {
    index++;
    const p = processFile(file, index, files.length, destBase);
    running.add(p);
    p.finally(() => running.delete(p));

    if (running.size >= limit) {
      await Promise.race(running);
    }
  }
  await Promise.all(running);
}

// ---------------------- NEW MODULE FUNCTIONS ----------------------

/**
 * Check if a file has already been processed
 */
function checkProcessingStatus(filePath, destBase) {
  const nameNoExt = path.parse(filePath).name;
  const safeFolder = safeName(nameNoExt);
  const outDir = path.join(destBase, safeFolder);

  const nfo = path.join(outDir, `${safeFolder}.nfo`);
  const torrent = path.join(outDir, `${safeFolder}.torrent`);
  const txt = path.join(outDir, `${safeFolder}.txt`);

  return {
    outputDir: outDir,
    hasNfo: fileExistsAndNotEmpty(nfo),
    hasTorrent: fileExistsAndNotEmpty(torrent),
    hasTxt: fileExistsAndNotEmpty(txt),
    isProcessed: fileExistsAndNotEmpty(nfo) && fileExistsAndNotEmpty(torrent) && fileExistsAndNotEmpty(txt)
  };
}

/**
 * Get all video files with their processing status
 */
async function getVideoFiles() {
  const results = { films: [], series: [], animes_films: [], animes_series: [], jeux: [] };

  for (const media of MEDIA_CONFIG) {
    // Utiliser les bonnes extensions selon le type de média
    const extensions = media.type === 'game' ? GAME_EXT : VIDEO_EXT;
    const files = await fg(extensions.map(e => `${media.source}/**/*.${e}`));

    const filesWithStatus = files.map(file => {
      const stats = fs.statSync(file);
      const status = checkProcessingStatus(file, media.dest);

      return {
        id: Buffer.from(file).toString('base64'),
        path: file,
        name: path.basename(file),
        size: stats.size,
        lastModified: stats.mtime.toISOString(),
        type: media.name,
        ...status
      };
    });

    // Append to existing array (for multiple sources like films + films2)
    if (!results[media.name]) {
      results[media.name] = [];
    }
    results[media.name] = results[media.name].concat(filesWithStatus);
  }

  return results;
}

/**
 * Process specific files with progress callback
 * @param {string[]} filePaths - Array of file paths to process
 * @param {function} progressCallback - Callback for progress updates
 * @returns {Promise<object>} - Processing statistics
 */
async function processFiles(filePaths, progressCallback = null) {
  const localProcessed = [];
  const localSkipped = [];
  const localTmdbFound = [];
  const localTmdbMissing = [];
  const localErrors = [];
  const localStartTime = Date.now();

  const log = (message, level = 'info') => {
    console.log(message);
    if (progressCallback) {
      progressCallback({ type: 'log', message, level, timestamp: new Date().toISOString() });
    }
  };

  const updateProgress = (current, total, currentFile) => {
    if (progressCallback) {
      progressCallback({
        type: 'progress',
        current,
        total,
        currentFile,
        timestamp: new Date().toISOString()
      });
    }
  };

  // Process each file
  let index = 0;
  for (const file of filePaths) {
    index++;

    try {
      // Find the correct destination base for this file
      let destBase = null;
      for (const media of MEDIA_CONFIG) {
        if (file.startsWith(media.source)) {
          destBase = media.dest;
          break;
        }
      }

      if (!destBase) {
        log(`⚠️ Impossible de déterminer le type pour : ${path.basename(file)}`, 'warn');
        localSkipped.push(file);
        continue;
      }

      const nameNoExt = path.parse(file).name;
      const safeFolder = safeName(nameNoExt);
      const outDir = path.join(destBase, safeFolder);

      const nfo = path.join(outDir, `${safeFolder}.nfo`);
      const torrent = path.join(outDir, `${safeFolder}.torrent`);
      const txt = path.join(outDir, `${safeFolder}.txt`);

      if (fileExistsAndNotEmpty(nfo) && fileExistsAndNotEmpty(torrent) && fileExistsAndNotEmpty(txt)) {
        localSkipped.push(file);
        log(`⏭️ Déjà traité : ${path.basename(file)}`);
        updateProgress(index, filePaths.length, path.basename(file));
        continue;
      }

      log(`📊 Traitement ${index}/${filePaths.length} → ${path.basename(file)}`);
      updateProgress(index, filePaths.length, path.basename(file));

      if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

      if (!fileExistsAndNotEmpty(nfo)) {
        let mediadata = await execAsync('mediainfo', [file]);
        mediadata = mediadata.replace(
          /^Complete name\s*:.*$/m,
          `Complete name : ${path.basename(file)}`
        );

        fs.writeFileSync(nfo, `
============================================================
Release Name : ${nameNoExt}
Added On    : ${new Date().toISOString().replace('T',' ').split('.')[0]}
============================================================

${mediadata}

============================================================
Generated by torrentify
============================================================
`.trim());
      }

      if (!fileExistsAndNotEmpty(torrent)) {
        // Remove empty torrent file if exists
        if (fs.existsSync(torrent)) fs.unlinkSync(torrent);

        log(`🔧 Création du torrent (peut prendre plusieurs minutes)...`);
        const trackers = TRACKERS.flatMap(t => ['-a', t]);
        await execAsync('mktorrent', [
          '-l', getMktorrentL(file).toString(),
          '-p',
          ...trackers,
          '-o', torrent,
          file
        ]);
        log(`✅ Torrent créé`);
      }

      if (!fileExistsAndNotEmpty(txt)) {
        const guess = await runPythonGuessit(file);

        const movie =
          await getCachedMovie(guess.title, guess.year, 'en-US') ||
          await getCachedMovie(guess.title, guess.year, 'fr-FR') ||
          await getCachedMovie(guess.title, '', 'en-US');

        if (movie?.id) {
          localTmdbFound.push(file);
          fs.writeFileSync(txt, `ID TMDB : ${movie.id}\n`);
          log(`🎬 TMDb trouvé : ${guess.title}`);
        } else {
          localTmdbMissing.push(file);
          fs.writeFileSync(txt, `TMDb non trouvé\n`);
          log(`⚠️ TMDb non trouvé : ${guess.title}`, 'warn');
        }
      }

      localProcessed.push(file);

      // Notify file status change
      if (progressCallback) {
        progressCallback({
          type: 'file:status',
          file,
          status: 'completed',
          outputs: {
            hasNfo: fs.existsSync(nfo),
            hasTorrent: fs.existsSync(torrent),
            hasTxt: fs.existsSync(txt)
          }
        });
      }

    } catch (error) {
      log(`❌ Erreur lors du traitement de ${path.basename(file)}: ${error.message}`, 'error');
      localErrors.push({ file, error: error.message });
    }
  }

  const totalTime = Date.now() - localStartTime;

  const summary = {
    processed: localProcessed.length,
    skipped: localSkipped.length,
    tmdbFound: localTmdbFound.length,
    tmdbMissing: localTmdbMissing.length,
    errors: localErrors.length,
    duration: totalTime,
    errorDetails: localErrors
  };

  log('\n📊 Résumé du traitement');
  log('==============================');
  log(`🎞️ Traités           : ${summary.processed}`);
  log(`⏭️ Déjà existants     : ${summary.skipped}`);
  log(`🎬 TMDb trouvés       : ${summary.tmdbFound}`);
  log(`⚠️ TMDb manquants     : ${summary.tmdbMissing}`);
  log(`❌ Erreurs            : ${summary.errors}`);
  log(`⏱️ Temps total        : ${formatDuration(totalTime)}`);
  log('==============================');

  if (progressCallback) {
    progressCallback({ type: 'complete', summary });
  }

  return summary;
}

/**
 * Format file size in human readable format
 */
function formatSize(bytes) {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = bytes;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }
  return `${size.toFixed(2)} ${units[unitIndex]}`;
}

/**
 * Scan all files in a directory recursively
 * @param {string} dirPath - Directory path to scan
 * @returns {Promise<object[]>} - Array of file objects with path, name, size, relativePath
 */
async function scanAllFilesInDirectory(dirPath) {
  const files = [];

  const scanDir = (currentPath, relativePath = '') => {
    const entries = fs.readdirSync(currentPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(currentPath, entry.name);
      const relPath = relativePath ? path.join(relativePath, entry.name) : entry.name;

      if (entry.isDirectory()) {
        scanDir(fullPath, relPath);
      } else if (entry.isFile()) {
        const stats = fs.statSync(fullPath);
        files.push({
          path: fullPath,
          name: entry.name,
          relativePath: relPath,
          size: stats.size
        });
      }
    }
  };

  scanDir(dirPath);
  return files;
}

/**
 * Get mktorrent piece size for a directory (based on total size)
 */
function getMktorrentLForDir(totalSize) {
  if (totalSize < 512 * 1024 * 1024) return 20;
  if (totalSize < 1 * 1024 ** 3) return 21;
  if (totalSize < 2 * 1024 ** 3) return 22;
  if (totalSize < 4 * 1024 ** 3) return 23;
  if (totalSize < 8 * 1024 ** 3) return 24;
  return 25; // For very large directories
}

/**
 * Process a directory as a single torrent with synthetic NFO
 * @param {string} dirPath - Directory path
 * @param {object[]} files - Array of file objects in the directory
 * @param {function} progressCallback - Callback for progress updates
 * @param {string} customTorrentName - Optional custom name for the torrent
 * @returns {Promise<object>} - Processing result
 */
async function processDirectory(dirPath, files, progressCallback = null, customTorrentName = null) {
  const dirName = path.basename(dirPath);
  // Use custom torrent name if provided, otherwise use directory name
  const torrentName = customTorrentName || dirName;
  const safeFolder = safeName(torrentName);

  // Find the correct destination base for this directory
  let destBase = null;
  let mediaType = null;
  for (const media of MEDIA_CONFIG) {
    if (dirPath.startsWith(media.source)) {
      destBase = media.dest;
      mediaType = media.type;
      break;
    }
  }

  if (!destBase) {
    throw new Error(`Cannot determine media type for directory: ${dirPath}`);
  }

  const outDir = path.join(destBase, safeFolder);
  const nfo = path.join(outDir, `${safeFolder}.nfo`);
  const torrent = path.join(outDir, `${safeFolder}.torrent`);
  const txt = path.join(outDir, `${safeFolder}.txt`);

  const log = (message, level = 'info') => {
    console.log(message);
    if (progressCallback) {
      progressCallback({ type: 'log', message, level, timestamp: new Date().toISOString() });
    }
  };

  const startTime = Date.now();

  // Check if already processed
  if (fileExistsAndNotEmpty(nfo) && fileExistsAndNotEmpty(torrent) && fileExistsAndNotEmpty(txt)) {
    log(`⏭️ Répertoire déjà traité : ${dirName}`);
    return { skipped: true, dirPath, dirName };
  }

  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  // For games, scan ALL files in the directory (not just game extensions)
  let allFiles;
  if (mediaType === 'game') {
    log(`🎮 Scan de tous les fichiers du répertoire jeu : ${dirName}`);
    allFiles = await scanAllFilesInDirectory(dirPath);
    log(`📁 Traitement du répertoire : ${dirName} (${allFiles.length} fichiers)`);
  } else {
    allFiles = files.map(f => ({
      ...f,
      relativePath: f.name
    }));
    log(`📁 Traitement du répertoire : ${dirName} (${allFiles.length} fichiers)`);
  }

  // Sort files by relative path for consistent order
  const sortedFiles = [...allFiles].sort((a, b) =>
    (a.relativePath || a.name).localeCompare(b.relativePath || b.name, 'fr')
  );

  // Calculate total size
  const totalSize = sortedFiles.reduce((sum, f) => sum + (f.size || 0), 0);

  // 1. Create synthetic NFO
  if (!fileExistsAndNotEmpty(nfo)) {
    log(`📝 Création du NFO synthétique...`);

    // Get mediainfo from first file for technical details
    let firstFileMediainfo = '';
    if (sortedFiles.length > 0) {
      try {
        firstFileMediainfo = await execAsync('mediainfo', [sortedFiles[0].path]);
        // Clean up the complete name
        firstFileMediainfo = firstFileMediainfo.replace(
          /^Complete name\s*:.*$/m,
          `Complete name : ${sortedFiles[0].name}`
        );
      } catch (e) {
        log(`⚠️ Impossible d'obtenir mediainfo: ${e.message}`, 'warn');
      }
    }

    // Build file list (use relativePath for games to show directory structure)
    const fileList = sortedFiles.map((f, i) => {
      const num = String(i + 1).padStart(2, ' ');
      const displayName = f.relativePath || f.name;
      const size = formatSize(f.size || 0).padStart(10, ' ');
      const dots = Math.max(3, 70 - displayName.length);
      return `  ${num}. ${displayName} ${'.'.repeat(dots)} ${size}`;
    }).join('\n');

    const nfoContent = `
================================================================================
                    ${torrentName.toUpperCase()}
================================================================================

📁 Contenu du répertoire:
--------------------------------------------------------------------------------
${fileList}
--------------------------------------------------------------------------------
  Total: ${sortedFiles.length} fichiers | ${formatSize(totalSize)}

📺 Informations média (basées sur le premier fichier):
--------------------------------------------------------------------------------
${firstFileMediainfo || '  Informations non disponibles'}

📅 Date d'ajout: ${new Date().toISOString().replace('T', ' ').split('.')[0]}
================================================================================
Generated by torrentify
================================================================================
`.trim();

    fs.writeFileSync(nfo, nfoContent);
    log(`✅ NFO synthétique créé`);
  }

  // 2. Create single torrent for the directory
  if (!fileExistsAndNotEmpty(torrent)) {
    if (fs.existsSync(torrent)) fs.unlinkSync(torrent);

    log(`🔧 Création du torrent pour le répertoire (${formatSize(totalSize)})...`);
    log(`📛 Nom du torrent: ${torrentName}`);
    const trackers = TRACKERS.flatMap(t => ['-a', t]);

    await execAsync('mktorrent', [
      '-l', getMktorrentLForDir(totalSize).toString(),
      '-p',
      '-n', torrentName,  // Custom name for the torrent content (for Transmission path)
      ...trackers,
      '-o', torrent,
      dirPath
    ]);
    log(`✅ Torrent créé`);

    // 2.5 Create hard links for Transmission seeding (preserve directory structure)
    createHardLinks(torrentName, sortedFiles, log, dirPath);
  }

  // 3. Create TMDB txt file (skip for games)
  if (!fileExistsAndNotEmpty(txt)) {
    if (mediaType === 'game') {
      // Pour les jeux, pas de recherche TMDB
      fs.writeFileSync(txt, `Type: Jeu\nNom: ${torrentName}\n`);
      log(`🎮 Jeu détecté - pas de recherche TMDB`);
    } else {
      // Try to guess series name from directory
      const guess = await runPythonGuessit(dirPath);

      // Search for TV show (not movie)
      let found = null;
      const searchTv = async (title, year, lang) => {
        const query = qs.escape(cleanTitle(title));
        const url = `https://api.themoviedb.org/3/search/tv?api_key=${TMDB_API_KEY}&query=${query}&language=${lang}`;
        try {
          const res = await axios.get(url);
          if (!res.data.results?.length) return null;
          let results = res.data.results;
          if (year) {
            const filtered = results.filter(r => r.first_air_date?.startsWith(year.toString()));
            if (filtered.length) results = filtered;
          }
          let best = null;
          let bestScore = 0;
          for (const r of results) {
            const score = stringSimilarity.compareTwoStrings(
              cleanTitle(title).toLowerCase(),
              (r.name || '').toLowerCase()
            );
            if (score > bestScore) {
              best = r;
              bestScore = score;
            }
          }
          return best;
        } catch {
          return null;
        }
      };

      found = await searchTv(guess.title, guess.year, 'en-US') ||
              await searchTv(guess.title, guess.year, 'fr-FR') ||
              await searchTv(guess.title, '', 'en-US');

      if (found?.id) {
        fs.writeFileSync(txt, `ID TMDB (TV): ${found.id}\nNom: ${found.name || guess.title}\n`);
        log(`🎬 TMDb trouvé : ${found.name || guess.title}`);
      } else {
        fs.writeFileSync(txt, `TMDb non trouvé\nRecherche: ${guess.title}\n`);
        log(`⚠️ TMDb non trouvé : ${guess.title}`, 'warn');
      }
    }
  }

  const duration = Date.now() - startTime;

  const result = {
    skipped: false,
    dirPath,
    dirName,
    filesCount: sortedFiles.length,
    totalSize,
    outputs: {
      nfo,
      torrent,
      txt
    },
    duration
  };

  if (progressCallback) {
    progressCallback({
      type: 'directory:status',
      ...result
    });
  }

  log(`✅ Répertoire traité en ${formatDuration(duration)}`);

  return result;
}

/**
 * Process multiple directories
 * @param {object[]} directories - Array of directory objects with path and files
 * @param {function} progressCallback - Callback for progress updates
 * @returns {Promise<object>} - Processing statistics
 */
async function processDirectories(directories, progressCallback = null) {
  const results = [];
  const errors = [];
  const startTime = Date.now();

  const log = (message, level = 'info') => {
    console.log(message);
    if (progressCallback) {
      progressCallback({ type: 'log', message, level, timestamp: new Date().toISOString() });
    }
  };

  log(`📁 Traitement de ${directories.length} répertoire(s)...`);

  for (let i = 0; i < directories.length; i++) {
    const dir = directories[i];

    if (progressCallback) {
      progressCallback({
        type: 'progress',
        current: i + 1,
        total: directories.length,
        currentFile: dir.name,
        timestamp: new Date().toISOString()
      });
    }

    try {
      const result = await processDirectory(dir.path, dir.files, progressCallback, dir.customTorrentName);
      results.push(result);
    } catch (error) {
      log(`❌ Erreur pour ${dir.name}: ${error.message}`, 'error');
      errors.push({ directory: dir.path, error: error.message });
    }
  }

  const totalTime = Date.now() - startTime;

  const summary = {
    processed: results.filter(r => !r.skipped).length,
    skipped: results.filter(r => r.skipped).length,
    errors: errors.length,
    duration: totalTime,
    errorDetails: errors
  };

  log('\n📊 Résumé du traitement répertoires');
  log('==============================');
  log(`📁 Traités           : ${summary.processed}`);
  log(`⏭️ Déjà existants     : ${summary.skipped}`);
  log(`❌ Erreurs            : ${summary.errors}`);
  log(`⏱️ Temps total        : ${formatDuration(totalTime)}`);
  log('==============================');

  if (progressCallback) {
    progressCallback({ type: 'complete', summary });
  }

  return summary;
}

// ---------------------- MODULE EXPORTS ----------------------
module.exports = {
  // Functions
  getVideoFiles,
  processFiles,
  processDirectory,
  processDirectories,
  checkProcessingStatus,

  // Utilities (for advanced usage)
  runPythonGuessit,
  getCachedMovie,
  searchTMDb,

  // Configuration
  CONFIG: {
    DEST_DIR,
    CACHE_DIR,
    VIDEO_EXT,
    MEDIA_CONFIG,
    TRACKERS,
    PARALLEL_JOBS
  }
};

// ---------------------- MAIN (CLI MODE) ----------------------
// Only run if executed directly (not imported as module)
if (require.main === module) {
  (async () => {
    for (const media of MEDIA_CONFIG) {
      const files = await fg(VIDEO_EXT.map(e => `${media.source}/**/*.${e}`));

      if (!files.length) {
        console.log(`ℹ️ Aucun fichier ${media.name} à traiter`);
        continue;
      }

      console.log(
        PARALLEL_JOBS === 1
          ? `▶️ ${media.name} : mode séquentiel`
          : `⚡ ${media.name} : mode parallèle (${PARALLEL_JOBS} jobs)`
      );

      await runWithLimit(files, PARALLEL_JOBS, media.dest);
    }

    const totalTime = Date.now() - startTime;

    console.log('\n📊 Résumé final');
    console.log('==============================');
    console.log(`🎞️ Traités           : ${processed}`);
    console.log(`⏭️ Déjà existants     : ${skipped}`);
    console.log(`🎬 TMDb trouvés       : ${tmdbFound}`);
    console.log(`⚠️ TMDb manquants     : ${tmdbMissing}`);
    console.log(`⏱️ Temps total        : ${formatDuration(totalTime)}`);
    console.log('==============================');
  })();
}
