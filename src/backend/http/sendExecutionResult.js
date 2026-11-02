import createGatewayError from '../errors/createGatewayError.js';

import sendJson from './sendJson.js';

export default function sendExecutionResult(context, result) {
  context.signal.throwIfAborted();
  if (context.response.headersSent && result?.streamed === true) {
    context.response.end();
    return;
  }
  if (!context.response.headersSent && result?.body !== undefined) {
    sendJson(context.response, result.statusCode || 200, result.body);
    return;
  }
  throw createGatewayError('消费者没有返回符合约定的响应结果。', {
    statusCode: 502,
    code: 'invalid_consumer_result',
  });
}
