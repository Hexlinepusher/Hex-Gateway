export default function closeInactiveConnections(activeResponsesBySocket) {
  for (const [socket, responses] of activeResponsesBySocket) {
    if (responses.size === 0) socket.destroy();
  }
}
