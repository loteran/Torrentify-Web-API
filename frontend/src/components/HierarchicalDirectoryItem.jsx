import { useState } from 'react';
import FileItem from './FileItem';

function HierarchicalDirectoryItem({
  directory,
  level = 0,
  selectedFiles,
  selectedDirectories,
  onSelectDirectory,
  onSelectFile
}) {
  const [isExpanded, setIsExpanded] = useState(false);

  const formatSize = (bytes) => {
    if (!bytes) return '-';
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    if (bytes === 0) return '0 B';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round((bytes / Math.pow(1024, i)) * 100) / 100 + ' ' + sizes[i];
  };

  // Get all file IDs recursively from this directory and its children
  const getAllFileIds = (dir) => {
    let ids = dir.files.map(f => f.id);
    if (dir.children) {
      dir.children.forEach(child => {
        ids = ids.concat(getAllFileIds(child));
      });
    }
    return ids;
  };

  // Get all directory IDs recursively
  const getAllDirIds = (dir) => {
    let ids = [dir.id];
    if (dir.children) {
      dir.children.forEach(child => {
        ids = ids.concat(getAllDirIds(child));
      });
    }
    return ids;
  };

  const allFileIds = getAllFileIds(directory);
  const allDirIds = getAllDirIds(directory);

  // Check selection state
  const allFilesSelected = allFileIds.length > 0 && allFileIds.every(id => selectedFiles.has(id));
  const someFilesSelected = allFileIds.some(id => selectedFiles.has(id));

  // Check if fully processed
  const totalFiles = allFileIds.length;
  const processedCount = directory.processedCount || 0;
  const isFullyProcessed = directory.pendingCount === 0;

  // Has children or files to show
  const hasContent = (directory.children && directory.children.length > 0) ||
                     (directory.files && directory.files.length > 0);

  const handleToggle = () => {
    if (hasContent) {
      setIsExpanded(!isExpanded);
    }
  };

  const handleSelectAll = (e) => {
    e.stopPropagation();
    onSelectDirectory(directory.id, allFileIds, allDirIds, !allFilesSelected);
  };

  const indentStyle = {
    paddingLeft: `${level * 24 + 8}px`
  };

  return (
    <div className="hierarchical-directory-item">
      <div
        className={`directory-header ${allFilesSelected ? 'selected' : ''}`}
        style={indentStyle}
      >
        <div className="col-select">
          <input
            type="checkbox"
            checked={allFilesSelected}
            ref={el => {
              if (el) el.indeterminate = someFilesSelected && !allFilesSelected;
            }}
            onChange={handleSelectAll}
            title="Selectionner tout le repertoire"
          />
        </div>

        <div className="col-name directory-name" onClick={handleToggle}>
          {hasContent ? (
            <span className="expand-icon">{isExpanded ? '▼' : '▶'}</span>
          ) : (
            <span className="expand-icon" style={{ visibility: 'hidden' }}>▶</span>
          )}
          <span className="folder-icon">📁</span>
          <span className="directory-label">
            <span className="series-name">{directory.name}</span>
          </span>
          <span className="file-count">
            ({totalFiles} fichier{totalFiles > 1 ? 's' : ''})
          </span>
        </div>

        <div className="col-size">
          {formatSize(directory.totalSize)}
        </div>

        <div className="col-status">
          <span className={`status-badge ${isFullyProcessed ? 'processed' : 'pending'}`}>
            {isFullyProcessed ? '✅' : '⏳'} {processedCount}/{totalFiles}
          </span>
        </div>

        <div className="col-actions">
        </div>
      </div>

      {isExpanded && (
        <div className="directory-content">
          {/* Sous-repertoires */}
          {directory.children && directory.children.map(child => (
            <HierarchicalDirectoryItem
              key={child.id}
              directory={child}
              level={level + 1}
              selectedFiles={selectedFiles}
              selectedDirectories={selectedDirectories}
              onSelectDirectory={onSelectDirectory}
              onSelectFile={onSelectFile}
            />
          ))}

          {/* Fichiers dans ce repertoire */}
          {directory.files && directory.files.length > 0 && (
            <div className="directory-files" style={{ paddingLeft: `${(level + 1) * 24 + 8}px` }}>
              {directory.files.map(file => (
                <FileItem
                  key={file.id}
                  file={file}
                  selected={selectedFiles.has(file.id)}
                  onSelect={() => onSelectFile(file.id)}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default HierarchicalDirectoryItem;
