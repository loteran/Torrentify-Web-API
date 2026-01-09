#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync, spawnSync } = require('child_process');
const axios = require('axios');
const qs = require('querystring');
const fg = require('fast-glob');
const stringSimilarity = require('string-similarity');

/* =======================
   CONFIGURATION
======================= */
const SOURCE_DIR = '/data/films';
const DEST_DIR = '/data/torrent';
const CACHE_DIR = '/data/cache_tmdb';

const TMDB_API_KEY =
  process.env.TMDB_API_KEY ||
  'VOTRE_CLE_TMDB_ICI'; // fallback par défaut

const TRACKERS = (
  process.env.TRACKERS ||
  'https://tracker1/announce,https://tracker2/announce'
)
  .split(',')
  .map(t => t.trim())
  .filter(Boolean);

const VIDEO_EXT = ['mkv','mp4','avi','mov','flv','wmv','m4v'];

/* =======================
   VALIDATIONS
======================= */
if (!TMDB_API_KEY) {
  console.error('❌ TMDB_API_KEY non défini');
  process.exit(1);
}

if (!TRACKERS.length) {
  console.error('❌ Aucun tracker défini');
  process.exit(1);
}

if (!fs.existsSync(CACHE_DIR)) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
}

/* =======================
   UTILITAIRES
======================= */
const safeName = n => n.replace(/ /g, '.');
const cleanTitle = t => t.replace(/[^a-zA-Z0-9 ]/g, '').trim();

function runPythonGuessit(filePath) {
  try {
    const r = spawnSync('python3', ['-c', `
import json
from guessit import guessit
f = guessit(r"""${filePath}""")
print(json.dumps({'title': f.get('title',''), 'year': f.get('year','')}))
    `], { encoding: 'utf-8' });

    return JSON.parse(r.stdout);
  } catch {
    return { title: path.parse(filePath).name, year: '' };
  }
}

async function searchTMDb(title, year, language) {
  const query = qs.escape(cleanTitle(title));
  const url = `https://api.themoviedb.org/3/search/movie?api_key=${TMDB_API_KEY}&query=${query}&language=${language}`;

  try {
    const res = await axios.get(url, { timeout: 8000 });
    if (!res.data.results?.length) return null;

    let results = res.data.results;
    if (year) {
      results = results.filter(r => r.release_date?.startsWith(year.toString())) || results;
    }

    return results.reduce((best, cur) => {
      const score = stringSimilarity.compareTwoStrings(
        cleanTitle(title).toLowerCase(),
        (cur.title || '').toLowerCase()
      );
      return score > best.score ? { movie: cur, score } : best;
    }, { movie: results[0], score: 0 }).movie;

  } catch (err) {
    console.error('❌ Erreur TMDb:', err.message);
    return null;
  }
}

async function getCachedMovie(title, year, language) {
  const cacheKey = safeName(`${title}_${year}_${language}`).toLowerCase();
  const cacheFile = path.join(CACHE_DIR, `${cacheKey}.json`);

  if (fs.existsSync(cacheFile)) {
    try {
      return JSON.parse(fs.readFileSync(cacheFile, 'utf-8'));
    } catch {}
  }

  const movie = await searchTMDb(title, year, language);
  if (movie) {
    fs.writeFileSync(cacheFile, JSON.stringify(movie, null, 2));
  }
  return movie;
}

function getPieceLength(filePath) {
  const size = fs.statSync(filePath).size;
  if (size < 512 * 1024 * 1024) return 20;
  if (size < 1 * 1024 * 1024 * 1024) return 21;
  if (size < 2 * 1024 * 1024 * 1024) return 22;
  if (size < 4 * 1024 * 1024 * 1024) return 23;
  return 24;
}

/* =======================
   SCRIPT PRINCIPAL
======================= */
(async () => {
  try { execSync('command -v mktorrent'); }
  catch { console.error('❌ mktorrent non installé'); process.exit(1); }

  try { execSync('command -v mediainfo'); }
  catch { console.error('❌ mediainfo non installé'); process.exit(1); }

  const patterns = VIDEO_EXT.map(ext => `${SOURCE_DIR}/**/*.${ext}`);
  const files = await fg(patterns, { dot: false });

  for (const file of files) {
    const nameNoExt = path.parse(file).name;
    const safeFolder = safeName(nameNoExt);
    const outDir = path.join(DEST_DIR, safeFolder);

    fs.mkdirSync(outDir, { recursive: true });

    const nfoFile = path.join(outDir, `${safeFolder}.nfo`);
    const torrentFile = path.join(outDir, `${safeFolder}.torrent`);
    const txtFile = path.join(outDir, `${safeFolder}.txt`);

    /* ---------- NFO ---------- */
    if (!fs.existsSync(nfoFile)) {
      console.log('📝 Création NFO :', safeFolder);

      let mediadata = spawnSync('mediainfo', [file], { encoding: 'utf-8' }).stdout;

      // 🔒 Nettoyage du chemin complet
      mediadata = mediadata.replace(
        /^Complete name\s*:.*$/m,
        `Complete name                            : ${path.basename(file)}`
      );

      const nfo = `
============================================================
                        PRIVATE TRACKER NFO
============================================================
Release Name : ${nameNoExt}
File Size    : ${execSync(`du -h "${file}" | cut -f1`).toString().trim()}
Added On     : ${new Date().toISOString().replace('T',' ').split('.')[0]}
============================================================

[ Video / Audio / Subtitles ]
------------------------------------------------------------
${mediadata}

============================================================
Generated by torrentify
============================================================
`;
      fs.writeFileSync(nfoFile, nfo.trim());
    }

    /* ---------- TORRENT ---------- */
    if (!fs.existsSync(torrentFile)) {
      console.log('🧲 Création torrent :', safeFolder);
      const trackerArgs = TRACKERS.flatMap(t => ['-a', t]);
      spawnSync(
        'mktorrent',
        ['-v', '-l', getPieceLength(file).toString(), ...trackerArgs, '-o', torrentFile, file],
        { stdio: 'inherit' }
      );
    }

    /* ---------- TMDB TXT ---------- */
    if (!fs.existsSync(txtFile)) {
      const guess = runPythonGuessit(file);
      const title = guess.title || nameNoExt;
      const year = guess.year || '';

      let movie =
        await getCachedMovie(title, year, 'en-US') ||
        await getCachedMovie(title, year, 'fr-FR') ||
        await getCachedMovie(title, '', 'en-US');

      if (movie && movie.id) {
        fs.writeFileSync(txtFile, `ID TMDB : ${movie.id}\n`);
        console.log(`🎬 TMDb trouvé : ${title} (${movie.id})`);
      } else {
        fs.writeFileSync(txtFile, 'TMDb : NON TROUVÉ\n');
        console.warn(`⚠️ TMDb non trouvé pour : ${title}`);
      }
    }
  }

  console.log('🎉 Traitement terminé');
})();
