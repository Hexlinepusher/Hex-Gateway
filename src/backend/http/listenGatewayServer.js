export default async function listenGatewayServer(httpServer, address, port) {
  let onListening;
  let onError;
  try {
    await new Promise((resolve, reject) => {
      onListening = resolve;
      onError = reject;
      httpServer.once('listening', onListening);
      httpServer.once('error', onError);
      httpServer.listen(port, address);
    });
  } finally {
    httpServer.off('listening', onListening);
    httpServer.off('error', onError);
  }
}
