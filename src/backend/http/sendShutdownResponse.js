import createGatewayError from '../errors/createGatewayError.js';

import recordRequestTermination from './recordRequestTermination.js';
import sendError from './sendError.js';

export default function sendShutdownResponse(requestContext, log) {
  const { httpRequest, httpResponse, downstreamAbortController } = requestContext;
  if (downstreamAbortController.signal.aborted || httpResponse.writableEnded) return;
  recordRequestTermination(requestContext, log, '网关关闭');
  if (!httpResponse.headersSent && !httpRequest.complete) {
    httpResponse.setHeader('Connection', 'close');
  }
  sendError(
    requestContext,
    createGatewayError('Gateway Is Stopping', {
      statusCode: 503,
      code: 'gateway_stopping',
      type: 'api_error',
    })
  );
}
