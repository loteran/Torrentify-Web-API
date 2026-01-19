const WebSocket = require('ws');

class WebSocketServer {
  constructor() {
    this.wss = null;
    this.clients = new Set();
  }

  /**
   * Initialize WebSocket server
   * @param {http.Server} server - HTTP server instance
   */
  init(server) {
    this.wss = new WebSocket.Server({
      server,
      path: '/ws'
    });

    this.wss.on('connection', (ws, req) => {
      this.handleConnection(ws, req);
    });

    console.log('✅ WebSocket server initialized on /ws');
  }

  /**
   * Handle new WebSocket connection
   */
  handleConnection(ws, req) {
    const clientId = this.generateClientId();
    console.log(`🔌 New WebSocket client connected: ${clientId}`);

    // Add to clients set
    this.clients.add(ws);

    // Set client ID
    ws.clientId = clientId;
    ws.isAlive = true;

    // Send welcome message
    this.send(ws, {
      type: 'connected',
      data: {
        clientId,
        message: 'Connected to Torrentify WebSocket server',
        timestamp: new Date().toISOString()
      }
    });

    // Handle incoming messages
    ws.on('message', (message) => {
      this.handleMessage(ws, message);
    });

    // Handle pong (heartbeat)
    ws.on('pong', () => {
      ws.isAlive = true;
    });

    // Handle connection close
    ws.on('close', () => {
      console.log(`🔌 WebSocket client disconnected: ${clientId}`);
      this.clients.delete(ws);
    });

    // Handle errors
    ws.on('error', (error) => {
      console.error(`❌ WebSocket error for client ${clientId}:`, error);
      this.clients.delete(ws);
    });
  }

  /**
   * Handle incoming WebSocket message
   */
  handleMessage(ws, message) {
    try {
      const data = JSON.parse(message);

      switch (data.type) {
        case 'ping':
          // Respond to ping
          this.send(ws, {
            type: 'pong',
            data: {
              timestamp: new Date().toISOString()
            }
          });
          break;

        case 'subscribe':
          // Subscribe to job updates
          if (data.jobId) {
            if (!ws.subscriptions) ws.subscriptions = new Set();
            ws.subscriptions.add(data.jobId);
            console.log(`Client ${ws.clientId} subscribed to job ${data.jobId}`);
          }
          break;

        case 'unsubscribe':
          // Unsubscribe from job updates
          if (data.jobId && ws.subscriptions) {
            ws.subscriptions.delete(data.jobId);
            console.log(`Client ${ws.clientId} unsubscribed from job ${data.jobId}`);
          }
          break;

        default:
          console.warn(`Unknown WebSocket message type: ${data.type}`);
      }

    } catch (error) {
      console.error('Error parsing WebSocket message:', error);
    }
  }

  /**
   * Send message to specific client
   */
  send(ws, data) {
    if (ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(JSON.stringify(data));
      } catch (error) {
        console.error('Error sending WebSocket message:', error);
      }
    }
  }

  /**
   * Broadcast message to all connected clients
   */
  broadcast(data) {
    const message = JSON.stringify(data);
    console.log(`📡 Broadcasting: ${data.type} for job ${data.jobId || 'N/A'} to ${this.clients.size} clients`);

    this.clients.forEach(ws => {
      if (ws.readyState === WebSocket.OPEN) {
        try {
          // Check if client is subscribed to this job (if jobId provided)
          if (data.jobId) {
            const isSubscribed = ws.subscriptions && ws.subscriptions.has(data.jobId);
            console.log(`  -> Client ${ws.clientId}: subscribed=${isSubscribed}, subs=${ws.subscriptions ? Array.from(ws.subscriptions).join(',') : 'none'}`);
            if (!ws.subscriptions || isSubscribed) {
              ws.send(message);
              console.log(`  -> Sent to ${ws.clientId}`);
            }
          } else {
            // Broadcast to all clients if no jobId
            ws.send(message);
          }
        } catch (error) {
          console.error(`Error broadcasting to client ${ws.clientId}:`, error);
        }
      }
    });
  }

  /**
   * Broadcast message to specific job subscribers
   */
  broadcastToJob(jobId, data) {
    const message = JSON.stringify({ ...data, jobId });

    this.clients.forEach(ws => {
      if (ws.readyState === WebSocket.OPEN && ws.subscriptions && ws.subscriptions.has(jobId)) {
        try {
          ws.send(message);
        } catch (error) {
          console.error(`Error broadcasting to client ${ws.clientId}:`, error);
        }
      }
    });
  }

  /**
   * Generate unique client ID
   */
  generateClientId() {
    return `client_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * Start heartbeat interval to detect dead connections
   */
  startHeartbeat(intervalMs = 30000) {
    setInterval(() => {
      this.clients.forEach(ws => {
        if (ws.isAlive === false) {
          console.log(`❌ Terminating dead client: ${ws.clientId}`);
          this.clients.delete(ws);
          return ws.terminate();
        }

        ws.isAlive = false;
        ws.ping();
      });
    }, intervalMs);
  }

  /**
   * Get number of connected clients
   */
  getClientCount() {
    return this.clients.size;
  }

  /**
   * Get WebSocket server statistics
   */
  getStats() {
    return {
      connectedClients: this.clients.size,
      clients: Array.from(this.clients).map(ws => ({
        id: ws.clientId,
        isAlive: ws.isAlive,
        subscriptions: ws.subscriptions ? Array.from(ws.subscriptions) : []
      }))
    };
  }

  /**
   * Close all connections and shut down server
   */
  close() {
    console.log('Closing WebSocket server...');

    this.clients.forEach(ws => {
      ws.close();
    });

    if (this.wss) {
      this.wss.close();
    }

    this.clients.clear();
  }
}

// Export singleton instance
const wsServer = new WebSocketServer();

module.exports = {
  initWebSocket: (server) => {
    wsServer.init(server);
    wsServer.startHeartbeat();
    return wsServer;
  },
  getWebSocketServer: () => wsServer
};
