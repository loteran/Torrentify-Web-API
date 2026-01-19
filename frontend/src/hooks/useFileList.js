import { useState, useEffect, useCallback } from 'react';
import apiService from '../services/api';

export function useFileList(type = 'all', autoRefresh = false) {
  const [files, setFiles] = useState({ films: [], series: [], animes_films: [], animes_series: [], jeux: [], series_directories: [], animes_series_directories: [], jeux_directories: [] });
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastFetch, setLastFetch] = useState(null);

  const fetchFiles = useCallback(async (forceRefresh = false) => {
    setLoading(true);
    setError(null);

    try {
      const response = await apiService.getFiles(type, forceRefresh);
      const data = response.data;

      setFiles({
        films: data.films || [],
        series: data.series || [],
        animes_films: data.animes_films || [],
        animes_series: data.animes_series || [],
        jeux: data.jeux || [],
        series_directories: data.series_directories || [],
        animes_series_directories: data.animes_series_directories || [],
        jeux_directories: data.jeux_directories || []
      });

      setStats(data.stats || null);
      setLastFetch(new Date());

    } catch (err) {
      console.error('Error fetching files:', err);
      setError(err.response?.data?.message || err.message || 'Failed to fetch files');
    } finally {
      setLoading(false);
    }
  }, [type]);

  const refresh = useCallback(() => {
    return fetchFiles(true);
  }, [fetchFiles]);

  const getFileById = useCallback((fileId) => {
    for (const fileList of [files.films, files.series, files.animes_films, files.animes_series, files.jeux]) {
      const file = fileList.find(f => f.id === fileId);
      if (file) return file;
    }
    return null;
  }, [files]);

  const getAllFiles = useCallback(() => {
    return [...files.films, ...files.series, ...files.animes_films, ...files.animes_series, ...files.jeux];
  }, [files]);

  const getFilesByStatus = useCallback((isProcessed) => {
    return getAllFiles().filter(f => f.isProcessed === isProcessed);
  }, [getAllFiles]);

  // Initial fetch
  useEffect(() => {
    fetchFiles();
  }, [fetchFiles]);

  // Auto refresh
  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(() => {
      fetchFiles(false); // Use cache
    }, 30000); // Refresh every 30 seconds

    return () => clearInterval(interval);
  }, [autoRefresh, fetchFiles]);

  return {
    files,
    stats,
    loading,
    error,
    lastFetch,
    refresh,
    getFileById,
    getAllFiles,
    getFilesByStatus
  };
}

export default useFileList;
