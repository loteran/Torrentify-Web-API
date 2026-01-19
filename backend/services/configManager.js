const fs = require('fs');
const path = require('path');
const axios = require('axios');

// Configuration file path
const CONFIG_PATH = process.env.CONFIG_PATH || '/data/config/settings.json';

// Default configuration
const DEFAULT_CONFIG = {
  tmdb_api_key: '',
  trackers: '',
  path_films: '',
  path_series: '',
  path_animes_films: '',
  path_animes_series: '',
  path_jeux: '',
  path_torrent_output: '/data/torrent',
  path_hardlinks: '',
  enable_films: true,
  enable_series: true,
  enable_animes_films: true,
  enable_animes_series: true,
  enable_jeux: true,
  parallel_jobs: 1
};

class ConfigManager {
  constructor() {
    this.config = null;
    this.configLoaded = false;
  }

  /**
   * Load configuration from file or environment
   */
  loadConfig() {
    let config = { ...DEFAULT_CONFIG };

    // Try to load from file first
    try {
      if (fs.existsSync(CONFIG_PATH)) {
        const configData = fs.readFileSync(CONFIG_PATH, 'utf8');
        const savedConfig = JSON.parse(configData);
        config = { ...DEFAULT_CONFIG, ...savedConfig };
        console.log('📋 Configuration chargée depuis:', CONFIG_PATH);
      }
    } catch (error) {
      console.log('⚠️ Impossible de charger la config, utilisation des valeurs par défaut');
    }

    // Apply environment variables as fallback
    if (!config.tmdb_api_key && process.env.TMDB_API_KEY) {
      config.tmdb_api_key = process.env.TMDB_API_KEY;
    }
    if (!config.trackers && process.env.TRACKERS) {
      config.trackers = process.env.TRACKERS;
    }
    if (process.env.PARALLEL_JOBS) {
      config.parallel_jobs = parseInt(process.env.PARALLEL_JOBS, 10);
    }

    this.config = config;
    this.configLoaded = true;
    return config;
  }

  /**
   * Get configuration (with optional masking of sensitive data)
   */
  getConfig(includeSecrets = false) {
    if (!this.configLoaded) {
      this.loadConfig();
    }

    const config = { ...this.config };

    // Check if configured
    config.configured = !!(config.tmdb_api_key && config.trackers);

    // Mask sensitive data if requested
    if (!includeSecrets) {
      if (config.tmdb_api_key) {
        config.tmdb_api_key = '***' + config.tmdb_api_key.slice(-4);
      }
    }

    return config;
  }

  /**
   * Get full configuration without masking
   */
  getFullConfig() {
    return this.getConfig(true);
  }

  /**
   * Update configuration
   */
  async update(newConfig) {
    if (!this.configLoaded) {
      this.loadConfig();
    }

    // Merge with existing config
    const updatedConfig = { ...this.config };

    // Update only provided fields
    for (const key in newConfig) {
      if (newConfig[key] !== undefined && key in DEFAULT_CONFIG) {
        // Don't overwrite API key if masked value is sent
        if (key === 'tmdb_api_key' && newConfig[key].startsWith('***')) {
          continue;
        }
        updatedConfig[key] = newConfig[key];
      }
    }

    // Ensure config directory exists
    const configDir = path.dirname(CONFIG_PATH);
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }

    // Save to file
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(updatedConfig, null, 2), 'utf8');

    this.config = updatedConfig;
    console.log('✅ Configuration sauvegardée');

    return this.getConfig(false);
  }

  /**
   * Test TMDb API key
   */
  async testTmdbKey(apiKey) {
    try {
      const response = await axios.get(
        `https://api.themoviedb.org/3/configuration?api_key=${apiKey}`,
        { timeout: 5000 }
      );
      return {
        valid: true,
        message: 'Clé API valide'
      };
    } catch (error) {
      return {
        valid: false,
        message: error.response?.status === 401 ? 'Clé API invalide' : 'Erreur de connexion'
      };
    }
  }

  /**
   * Get media configuration for scene-maker
   */
  getMediaConfig() {
    const config = this.getFullConfig();
    const destDir = config.path_torrent_output || '/data/torrent';
    const mediaConfigs = [];

    // Films
    if (config.enable_films && config.path_films) {
      config.path_films.split(',').map(p => p.trim()).filter(Boolean).forEach(sourcePath => {
        if (fs.existsSync(sourcePath)) {
          mediaConfigs.push({
            name: 'films',
            source: sourcePath,
            dest: path.join(destDir, 'films'),
            type: 'movie'
          });
        }
      });
    }

    // Series
    if (config.enable_series && config.path_series) {
      config.path_series.split(',').map(p => p.trim()).filter(Boolean).forEach(sourcePath => {
        if (fs.existsSync(sourcePath)) {
          mediaConfigs.push({
            name: 'series',
            source: sourcePath,
            dest: path.join(destDir, 'series'),
            type: 'tv'
          });
        }
      });
    }

    // Animes Films
    if (config.enable_animes_films && config.path_animes_films) {
      config.path_animes_films.split(',').map(p => p.trim()).filter(Boolean).forEach(sourcePath => {
        if (fs.existsSync(sourcePath)) {
          mediaConfigs.push({
            name: 'animes_films',
            source: sourcePath,
            dest: path.join(destDir, 'animes_films'),
            type: 'movie'
          });
        }
      });
    }

    // Animes Series
    if (config.enable_animes_series && config.path_animes_series) {
      config.path_animes_series.split(',').map(p => p.trim()).filter(Boolean).forEach(sourcePath => {
        if (fs.existsSync(sourcePath)) {
          mediaConfigs.push({
            name: 'animes_series',
            source: sourcePath,
            dest: path.join(destDir, 'animes_series'),
            type: 'tv'
          });
        }
      });
    }

    // Jeux
    if (config.enable_jeux && config.path_jeux) {
      config.path_jeux.split(',').map(p => p.trim()).filter(Boolean).forEach(sourcePath => {
        if (fs.existsSync(sourcePath)) {
          mediaConfigs.push({
            name: 'jeux',
            source: sourcePath,
            dest: path.join(destDir, 'jeux'),
            type: 'game'
          });
        }
      });
    }

    return mediaConfigs;
  }

  /**
   * Get trackers as array
   */
  getTrackers() {
    const config = this.getFullConfig();
    if (!config.trackers) return [];
    return config.trackers.split(',').map(t => t.trim()).filter(Boolean);
  }

  /**
   * Get hardlink mapping
   */
  getHardlinkMapping() {
    const config = this.getFullConfig();
    if (!config.path_hardlinks) return [];

    const result = [];
    const mediaConfigs = this.getMediaConfig();
    const hardlinkDirs = config.path_hardlinks.split(',').map(p => p.trim()).filter(Boolean);

    mediaConfigs.forEach(media => {
      hardlinkDirs.forEach(dest => {
        if (fs.existsSync(dest)) {
          result.push({ source: media.source, dest });
        }
      });
    });

    return result;
  }

  /**
   * Reload configuration
   */
  reloadConfig() {
    this.configLoaded = false;
    return this.loadConfig();
  }
}

module.exports = new ConfigManager();
