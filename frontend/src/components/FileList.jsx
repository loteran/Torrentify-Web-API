import { useState, useMemo } from 'react';
import FileItem from './FileItem';
import DirectoryItem from './DirectoryItem';
import HierarchicalDirectoryItem from './HierarchicalDirectoryItem';
import TorrentNameModal from './TorrentNameModal';
import apiService from '../services/api';

function FileList({ files, stats, loading, type, onProcessingStart, onRefresh }) {
  const [selectedFiles, setSelectedFiles] = useState(new Set());
  const [selectedDirectories, setSelectedDirectories] = useState(new Set());
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [processing, setProcessing] = useState(false);
  const [sortOrder, setSortOrder] = useState(null); // 'asc' | 'desc' | null
  const [showNameModal, setShowNameModal] = useState(false);

  // Check if this type should use directory view
  const useDirectoryView = type === 'series' || type === 'animes_series' || type === 'jeux';
  // Jeux uses hierarchical view (tree structure)
  const useHierarchicalView = type === 'jeux';

  // Get directories for series/jeux types
  const directories = useMemo(() => {
    if (!useDirectoryView) return [];
    if (type === 'series') return files.series_directories || [];
    if (type === 'animes_series') return files.animes_series_directories || [];
    if (type === 'jeux') return files.jeux_directories || [];
    return [];
  }, [files, type, useDirectoryView]);

  // Get all files based on type
  const allFiles = useMemo(() => {
    if (type === 'films') return files.films || [];
    if (type === 'series') return files.series || [];
    if (type === 'animes_films') return files.animes_films || [];
    if (type === 'animes_series') return files.animes_series || [];
    if (type === 'jeux') return files.jeux || [];
    return [
      ...(files.films || []),
      ...(files.series || []),
      ...(files.animes_films || []),
      ...(files.animes_series || []),
      ...(files.jeux || [])
    ];
  }, [files, type]);

  // Filter files
  const filteredFiles = useMemo(() => {
    let result = allFiles;

    // Search filter
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      result = result.filter(file =>
        file.name.toLowerCase().includes(term)
      );
    }

    // Status filter
    if (statusFilter !== 'all') {
      result = result.filter(file => {
        if (statusFilter === 'processed') return file.isProcessed;
        if (statusFilter === 'pending') return !file.isProcessed;
        return true;
      });
    }

    return result;
  }, [allFiles, searchTerm, statusFilter]);

  // Filter directories
  const filteredDirectories = useMemo(() => {
    if (!useDirectoryView) return [];

    let result = directories;

    // Search filter - search in directory name or file names
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      result = result.filter(dir =>
        dir.name.toLowerCase().includes(term) ||
        dir.seriesName.toLowerCase().includes(term) ||
        dir.files.some(f => f.name.toLowerCase().includes(term))
      );
    }

    // Status filter
    if (statusFilter !== 'all') {
      result = result.map(dir => ({
        ...dir,
        files: dir.files.filter(file => {
          if (statusFilter === 'processed') return file.isProcessed;
          if (statusFilter === 'pending') return !file.isProcessed;
          return true;
        })
      })).filter(dir => dir.files.length > 0);
    }

    return result;
  }, [directories, searchTerm, statusFilter, useDirectoryView]);

  // Sort files
  const sortedFiles = useMemo(() => {
    if (!sortOrder) return filteredFiles;
    return [...filteredFiles].sort((a, b) => {
      const cmp = a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' });
      return sortOrder === 'asc' ? cmp : -cmp;
    });
  }, [filteredFiles, sortOrder]);

  // Sort directories
  const sortedDirectories = useMemo(() => {
    if (!sortOrder) return filteredDirectories;
    return [...filteredDirectories].sort((a, b) => {
      const cmp = a.seriesName.localeCompare(b.seriesName, 'fr', { sensitivity: 'base' });
      return sortOrder === 'asc' ? cmp : -cmp;
    });
  }, [filteredDirectories, sortOrder]);

  // Collecte récursivement tous les fichiers d'un répertoire et ses sous-répertoires
  const collectAllFilesFromDirectory = (dir) => {
    const fileIds = [];
    // Fichiers directs du répertoire
    if (dir.files) {
      dir.files.forEach(f => fileIds.push(f.id));
    }
    // Fichiers des sous-répertoires
    if (dir.children) {
      dir.children.forEach(child => {
        fileIds.push(...collectAllFilesFromDirectory(child));
      });
    }
    return fileIds;
  };

  // Cherche récursivement un répertoire par ID
  const findDirectoryRecursive = (dirs, dirId) => {
    for (const dir of dirs) {
      if (dir.id === dirId) return dir;
      if (dir.children) {
        const found = findDirectoryRecursive(dir.children, dirId);
        if (found) return found;
      }
    }
    return null;
  };

  // Calcule les fichiers sélectionnés individuellement (pas via un répertoire complet)
  const getIndividuallySelectedFiles = () => {
    if (!useDirectoryView) return selectedFiles;

    // Fichiers qui appartiennent aux répertoires sélectionnés (y compris sous-répertoires)
    const filesInSelectedDirs = new Set();
    selectedDirectories.forEach(dirId => {
      const dir = findDirectoryRecursive(sortedDirectories, dirId);
      if (dir) {
        collectAllFilesFromDirectory(dir).forEach(fId => filesInSelectedDirs.add(fId));
      }
    });

    // Fichiers sélectionnés individuellement (pas via un répertoire)
    return new Set([...selectedFiles].filter(id => !filesInSelectedDirs.has(id)));
  };

  const handleSort = () => {
    setSortOrder(prev => {
      if (prev === null) return 'asc';
      if (prev === 'asc') return 'desc';
      return null;
    });
  };

  const handleSelectAll = () => {
    if (useDirectoryView) {
      // Select all directories
      const allDirIds = new Set(sortedDirectories.map(d => d.id));
      const allFileIds = new Set(sortedDirectories.flatMap(d => d.files.map(f => f.id)));

      if (selectedDirectories.size === sortedDirectories.length) {
        setSelectedDirectories(new Set());
        setSelectedFiles(new Set());
      } else {
        setSelectedDirectories(allDirIds);
        setSelectedFiles(allFileIds);
      }
    } else {
      if (selectedFiles.size === sortedFiles.length) {
        setSelectedFiles(new Set());
      } else {
        setSelectedFiles(new Set(sortedFiles.map(f => f.id)));
      }
    }
  };

  const handleSelectFile = (fileId) => {
    const newSelection = new Set(selectedFiles);
    if (newSelection.has(fileId)) {
      newSelection.delete(fileId);
    } else {
      newSelection.add(fileId);
    }
    setSelectedFiles(newSelection);
  };

  const handleSelectDirectory = (dirId, fileIds, select) => {
    const newDirSelection = new Set(selectedDirectories);
    const newFileSelection = new Set(selectedFiles);

    if (select) {
      newDirSelection.add(dirId);
      fileIds.forEach(id => newFileSelection.add(id));
    } else {
      newDirSelection.delete(dirId);
      fileIds.forEach(id => newFileSelection.delete(id));
    }

    setSelectedDirectories(newDirSelection);
    setSelectedFiles(newFileSelection);
  };

  // Handler for hierarchical directory selection (includes all subdirectory IDs)
  const handleSelectHierarchicalDirectory = (dirId, fileIds, dirIds, select) => {
    const newDirSelection = new Set(selectedDirectories);
    const newFileSelection = new Set(selectedFiles);

    if (select) {
      dirIds.forEach(id => newDirSelection.add(id));
      fileIds.forEach(id => newFileSelection.add(id));
    } else {
      dirIds.forEach(id => newDirSelection.delete(id));
      fileIds.forEach(id => newFileSelection.delete(id));
    }

    setSelectedDirectories(newDirSelection);
    setSelectedFiles(newFileSelection);
  };

  const handleProcess = async () => {
    if (selectedFiles.size === 0 && selectedDirectories.size === 0) return;

    // En mode répertoire, gérer les fichiers individuels et les répertoires
    if (useDirectoryView) {
      const individualFiles = getIndividuallySelectedFiles();
      const hasDirectories = selectedDirectories.size > 0;
      const hasIndividualFiles = individualFiles.size > 0;

      if (hasDirectories && !hasIndividualFiles) {
        // Seulement des répertoires → modal pour les noms
        setShowNameModal(true);
        return;
      } else if (!hasDirectories && hasIndividualFiles) {
        // Seulement des fichiers individuels → traiter directement
        await processFilesDirectly(individualFiles);
        return;
      } else if (hasDirectories && hasIndividualFiles) {
        // Les deux → afficher le modal (on traitera tout ensemble)
        setShowNameModal(true);
        return;
      }
      return;
    }

    // Mode fichiers classique (films, etc.) - traiter directement
    await processFilesDirectly();
  };

  const processFilesDirectly = async (filesToProcess = null) => {
    setProcessing(true);

    try {
      // Utiliser les fichiers fournis ou selectedFiles par défaut
      const fileIds = filesToProcess
        ? Array.from(filesToProcess)
        : Array.from(selectedFiles);

      const response = await apiService.processFiles(fileIds);
      const { jobId } = response.data;

      console.log('Processing started:', jobId);

      // Clear selection
      setSelectedFiles(new Set());
      setSelectedDirectories(new Set());

      // Notify parent
      if (onProcessingStart) {
        onProcessingStart(jobId);
      }

    } catch (error) {
      console.error('Error starting processing:', error);
      alert('Erreur lors du lancement du traitement: ' + (error.response?.data?.message || error.message));
    } finally {
      setProcessing(false);
    }
  };

  const handleConfirmTorrentNames = async (torrentNames, includeIndividualFiles = true) => {
    setShowNameModal(false);
    setProcessing(true);

    try {
      const individualFiles = getIndividuallySelectedFiles();
      let jobId = null;

      // D'abord traiter les fichiers individuels si présents
      if (includeIndividualFiles && individualFiles.size > 0) {
        const filesResponse = await apiService.processFiles(Array.from(individualFiles));
        jobId = filesResponse.data.jobId;
        console.log('Individual files processing started:', jobId);
      }

      // Ensuite traiter les répertoires si présents
      if (selectedDirectories.size > 0) {
        const response = await apiService.processDirectories(
          Array.from(selectedDirectories),
          torrentNames
        );
        jobId = response.data.jobId;
        console.log('Directories processing started:', jobId);
      }

      // Clear selection
      setSelectedFiles(new Set());
      setSelectedDirectories(new Set());

      // Notify parent avec le dernier jobId (ou le seul)
      if (onProcessingStart && jobId) {
        onProcessingStart(jobId);
      }

    } catch (error) {
      console.error('Error starting processing:', error);
      alert('Erreur lors du lancement du traitement: ' + (error.response?.data?.message || error.message));
    } finally {
      setProcessing(false);
    }
  };

  if (loading && allFiles.length === 0) {
    return (
      <div className="file-list-loading">
        <div className="spinner"></div>
        <p>Chargement des fichiers...</p>
      </div>
    );
  }

  // Calcul des fichiers sélectionnés individuellement pour l'affichage
  const individuallySelectedFiles = getIndividuallySelectedFiles();
  const totalSelected = useDirectoryView
    ? selectedDirectories.size + individuallySelectedFiles.size
    : selectedFiles.size;
  const itemLabel = useDirectoryView
    ? (selectedDirectories.size > 0 && individuallySelectedFiles.size > 0
        ? 'élément'
        : (selectedDirectories.size > 0 ? 'repertoire' : 'fichier'))
    : 'fichier';
  const totalItems = useDirectoryView ? sortedDirectories.length : sortedFiles.length;
  const allSelected = totalSelected > 0 && selectedDirectories.size === sortedDirectories.length;

  return (
    <div className="file-list">
      <div className="file-list-header">
        <div className="file-list-controls">
          <input
            type="text"
            className="search-input"
            placeholder="Rechercher..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />

          <select
            className="status-filter"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="all">Tous les statuts</option>
            <option value="processed">Traites</option>
            <option value="pending">En attente</option>
          </select>

          <button
            className="btn btn-secondary"
            onClick={onRefresh}
            disabled={loading}
          >
            Actualiser
          </button>
        </div>

        <div className="file-list-actions">
          <label className="select-all">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={handleSelectAll}
            />
            <span>Tout selectionner</span>
          </label>

          <span className="selection-count">
            {totalSelected} {itemLabel}{totalSelected > 1 ? 's' : ''} selectionne{totalSelected > 1 ? 's' : ''}
          </span>

          <button
            className="btn btn-primary"
            onClick={handleProcess}
            disabled={totalSelected === 0 || processing}
          >
            {processing ? 'Lancement...' : 'Traiter la selection'}
          </button>
        </div>
      </div>

      {totalItems === 0 ? (
        <div className="file-list-empty">
          <p>
            {searchTerm || statusFilter !== 'all'
              ? 'Aucun fichier ne correspond aux criteres de recherche'
              : 'Aucun fichier trouve'}
          </p>
        </div>
      ) : (
        <div className="file-list-table">
          <div className="file-list-table-header">
            <div className="col-select"></div>
            <div className="col-name sortable" onClick={handleSort}>
              {useDirectoryView ? 'Repertoire' : 'Nom du fichier'} {sortOrder === 'asc' ? '^' : sortOrder === 'desc' ? 'v' : ''}
            </div>
            <div className="col-size">Taille</div>
            <div className="col-status">Statut</div>
            <div className="col-actions">Actions</div>
          </div>

          <div className="file-list-items">
            {useHierarchicalView ? (
              // Hierarchical view for jeux
              sortedDirectories.map(dir => (
                <HierarchicalDirectoryItem
                  key={dir.id}
                  directory={dir}
                  level={0}
                  selectedFiles={selectedFiles}
                  selectedDirectories={selectedDirectories}
                  onSelectDirectory={handleSelectHierarchicalDirectory}
                  onSelectFile={handleSelectFile}
                />
              ))
            ) : useDirectoryView ? (
              // Flat directory view for series/animes
              sortedDirectories.map(dir => (
                <DirectoryItem
                  key={dir.id}
                  directory={dir}
                  selectedFiles={selectedFiles}
                  onSelectDirectory={handleSelectDirectory}
                  onSelectFile={handleSelectFile}
                />
              ))
            ) : (
              // File view for films
              sortedFiles.map(file => (
                <FileItem
                  key={file.id}
                  file={file}
                  selected={selectedFiles.has(file.id)}
                  onSelect={() => handleSelectFile(file.id)}
                />
              ))
            )}
          </div>
        </div>
      )}

      {stats && (
        <div className="file-list-stats">
          <span>Total: {stats.totalFiles}</span>
          <span>Traites: {stats.completed}</span>
          <span>En attente: {stats.pending}</span>
          <span>Taux: {stats.completionRate}%</span>
        </div>
      )}

      <TorrentNameModal
        isOpen={showNameModal}
        onClose={() => setShowNameModal(false)}
        onConfirm={handleConfirmTorrentNames}
        directories={directories}
        selectedDirectories={selectedDirectories}
        individualFiles={sortedDirectories
          .flatMap(d => d.files)
          .filter(f => individuallySelectedFiles.has(f.id))}
      />
    </div>
  );
}

export default FileList;
