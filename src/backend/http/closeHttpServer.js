import closeInactiveConnections from './closeInactiveConnections.js';

export default function closeHttpServer(httpServer) {
  return new Promise((resolve, reject) => {
    const closeIdleConnections = httpServer.closeIdleConnections;
    if (httpServer.activeResponsesBySocket) {
      httpServer.closeIdleConnections = () =>
        closeInactiveConnections(httpServer.activeResponsesBySocket);
    }
    try {
      httpServer.close((error) => {
        if (error) reject(error);
        else resolve();
      });
    } finally {
      httpServer.closeIdleConnections = closeIdleConnections;
    }
  });
}
