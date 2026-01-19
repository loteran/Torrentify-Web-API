import { useState } from 'react';
import FileItem from './FileItem';

function DirectoryItem({ directory, selectedFiles, onSelectDirectory, onSelectFile }) {
  const [isExpanded, setIsExpanded] = useState(false);

  const formatSize = (bytes) => {
    if (!bytes) return '-';
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    if (bytes === 0) return '0 B';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round((bytes / Math.pow(1024, i)) * 100) / 100 + ' ' + sizes[i];
  };

  // Check if all files in directory are selected
  const allFilesSelected = directory.files.every(f => selectedFiles.has(f.id));
  const someFilesSelected = directory.files.some(f => selectedFiles.has(f.id));

  // Check if directory is fully processed
  const isFullyProcessed = directory.files.every(f => f.isProcessed);
  const processedCount = directory.files.filter(f => f.isProcessed).length;

  const handleToggle = () => {
    setIsExpanded(!isExpanded);
  };

  const handleSelectAll = () => {
    onSelectDirectory(directory.id, directory.files.map(f => f.id), !allFilesSelected);
  };

  return (
    <div className="directory-item">
      <div className={`directory-header ${allFilesSelected ? 'selected' : ''}`}>
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
          <span className="expand-icon">{isExpanded ? '▼' : '▶'}</span>
          <span className="folder-icon">📁</span>
          <span className="directory-label">
            <span className="series-name">{directory.seriesName}</span>
            {directory.seriesName !== directory.name && (
              <span className="season-name"> / {directory.name}</span>
            )}
          </span>
          <span className="file-count">({directory.files.length} fichiers)</span>
        </div>

        <div className="col-size">
          {formatSize(directory.totalSize)}
        </div>

        <div className="col-status">
          <span className={`status-badge ${isFullyProcessed ? 'processed' : 'pending'}`}>
            {isFullyProcessed ? '✅' : '⏳'} {processedCount}/{directory.files.length}
          </span>
        </div>

        <div className="col-actions">
          {/* Space for potential directory actions */}
        </div>
      </div>

      {isExpanded && (
        <div className="directory-files">
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
  );
}

export default DirectoryItem;
