import { useState, useEffect, useCallback } from 'react';
import apiService from '../services/api';
import LogViewer from './LogViewer';
import { useWebSocket } from '../hooks/useWebSocket';

function ProcessingView({ jobId, onClose }) {
  const [job, setJob] = useState(null);
  const [loading, setLoading] = useState(true);
  const { lastMessage } = useWebSocket();

  const fetchJob = useCallback(async () => {
    try {
      const response = await apiService.getJob(jobId);
      setJob(response.data);
      setLoading(false);
    } catch (error) {
      console.error('Error fetching job:', error);
      setLoading(false);
    }
  }, [jobId]);

  useEffect(() => {
    fetchJob();

    // Poll for updates every 2 seconds as fallback for WebSocket
    const pollInterval = setInterval(() => {
      fetchJob();
    }, 2000);

    return () => clearInterval(pollInterval);
  }, [fetchJob]);

  // Handle WebSocket updates
  useEffect(() => {
    if (!lastMessage || lastMessage.jobId !== jobId) return;

    const { type, data } = lastMessage;

    setJob(prevJob => {
      if (!prevJob) return prevJob;

      const updated = { ...prevJob };

      switch (type) {
        case 'job:progress':
          updated.progress = {
            ...updated.progress,
            current: data.current,
            currentFile: data.currentFile
          };
          break;

        case 'job:log':
          updated.logs = [...(updated.logs || []), {
            timestamp: data.timestamp,
            message: data.message,
            level: data.level
          }];
          break;

        case 'job:complete':
          updated.status = 'completed';
          updated.summary = data.summary;
          updated.endTime = data.timestamp;
          break;

        case 'job:error':
          updated.status = 'error';
          updated.error = data.error;
          updated.endTime = data.timestamp;
          break;

        default:
          break;
      }

      return updated;
    });
  }, [lastMessage, jobId]);

  if (loading) {
    return (
      <div className="processing-view-loading">
        <div className="spinner"></div>
        <p>Chargement du job...</p>
      </div>
    );
  }

  if (!job) {
    return (
      <div className="processing-view-error">
        <p>❌ Job introuvable</p>
        <button className="btn btn-primary" onClick={onClose}>
          Retour
        </button>
      </div>
    );
  }

  const isActive = job.status === 'queued' || job.status === 'running';
  const progressPercent = job.progress.total > 0
    ? Math.round((job.progress.current / job.progress.total) * 100)
    : 0;

  const formatDuration = (startTime, endTime) => {
    const start = new Date(startTime);
    const end = endTime ? new Date(endTime) : new Date();
    const durationMs = end - start;

    const seconds = Math.floor(durationMs / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  };

  return (
    <div className="processing-view">
      <div className="processing-header">
        <h2>
          {isActive ? '⚙️ Traitement en cours' : job.status === 'completed' ? '✅ Traitement terminé' : '❌ Erreur'}
        </h2>
        <div className="processing-info">
          <span>Job ID: {jobId}</span>
          <span>Démarré: {new Date(job.startTime).toLocaleString('fr-FR')}</span>
          {job.endTime && (
            <span>Durée: {formatDuration(job.startTime, job.endTime)}</span>
          )}
        </div>
      </div>

      <div className="processing-progress">
        <div className="progress-header">
          <span>Progression: {job.progress.current} / {job.progress.total}</span>
          <span>{progressPercent}%</span>
        </div>

        <div className="progress-bar">
          <div
            className="progress-bar-fill"
            style={{ width: `${progressPercent}%` }}
          ></div>
        </div>

        {job.progress.currentFile && (
          <div className="current-file">
            📄 Fichier en cours: <strong>{job.progress.currentFile}</strong>
          </div>
        )}
      </div>

      {job.summary && (
        <div className="processing-summary">
          <h3>📊 Résumé</h3>
          <div className="summary-stats">
            <div className="stat">
              <span className="stat-label">Traités</span>
              <span className="stat-value">{job.summary.processed}</span>
            </div>
            <div className="stat">
              <span className="stat-label">Ignorés</span>
              <span className="stat-value">{job.summary.skipped}</span>
            </div>
            <div className="stat">
              <span className="stat-label">TMDb trouvés</span>
              <span className="stat-value">{job.summary.tmdbFound}</span>
            </div>
            <div className="stat">
              <span className="stat-label">TMDb manquants</span>
              <span className="stat-value">{job.summary.tmdbMissing}</span>
            </div>
            {job.summary.errors > 0 && (
              <div className="stat error">
                <span className="stat-label">Erreurs</span>
                <span className="stat-value">{job.summary.errors}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {job.error && (
        <div className="processing-error">
          <h3>❌ Erreur</h3>
          <p>{job.error}</p>
        </div>
      )}

      <LogViewer logs={job.logs || []} />

      <div className="processing-actions">
        <button
          className="btn btn-primary"
          onClick={onClose}
          disabled={isActive}
        >
          {isActive ? '⏳ En cours...' : '← Retour à la liste'}
        </button>
      </div>
    </div>
  );
}

export default ProcessingView;
