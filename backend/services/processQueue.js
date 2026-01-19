const { v4: uuidv4 } = require('crypto');

class ProcessQueue {
  constructor() {
    this.jobs = new Map(); // jobId -> job object
    this.activeJobs = new Set(); // Set of jobIds currently processing
  }

  /**
   * Generate a unique job ID
   */
  generateJobId() {
    // Use crypto to generate UUID-like ID
    const randomBytes = require('crypto').randomBytes(16);
    return randomBytes.toString('hex').substring(0, 16);
  }

  /**
   * Create a new processing job
   * @param {Array} files - Array of file objects to process
   * @returns {string} - Job ID
   */
  createJob(files) {
    const jobId = this.generateJobId();

    const job = {
      id: jobId,
      status: 'queued', // queued | running | completed | error
      files: files.map(f => ({
        id: f.id,
        path: f.path,
        name: f.name,
        status: 'pending' // pending | processing | completed | error
      })),
      progress: {
        total: files.length,
        completed: 0,
        current: 0,
        currentFile: null
      },
      logs: [],
      startTime: new Date().toISOString(),
      endTime: null,
      summary: null,
      error: null
    };

    this.jobs.set(jobId, job);
    return jobId;
  }

  /**
   * Get a job by ID
   */
  getJob(jobId) {
    return this.jobs.get(jobId) || null;
  }

  /**
   * Get all jobs
   */
  getAllJobs() {
    return Array.from(this.jobs.values());
  }

  /**
   * Get active jobs (queued or running)
   */
  getActiveJobs() {
    return Array.from(this.jobs.values()).filter(
      job => job.status === 'queued' || job.status === 'running'
    );
  }

  /**
   * Update job status
   */
  updateJobStatus(jobId, status) {
    const job = this.jobs.get(jobId);
    if (!job) return false;

    job.status = status;

    if (status === 'running') {
      this.activeJobs.add(jobId);
    } else if (status === 'completed' || status === 'error') {
      job.endTime = new Date().toISOString();
      this.activeJobs.delete(jobId);
    }

    return true;
  }

  /**
   * Update job progress
   */
  updateProgress(jobId, progressData) {
    const job = this.jobs.get(jobId);
    if (!job) return false;

    if (progressData.current !== undefined) {
      job.progress.current = progressData.current;
    }
    if (progressData.completed !== undefined) {
      job.progress.completed = progressData.completed;
    }
    if (progressData.currentFile !== undefined) {
      job.progress.currentFile = progressData.currentFile;
    }

    return true;
  }

  /**
   * Add a log entry to a job
   */
  addLog(jobId, message, level = 'info') {
    const job = this.jobs.get(jobId);
    if (!job) return false;

    const logEntry = {
      timestamp: new Date().toISOString(),
      message,
      level
    };

    job.logs.push(logEntry);

    // Keep only last 1000 log entries to prevent memory issues
    if (job.logs.length > 1000) {
      job.logs = job.logs.slice(-1000);
    }

    return true;
  }

  /**
   * Update file status within a job
   */
  updateFileStatus(jobId, filePath, status) {
    const job = this.jobs.get(jobId);
    if (!job) return false;

    const file = job.files.find(f => f.path === filePath);
    if (file) {
      file.status = status;
      return true;
    }

    return false;
  }

  /**
   * Set job summary (completion statistics)
   */
  setJobSummary(jobId, summary) {
    const job = this.jobs.get(jobId);
    if (!job) return false;

    job.summary = summary;
    return true;
  }

  /**
   * Set job error
   */
  setJobError(jobId, error) {
    const job = this.jobs.get(jobId);
    if (!job) return false;

    job.error = error;
    job.status = 'error';
    job.endTime = new Date().toISOString();
    this.activeJobs.delete(jobId);

    return true;
  }

  /**
   * Delete a job
   */
  deleteJob(jobId) {
    this.activeJobs.delete(jobId);
    return this.jobs.delete(jobId);
  }

  /**
   * Clean up old completed jobs (keep last 24 hours)
   */
  cleanupOldJobs(maxAgeMs = 24 * 60 * 60 * 1000) {
    const now = Date.now();
    let cleaned = 0;

    for (const [jobId, job] of this.jobs.entries()) {
      if (job.endTime && job.status !== 'running' && job.status !== 'queued') {
        const endTime = new Date(job.endTime).getTime();
        if (now - endTime > maxAgeMs) {
          this.jobs.delete(jobId);
          cleaned++;
        }
      }
    }

    return cleaned;
  }

  /**
   * Get statistics about jobs
   */
  getStats() {
    const jobs = Array.from(this.jobs.values());

    return {
      total: jobs.length,
      queued: jobs.filter(j => j.status === 'queued').length,
      running: jobs.filter(j => j.status === 'running').length,
      completed: jobs.filter(j => j.status === 'completed').length,
      errors: jobs.filter(j => j.status === 'error').length,
      activeJobs: this.activeJobs.size
    };
  }

  /**
   * Check if a job is active (queued or running)
   */
  isJobActive(jobId) {
    return this.activeJobs.has(jobId);
  }

  /**
   * Get job logs with pagination
   */
  getJobLogs(jobId, offset = 0, limit = 100) {
    const job = this.jobs.get(jobId);
    if (!job) return null;

    const logs = job.logs.slice(offset, offset + limit);
    return {
      logs,
      total: job.logs.length,
      offset,
      limit
    };
  }
}

// Export singleton instance
module.exports = new ProcessQueue();
