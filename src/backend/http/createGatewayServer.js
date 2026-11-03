import { createServer } from 'node:http';

import observeHttpConnections from './observeHttpConnections.js';

export default function createGatewayServer(requestHandler) {
  const httpServer = createServer(requestHandler);
  httpServer.activeResponsesBySocket = observeHttpConnections(httpServer);
  httpServer.requestTimeout = 0;
  httpServer.timeout = 0;
  return httpServer;
}
