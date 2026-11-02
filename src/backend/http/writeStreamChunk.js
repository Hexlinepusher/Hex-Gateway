import { once } from 'node:events';

import serializeStreamChunk from './serializeStreamChunk.js';

export default async function writeStreamChunk(response, chunk, signal) {
  signal.throwIfAborted();
  if (response.destroyed || response.writableEnded) return;
  if (!response.headersSent) {
    response.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache',
    });
  }
  if (!response.write(serializeStreamChunk(chunk))) {
    await once(response, 'drain', { signal });
  }
}
