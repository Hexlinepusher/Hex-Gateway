import { randomUUID } from 'node:crypto';

import createGatewayError from '../errors/createGatewayError.js';

export default function createRequestContext(request, response, totalTimeoutMs) {
  const controller = new AbortController();
  const receivedAt = Date.now();
  const context = {
    uid: randomUUID(),
    request,
    response,
    receivedAt,
    deadline: receivedAt + totalTimeoutMs,
    controller,
    signal: controller.signal,
  };
  const timeout = setTimeout(() => {
    controller.abort(
      createGatewayError('请求整体超时。', {
        statusCode: 504,
        code: 'total_timeout',
        type: 'timeout_error',
      })
    );
  }, totalTimeoutMs);
  response.once('finish', () => clearTimeout(timeout));
  response.once('close', () => {
    clearTimeout(timeout);
    if (!response.writableFinished) {
      controller.abort(
        createGatewayError('客户端已断开连接。', {
          statusCode: 499,
          code: 'request_cancelled',
          type: 'request_cancelled',
        })
      );
    }
  });
  response.setHeader('x-request-id', context.uid);
  return context;
}
