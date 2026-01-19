import { useState, useEffect, useRef, useCallback } from 'react';

export function useWebSocket() {
  const [connected, setConnected] = useState(false);
  const [messages, setMessages] = useState([]);
  const [lastMessage, setLastMessage] = useState(null);
  const wsRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const subscriptionsRef = useRef(new Set());

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return; // Already connected
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    // Utilise le base path de Vite pour construire l'URL WebSocket
    const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');
    const wsUrl = `${protocol}//${window.location.host}${basePath}/ws`;

    console.log('Connecting to WebSocket:', wsUrl);

    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      console.log('WebSocket connected');
      setConnected(true);

      // Resubscribe to previous subscriptions
      subscriptionsRef.current.forEach(jobId => {
        ws.send(JSON.stringify({ type: 'subscribe', jobId }));
      });
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        setLastMessage(data);
        setMessages(prev => [...prev.slice(-99), data]); // Keep last 100 messages
      } catch (error) {
        console.error('Error parsing WebSocket message:', error);
      }
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };

    ws.onclose = () => {
      console.log('WebSocket disconnected');
      setConnected(false);

      // Attempt reconnect after 3 seconds
      reconnectTimeoutRef.current = setTimeout(() => {
        console.log('Attempting to reconnect...');
        connect();
      }, 3000);
    };

    wsRef.current = ws;
  }, []);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }

    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    setConnected(false);
  }, []);

  const send = useCallback((data) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data));
      return true;
    }
    return false;
  }, []);

  const subscribe = useCallback((jobId) => {
    subscriptionsRef.current.add(jobId);
    send({ type: 'subscribe', jobId });
  }, [send]);

  const unsubscribe = useCallback((jobId) => {
    subscriptionsRef.current.delete(jobId);
    send({ type: 'unsubscribe', jobId });
  }, [send]);

  const ping = useCallback(() => {
    send({ type: 'ping' });
  }, [send]);

  useEffect(() => {
    connect();

    // Ping every 30 seconds to keep connection alive
    const pingInterval = setInterval(() => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        ping();
      }
    }, 30000);

    return () => {
      clearInterval(pingInterval);
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      disconnect();
    };
  }, [connect, disconnect, ping]);

  return {
    connected,
    messages,
    lastMessage,
    send,
    subscribe,
    unsubscribe,
    reconnect: connect
  };
}

export default useWebSocket;
