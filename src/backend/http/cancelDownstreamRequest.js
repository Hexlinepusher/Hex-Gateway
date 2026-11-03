import removeQueueEntry from '../concurrency/removeQueueEntry.js';
import createGatewayError from '../errors/createGatewayError.js';

import recordRequestTermination from './recordRequestTermination.js';

export default function cancelDownstreamRequest(requestContext, requestQueue, log) {
  const { downstreamAbortController, httpResponse } = requestContext;
  if (downstreamAbortController.signal.aborted || httpResponse.writableFinished) return;
  const error = createGatewayError('客户端已断开连接。', {
    statusCode: 499,
    code: 'request_cancelled',
    type: 'request_cancelled',
  });
  const queueEntry = requestQueue.entries.find((entry) => entry.requestContext === requestContext);
  if (queueEntry) removeQueueEntry(requestQueue, queueEntry);
  recordRequestTermination(requestContext, log, error.message);
  downstreamAbortController.abort(error);
  httpResponse.destroy();
}
