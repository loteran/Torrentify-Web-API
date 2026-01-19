import { useState, useEffect } from 'react';
import { useWebSocket } from './hooks/useWebSocket';
import { useFileList } from './hooks/useFileList';
import FileList from './components/FileList';
import ProcessingView from './components/ProcessingView';
import StatsPanel from './components/StatsPanel';
import ConfigPanel from './components/ConfigPanel';
import apiService from './services/api';
import './styles/App.css';

function App() {
  const [activeTab, setActiveTab] = useState('all');
  const [activeJob, setActiveJob] = useState(null);
  const [showStats, setShowStats] = useState(false);
  const [showConfig, setShowConfig] = useState(false);
  const [isConfigured, setIsConfigured] = useState(null); // null = loading
  const [needsSetup, setNeedsSetup] = useState(false);

  const { connected, lastMessage, subscribe, unsubscribe } = useWebSocket();
  const { files, stats, loading, error, refresh } = useFileList(activeTab);

  // Verifier la configuration au demarrage
  useEffect(() => {
    checkConfiguration();
  }, []);

  const checkConfiguration = async () => {
    try {
      const response = await apiService.getConfigStatus();
      const { configured } = response.data;
      setIsConfigured(configured);
      setNeedsSetup(!configured);
    } catch (err) {
      console.error('Erreur verification config:', err);
      setIsConfigured(false);
      setNeedsSetup(true);
    }
  };

  // Handle WebSocket messages
  useEffect(() => {
    if (!lastMessage) return;

    const { type, jobId, data } = lastMessage;

    switch (type) {
      case 'job:start':
        console.log('Job started:', jobId);
        break;

      case 'job:progress':
      case 'job:log':
        // Update handled by ProcessingView
        break;

      case 'job:complete':
        console.log('Job completed:', jobId);
        // Refresh file list to show updated status
        setTimeout(() => refresh(), 1000);
        break;

      case 'job:error':
        console.error('Job error:', data);
        break;

      case 'file:status':
        // Refresh to show updated file status
        refresh();
        break;

      default:
        break;
    }
  }, [lastMessage, refresh]);

  const handleProcessingStart = (jobId) => {
    setActiveJob(jobId);
    setActiveTab('processing');
    subscribe(jobId);
  };

  const handleProcessingClose = () => {
    if (activeJob) {
      unsubscribe(activeJob);
    }
    setActiveJob(null);
    setActiveTab('all');
    refresh();
  };

  const handleConfigSave = () => {
    setIsConfigured(true);
    setNeedsSetup(false);
    setShowConfig(false);
    refresh();
  };

  // Ecran de chargement
  if (isConfigured === null) {
    return (
      <div className="app">
        <div className="app-loading">
          <div className="spinner"></div>
          <p>Chargement...</p>
        </div>
      </div>
    );
  }

  // Page de configuration initiale
  if (needsSetup) {
    return (
      <div className="app">
        <header className="app-header">
          <h1>🧲 Torrentify</h1>
        </header>
        <ConfigPanel isSetup={true} onSave={handleConfigSave} />
      </div>
    );
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1>🧲 Torrentify</h1>
        <div className="header-actions">
          <span className={`connection-status ${connected ? 'connected' : 'disconnected'}`}>
            {connected ? '🟢 Connecte' : '🔴 Deconnecte'}
          </span>
          <button
            className="btn btn-secondary"
            onClick={() => setShowConfig(true)}
            title="Configuration"
          >
            ⚙️
          </button>
          <button
            className="btn btn-secondary"
            onClick={() => setShowStats(!showStats)}
          >
            📊 Stats
          </button>
        </div>
      </header>

      <nav className="app-tabs">
        <button
          className={`tab ${activeTab === 'all' ? 'active' : ''}`}
          onClick={() => setActiveTab('all')}
          disabled={activeJob}
        >
          Tous
        </button>
        <button
          className={`tab ${activeTab === 'films' ? 'active' : ''}`}
          onClick={() => setActiveTab('films')}
          disabled={activeJob}
        >
          Films
        </button>
        <button
          className={`tab ${activeTab === 'series' ? 'active' : ''}`}
          onClick={() => setActiveTab('series')}
          disabled={activeJob}
        >
          Series
        </button>
        <button
          className={`tab ${activeTab === 'animes_films' ? 'active' : ''}`}
          onClick={() => setActiveTab('animes_films')}
          disabled={activeJob}
        >
          Animes Films
        </button>
        <button
          className={`tab ${activeTab === 'animes_series' ? 'active' : ''}`}
          onClick={() => setActiveTab('animes_series')}
          disabled={activeJob}
        >
          Animes Series
        </button>
        <button
          className={`tab ${activeTab === 'jeux' ? 'active' : ''}`}
          onClick={() => setActiveTab('jeux')}
          disabled={activeJob}
        >
          Jeux
        </button>
        {activeJob && (
          <button
            className="tab active"
          >
            ⚙️ Traitement
          </button>
        )}
      </nav>

      <main className="app-main">
        {error && (
          <div className="error-banner">
            ❌ Erreur: {error}
          </div>
        )}

        {activeJob ? (
          <ProcessingView
            jobId={activeJob}
            onClose={handleProcessingClose}
          />
        ) : (
          <FileList
            files={files}
            stats={stats}
            loading={loading}
            type={activeTab}
            onProcessingStart={handleProcessingStart}
            onRefresh={refresh}
          />
        )}
      </main>

      {showStats && (
        <StatsPanel
          onClose={() => setShowStats(false)}
        />
      )}

      {showConfig && (
        <ConfigPanel
          onClose={() => setShowConfig(false)}
          onSave={handleConfigSave}
        />
      )}

      <footer className="app-footer">
        <p>
          Torrentify v2.0.0 - Generateur automatique de torrents
          {stats && ` • ${stats.totalFiles} fichiers • ${stats.completed} traites`}
        </p>
      </footer>
    </div>
  );
}

export default App;
