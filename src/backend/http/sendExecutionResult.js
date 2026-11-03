import sendError from './sendError.js';
import sendJson from './sendJson.js';

export default function sendExecutionResult(context, result) {
  const { httpResponse } = context;
  if (
    context.downstreamAbortController.signal.aborted ||
    httpResponse.destroyed ||
    httpResponse.writableEnded
  )
    return;
  try {
    if (result.error) {
      sendError(context, result.error);
    } else if (result.streamed === true) {
      if (!httpResponse.headersSent) {
        httpResponse.writeHead(200, {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-cache',
        });
      }
      httpResponse.end();
    } else if (!httpResponse.headersSent) {
      sendJson(httpResponse, result.statusCode ?? 200, result.body);
    } else {
      httpResponse.destroy();
    }
  } catch {
    httpResponse.destroy();
  }
}
