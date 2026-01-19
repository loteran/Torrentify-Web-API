const express = require('express');
const router = express.Router();
const configManager = require('../services/configManager');

/**
 * GET /api/config
 * Retourne la configuration actuelle (cles masquees)
 */
router.get('/', (req, res) => {
  try {
    const config = configManager.getConfig(false);
    res.json(config);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/config/status
 * Retourne le statut de configuration
 */
router.get('/status', (req, res) => {
  try {
    const config = configManager.getConfig(false);
    res.json({
      configured: config.configured,
      hasApiKey: !!config.tmdb_api_key,
      hasTrackers: !!config.trackers
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * PUT /api/config
 * Met a jour la configuration
 */
router.put('/', async (req, res) => {
  try {
    const newConfig = req.body;
    const updatedConfig = await configManager.update(newConfig);
    res.json({
      success: true,
      config: updatedConfig
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/config/test-tmdb
 * Teste une cle API TMDb
 */
router.post('/test-tmdb', async (req, res) => {
  try {
    const { apiKey } = req.body;
    if (!apiKey) {
      return res.status(400).json({ error: 'apiKey requis' });
    }
    const result = await configManager.testTmdbKey(apiKey);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/config/directories
 * Retourne les repertoires configures et leur statut
 */
router.get('/directories', (req, res) => {
  const fs = require('fs');
  const config = configManager.getFullConfig();

  // Verifier les chemins configures
  const directories = {
    films: {
      path: config.path_films || '',
      mounted: config.path_films ? fs.existsSync(config.path_films) : false
    },
    series: {
      path: config.path_series || '',
      mounted: config.path_series ? fs.existsSync(config.path_series) : false
    },
    animes_films: {
      path: config.path_animes_films || '',
      mounted: config.path_animes_films ? fs.existsSync(config.path_animes_films) : false
    },
    animes_series: {
      path: config.path_animes_series || '',
      mounted: config.path_animes_series ? fs.existsSync(config.path_animes_series) : false
    },
    jeux: {
      path: config.path_jeux || '',
      mounted: config.path_jeux ? fs.existsSync(config.path_jeux) : false
    },
    torrent_output: {
      path: config.path_torrent_output || '',
      mounted: config.path_torrent_output ? fs.existsSync(config.path_torrent_output) : false
    }
  };

  res.json(directories);
});

/**
 * GET /api/config/browse
 * Explore un repertoire pour permettre la selection
 */
router.get('/browse', (req, res) => {
  const fs = require('fs');
  const path = require('path');

  let dirPath = req.query.path || '/';

  // Securite : empecher la traversee de repertoire
  dirPath = path.normalize(dirPath).replace(/^(\.\.(\/|\\|$))+/, '');

  // S'assurer que le chemin commence par /
  if (!dirPath.startsWith('/')) {
    dirPath = '/' + dirPath;
  }

  try {
    if (!fs.existsSync(dirPath)) {
      return res.status(404).json({ error: 'Repertoire non trouve' });
    }

    const stats = fs.statSync(dirPath);
    if (!stats.isDirectory()) {
      return res.status(400).json({ error: 'Le chemin n\'est pas un repertoire' });
    }

    const items = fs.readdirSync(dirPath, { withFileTypes: true });

    // Filtrer et trier : dossiers seulement, caches exclus
    const folders = items
      .filter(item => {
        if (!item.isDirectory()) return false;
        // Exclure les dossiers caches et systeme
        if (item.name.startsWith('.')) return false;
        if (['proc', 'sys', 'dev', 'run', 'snap', 'lost+found'].includes(item.name)) return false;
        return true;
      })
      .map(item => ({
        name: item.name,
        path: path.join(dirPath, item.name),
        isDirectory: true
      }))
      .sort((a, b) => a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' }));

    // Ajouter le parent si on n'est pas a la racine
    const parent = dirPath !== '/' ? path.dirname(dirPath) : null;

    res.json({
      current: dirPath,
      parent: parent,
      folders: folders
    });

  } catch (error) {
    console.error('Erreur exploration:', error);
    res.status(500).json({ error: 'Erreur lors de l\'exploration: ' + error.message });
  }
});

/**
 * GET /api/config/roots
 * Retourne les points de montage racine disponibles
 */
router.get('/roots', (req, res) => {
  const fs = require('fs');
  const path = require('path');

  // Points de montage communs a verifier
  const commonRoots = [
    { path: '/mnt', name: 'Montages (/mnt)' },
    { path: '/media', name: 'Media (/media)' },
    { path: '/data', name: 'Data (/data)' },
    { path: '/storage', name: 'Storage (/storage)' },
    { path: '/share', name: 'Share (/share)' },
    { path: '/volume1', name: 'Volume1 (Synology)' },
    { path: '/volume2', name: 'Volume2 (Synology)' },
    { path: '/host', name: 'Host (/)' }
  ];

  const availableRoots = [];

  // Verifier chaque racine et ajouter les sous-dossiers montes
  commonRoots.forEach(root => {
    try {
      if (fs.existsSync(root.path) && fs.statSync(root.path).isDirectory()) {
        // Verifier si le dossier contient des elements
        const contents = fs.readdirSync(root.path);
        if (contents.length > 0) {
          availableRoots.push(root);

          // Pour /mnt et /media, ajouter aussi les sous-dossiers directement
          if (root.path === '/mnt' || root.path === '/media') {
            contents.forEach(item => {
              const itemPath = path.join(root.path, item);
              try {
                if (fs.statSync(itemPath).isDirectory() && !item.startsWith('.')) {
                  availableRoots.push({
                    path: itemPath,
                    name: `${item} (${root.path}/${item})`
                  });
                }
              } catch (e) {
                // Ignorer les erreurs d'acces
              }
            });
          }
        }
      }
    } catch {
      // Ignorer les erreurs
    }
  });

  // Toujours ajouter / comme option en premier
  availableRoots.unshift({ path: '/', name: 'Racine (/)' });

  res.json(availableRoots);
});

module.exports = router;
