import createTextChunks from '../protocols/createTextChunks.js';
import createTextResponse from '../protocols/createTextResponse.js';

import sendJson from './sendJson.js';
import waitForResponseFinish from './waitForResponseFinish.js';
import writeStreamChunk from './writeStreamChunk.js';

export default async function sendTextResponse(context, text, shutdownSignal) {
  const { parsedBody, httpResponse } = context;
  const signal = AbortSignal.any([context.downstreamAbortController.signal, shutdownSignal]);
  const data = {
    uid: context.uid,
    model: parsedBody.model,
    text,
    created: Math.floor(context.receivedAt / 1000),
  };
  signal.throwIfAborted();
  if (parsedBody.stream === true) {
    for (const chunk of createTextChunks(data, context.protocol)) {
      await writeStreamChunk(httpResponse, chunk, signal);
    }
    httpResponse.end();
  } else {
    sendJson(httpResponse, 200, createTextResponse(data, context.protocol));
  }
  await waitForResponseFinish(httpResponse);
}
