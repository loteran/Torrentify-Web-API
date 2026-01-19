import apiService from '../services/api';

function FileItem({ file, selected, onSelect }) {
  const formatSize = (bytes) => {
    if (!bytes) return '-';
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    if (bytes === 0) return '0 B';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round((bytes / Math.pow(1024, i)) * 100) / 100 + ' ' + sizes[i];
  };

  const getStatusIcon = () => {
    if (file.isProcessed) {
      return '✅';
    }
    return '⏳';
  };

  const getStatusText = () => {
    if (file.isProcessed) {
      return 'Traité';
    }
    return 'En attente';
  };

  const getFileIcons = () => {
    return (
      <div className="file-icons">
        <span className={file.hasNfo ? 'available' : 'unavailable'} title="NFO">
          {file.hasNfo ? '📄' : '❌'}
        </span>
        <span className={file.hasTorrent ? 'available' : 'unavailable'} title="Torrent">
          {file.hasTorrent ? '🔗' : '❌'}
        </span>
        <span className={file.hasTxt ? 'available' : 'unavailable'} title="TMDb">
          {file.hasTxt ? '🎬' : '❌'}
        </span>
      </div>
    );
  };

  const handleDownload = (ext) => {
    // Extract folder name from output directory
    const folderName = file.outputDir.split('/').pop();
    const fileName = `${folderName}.${ext}`;
    const url = apiService.getDownloadUrl(file.type, folderName, fileName);

    // Open in new tab to trigger download
    window.open(url, '_blank');
  };

  return (
    <div className={`file-item ${selected ? 'selected' : ''}`}>
      <div className="col-select">
        <input
          type="checkbox"
          checked={selected}
          onChange={onSelect}
        />
      </div>

      <div className="col-name">
        <span className="file-name" title={file.path}>
          {file.name}
        </span>
        <span className="file-type-badge">{file.type}</span>
      </div>

      <div className="col-size">
        {formatSize(file.size)}
      </div>

      <div className="col-status">
        <span className={`status-badge ${file.isProcessed ? 'processed' : 'pending'}`}>
          {getStatusIcon()} {getStatusText()}
        </span>
        {getFileIcons()}
      </div>

      <div className="col-actions">
        {file.isProcessed && (
          <div className="download-actions">
            {file.hasTorrent && (
              <button
                className="btn-download"
                onClick={() => handleDownload('torrent')}
                title="Télécharger .torrent"
              >
                🔗
              </button>
            )}
            {file.hasNfo && (
              <button
                className="btn-download"
                onClick={() => handleDownload('nfo')}
                title="Télécharger .nfo"
              >
                📄
              </button>
            )}
            {file.hasTxt && (
              <button
                className="btn-download"
                onClick={() => handleDownload('txt')}
                title="Télécharger .txt"
              >
                📝
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default FileItem;
