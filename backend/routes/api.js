const express = require('express');
const router = express.Router();
const fileScanner = require('../services/fileScanner');
const torrentProcessor = require('../services/torrentProcessor');
const { getWebSocketServer } = require('../services/websocket');
const logger = require('../utils/logger');

/**
 * GET /api/health
 * Health check endpoint
 */
router.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    version: '2.0.0',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

/**
 * GET /api/files
 * Get all video files with their processing status
 * Query params: type (films|series|all), refresh (true|false), grouped (true|false)
 */
router.get('/files', async (req, res) => {
  try {
    const type = req.query.type || 'all';
    const forceRefresh = req.query.refresh === 'true';
    const grouped = req.query.grouped === 'true';

    logger.info(`GET /api/files - type: ${type}, refresh: ${forceRefresh}, grouped: ${grouped}`);

    let files;
    if (grouped) {
      files = await fileScanner.getFilesWithDirectories(type, forceRefresh);
    } else {
      files = await fileScanner.getFilesByType(type, forceRefresh);
    }

    res.json(files);

  } catch (error) {
    logger.error('Error getting files:', error);
    res.status(500).json({
      error: 'Failed to retrieve files',
      message: error.message
    });
  }
});

/**
 * GET /api/files/:id
 * Get a single file by ID
 */
router.get('/files/:id', async (req, res) => {
  try {
    const fileId = req.params.id;

    logger.info(`GET /api/files/${fileId}`);

    const file = await fileScanner.getFileById(fileId);

    if (!file) {
      return res.status(404).json({
        error: 'File not found',
        fileId
      });
    }

    res.json(file);

  } catch (error) {
    logger.error('Error getting file:', error);
    res.status(500).json({
      error: 'Failed to retrieve file',
      message: error.message
    });
  }
});

/**
 * POST /api/process
 * Start processing selected files or directories
 * Body: { files: ["fileId1", ...], directories: ["dirId1", ...] }
 */
router.post('/process', async (req, res) => {
  try {
    const { files, directories, torrentNames } = req.body;

    const hasFiles = files && Array.isArray(files) && files.length > 0;
    const hasDirectories = directories && Array.isArray(directories) && directories.length > 0;

    if (!hasFiles && !hasDirectories) {
      return res.status(400).json({
        error: 'Invalid request',
        message: 'Body must contain an array of file IDs or directory IDs'
      });
    }

    let totalItems = 0;
    let jobId;

    if (hasDirectories) {
      // Process directories (creates one torrent per directory)
      // torrentNames is an object: { dirId: "Custom Name", ... }
      logger.info(`POST /api/process - processing ${directories.length} directories`);
      jobId = await torrentProcessor.processDirectoriesByIds(directories, torrentNames || {});
      totalItems = directories.length;
    } else {
      // Process individual files
      logger.info(`POST /api/process - processing ${files.length} files`);
      jobId = await torrentProcessor.processFilesByIds(files);
      totalItems = files.length;
    }

    res.json({
      jobId,
      filesCount: totalItems,
      isDirectory: hasDirectories,
      message: 'Processing started',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Error starting processing:', error);
    res.status(500).json({
      error: 'Failed to start processing',
      message: error.message
    });
  }
});

/**
 * GET /api/jobs
 * Get all jobs
 */
router.get('/jobs', (req, res) => {
  try {
    const status = req.query.status; // Optional filter: queued|running|completed|error

    logger.info(`GET /api/jobs - status filter: ${status || 'all'}`);

    let jobs = torrentProcessor.getAllJobs();

    if (status) {
      jobs = jobs.filter(job => job.status === status);
    }

    res.json({
      jobs,
      count: jobs.length
    });

  } catch (error) {
    logger.error('Error getting jobs:', error);
    res.status(500).json({
      error: 'Failed to retrieve jobs',
      message: error.message
    });
  }
});

/**
 * GET /api/jobs/:jobId
 * Get job status and details
 */
router.get('/jobs/:jobId', (req, res) => {
  try {
    const { jobId } = req.params;

    logger.info(`GET /api/jobs/${jobId}`);

    const job = torrentProcessor.getJobStatus(jobId);

    if (!job) {
      return res.status(404).json({
        error: 'Job not found',
        jobId
      });
    }

    res.json(job);

  } catch (error) {
    logger.error('Error getting job:', error);
    res.status(500).json({
      error: 'Failed to retrieve job',
      message: error.message
    });
  }
});

/**
 * GET /api/stats
 * Get system and processing statistics
 */
router.get('/stats', async (req, res) => {
  try {
    logger.info('GET /api/stats');

    const files = await fileScanner.getFiles();
    const jobStats = torrentProcessor.getJobStats();
    const wsServer = getWebSocketServer();
    const wsStats = wsServer.getStats();

    res.json({
      files: files.stats,
      jobs: jobStats,
      websocket: {
        connectedClients: wsStats.connectedClients
      },
      system: {
        uptime: process.uptime(),
        memory: {
          used: process.memoryUsage().heapUsed,
          total: process.memoryUsage().heapTotal
        },
        nodeVersion: process.version
      }
    });

  } catch (error) {
    logger.error('Error getting stats:', error);
    res.status(500).json({
      error: 'Failed to retrieve statistics',
      message: error.message
    });
  }
});

/**
 * POST /api/cache/clear
 * Clear file scanner cache
 */
router.post('/cache/clear', (req, res) => {
  try {
    logger.info('POST /api/cache/clear');

    fileScanner.clearCache();

    res.json({
      message: 'Cache cleared successfully',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Error clearing cache:', error);
    res.status(500).json({
      error: 'Failed to clear cache',
      message: error.message
    });
  }
});

module.exports = router;
