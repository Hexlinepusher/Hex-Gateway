export default function observeHttpConnections(httpServer) {
  const activeResponsesBySocket = new Map();
  httpServer.on('connection', (socket) => {
    activeResponsesBySocket.set(socket, new Set());
    socket.once('close', () => activeResponsesBySocket.delete(socket));
    if (!httpServer.listening) socket.destroy();
  });
  httpServer.prependListener('request', (request, response) => {
    const { socket } = request;
    const activeResponses = activeResponsesBySocket.get(socket);
    activeResponses.add(response);
    const onCompleted = () => {
      response.off('finish', onCompleted);
      response.off('close', onCompleted);
      activeResponses.delete(response);
      if (!httpServer.listening && activeResponses.size === 0) socket.destroy();
    };
    response.once('finish', onCompleted);
    response.once('close', onCompleted);
  });
  return activeResponsesBySocket;
}
