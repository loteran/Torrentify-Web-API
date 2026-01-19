import axios from 'axios';

// Utilise le base path de Vite (ex: /torrentify/)
const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');

const api = axios.create({
  baseURL: `${basePath}/api`,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json'
  }
});

// Request interceptor for logging (development)
if (import.meta.env.DEV) {
  api.interceptors.request.use(
    (config) => {
      console.log(`API Request: ${config.method?.toUpperCase()} ${config.url}`);
      return config;
    },
    (error) => {
      console.error('API Request Error:', error);
      return Promise.reject(error);
    }
  );

  api.interceptors.response.use(
    (response) => {
      console.log(`API Response: ${response.status} ${response.config.url}`);
      return response;
    },
    (error) => {
      console.error('API Response Error:', error);
      return Promise.reject(error);
    }
  );
}

export const apiService = {
  // Health check
  health: () => api.get('/health'),

  // Files
  getFiles: (type = 'all', refresh = false) =>
    api.get('/files', { params: { type, refresh, grouped: true } }),

  getFileById: (id) =>
    api.get(`/files/${id}`),

  // Processing
  processFiles: (fileIds) =>
    api.post('/process', { files: fileIds }),

  // Process directories (creates one torrent per directory)
  // torrentNames is an object: { dirId: "Custom Torrent Name", ... }
  processDirectories: (directoryIds, torrentNames = {}) =>
    api.post('/process', { directories: directoryIds, torrentNames }),

  // Jobs
  getJobs: (status = null) =>
    api.get('/jobs', { params: status ? { status } : {} }),

  getJob: (jobId) =>
    api.get(`/jobs/${jobId}`),

  // Stats
  getStats: () =>
    api.get('/stats'),

  // Cache
  clearCache: () =>
    api.post('/cache/clear'),

  // Download URLs (returns URL string, not axios call)
  getDownloadUrl: (type, folder, file) =>
    `${basePath}/api/download/${type}/${folder}/${file}`,

  listDownloads: (type, folder) =>
    api.get(`/download/${type}/${folder}`),

  // Configuration
  getConfig: () =>
    api.get('/config'),

  getConfigStatus: () =>
    api.get('/config/status'),

  updateConfig: (config) =>
    api.put('/config', config),

  testTmdbKey: (apiKey) =>
    api.post('/config/test-tmdb', { apiKey }),

  getDirectories: () =>
    api.get('/config/directories'),

  // Exploration de fichiers
  browse: (path) =>
    api.get('/config/browse', { params: { path } }),

  getRoots: () =>
    api.get('/config/roots')
};

export default apiService;
