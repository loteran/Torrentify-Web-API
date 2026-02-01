import { useState, useEffect } from 'react';
import apiService from '../services/api';
import FolderBrowser from './FolderBrowser';
import NginxGenerator from './NginxGenerator';

// Composant pour gerer plusieurs repertoires
function MultiPathInput({ label, paths, onChange, onBrowse }) {
  const pathList = paths ? paths.split(',').map(p => p.trim()).filter(Boolean) : [];

  const addPath = () => {
    onBrowse();
  };

  const removePath = (index) => {
    const newPaths = [...pathList];
    newPaths.splice(index, 1);
    onChange(newPaths.join(','));
  };

  const updatePath = (index, value) => {
    const newPaths = [...pathList];
    newPaths[index] = value;
    onChange(newPaths.join(','));
  };

  return (
    <div className="config-field multi-path-field">
      <label>{label}</label>
      <div className="multi-path-list">
        {pathList.length === 0 ? (
          <div className="multi-path-empty">Aucun repertoire configure</div>
        ) : (
          pathList.map((p, index) => (
            <div key={index} className="multi-path-item">
              <input
                type="text"
                value={p}
                onChange={(e) => updatePath(index, e.target.value)}
                placeholder="/chemin/vers/dossier"
              />
              <button
                className="btn btn-danger btn-small"
                onClick={() => removePath(index)}
                title="Supprimer ce repertoire"
              >
                &times;
              </button>
            </div>
          ))
        )}
      </div>
      <button className="btn btn-secondary btn-add-path" onClick={addPath}>
        + Ajouter un repertoire
      </button>
    </div>
  );
}

function ConfigPanel({ onClose, onSave, isSetup = false }) {
  const [config, setConfig] = useState({
    tmdb_api_key: '',
    trackers: '',
    path_films: '',
    path_series: '',
    path_animes_films: '',
    path_animes_series: '',
    path_jeux: '',
    path_torrent_output: '',
    path_hardlinks: '',
    enable_films: true,
    enable_series: true,
    enable_animes_films: true,
    enable_animes_series: true,
    enable_jeux: true,
    parallel_jobs: 1,
    // Authentification
    auth_enabled: false,
    auth_username: '',
    auth_password: ''
  });
  const [directories, setDirectories] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [error, setError] = useState(null);
  const [browserOpen, setBrowserOpen] = useState(false);
  const [browserTarget, setBrowserTarget] = useState(null);
  const [browserMode, setBrowserMode] = useState('replace'); // 'replace' ou 'add'

  // Charger la configuration
  useEffect(() => {
    loadConfig();
    loadDirectories();
  }, []);

  const loadConfig = async () => {
    try {
      const response = await apiService.getConfig();
      const data = response.data;
      setConfig({
        tmdb_api_key: data.tmdb_api_key?.startsWith('***') ? '' : (data.tmdb_api_key || ''),
        trackers: data.trackers || '',
        path_films: data.path_films || '',
        path_series: data.path_series || '',
        path_animes_films: data.path_animes_films || '',
        path_animes_series: data.path_animes_series || '',
        path_jeux: data.path_jeux || '',
        path_torrent_output: data.path_torrent_output || '',
        path_hardlinks: data.path_hardlinks || '',
        enable_films: data.enable_films ?? true,
        enable_series: data.enable_series ?? true,
        enable_animes_films: data.enable_animes_films ?? true,
        enable_animes_series: data.enable_animes_series ?? true,
        enable_jeux: data.enable_jeux ?? true,
        parallel_jobs: data.parallel_jobs || 1,
        // Authentification
        auth_enabled: data.auth_enabled ?? false,
        auth_username: data.auth_username || '',
        auth_password: '' // Ne pas afficher le mot de passe existant
      });
    } catch (err) {
      setError('Erreur chargement configuration');
    } finally {
      setLoading(false);
    }
  };

  const openBrowser = (targetField, mode = 'replace') => {
    setBrowserTarget(targetField);
    setBrowserMode(mode);
    setBrowserOpen(true);
  };

  const handleBrowserSelect = (path) => {
    if (browserTarget) {
      if (browserMode === 'add') {
        // Ajouter a la liste existante
        const currentPaths = config[browserTarget] || '';
        const pathList = currentPaths ? currentPaths.split(',').map(p => p.trim()).filter(Boolean) : [];
        if (!pathList.includes(path)) {
          pathList.push(path);
          handleChange(browserTarget, pathList.join(','));
        }
      } else {
        // Remplacer
        handleChange(browserTarget, path);
      }
    }
    setBrowserOpen(false);
    setBrowserTarget(null);
  };

  const loadDirectories = async () => {
    try {
      const response = await apiService.getDirectories();
      setDirectories(response.data);
    } catch (err) {
      console.error('Erreur chargement repertoires:', err);
    }
  };

  const handleChange = (field, value) => {
    setConfig(prev => ({ ...prev, [field]: value }));
    setTestResult(null);
  };

  const handleTestTmdb = async () => {
    if (!config.tmdb_api_key) {
      setTestResult({ valid: false, message: 'Entrez une cle API' });
      return;
    }

    setTesting(true);
    setTestResult(null);
    try {
      const response = await apiService.testTmdbKey(config.tmdb_api_key);
      setTestResult(response.data);
    } catch (err) {
      setTestResult({ valid: false, message: 'Erreur de test' });
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);

    try {
      // Ne pas envoyer les champs vides (pour ne pas ecraser les valeurs existantes)
      const dataToSave = { ...config };
      if (!dataToSave.tmdb_api_key) delete dataToSave.tmdb_api_key;
      if (!dataToSave.trackers) delete dataToSave.trackers;

      await apiService.updateConfig(dataToSave);

      if (onSave) onSave();
      if (onClose && !isSetup) onClose();
    } catch (err) {
      setError('Erreur sauvegarde configuration');
    } finally {
      setSaving(false);
    }
  };

  // Compte le nombre de repertoires pour chaque categorie
  const countPaths = (pathStr) => {
    if (!pathStr) return 0;
    return pathStr.split(',').map(p => p.trim()).filter(Boolean).length;
  };

  if (loading) {
    return (
      <div className="config-panel-overlay">
        <div className="config-panel">
          <div className="config-loading">Chargement...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="config-panel-overlay">
      <div className="config-panel">
        <div className="config-panel-header">
          <h2>{isSetup ? 'Configuration initiale' : 'Configuration'}</h2>
          {!isSetup && (
            <button className="btn-close" onClick={onClose}>&times;</button>
          )}
        </div>

        <div className="config-panel-content">
          {error && <div className="config-error">{error}</div>}

          {isSetup && (
            <div className="config-setup-message">
              <p>Bienvenue ! Configurez Torrentify pour commencer.</p>
              <p>Les champs marques * sont obligatoires.</p>
            </div>
          )}

          {/* Cles API */}
          <div className="config-section">
            <h3>Cles API *</h3>

            <div className="config-field">
              <label>Cle API TMDb</label>
              <div className="config-input-group">
                <input
                  type="text"
                  value={config.tmdb_api_key}
                  onChange={(e) => handleChange('tmdb_api_key', e.target.value)}
                  placeholder="Votre cle API TMDb"
                />
                <button
                  className="btn btn-secondary"
                  onClick={handleTestTmdb}
                  disabled={testing}
                >
                  {testing ? '...' : 'Tester'}
                </button>
              </div>
              {testResult && (
                <div className={`config-test-result ${testResult.valid ? 'valid' : 'invalid'}`}>
                  {testResult.valid ? 'OK' : 'X'} {testResult.message}
                </div>
              )}
              <small>
                Obtenez une cle gratuite sur{' '}
                <a href="https://www.themoviedb.org/settings/api" target="_blank" rel="noopener noreferrer">
                  themoviedb.org
                </a>
              </small>
            </div>

            <div className="config-field">
              <label>Trackers (URLs avec passkey)</label>
              <textarea
                value={config.trackers}
                onChange={(e) => handleChange('trackers', e.target.value)}
                placeholder="https://tracker.example.com/announce?passkey=xxx&#10;(un par ligne ou separes par virgules)"
                rows={3}
              />
              <small>URLs des trackers avec votre passkey personnelle</small>
            </div>
          </div>

          {/* Categories */}
          <div className="config-section">
            <h3>Categories actives</h3>
            <div className="config-checkboxes">
              <label>
                <input
                  type="checkbox"
                  checked={config.enable_films}
                  onChange={(e) => handleChange('enable_films', e.target.checked)}
                />
                Films
                {countPaths(config.path_films) > 0 && (
                  <span className="dir-count">{countPaths(config.path_films)} repertoire(s)</span>
                )}
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={config.enable_series}
                  onChange={(e) => handleChange('enable_series', e.target.checked)}
                />
                Series
                {countPaths(config.path_series) > 0 && (
                  <span className="dir-count">{countPaths(config.path_series)} repertoire(s)</span>
                )}
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={config.enable_animes_films}
                  onChange={(e) => handleChange('enable_animes_films', e.target.checked)}
                />
                Animes Films
                {countPaths(config.path_animes_films) > 0 && (
                  <span className="dir-count">{countPaths(config.path_animes_films)} repertoire(s)</span>
                )}
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={config.enable_animes_series}
                  onChange={(e) => handleChange('enable_animes_series', e.target.checked)}
                />
                Animes Series
                {countPaths(config.path_animes_series) > 0 && (
                  <span className="dir-count">{countPaths(config.path_animes_series)} repertoire(s)</span>
                )}
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={config.enable_jeux}
                  onChange={(e) => handleChange('enable_jeux', e.target.checked)}
                />
                Jeux
                {countPaths(config.path_jeux) > 0 && (
                  <span className="dir-count">{countPaths(config.path_jeux)} repertoire(s)</span>
                )}
              </label>
            </div>
          </div>

          {/* Repertoires */}
          <div className="config-section">
            <h3>Repertoires des medias</h3>
            <small className="section-hint">Ajoutez un ou plusieurs repertoires pour chaque categorie de medias.</small>

            <div className="config-info-box">
              <strong>Important - Configuration Docker</strong>
              <p>
                Les chemins configures ici doivent etre montes dans votre <code>docker-compose.yml</code>.
                Pour creer des torrents, les volumes doivent etre en <strong>lecture-ecriture</strong> (sans <code>:ro</code>).
              </p>
              <p>Exemple :</p>
              <pre>volumes:{'\n'}  - /mnt:/mnt        # Lecture-ecriture{'\n'}  - /media:/media    # Lecture-ecriture</pre>
            </div>

            <MultiPathInput
              label="Films"
              paths={config.path_films}
              onChange={(value) => handleChange('path_films', value)}
              onBrowse={() => openBrowser('path_films', 'add')}
            />

            <MultiPathInput
              label="Series"
              paths={config.path_series}
              onChange={(value) => handleChange('path_series', value)}
              onBrowse={() => openBrowser('path_series', 'add')}
            />

            <MultiPathInput
              label="Animes Films"
              paths={config.path_animes_films}
              onChange={(value) => handleChange('path_animes_films', value)}
              onBrowse={() => openBrowser('path_animes_films', 'add')}
            />

            <MultiPathInput
              label="Animes Series"
              paths={config.path_animes_series}
              onChange={(value) => handleChange('path_animes_series', value)}
              onBrowse={() => openBrowser('path_animes_series', 'add')}
            />

            <MultiPathInput
              label="Jeux"
              paths={config.path_jeux}
              onChange={(value) => handleChange('path_jeux', value)}
              onBrowse={() => openBrowser('path_jeux', 'add')}
            />

            <div className="config-field">
              <label>Sortie Torrents</label>
              <div className="config-input-group">
                <input
                  type="text"
                  value={config.path_torrent_output}
                  onChange={(e) => handleChange('path_torrent_output', e.target.value)}
                  placeholder="/data/torrent"
                />
                <button className="btn btn-secondary" onClick={() => openBrowser('path_torrent_output', 'replace')}>
                  Parcourir
                </button>
              </div>
            </div>

            <MultiPathInput
              label="Hardlinks (optionnel)"
              paths={config.path_hardlinks}
              onChange={(value) => handleChange('path_hardlinks', value)}
              onBrowse={() => openBrowser('path_hardlinks', 'add')}
            />
            <small className="field-hint">Pour le seeding avec Transmission/qBittorrent</small>
          </div>

          {/* Authentification */}
          <div className="config-section">
            <h3>Authentification</h3>
            <small className="section-hint">Protegez l'acces a l'interface avec un identifiant et mot de passe.</small>

            <div className="config-field">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={config.auth_enabled}
                  onChange={(e) => handleChange('auth_enabled', e.target.checked)}
                />
                Activer l'authentification
              </label>
            </div>

            {config.auth_enabled && (
              <>
                <div className="config-field">
                  <label>Identifiant</label>
                  <input
                    type="text"
                    value={config.auth_username}
                    onChange={(e) => handleChange('auth_username', e.target.value)}
                    placeholder="admin"
                  />
                </div>

                <div className="config-field">
                  <label>Mot de passe</label>
                  <input
                    type="password"
                    value={config.auth_password}
                    onChange={(e) => handleChange('auth_password', e.target.value)}
                    placeholder="Laisser vide pour ne pas modifier"
                  />
                  <small>Laissez vide pour conserver le mot de passe actuel</small>
                </div>
              </>
            )}
          </div>

          {/* Options avancees */}
          <div className="config-section">
            <h3>Options avancees</h3>

            <div className="config-field">
              <label>Jobs paralleles</label>
              <input
                type="number"
                min="1"
                max="10"
                value={config.parallel_jobs}
                onChange={(e) => handleChange('parallel_jobs', parseInt(e.target.value, 10) || 1)}
              />
              <small>Nombre de fichiers traites simultanement</small>
            </div>
          </div>

          {/* Reverse Proxy Nginx */}
          {!isSetup && (
            <div className="config-section">
              <h3>Reverse Proxy (Nginx)</h3>
              <small className="section-hint">Generez une configuration nginx pour acceder a Torrentify en HTTPS.</small>
              <NginxGenerator />
            </div>
          )}
        </div>

        <FolderBrowser
          isOpen={browserOpen}
          onClose={() => setBrowserOpen(false)}
          onSelect={handleBrowserSelect}
          currentPath={browserTarget ? (config[browserTarget]?.split(',')[0]?.trim() || '/') : '/'}
          title={browserTarget ? `Ajouter: ${browserTarget.replace('path_', '').replace(/_/g, ' ')}` : 'Selectionner un dossier'}
        />

        <div className="config-panel-footer">
          {!isSetup && (
            <button className="btn btn-secondary" onClick={onClose}>
              Annuler
            </button>
          )}
          <button
            className="btn btn-primary"
            onClick={handleSave}
            disabled={saving || (!config.tmdb_api_key && !config.trackers && isSetup)}
          >
            {saving ? 'Sauvegarde...' : (isSetup ? 'Demarrer' : 'Sauvegarder')}
          </button>
        </div>
      </div>
    </div>
  );
}

export default ConfigPanel;
