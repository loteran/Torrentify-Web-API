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

// Vérifications obligatoires uniquement en mode CLI (pas quand importé comme module)
const IS_CLI_MODE = require.main === module;

if (IS_CLI_MODE) {
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
} else {
  // Mode module : avertissements seulement
  if (!TRACKERS.length) {
    console.warn('⚠️  TRACKERS non configuré - le traitement des torrents sera désactivé');
  }
  if (!TMDB_API_KEY) {
    console.warn('⚠️  TMDB_API_KEY non configuré - la recherche TMDb sera désactivée');
  }
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


// Utility function to set permissions and ownership for files/directories
function setPermissions(filePath) {
  try {
    fs.chmodSync(filePath, 0o777);
    fs.chownSync(filePath, 1000, 1000); // pi:pi
  } catch (err) {
    // Silently fail if not running as root or if permissions cannot be changed
  }
}

// ---------------------- AATM NAMING FUNCTIONS ----------------------

/**
 * Extract video/audio codecs from file using mediainfo
 * @param {string} filePath - Path to media file
 * @returns {object} - Object with codec, audio, audioChannels
 */
async function extractMediaCodecs(filePath) {
  const result = { codec: '', audio: '', audioChannels: '' };

  try {
    // Extract video codec
    const videoFormat = await execAsync('mediainfo', ['--Output=Video;%Format%', filePath]);
    const videoCodec = videoFormat.trim().split('\n')[0]; // Take first video track
    if (videoCodec) {
      // Map mediainfo format to scene naming
      const vc = videoCodec.toUpperCase();
      if (vc === 'AVC' || vc === 'H.264' || vc === 'H264') {
        result.codec = 'x264';
      } else if (vc === 'HEVC' || vc === 'H.265' || vc === 'H265') {
        result.codec = 'x265';
      } else if (vc === 'VP9') {
        result.codec = 'VP9';
      } else if (vc === 'AV1') {
        result.codec = 'AV1';
      } else {
        result.codec = videoCodec;
      }
    }

    // Extract audio codec and channels (first audio track)
    const audioInfo = await execAsync('mediainfo', ['--Output=Audio;%Format%|%Channels%\\n', filePath]);
    const firstAudioTrack = audioInfo.trim().split('\n')[0];
    if (firstAudioTrack && firstAudioTrack.includes('|')) {
      const [audioFormat, channels] = firstAudioTrack.split('|');

      // Map audio codec
      if (audioFormat) {
        const af = audioFormat.toUpperCase().trim();
        if (af === 'E-AC-3' || af === 'EAC3') {
          result.audio = 'DDP';
        } else if (af === 'AC-3' || af === 'AC3') {
          result.audio = 'AC3';
        } else if (af === 'AAC' || af.startsWith('AAC')) {
          result.audio = 'AAC';
        } else if (af === 'DTS') {
          result.audio = 'DTS';
        } else if (af === 'DTS-HD' || af.includes('DTS-HD MA')) {
          result.audio = 'DTS-HD.MA';
        } else if (af === 'TRUEHD' || af === 'MLP FBA') {
          result.audio = 'TrueHD';
        } else if (af === 'FLAC') {
          result.audio = 'FLAC';
        } else if (af === 'OPUS') {
          result.audio = 'OPUS';
        } else if (af === 'VORBIS') {
          result.audio = 'Vorbis';
        } else if (af === 'MP3' || af === 'MPEG AUDIO') {
          result.audio = 'MP3';
        } else {
          result.audio = audioFormat.trim();
        }
      }

      // Map channels
      if (channels) {
        const ch = parseInt(channels.trim(), 10);
        if (ch === 1) result.audioChannels = '1.0';
        else if (ch === 2) result.audioChannels = '2.0';
        else if (ch === 6) result.audioChannels = '5.1';
        else if (ch === 8) result.audioChannels = '7.1';
        else if (ch > 0) result.audioChannels = `${ch - 1}.1`;
      }
    }
  } catch (e) {
    // Silently fail - mediainfo might not work on all files
  }

  return result;
}

/**
 * Extract full media info using guessit
 * @param {string} filePath - Path to analyze
 * @returns {object} - Media info object
 */
async function extractFullMediaInfo(filePath) {
  try {
    const pythonPath = '/opt/venv/bin/python3';
    const out = await execAsync(pythonPath, ['-c', `
import json
from guessit import guessit
info = guessit("${filePath.replace(/"/g, '\\"')}")
result = {
    'title': info.get('title', ''),
    'year': str(info.get('year', '')) if info.get('year') else '',
    'season': 'S' + str(info.get('season', '')).zfill(2) if info.get('season') else '',
    'episode': 'E' + str(info.get('episode', '')).zfill(2) if info.get('episode') else '',
    'resolution': info.get('screen_size', ''),
    'source': info.get('source', ''),
    'codec': info.get('video_codec', ''),
    'audio': info.get('audio_codec', ''),
    'audioChannels': info.get('audio_channels', ''),
    'language': 'MULTI' if isinstance(info.get('language'), list) and len(info.get('language', [])) > 1 else (str(info.get('language', '')).upper() if info.get('language') else ''),
    'releaseGroup': info.get('release_group', ''),
    'hdr': [],
    'edition': info.get('edition', ''),
    'imax': 'imax' in str(info).lower()
}

# Fix: If release_group looks like a resolution (1080p, 720p, 2160p, etc.), swap them
rg = result['releaseGroup']
if rg and isinstance(rg, str) and rg.lower().replace('p', '').replace('i', '').isdigit():
    # This is likely a resolution, not a release group
    if not result['resolution']:
        result['resolution'] = rg
    result['releaseGroup'] = ''
# Handle HDR formats
other = info.get('other', [])
if not isinstance(other, list):
    other = [other] if other else []
for o in other:
    o_lower = str(o).lower()
    if 'hdr10+' in o_lower or 'hdr10plus' in o_lower:
        result['hdr'].append('HDR10+')
    elif 'hdr10' in o_lower:
        result['hdr'].append('HDR10')
    elif 'hdr' in o_lower:
        result['hdr'].append('HDR')
    elif 'dolby vision' in o_lower or o_lower == 'dv':
        result['hdr'].append('DV')
print(json.dumps(result))
    `]);
    return JSON.parse(out.trim());
  } catch (e) {
    console.error('extractFullMediaInfo error:', e.message);
    return { title: path.parse(filePath).name, year: '' };
  }
}

/**
 * Normalize title according to scene naming rules
 * @param {string} title - Original title
 * @returns {string} - Normalized title
 */
function normalizeTitle(title) {
  if (!title) return '';
  // Remove accents
  let normalized = title.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  // Replace cedillas
  normalized = normalized.replace(/[çÇ]/g, m => m === 'ç' ? 'c' : 'C');
  // Replace apostrophes with dots
  normalized = normalized.replace(/[''`]/g, '.');
  // Remove forbidden special characters
  normalized = normalized.replace(/[,;}{[\]:]/g, '');
  // Replace hyphens with dots
  normalized = normalized.replace(/-/g, '.');
  // Capitalize first letter of each word
  normalized = normalized.split(/\s+/).map(word => {
    if (word.length === 0) return '';
    if (word === word.toUpperCase() && word.length <= 4) return word;
    return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
  }).join('.');
  // Clean multiple dots
  normalized = normalized.replace(/\.{2,}/g, '.').replace(/^\.|\.$/g, '');
  return normalized;
}

/**
 * Generate movie release name according to AATM/La Cale rules
 * @param {object} info - Media info object
 * @returns {string} - Release name
 */
function generateMovieReleaseName(info) {
  const parts = [];

  // 1. Title (normalized)
  if (info.title) parts.push(normalizeTitle(info.title));

  // 2. Year
  if (info.year) parts.push(info.year);

  // 3. Info (REPACK, PROPER, etc.)
  if (info.info) parts.push(info.info.toUpperCase());

  // 4. Edition
  if (info.edition) parts.push(info.edition);

  // 5. IMAX
  if (info.imax) parts.push('iMAX');

  // 6. Language
  if (info.language) {
    const lang = info.language.toUpperCase();
    parts.push(lang === 'MULTI' ? 'MULTi' : lang);
  }

  // 7. LanguageInfo (VFF, VFQ, etc.)
  if (info.languageInfo) parts.push(info.languageInfo.toUpperCase());

  // 8. HDR/DV
  if (info.hdr && info.hdr.length > 0) {
    const hdrOrder = ['HDR10+', 'HDR10', 'HDR', 'DV', 'HLG', 'SDR'];
    const sortedHdr = info.hdr
      .map(h => h.toUpperCase().replace('DOLBY VISION', 'DV'))
      .sort((a, b) => hdrOrder.indexOf(a) - hdrOrder.indexOf(b));
    parts.push(...sortedHdr);
  }

  // 9. Resolution
  if (info.resolution) {
    const res = info.resolution.toLowerCase();
    parts.push(res.endsWith('p') ? res : res + 'p');
  }

  // 10. Platform
  if (info.platform) parts.push(info.platform.toUpperCase());

  // 11. Source (normalized)
  if (info.source) {
    let source = info.source;
    const s = source.toLowerCase();
    if (s === 'web-dl' || s === 'webdl' || s === 'web') source = 'WEB-DL';
    else if (s === 'webrip') source = 'WEBRip';
    else if (s === 'bluray' || s === 'blu-ray' || s === 'bdrip' || s === 'brrip') source = 'BluRay';
    else if (s === 'remux') source = 'REMUX';
    else if (s === 'hdlight') source = 'HDLight';
    else if (s === '4klight') source = '4KLight';
    else if (s === 'dvdrip') source = 'DVDRip';
    else if (s === 'hdtv') source = 'HDTV';
    parts.push(source);
  }

  // 12. Audio (normalized)
  if (info.audio) {
    let audio = info.audio.toUpperCase();
    if (audio === 'DDP' || audio === 'E-AC-3' || audio === 'EAC3') audio = 'DDP';
    if (audio === 'DD' || audio === 'AC-3') audio = 'AC3';
    parts.push(audio);
  }

  // 13. Audio channels
  if (info.audioChannels) parts.push(info.audioChannels);

  // 14. AudioSpec (Atmos)
  if (info.audioSpec) parts.push(info.audioSpec);

  // 15. Video codec (normalized)
  if (info.codec) {
    let codec = info.codec.toUpperCase();
    if (codec === 'H264' || codec === 'H.264' || codec === 'AVC') codec = 'x264';
    if (codec === 'H265' || codec === 'H.265' || codec === 'HEVC') codec = 'x265';
    parts.push(codec);
  }

  // Build name
  const baseName = parts.join('.');
  const team = info.releaseGroup || 'NoTag';
  return `${baseName}-${team}`;
}

/**
 * Generate series release name according to AATM/La Cale rules
 * @param {object} info - Media info object
 * @param {string} mediaType - 'season' or 'episode'
 * @returns {string} - Release name
 */
function generateSeriesReleaseName(info, mediaType) {
  const parts = [];

  // 1. Title
  if (info.title) parts.push(normalizeTitle(info.title));

  // 2. Year (optional for series)
  if (info.year) parts.push(info.year);

  // 3. Season/Episode
  if (mediaType === 'season') {
    if (info.season) {
      if (info.season.toUpperCase() === 'COMPLETE' || info.season.toUpperCase() === 'INTEGRALE') {
        parts.push('COMPLETE');
      } else {
        parts.push(info.season.toUpperCase());
      }
    }
  } else {
    if (info.season && info.episode) {
      parts.push(`${info.season.toUpperCase()}${info.episode.toUpperCase()}`);
    } else if (info.episode) {
      parts.push(info.episode.toUpperCase());
    } else if (info.season) {
      parts.push(info.season.toUpperCase());
    }
  }

  // 4-15. Same tags as movies
  if (info.info) parts.push(info.info.toUpperCase());
  if (info.edition) parts.push(info.edition);
  if (info.imax) parts.push('iMAX');
  if (info.language) parts.push(info.language === 'MULTI' ? 'MULTi' : info.language.toUpperCase());
  if (info.languageInfo) parts.push(info.languageInfo.toUpperCase());
  if (info.hdr && info.hdr.length > 0) parts.push(...info.hdr.map(h => h.toUpperCase()));
  if (info.resolution) parts.push(info.resolution.toLowerCase().endsWith('p') ? info.resolution.toLowerCase() : info.resolution.toLowerCase() + 'p');
  if (info.platform) parts.push(info.platform.toUpperCase());
  if (info.source) {
    let source = info.source.toLowerCase();
    if (source === 'bluray' || source === 'bdrip') source = 'BluRay';
    else if (source === 'web-dl' || source === 'webdl' || source === 'web') source = 'WEB-DL';
    else if (source === 'webrip') source = 'WEBRip';
    else source = info.source;
    parts.push(source);
  }
  if (info.audio) parts.push(info.audio.toUpperCase());
  if (info.audioChannels) parts.push(info.audioChannels);
  if (info.audioSpec) parts.push(info.audioSpec);
  if (info.codec) {
    let codec = info.codec.toUpperCase();
    if (codec === 'HEVC' || codec === 'H265') codec = 'x265';
    if (codec === 'AVC' || codec === 'H264') codec = 'x264';
    parts.push(codec);
  }

  const baseName = parts.join('.');
  const team = info.releaseGroup || 'NoTag';
  return `${baseName}-${team}`;
}

/**
 * Generate release name based on media type
 * @param {object} info - Media info object
 * @param {string} mediaType - 'movie', 'tv', 'season', or 'episode'
 * @returns {string} - Release name
 */
function generateReleaseName(info, mediaType) {
  if (mediaType === 'movie') {
    return generateMovieReleaseName(info);
  } else if (mediaType === 'tv' || mediaType === 'season' || mediaType === 'episode') {
    // Determine if it's a full season or single episode
    const seriesType = info.episode ? 'episode' : 'season';
    return generateSeriesReleaseName(info, seriesType);
  }
  // For ebook/game, keep original name
  return info.title || '';
}

/**
 * Find the hardlink directory for a given source path
 * @param {string} sourcePath - Source file path
 * @returns {string|null} - Hardlink directory or null if not found
 */
function getHardlinkDir(sourcePath, hardlinkMapping = null) {
  const mappingToUse = hardlinkMapping || HARDLINK_MAPPING;
  // Sort mappings by length (longest first) to match most specific path first
  const sortedMappings = mappingToUse.slice().sort((a, b) => b.source.length - a.source.length);
  
  for (const mapping of sortedMappings) {
    // Check if sourcePath starts with mapping.source AND
    // the next character is '/' (path separator) or it's the exact match
    if (sourcePath === mapping.source || 
        sourcePath.startsWith(mapping.source + '/')) {
      return mapping.dest;
    }
  }
  return null;
}

/**
 * Check if a path starts with a given prefix, with proper path boundary checking
 * Prevents /mnt/Stockage/Films2 from matching /mnt/Stockage/Films
 */
function pathStartsWith(filePath, prefix) {
  return filePath === prefix || filePath.startsWith(prefix + '/');
}


/**
 * Create hard links for files in a directory, preserving subdirectory structure
 * @param {string} torrentName - Name of the torrent (will be the folder name)
 * @param {object[]} files - Array of file objects with path property
 * @param {function} log - Logging function
 * @param {string} sourceBaseDir - Base directory to calculate relative paths from (optional)
 * @returns {string|null} - Path to hardlink directory or null if disabled
 */
function createHardLinks(torrentName, files, log = console.log, sourceBaseDir = null, hardlinkMapping = null) {
  const mappingToUse = hardlinkMapping || HARDLINK_MAPPING;
  
  if (mappingToUse.length === 0 || files.length === 0) {
    return null;
  }

  // Determine hardlink directory based on first file's source path
  const hardlinkBaseDir = getHardlinkDir(files[0].path, mappingToUse);
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
      setPermissions(hardlinkFolder);
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
          setPermissions(destDir);
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
        setPermissions(destPath);
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

async function searchTMDb(title, year, language, apiKey = null) {
  const tmdbKey = apiKey || TMDB_API_KEY;
  if (!tmdbKey) return null;

  const query = qs.escape(cleanTitle(title));
  const url = `https://api.themoviedb.org/3/search/movie?api_key=${tmdbKey}&query=${query}&language=${language}`;

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

async function getCachedMovie(title, year, language, apiKey = null) {
  const key = safeName(`${title}_${year}_${language}`).toLowerCase();
  const file = path.join(CACHE_DIR, key + '.json');

  if (fs.existsSync(file)) {
    try { return JSON.parse(fs.readFileSync(file)); } catch {}
  }

  const movie = await searchTMDb(title, year, language, apiKey);
  if (movie) {
    fs.writeFileSync(file, JSON.stringify(movie, null, 2));
    setPermissions(file);
  }
  setPermissions(file);
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
  setPermissions(outDir);

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
    if (!TRACKERS.length) {
      console.log(`⚠️ Torrent non créé - TRACKERS non configuré`);
    } else {
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
      setPermissions(txt);
    } else {
      tmdbMissing++;
      fs.writeFileSync(txt, `TMDb non trouvé\n`);
      setPermissions(txt);
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
 * @param {Array} customMediaConfig - Optional custom media configuration (from configManager)
 */
async function getVideoFiles(customMediaConfig = null) {
  const results = { films: [], series: [], animes_films: [], animes_series: [], jeux: [] };

  // Use custom config if provided, otherwise fall back to MEDIA_CONFIG
  const mediaConfig = customMediaConfig && customMediaConfig.length > 0 ? customMediaConfig : MEDIA_CONFIG;

  if (mediaConfig.length === 0) {
    console.warn('⚠️ Aucun répertoire média configuré');
    return results;
  }

  for (const media of mediaConfig) {
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
 * @param {object} options - Configuration options
 * @param {Array} options.mediaConfig - Custom media configuration (from configManager)
 * @param {Array} options.trackers - Tracker URLs
 * @param {string} options.tmdbApiKey - TMDb API key
 * @returns {Promise<object>} - Processing statistics
 */
async function processFiles(filePaths, progressCallback = null, options = {}) {
  const { mediaConfig: customMediaConfig, trackers: customTrackers, hardlinkMapping: customHardlinkMapping, tmdbApiKey: customTmdbApiKey } = options;
  const trackersToUse = customTrackers && customTrackers.length > 0 ? customTrackers : TRACKERS;
  const tmdbKeyToUse = customTmdbApiKey || TMDB_API_KEY;
  const hardlinkMappingToUse = customHardlinkMapping && customHardlinkMapping.length > 0 ? customHardlinkMapping : HARDLINK_MAPPING;

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
      // Use custom config if provided, otherwise fall back to MEDIA_CONFIG
      const mediaConfig = customMediaConfig && customMediaConfig.length > 0 ? customMediaConfig : MEDIA_CONFIG;

      // Find the correct destination base for this file
      let destBase = null;
      let mediaType = null;
      for (const media of mediaConfig) {
        if (pathStartsWith(file, media.source)) {
          destBase = media.dest;
          mediaType = media.type;
          break;
        }
      }

      if (!destBase) {
        log(`⚠️ Impossible de déterminer le type pour : ${path.basename(file)}`, 'warn');
        localSkipped.push(file);
        continue;
      }

      // Generate scene name using AATM logic (for movie/tv types)
      let fileName = path.parse(file).name;
      let torrentName = fileName;
      let mediaInfo = null;

      if (mediaType !== 'game') {
        try {
          log(`🔍 Extraction des informations media avec guessit...`);
          mediaInfo = await extractFullMediaInfo(file);

          // Enrich with mediainfo codecs if guessit didn't find them
          if (mediaInfo && (!mediaInfo.codec || !mediaInfo.audio)) {
            log(`🔍 Extraction des codecs avec mediainfo...`);
            const codecs = await extractMediaCodecs(file);
            if (!mediaInfo.codec && codecs.codec) {
              mediaInfo.codec = codecs.codec;
              log(`📼 Codec vidéo détecté: ${codecs.codec}`);
            }
            if (!mediaInfo.audio && codecs.audio) {
              mediaInfo.audio = codecs.audio;
              log(`🔊 Codec audio détecté: ${codecs.audio}`);
            }
            if (!mediaInfo.audioChannels && codecs.audioChannels) {
              mediaInfo.audioChannels = codecs.audioChannels;
              log(`🔊 Canaux audio détectés: ${codecs.audioChannels}`);
            }
          }

          if (mediaInfo && mediaInfo.title) {
            log(`📋 Titre: ${mediaInfo.title}${mediaInfo.year ? ` (${mediaInfo.year})` : ''}`);
            if (mediaInfo.season) log(`📺 Saison: ${mediaInfo.season}${mediaInfo.episode ? ` Episode: ${mediaInfo.episode}` : ''}`);

            const aatmName = generateReleaseName(mediaInfo, mediaType);
            if (aatmName && aatmName.length > 5) {
              log(`🎬 Nom scene AATM: ${aatmName}`);
              torrentName = aatmName;
            }
          }
        } catch (e) {
          log(`⚠️ Impossible de generer le nom AATM: ${e.message}`, 'warn');
          torrentName = fileName; // fallback to filename without extension
        }
      }

      const safeFolder = safeName(torrentName);
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
  setPermissions(outDir);

      if (!fileExistsAndNotEmpty(nfo)) {
        let mediadata = await execAsync('mediainfo', [file]);
        mediadata = mediadata.replace(
          /^Complete name\s*:.*$/m,
          `Complete name : ${path.basename(file)}`
        );

        fs.writeFileSync(nfo, `
============================================================
Release Name : ${torrentName}
Added On    : ${new Date().toISOString().replace('T',' ').split('.')[0]}
============================================================

${mediadata}

============================================================
Generated by torrentify
============================================================
`.trim());
      setPermissions(nfo);
      }

      if (!fileExistsAndNotEmpty(torrent)) {
        if (!trackersToUse.length) {
          log(`⚠️ Torrent non créé - TRACKERS non configuré`, 'warn');
        } else {
          // Remove empty torrent file if exists
          if (fs.existsSync(torrent)) fs.unlinkSync(torrent);

          log(`🔧 Création du torrent (peut prendre plusieurs minutes)...`);
          const trackers = trackersToUse.flatMap(t => ['-a', t]);
          await execAsync('mktorrent', [
            '-l', getMktorrentL(file).toString(),
            '-p',
            ...trackers,
            '-o', torrent,
            file
          ]);
          log(`✅ Torrent créé`);
          
          // Create hardlinks for seeding (for individual files)
          try {
            createHardLinks(torrentName, [{ path: file }], log, null, hardlinkMappingToUse);
          } catch (e) {
            log(`⚠️ Impossible de créer les hardlinks : ${e.message}`, 'warn');
          }
        }
      }

      if (!fileExistsAndNotEmpty(txt)) {
        const guess = await runPythonGuessit(file);

        const movie =
          await getCachedMovie(guess.title, guess.year, 'en-US', tmdbKeyToUse) ||
          await getCachedMovie(guess.title, guess.year, 'fr-FR', tmdbKeyToUse) ||
          await getCachedMovie(guess.title, '', 'en-US', tmdbKeyToUse);

        if (movie?.id) {
          localTmdbFound.push(file);
          fs.writeFileSync(txt, `ID TMDB : ${movie.id}\n`);
          setPermissions(txt);
          log(`🎬 TMDb trouvé : ${guess.title}`);
        } else {
          localTmdbMissing.push(file);
          fs.writeFileSync(txt, `TMDb non trouvé\n`);
          setPermissions(txt);
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
 * @param {object} options - Configuration options
 * @param {Array} options.mediaConfig - Custom media configuration (from configManager)
 * @param {Array} options.trackers - Tracker URLs
 * @param {string} options.tmdbApiKey - TMDb API key
 * @returns {Promise<object>} - Processing result
 */
async function processDirectory(dirPath, files, progressCallback = null, customTorrentName = null, options = {}) {
  const { mediaConfig: customMediaConfig, trackers: customTrackers, hardlinkMapping: customHardlinkMapping, tmdbApiKey: customTmdbApiKey } = options;
  const trackersToUse = customTrackers && customTrackers.length > 0 ? customTrackers : TRACKERS;
  const tmdbKeyToUse = customTmdbApiKey || TMDB_API_KEY;
  const hardlinkMappingToUse = customHardlinkMapping && customHardlinkMapping.length > 0 ? customHardlinkMapping : HARDLINK_MAPPING;

  const dirName = path.basename(dirPath);

  // Use custom config if provided, otherwise fall back to MEDIA_CONFIG
  const mediaConfig = customMediaConfig && customMediaConfig.length > 0 ? customMediaConfig : MEDIA_CONFIG;

  // Find the correct destination base for this directory first (needed for AATM naming)
  let destBase = null;
  let mediaType = null;
  for (const media of mediaConfig) {
        if (pathStartsWith(dirPath, media.source)) {
      destBase = media.dest;
      mediaType = media.type;
      break;
    }
  }

  if (!destBase) {
    throw new Error(`Cannot determine media type for directory: ${dirPath}`);
  }

  // Helper log function (defined early for use in AATM naming)
  const log = (message, level = 'info') => {
    console.log(message);
    if (progressCallback) {
      progressCallback({ type: 'log', message, level, timestamp: new Date().toISOString() });
    }
  };

  // Generate scene name using AATM logic (unless custom name provided or game type)
  let torrentName = customTorrentName || dirName;
  let mediaInfo = null;

  if (!customTorrentName && mediaType !== 'game') {
    try {
      log(`🔍 Extraction des informations media avec guessit...`);
      // Use the first video file for guessit, not the directory path
      const firstVideoFile = files.find(f => f.path && VIDEO_EXT.some(ext => f.path.toLowerCase().endsWith(`.${ext}`)));
      const guessitPath = firstVideoFile ? firstVideoFile.path : dirPath;
      mediaInfo = await extractFullMediaInfo(guessitPath);

      // Enrich with mediainfo codecs if guessit didn't find them
      if (mediaInfo && firstVideoFile && (!mediaInfo.codec || !mediaInfo.audio)) {
        log(`🔍 Extraction des codecs avec mediainfo...`);
        const codecs = await extractMediaCodecs(firstVideoFile.path);
        if (!mediaInfo.codec && codecs.codec) {
          mediaInfo.codec = codecs.codec;
          log(`📼 Codec vidéo détecté: ${codecs.codec}`);
        }
        if (!mediaInfo.audio && codecs.audio) {
          mediaInfo.audio = codecs.audio;
          log(`🔊 Codec audio détecté: ${codecs.audio}`);
        }
        if (!mediaInfo.audioChannels && codecs.audioChannels) {
          mediaInfo.audioChannels = codecs.audioChannels;
          log(`🔊 Canaux audio détectés: ${codecs.audioChannels}`);
        }
      }

      if (mediaInfo && mediaInfo.title) {
        log(`📋 Titre: ${mediaInfo.title}${mediaInfo.year ? ` (${mediaInfo.year})` : ''}`);
        if (mediaInfo.season) log(`📺 Saison: ${mediaInfo.season}${mediaInfo.episode ? ` Episode: ${mediaInfo.episode}` : ''}`);

        const aatmName = generateReleaseName(mediaInfo, mediaType);
        if (aatmName && aatmName.length > 5) {
          log(`🎬 Nom scene AATM: ${aatmName}`);
          torrentName = aatmName;
        }
      }
    } catch (e) {
      log(`⚠️ Impossible de generer le nom AATM: ${e.message}`, 'warn');
    }
  }

  const safeFolder = safeName(torrentName);

  const outDir = path.join(destBase, safeFolder);
  const nfo = path.join(outDir, `${safeFolder}.nfo`);
  const torrent = path.join(outDir, `${safeFolder}.torrent`);
  const txt = path.join(outDir, `${safeFolder}.txt`);

  const startTime = Date.now();

  // Check if already processed
  if (fileExistsAndNotEmpty(nfo) && fileExistsAndNotEmpty(torrent) && fileExistsAndNotEmpty(txt)) {
    log(`⏭️ Répertoire déjà traité : ${dirName}`);
    return { skipped: true, dirPath, dirName };
  }

  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  setPermissions(outDir);

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
    setPermissions(nfo);
    log(`✅ NFO synthétique créé`);
  }

  // 2. Create single torrent for the directory
  if (!fileExistsAndNotEmpty(torrent)) {
    if (!trackersToUse.length) {
      log(`⚠️ Torrent non créé - TRACKERS non configuré`, 'warn');
    } else {
      if (fs.existsSync(torrent)) fs.unlinkSync(torrent);

      log(`🔧 Création du torrent pour le répertoire (${formatSize(totalSize)})...`);
      log(`📛 Nom du torrent: ${torrentName}`);
      const trackers = trackersToUse.flatMap(t => ['-a', t]);

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
      createHardLinks(torrentName, sortedFiles, log, dirPath, hardlinkMappingToUse);
    }
  }

  // 3. Create TMDB txt file (skip for games)
  if (!fileExistsAndNotEmpty(txt)) {
    if (mediaType === 'game') {
      // Pour les jeux, pas de recherche TMDB
      fs.writeFileSync(txt, `Type: Jeu\nNom: ${torrentName}\n`);
      setPermissions(txt);
      log(`🎮 Jeu détecté - pas de recherche TMDB`);
    } else {
      // Try to guess series name from directory
      const guess = await runPythonGuessit(dirPath);

      // Search for TV show (not movie)
      let found = null;
      const searchTv = async (title, year, lang) => {
        if (!tmdbKeyToUse) return null;

        const query = qs.escape(cleanTitle(title));
        const url = `https://api.themoviedb.org/3/search/tv?api_key=${tmdbKeyToUse}&query=${query}&language=${lang}`;
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
        setPermissions(txt);
        log(`🎬 TMDb trouvé : ${found.name || guess.title}`);
      } else {
        fs.writeFileSync(txt, `TMDb non trouvé\nRecherche: ${guess.title}\n`);
        setPermissions(txt);
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
 * @param {object} options - Configuration options
 * @param {Array} options.mediaConfig - Custom media configuration (from configManager)
 * @param {Array} options.trackers - Tracker URLs
 * @param {string} options.tmdbApiKey - TMDb API key
 * @returns {Promise<object>} - Processing statistics
 */
async function processDirectories(directories, progressCallback = null, options = {}) {
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
      const result = await processDirectory(dir.path, dir.files, progressCallback, dir.customTorrentName, options);
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
