import { useState, useEffect } from 'react';
import apiService from '../services/api';

function StatsPanel({ onClose }) {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      setLoading(true);
      const response = await apiService.getStats();
      setStats(response.data);
      setError(null);
    } catch (err) {
      console.error('Error fetching stats:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const formatBytes = (bytes) => {
    if (!bytes) return '-';
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    if (bytes === 0) return '0 B';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round((bytes / Math.pow(1024, i)) * 100) / 100 + ' ' + sizes[i];
  };

  const formatUptime = (seconds) => {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);

    if (days > 0) {
      return `${days}j ${hours}h ${minutes}m`;
    } else if (hours > 0) {
      return `${hours}h ${minutes}m`;
    } else {
      return `${minutes}m`;
    }
  };

  return (
    <div className="stats-panel-overlay" onClick={onClose}>
      <div className="stats-panel" onClick={(e) => e.stopPropagation()}>
        <div className="stats-panel-header">
          <h2>📊 Statistiques</h2>
          <button className="btn-close" onClick={onClose}>✕</button>
        </div>

        <div className="stats-panel-content">
          {loading ? (
            <div className="stats-loading">
              <div className="spinner"></div>
              <p>Chargement des statistiques...</p>
            </div>
          ) : error ? (
            <div className="stats-error">
              <p>❌ Erreur: {error}</p>
              <button className="btn btn-secondary" onClick={fetchStats}>
                Réessayer
              </button>
            </div>
          ) : stats ? (
            <>
              <div className="stats-section">
                <h3>📁 Fichiers</h3>
                <div className="stats-grid">
                  <div className="stat-box">
                    <span className="stat-label">Total</span>
                    <span className="stat-value">{stats.files.totalFiles}</span>
                  </div>
                  <div className="stat-box success">
                    <span className="stat-label">Traités</span>
                    <span className="stat-value">{stats.files.completed}</span>
                  </div>
                  <div className="stat-box warning">
                    <span className="stat-label">En attente</span>
                    <span className="stat-value">{stats.files.pending}</span>
                  </div>
                  <div className="stat-box info">
                    <span className="stat-label">Taux de complétion</span>
                    <span className="stat-value">{stats.files.completionRate}%</span>
                  </div>
                  <div className="stat-box">
                    <span className="stat-label">Taille totale</span>
                    <span className="stat-value">{formatBytes(stats.files.totalSize)}</span>
                  </div>
                </div>
              </div>

              <div className="stats-section">
                <h3>⚙️ Jobs</h3>
                <div className="stats-grid">
                  <div className="stat-box">
                    <span className="stat-label">Total</span>
                    <span className="stat-value">{stats.jobs.total}</span>
                  </div>
                  <div className="stat-box info">
                    <span className="stat-label">En cours</span>
                    <span className="stat-value">{stats.jobs.running}</span>
                  </div>
                  <div className="stat-box">
                    <span className="stat-label">En file</span>
                    <span className="stat-value">{stats.jobs.queued}</span>
                  </div>
                  <div className="stat-box success">
                    <span className="stat-label">Terminés</span>
                    <span className="stat-value">{stats.jobs.completed}</span>
                  </div>
                  <div className="stat-box error">
                    <span className="stat-label">Erreurs</span>
                    <span className="stat-value">{stats.jobs.errors}</span>
                  </div>
                </div>
              </div>

              <div className="stats-section">
                <h3>🌐 Système</h3>
                <div className="stats-grid">
                  <div className="stat-box">
                    <span className="stat-label">Uptime</span>
                    <span className="stat-value">{formatUptime(stats.system.uptime)}</span>
                  </div>
                  <div className="stat-box">
                    <span className="stat-label">Mémoire utilisée</span>
                    <span className="stat-value">{formatBytes(stats.system.memory.used)}</span>
                  </div>
                  <div className="stat-box">
                    <span className="stat-label">Node.js</span>
                    <span className="stat-value">{stats.system.nodeVersion}</span>
                  </div>
                  <div className="stat-box">
                    <span className="stat-label">WebSocket clients</span>
                    <span className="stat-value">{stats.websocket.connectedClients}</span>
                  </div>
                </div>
              </div>
            </>
          ) : null}
        </div>

        <div className="stats-panel-footer">
          <button className="btn btn-secondary" onClick={fetchStats} disabled={loading}>
            🔄 Actualiser
          </button>
          <button className="btn btn-primary" onClick={onClose}>
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
}

export default StatsPanel;
