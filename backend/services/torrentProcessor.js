const sceneMaker = require('../../scene-maker');
const processQueue = require('./processQueue');
const fileScanner = require('./fileScanner');
const configManager = require('./configManager');

class TorrentProcessor {
  constructor() {
    this.wsServer = null; // Will be set by websocket service
  }

  /**
   * Set WebSocket server for broadcasting events
   */
  setWebSocketServer(wsServer) {
    this.wsServer = wsServer;
  }

  /**
   * Broadcast event to all WebSocket clients
   */
  broadcast(event) {
    if (this.wsServer && this.wsServer.broadcast) {
      this.wsServer.broadcast(event);
    }
  }

  /**
   * Process files by their IDs
   * @param {string[]} fileIds - Array of file IDs to process
   * @returns {Promise<string>} - Job ID
   */
  async processFilesByIds(fileIds) {
    // Get file objects from scanner
    const files = await fileScanner.getFilesByIds(fileIds);

    if (files.length === 0) {
      throw new Error('No valid files found for the provided IDs');
    }

    // Create job
    const jobId = processQueue.createJob(files);

    // Start processing asynchronously (don't await)
    this.startProcessing(jobId, files).catch(error => {
      console.error(`Error processing job ${jobId}:`, error);
      processQueue.setJobError(jobId, error.message);
      this.broadcast({
        type: 'job:error',
        jobId,
        data: {
          error: error.message,
          timestamp: new Date().toISOString()
        }
      });
    });

    return jobId;
  }

  /**
   * Start processing files for a job
   */
  async startProcessing(jobId, files) {
    // Update job status to running
    processQueue.updateJobStatus(jobId, 'running');

    this.broadcast({
      type: 'job:start',
      jobId,
      data: {
        filesCount: files.length,
        timestamp: new Date().toISOString()
      }
    });

    // Extract file paths
    const filePaths = files.map(f => f.path);

    // Create progress callback
    const progressCallback = (event) => {
      this.handleProgressEvent(jobId, event);
    };

    try {
      // Get dynamic configuration
      const mediaConfig = configManager.getMediaConfig();
      const trackers = configManager.getTrackers();
      const fullConfig = configManager.getFullConfig();

      // Process files using scene-maker with dynamic config
      const summary = await sceneMaker.processFiles(filePaths, progressCallback, {
        mediaConfig,
        trackers,
        tmdbApiKey: fullConfig.tmdb_api_key
      });

      // Update job with summary
      processQueue.setJobSummary(jobId, summary);
      processQueue.updateJobStatus(jobId, 'completed');

      // Broadcast completion
      this.broadcast({
        type: 'job:complete',
        jobId,
        data: {
          summary,
          timestamp: new Date().toISOString()
        }
      });

      // Clear file scanner cache to reflect new processed files
      fileScanner.clearCache();

      console.log(`✅ Job ${jobId} completed: ${summary.processed} processed, ${summary.skipped} skipped`);

    } catch (error) {
      // Handle error
      processQueue.setJobError(jobId, error.message);

      this.broadcast({
        type: 'job:error',
        jobId,
        data: {
          error: error.message,
          timestamp: new Date().toISOString()
        }
      });

      console.error(`❌ Job ${jobId} failed:`, error);
      throw error;
    }
  }

  /**
   * Handle progress events from scene-maker
   */
  handleProgressEvent(jobId, event) {
    const { type, ...data } = event;

    switch (type) {
      case 'log':
        // Add log to job
        processQueue.addLog(jobId, data.message, data.level);

        // Broadcast log event
        this.broadcast({
          type: 'job:log',
          jobId,
          data: {
            message: data.message,
            level: data.level,
            timestamp: data.timestamp
          }
        });
        break;

      case 'progress':
        // Update job progress
        processQueue.updateProgress(jobId, {
          current: data.current,
          currentFile: data.currentFile
        });

        // Broadcast progress event
        this.broadcast({
          type: 'job:progress',
          jobId,
          data: {
            current: data.current,
            total: data.total,
            currentFile: data.currentFile,
            timestamp: data.timestamp
          }
        });
        break;

      case 'file:status':
        // Update file status in job
        processQueue.updateFileStatus(jobId, data.file, data.status);

        // Increment completed count
        const job = processQueue.getJob(jobId);
        if (job && data.status === 'completed') {
          processQueue.updateProgress(jobId, {
            completed: job.progress.completed + 1
          });
        }

        // Broadcast file status change
        this.broadcast({
          type: 'file:status',
          jobId,
          data: {
            file: data.file,
            status: data.status,
            outputs: data.outputs,
            timestamp: new Date().toISOString()
          }
        });
        break;

      case 'directory:status':
        // Update directory status in job
        const dirJob = processQueue.getJob(jobId);
        if (dirJob && !data.skipped) {
          processQueue.updateProgress(jobId, {
            completed: dirJob.progress.completed + 1
          });
        }

        // Broadcast directory status change
        this.broadcast({
          type: 'directory:status',
          jobId,
          data: {
            dirPath: data.dirPath,
            dirName: data.dirName,
            skipped: data.skipped,
            outputs: data.outputs,
            timestamp: new Date().toISOString()
          }
        });
        break;

      case 'complete':
        // Already handled in startProcessing
        break;

      default:
        console.warn(`Unknown progress event type: ${type}`);
    }
  }

  /**
   * Process directories by their IDs
   * @param {string[]} directoryIds - Array of directory IDs to process
   * @param {Object} torrentNames - Object mapping directory IDs to custom torrent names
   * @returns {Promise<string>} - Job ID
   */
  async processDirectoriesByIds(directoryIds, torrentNames = {}) {
    // Get directory objects from scanner
    const directories = [];
    for (const dirId of directoryIds) {
      const dir = await fileScanner.getDirectoryById(dirId);
      if (dir) {
        // Add custom torrent name if provided
        dir.customTorrentName = torrentNames[dirId] || null;
        directories.push(dir);
      }
    }

    if (directories.length === 0) {
      throw new Error('No valid directories found for the provided IDs');
    }

    // Create job with directory info
    const jobId = processQueue.createJob(directories.map(d => ({
      id: d.id,
      name: d.name,
      path: d.path,
      isDirectory: true,
      filesCount: d.files.length,
      customTorrentName: d.customTorrentName
    })));

    // Start processing asynchronously
    this.startProcessingDirectories(jobId, directories).catch(error => {
      console.error(`Error processing directories job ${jobId}:`, error);
      processQueue.setJobError(jobId, error.message);
      this.broadcast({
        type: 'job:error',
        jobId,
        data: {
          error: error.message,
          timestamp: new Date().toISOString()
        }
      });
    });

    return jobId;
  }

  /**
   * Start processing directories for a job
   */
  async startProcessingDirectories(jobId, directories) {
    // Update job status to running
    processQueue.updateJobStatus(jobId, 'running');

    this.broadcast({
      type: 'job:start',
      jobId,
      data: {
        directoriesCount: directories.length,
        isDirectory: true,
        timestamp: new Date().toISOString()
      }
    });

    // Create progress callback
    const progressCallback = (event) => {
      this.handleProgressEvent(jobId, event);
    };

    try {
      // Get dynamic configuration
      const mediaConfig = configManager.getMediaConfig();
      const trackers = configManager.getTrackers();
      const fullConfig = configManager.getFullConfig();

      // Process directories using scene-maker with dynamic config
      const summary = await sceneMaker.processDirectories(directories, progressCallback, {
        mediaConfig,
        trackers,
        tmdbApiKey: fullConfig.tmdb_api_key
      });

      // Update job with summary
      processQueue.setJobSummary(jobId, summary);
      processQueue.updateJobStatus(jobId, 'completed');

      // Broadcast completion
      this.broadcast({
        type: 'job:complete',
        jobId,
        data: {
          summary,
          isDirectory: true,
          timestamp: new Date().toISOString()
        }
      });

      // Clear file scanner cache
      fileScanner.clearCache();

      console.log(`✅ Directory job ${jobId} completed: ${summary.processed} processed, ${summary.skipped} skipped`);

    } catch (error) {
      processQueue.setJobError(jobId, error.message);

      this.broadcast({
        type: 'job:error',
        jobId,
        data: {
          error: error.message,
          timestamp: new Date().toISOString()
        }
      });

      console.error(`❌ Directory job ${jobId} failed:`, error);
      throw error;
    }
  }

  /**
   * Get job status
   */
  getJobStatus(jobId) {
    return processQueue.getJob(jobId);
  }

  /**
   * Get all jobs
   */
  getAllJobs() {
    return processQueue.getAllJobs();
  }

  /**
   * Get active jobs
   */
  getActiveJobs() {
    return processQueue.getActiveJobs();
  }

  /**
   * Get job statistics
   */
  getJobStats() {
    return processQueue.getStats();
  }
}

// Export singleton instance
module.exports = new TorrentProcessor();
