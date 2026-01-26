import axios from 'axios';

// Utilise le base path de Vite (ex: /torrentify/)
const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');

const api = axios.create({
  baseURL: `${basePath}/api`,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json'
  },
  withCredentials: true
});

// Request interceptor pour ajouter le token d'authentification
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('auth_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    if (import.meta.env.DEV) {
      console.log(`API Request: ${config.method?.toUpperCase()} ${config.url}`);
    }
    return config;
  },
  (error) => {
    console.error('API Request Error:', error);
    return Promise.reject(error);
  }
);

// Response interceptor pour gerer les erreurs d'authentification
api.interceptors.response.use(
  (response) => {
    if (import.meta.env.DEV) {
      console.log(`API Response: ${response.status} ${response.config.url}`);
    }
    return response;
  },
  (error) => {
    if (import.meta.env.DEV) {
      console.error('API Response Error:', error);
    }
    // Si 401 et pas sur la route auth, declencher un evenement
    if (error.response?.status === 401 && !error.config.url.includes('/auth/')) {
      window.dispatchEvent(new CustomEvent('auth:unauthorized'));
    }
    return Promise.reject(error);
  }
);

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
    api.get('/config/roots'),

  // Authentification
  getAuthStatus: () =>
    api.get('/auth/status'),

  login: (username, password) =>
    api.post('/auth/login', { username, password }),

  logout: () =>
    api.post('/auth/logout'),

  checkAuth: () =>
    api.get('/auth/check')
};

export default apiService;
