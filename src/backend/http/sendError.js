import createErrorResponse from '../protocols/createErrorResponse.js';

import sendJson from './sendJson.js';
import serializeStreamChunk from './serializeStreamChunk.js';

export default function sendError(context, error) {
  const { httpResponse: response, protocol, uid } = context;
  if (
    context.downstreamAbortController.signal.aborted ||
    response.destroyed ||
    response.writableEnded
  )
    return;
  const body = createErrorResponse(error, protocol, uid);
  if (response.headersSent) {
    response.end(
      serializeStreamChunk({
        ...(protocol === 'anthropic' ? { event: 'error' } : {}),
        data: body,
      })
    );
    return;
  }
  const statusCode =
    Number.isInteger(error.statusCode) && error.statusCode >= 400 && error.statusCode <= 599
      ? error.statusCode
      : 500;
  sendJson(response, statusCode, body);
}
