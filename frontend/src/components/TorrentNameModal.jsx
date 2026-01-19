import { useState, useEffect, useMemo } from 'react';

function TorrentNameModal({ isOpen, onClose, onConfirm, directories, selectedDirectories, individualFiles = [] }) {
  const [torrentNames, setTorrentNames] = useState({});

  // Cherche récursivement tous les répertoires sélectionnés
  const findSelectedDirectoriesRecursive = (dirs, selected) => {
    const result = [];
    for (const dir of dirs) {
      if (selected.has(dir.id)) {
        result.push(dir);
      }
      if (dir.children && dir.children.length > 0) {
        result.push(...findSelectedDirectoriesRecursive(dir.children, selected));
      }
    }
    return result;
  };

  // Trouve tous les répertoires sélectionnés (y compris dans les sous-répertoires)
  const selectedDirs = useMemo(() => {
    if (!directories || selectedDirectories.size === 0) return [];
    return findSelectedDirectoriesRecursive(directories, selectedDirectories);
  }, [directories, selectedDirectories]);

  // Initialize default names when modal opens
  useEffect(() => {
    if (isOpen && selectedDirs.length > 0) {
      const defaultNames = {};
      selectedDirs.forEach(dir => {
        // Default name: directory name
        const defaultName = dir.seriesName && dir.seriesName !== dir.name
          ? `${dir.seriesName} - ${dir.name}`
          : dir.name;
        defaultNames[dir.id] = defaultName.replace(/\./g, ' ');
      });
      setTorrentNames(defaultNames);
    }
  }, [isOpen, selectedDirs]);

  const handleNameChange = (dirId, newName) => {
    setTorrentNames(prev => ({
      ...prev,
      [dirId]: newName
    }));
  };

  const handleConfirm = () => {
    onConfirm(torrentNames);
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-content torrent-name-modal">
        <div className="modal-header">
          <h2>Nom des torrents</h2>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>

        <div className="modal-body">
          <p className="modal-description">
            Definissez le nom de chaque torrent. Ce nom sera utilise pour le fichier torrent
            et comme nom de dossier lors du telechargement.
          </p>

          {/* Fichiers individuels sélectionnés */}
          {individualFiles.length > 0 && (
            <div className="individual-files-section">
              <h4>Fichiers individuels ({individualFiles.length})</h4>
              <p className="section-description">
                Ces fichiers seront traites individuellement (un torrent par fichier).
              </p>
              <ul className="individual-files-list">
                {individualFiles.map(file => (
                  <li key={file.id} className="individual-file-item">
                    <span className="file-icon">📄</span>
                    <span className="file-name">{file.name}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Répertoires sélectionnés */}
          {selectedDirs.length > 0 && (
            <div className="directories-section">
              {individualFiles.length > 0 && <h4>Repertoires ({selectedDirs.length})</h4>}
              <div className="torrent-names-list">
                {selectedDirs.map(dir => (
                  <div key={dir.id} className="torrent-name-item">
                    <div className="torrent-name-info">
                      <span className="torrent-original-path">
                        {dir.seriesName}{dir.seriesName !== dir.name ? ` / ${dir.name}` : ''}
                      </span>
                      <span className="torrent-files-count">
                        ({dir.files.length} fichiers)
                      </span>
                    </div>
                    <input
                      type="text"
                      className="torrent-name-input"
                      value={torrentNames[dir.id] || ''}
                      onChange={(e) => handleNameChange(dir.id, e.target.value)}
                      placeholder="Nom du torrent..."
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>
            Annuler
          </button>
          <button className="btn btn-primary" onClick={handleConfirm}>
            Creer les torrents
          </button>
        </div>
      </div>
    </div>
  );
}

export default TorrentNameModal;
