export default function serializeStreamChunk(chunk) {
  const data = typeof chunk.data === 'string' ? chunk.data : JSON.stringify(chunk.data);
  return (chunk.event ? `event: ${chunk.event}\n` : '') + `data: ${data}\n\n`;
}
