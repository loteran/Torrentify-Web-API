const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const logger = require('../utils/logger');

const TORRENT_BASE = '/data/torrent';

/**
 * Sanitize folder name to prevent path traversal
 */
function sanitizePath(input) {
  // Remove any path traversal attempts
  return path.basename(input).replace(/\.\./g, '');
}

/**
 * GET /api/download/:type/:folder/:file
 * Download generated files (.torrent, .nfo, .txt)
 *
 * Examples:
 * /api/download/films/Movie.Name.2024/Movie.Name.2024.torrent
 * /api/download/series/Series.Name/Series.Name.nfo
 */
router.get('/:type/:folder/:file', (req, res) => {
  try {
    const { type, folder, file } = req.params;

    // Validate type
    if (type !== 'films' && type !== 'series') {
      return res.status(400).json({
        error: 'Invalid type',
        message: 'Type must be "films" or "series"'
      });
    }

    // Sanitize folder and file names
    const safeFolder = sanitizePath(folder);
    const safeFile = sanitizePath(file);

    // Validate file extension
    const ext = path.extname(safeFile).toLowerCase();
    if (ext !== '.torrent' && ext !== '.nfo' && ext !== '.txt') {
      return res.status(400).json({
        error: 'Invalid file type',
        message: 'Only .torrent, .nfo, and .txt files can be downloaded'
      });
    }

    // Construct file path
    const filePath = path.join(TORRENT_BASE, type, safeFolder, safeFile);

    logger.info(`Download request: ${filePath}`);

    // Check if file exists
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({
        error: 'File not found',
        path: `${type}/${safeFolder}/${safeFile}`
      });
    }

    // Security check: Ensure resolved path is within TORRENT_BASE
    const resolvedPath = path.resolve(filePath);
    const resolvedBase = path.resolve(TORRENT_BASE);

    if (!resolvedPath.startsWith(resolvedBase)) {
      logger.warn(`Path traversal attempt blocked: ${filePath}`);
      return res.status(403).json({
        error: 'Access denied',
        message: 'Path traversal attempt detected'
      });
    }

    // Set content type based on extension
    const contentTypes = {
      '.torrent': 'application/x-bittorrent',
      '.nfo': 'text/plain',
      '.txt': 'text/plain'
    };

    const contentType = contentTypes[ext] || 'application/octet-stream';

    // Set headers for download
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${safeFile}"`);

    // Stream file
    const fileStream = fs.createReadStream(filePath);

    fileStream.on('error', (error) => {
      logger.error(`Error streaming file ${filePath}:`, error);
      if (!res.headersSent) {
        res.status(500).json({
          error: 'Failed to stream file',
          message: error.message
        });
      }
    });

    fileStream.pipe(res);

  } catch (error) {
    logger.error('Error in download route:', error);
    res.status(500).json({
      error: 'Failed to download file',
      message: error.message
    });
  }
});

/**
 * GET /api/download/:type/:folder
 * List all files available for download in a folder
 */
router.get('/:type/:folder', (req, res) => {
  try {
    const { type, folder } = req.params;

    // Validate type
    if (type !== 'films' && type !== 'series') {
      return res.status(400).json({
        error: 'Invalid type',
        message: 'Type must be "films" or "series"'
      });
    }

    // Sanitize folder name
    const safeFolder = sanitizePath(folder);

    // Construct folder path
    const folderPath = path.join(TORRENT_BASE, type, safeFolder);

    logger.info(`List files request: ${folderPath}`);

    // Check if folder exists
    if (!fs.existsSync(folderPath)) {
      return res.status(404).json({
        error: 'Folder not found',
        path: `${type}/${safeFolder}`
      });
    }

    // Read folder contents
    const files = fs.readdirSync(folderPath).filter(file => {
      const ext = path.extname(file).toLowerCase();
      return ext === '.torrent' || ext === '.nfo' || ext === '.txt';
    });

    // Get file stats
    const fileList = files.map(file => {
      const filePath = path.join(folderPath, file);
      const stats = fs.statSync(filePath);

      return {
        name: file,
        size: stats.size,
        modified: stats.mtime.toISOString(),
        downloadUrl: `/api/download/${type}/${safeFolder}/${file}`
      };
    });

    res.json({
      folder: safeFolder,
      type,
      files: fileList
    });

  } catch (error) {
    logger.error('Error listing files:', error);
    res.status(500).json({
      error: 'Failed to list files',
      message: error.message
    });
  }
});

module.exports = router;
