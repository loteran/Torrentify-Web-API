import { useState, useEffect } from 'react';
import apiService from '../services/api';

function FolderBrowser({ isOpen, onClose, onSelect, title, currentPath }) {
  const [path, setPath] = useState(currentPath || '/');
  const [folders, setFolders] = useState([]);
  const [parent, setParent] = useState(null);
  const [roots, setRoots] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (isOpen) {
      loadRoots();
      browse(currentPath || '/');
    }
  }, [isOpen, currentPath]);

  const loadRoots = async () => {
    try {
      const response = await apiService.getRoots();
      setRoots(response.data);
    } catch (err) {
      console.error('Erreur chargement racines:', err);
    }
  };

  const browse = async (dirPath) => {
    setLoading(true);
    setError(null);
    try {
      const response = await apiService.browse(dirPath);
      setPath(response.data.current);
      setFolders(response.data.folders);
      setParent(response.data.parent);
    } catch (err) {
      setError(err.response?.data?.error || 'Erreur de navigation');
    } finally {
      setLoading(false);
    }
  };

  const handleFolderClick = (folderPath) => {
    browse(folderPath);
  };

  const handleParentClick = () => {
    if (parent) {
      browse(parent);
    }
  };

  const handleRootChange = (e) => {
    const rootPath = e.target.value;
    browse(rootPath);
  };

  const handleSelect = () => {
    onSelect(path);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="folder-browser-overlay">
      <div className="folder-browser">
        <div className="folder-browser-header">
          <h3>{title || 'Selectionner un dossier'}</h3>
          <button className="btn-close" onClick={onClose}>&times;</button>
        </div>

        <div className="folder-browser-toolbar">
          <select
            className="root-selector"
            value={roots.find(r => path.startsWith(r.path))?.path || '/'}
            onChange={handleRootChange}
          >
            {roots.map(root => (
              <option key={root.path} value={root.path}>{root.name}</option>
            ))}
          </select>
        </div>

        <div className="folder-browser-path">
          <span className="path-label">Chemin:</span>
          <span className="path-value">{path}</span>
        </div>

        {error && (
          <div className="folder-browser-error">{error}</div>
        )}

        <div className="folder-browser-content">
          {loading ? (
            <div className="folder-browser-loading">Chargement...</div>
          ) : (
            <div className="folder-list">
              {parent && (
                <div
                  className="folder-item folder-parent"
                  onClick={handleParentClick}
                >
                  <span className="folder-icon">📁</span>
                  <span className="folder-name">..</span>
                </div>
              )}
              {folders.length === 0 && !parent ? (
                <div className="folder-empty">Aucun sous-dossier</div>
              ) : (
                folders.map(folder => (
                  <div
                    key={folder.path}
                    className="folder-item"
                    onClick={() => handleFolderClick(folder.path)}
                  >
                    <span className="folder-icon">📁</span>
                    <span className="folder-name">{folder.name}</span>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        <div className="folder-browser-footer">
          <button className="btn btn-secondary" onClick={onClose}>
            Annuler
          </button>
          <button className="btn btn-primary" onClick={handleSelect}>
            Selectionner ce dossier
          </button>
        </div>
      </div>
    </div>
  );
}

export default FolderBrowser;
