const sceneMaker = require('../../scene-maker');
const configManager = require('./configManager');

class FileScanner {
  constructor() {
    this.cache = null;
    this.cacheTime = null;
    this.cacheDuration = 30000; // 30 seconds cache
  }

  /**
   * Get all video files with their processing status
   * Uses cache to avoid repeated filesystem scans
   */
  async getFiles(forceRefresh = false) {
    const now = Date.now();

    // Return cached results if still valid
    if (!forceRefresh && this.cache && this.cacheTime && (now - this.cacheTime < this.cacheDuration)) {
      return this.cache;
    }

    try {
      // Get dynamic media configuration from configManager
      const mediaConfig = configManager.getMediaConfig();

      // Scan files using scene-maker's getVideoFiles function with dynamic config
      const files = await sceneMaker.getVideoFiles(mediaConfig);

      // Calculate statistics
      const stats = this.calculateStats(files);

      const result = {
        films: files.films || [],
        series: files.series || [],
        animes_films: files.animes_films || [],
        animes_series: files.animes_series || [],
        jeux: files.jeux || [],
        stats
      };

      // Update cache
      this.cache = result;
      this.cacheTime = now;

      return result;

    } catch (error) {
      console.error('Error scanning files:', error);
      throw new Error(`Failed to scan files: ${error.message}`);
    }
  }

  /**
   * Get files by type (films, series, animes_films, animes_series, or all)
   */
  async getFilesByType(type = 'all', forceRefresh = false) {
    const files = await this.getFiles(forceRefresh);
    const validTypes = ['films', 'series', 'animes_films', 'animes_series', 'jeux'];

    if (type === 'all') {
      return files;
    } else if (validTypes.includes(type)) {
      return {
        [type]: files[type],
        stats: this.calculateStats({ [type]: files[type] })
      };
    } else {
      throw new Error(`Invalid type: ${type}. Must be 'all', ${validTypes.map(t => `'${t}'`).join(', ')}`);
    }
  }

  /**
   * Get a single file by ID
   */
  async getFileById(fileId) {
    const files = await this.getFiles();
    const allTypes = ['films', 'series', 'animes_films', 'animes_series', 'jeux'];

    // Search in all categories
    for (const type of allTypes) {
      if (files[type]) {
        const file = files[type].find(f => f.id === fileId);
        if (file) {
          return file;
        }
      }
    }

    return null;
  }

  /**
   * Get multiple files by IDs
   */
  async getFilesByIds(fileIds) {
    const files = await this.getFiles();
    const result = [];
    const allTypes = ['films', 'series', 'animes_films', 'animes_series', 'jeux'];

    for (const id of fileIds) {
      for (const type of allTypes) {
        if (files[type]) {
          const file = files[type].find(f => f.id === id);
          if (file) {
            result.push(file);
            break;
          }
        }
      }
    }

    return result;
  }

  /**
   * Calculate statistics from file list
   */
  calculateStats(files) {
    let totalFiles = 0;
    let completed = 0;
    let pending = 0;
    let totalSize = 0;
    const allTypes = ['films', 'series', 'animes_films', 'animes_series', 'jeux'];

    for (const type of allTypes) {
      if (files[type]) {
        totalFiles += files[type].length;

        files[type].forEach(file => {
          totalSize += file.size || 0;
          if (file.isProcessed) {
            completed++;
          } else {
            pending++;
          }
        });
      }
    }

    return {
      totalFiles,
      completed,
      pending,
      processing: 0, // Will be updated by processQueue
      errors: 0,
      totalSize,
      completionRate: totalFiles > 0 ? Math.round((completed / totalFiles) * 100) : 0
    };
  }

  /**
   * Clear cache to force refresh on next scan
   */
  clearCache() {
    this.cache = null;
    this.cacheTime = null;
  }

  /**
   * Group files by parent directory (for series/animes_series)
   * Returns directories with their files grouped
   */
  groupFilesByDirectory(files) {
    const directories = {};

    // Source directories to exclude from series names
    const sourceDirs = ['Animes_series', 'Animes_series2', 'Animes_films', 'Animes_films2',
                        'series', 'series2', 'films', 'films2', 'jeux', 'data'];

    files.forEach(file => {
      // Get parent directory path (one level up from the file)
      const pathParts = file.path.split('/');
      const fileName = pathParts.pop();
      const dirPath = pathParts.join('/');
      const dirName = pathParts[pathParts.length - 1] || 'Unknown';

      // Get series name (two levels up for season folders)
      // But if the parent is a source directory, use dirName as series name
      let seriesName = pathParts[pathParts.length - 2] || dirName;

      // If seriesName is a source directory, the file is directly in the series folder (no season subfolder)
      if (sourceDirs.includes(seriesName)) {
        seriesName = dirName;
      }

      if (!directories[dirPath]) {
        directories[dirPath] = {
          id: Buffer.from(dirPath).toString('base64'),
          path: dirPath,
          name: dirName,
          seriesName: seriesName,
          type: file.type,
          isDirectory: true,
          files: [],
          totalSize: 0,
          processedCount: 0,
          pendingCount: 0
        };
      }

      directories[dirPath].files.push(file);
      directories[dirPath].totalSize += file.size || 0;
      if (file.isProcessed) {
        directories[dirPath].processedCount++;
      } else {
        directories[dirPath].pendingCount++;
      }
    });

    // Sort files within each directory by name
    Object.values(directories).forEach(dir => {
      dir.files.sort((a, b) => a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' }));
      dir.isFullyProcessed = dir.pendingCount === 0;
    });

    // Return sorted by series name then directory name
    return Object.values(directories).sort((a, b) => {
      const seriesCmp = a.seriesName.localeCompare(b.seriesName, 'fr', { sensitivity: 'base' });
      if (seriesCmp !== 0) return seriesCmp;
      return a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' });
    });
  }

  /**
   * Group jeux files hierarchically from root directories
   * Returns a tree structure with only root dirs visible initially
   */
  groupJeuxHierarchically(files, rootPath = '/data/jeux') {
    // Build a tree structure
    const tree = {};

    files.forEach(file => {
      // Get relative path from root
      const relativePath = file.path.replace(rootPath + '/', '');
      const parts = relativePath.split('/');
      const fileName = parts.pop(); // Remove file name

      // Navigate/create tree structure
      let current = tree;
      let currentPath = rootPath;

      parts.forEach((part, index) => {
        currentPath = currentPath + '/' + part;

        if (!current[part]) {
          current[part] = {
            id: Buffer.from(currentPath).toString('base64'),
            path: currentPath,
            name: part,
            type: 'jeux',
            isDirectory: true,
            children: {},
            files: [],
            totalSize: 0,
            processedCount: 0,
            pendingCount: 0
          };
        }

        // Update stats for all parent directories
        current[part].totalSize += file.size || 0;
        if (file.isProcessed) {
          current[part].processedCount++;
        } else {
          current[part].pendingCount++;
        }

        // If last part of path, add file here
        if (index === parts.length - 1) {
          current[part].files.push(file);
        }

        current = current[part].children;
      });

      // If file is directly in root (no subdirectories)
      if (parts.length === 0) {
        if (!tree['_root_files']) {
          tree['_root_files'] = [];
        }
        tree['_root_files'].push(file);
      }
    });

    // Convert tree to array format, only returning root level directories
    const convertToArray = (node) => {
      const result = { ...node };
      result.children = Object.values(node.children)
        .map(child => convertToArray(child))
        .sort((a, b) => a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' }));
      result.files = (node.files || []).sort((a, b) =>
        a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' })
      );
      result.isFullyProcessed = result.pendingCount === 0;
      return result;
    };

    // Get only root level directories
    const rootDirs = Object.entries(tree)
      .filter(([key]) => key !== '_root_files')
      .map(([_, node]) => convertToArray(node))
      .sort((a, b) => a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' }));

    return {
      directories: rootDirs,
      rootFiles: tree['_root_files'] || []
    };
  }

  /**
   * Get files grouped by directory for series types
   */
  async getFilesWithDirectories(type = 'all', forceRefresh = false) {
    const files = await this.getFiles(forceRefresh);
    const result = { ...files };

    // Group series, animes_series by flat directory
    if (type === 'all' || type === 'series') {
      result.series_directories = this.groupFilesByDirectory(files.series || []);
    }
    if (type === 'all' || type === 'animes_series') {
      result.animes_series_directories = this.groupFilesByDirectory(files.animes_series || []);
    }
    // Group jeux hierarchically (tree structure)
    if (type === 'all' || type === 'jeux') {
      const jeuxHierarchy = this.groupJeuxHierarchically(files.jeux || []);
      result.jeux_directories = jeuxHierarchy.directories;
      result.jeux_root_files = jeuxHierarchy.rootFiles;
    }

    return result;
  }

  /**
   * Recursively search for a directory by ID in a tree structure
   */
  findDirectoryRecursive(directories, dirId) {
    for (const dir of directories) {
      if (dir.id === dirId) {
        return dir;
      }
      // Search in children recursively
      if (dir.children && dir.children.length > 0) {
        const found = this.findDirectoryRecursive(dir.children, dirId);
        if (found) return found;
      }
    }
    return null;
  }

  /**
   * Get directory by ID
   */
  async getDirectoryById(dirId) {
    const files = await this.getFilesWithDirectories();

    // Search in series directories
    let dir = files.series_directories?.find(d => d.id === dirId);
    if (dir) return dir;

    // Search in animes_series directories
    dir = files.animes_series_directories?.find(d => d.id === dirId);
    if (dir) return dir;

    // Search in jeux directories (recursively for nested structure)
    if (files.jeux_directories) {
      dir = this.findDirectoryRecursive(files.jeux_directories, dirId);
      if (dir) return dir;
    }

    return null;
  }
}

// Export singleton instance
module.exports = new FileScanner();
