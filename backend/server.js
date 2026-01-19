#!/usr/bin/env node

const express = require('express');
const path = require('path');
const cors = require('cors');
const logger = require('./utils/logger');
const apiRoutes = require('./routes/api');
const downloadRoutes = require('./routes/download');
const configRoutes = require('./routes/config');
const { initWebSocket, getWebSocketServer } = require('./services/websocket');
const configManager = require('./services/configManager');
const torrentProcessor = require('./services/torrentProcessor');

// Configuration
const PORT = process.env.WEB_PORT || 3000;
const BASE_PATH = process.env.BASE_PATH || '';
const NODE_ENV = process.env.NODE_ENV || 'production';

// Create Express app
const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging in development
if (NODE_ENV === 'development') {
  app.use((req, res, next) => {
    logger.debug(`${req.method} ${req.url}`);
    next();
  });
}

// API routes
app.use(`${BASE_PATH}/api`, apiRoutes);
app.use(`${BASE_PATH}/api/download`, downloadRoutes);
app.use(`${BASE_PATH}/api/config`, configRoutes);

// Serve frontend static files
const frontendPath = path.join(__dirname, '../frontend/dist');
app.use(`${BASE_PATH}/`, express.static(frontendPath));

// Catch-all route for SPA (must be after API routes)
app.get(`${BASE_PATH}/*`, (req, res) => {
  // Don't handle API or download routes
  if (req.path.startsWith(`${BASE_PATH}/api`)) {
    return res.status(404).json({ error: 'API endpoint not found' });
  }

  // Serve index.html for all other routes (SPA)
  res.sendFile(path.join(frontendPath, 'index.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
  logger.error('Express error:', err);

  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
    ...(NODE_ENV === 'development' && { stack: err.stack })
  });
});

// Start server
const server = app.listen(PORT, () => {
  logger.success(`🚀 Torrentify Web UI started`);
  logger.info(`   📡 Server running on http://localhost:${PORT}${BASE_PATH}`);
  logger.info(`   🌍 Environment: ${NODE_ENV}`);
  logger.info(`   📂 Frontend: ${frontendPath}`);

  if (BASE_PATH) {
    logger.info(`   🔗 Base path: ${BASE_PATH}`);
  }

  // Display configuration
  const config = configManager.getConfig(false);
  logger.info(`\n📋 Configuration:`);
  logger.info(`   TMDB_API_KEY: ${config.tmdb_api_key ? '✓ configured' : '✗ not set'}`);
  logger.info(`   TRACKERS: ${config.trackers ? '✓ configured' : '✗ not set'}`);
  logger.info(`   ENABLE_FILMS: ${config.enable_films}`);
  logger.info(`   ENABLE_SERIES: ${config.enable_series}`);
  logger.info(`   ENABLE_JEUX: ${config.enable_jeux}`);
  logger.info(`   PARALLEL_JOBS: ${config.parallel_jobs}`);

  if (!config.configured) {
    logger.warn(`\n⚠️  Configuration incomplete! Ouvrez l'interface web pour configurer.`);
  }
});

// Initialize WebSocket server
const wsServer = initWebSocket(server);
logger.success('🔌 WebSocket server initialized on /ws');

// Connect WebSocket server to torrent processor
torrentProcessor.setWebSocketServer(wsServer);

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM signal received: closing HTTP server');

  server.close(() => {
    logger.info('HTTP server closed');

    // Close WebSocket connections
    wsServer.close();

    process.exit(0);
  });
});

process.on('SIGINT', () => {
  logger.info('\nSIGINT signal received: closing HTTP server');

  server.close(() => {
    logger.info('HTTP server closed');

    // Close WebSocket connections
    wsServer.close();

    process.exit(0);
  });
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled rejection at:', promise);
  logger.error('Reason:', reason);
});

// Display banner
console.log(`
╔═══════════════════════════════════════╗
║                                       ║
║     🎬  Torrentify Web Interface      ║
║         Version 2.0.0                 ║
║                                       ║
╚═══════════════════════════════════════╝
`);

module.exports = { app, server };
