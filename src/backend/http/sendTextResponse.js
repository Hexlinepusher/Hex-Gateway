import createTextChunks from '../protocols/createTextChunks.js';
import createTextResponse from '../protocols/createTextResponse.js';

import sendJson from './sendJson.js';
import writeStreamChunk from './writeStreamChunk.js';

export default async function sendTextResponse(context, body, text) {
  const data = {
    uid: context.uid,
    model: body.model,
    text,
    created: Math.floor(context.receivedAt / 1000),
  };
  context.signal.throwIfAborted();
  if (!body.stream) {
    sendJson(context.response, 200, createTextResponse(data, context.protocol));
    return;
  }
  for (const chunk of createTextChunks(data, context.protocol)) {
    await writeStreamChunk(context.response, chunk, context.signal);
  }
  context.response.end();
}
