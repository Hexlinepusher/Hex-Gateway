import detectProtocol from '../protocols/detectProtocol.js';

import createRequestContext from './createRequestContext.js';
import routeRequest from './routeRequest.js';
import sendError from './sendError.js';
import waitForOperation from './waitForOperation.js';
import waitForResponseFinish from './waitForResponseFinish.js';

export default async function handleRequest(application, request, response) {
  const context = createRequestContext(request, response, application.configuration.totalTimeoutMs);
  context.protocol = 'openai';
  application.log('info', '请求到达', {
    requestId: context.uid,
    method: request.method,
    url: request.url,
  });
  response.once('finish', () =>
    application.log('info', '请求结束', {
      requestId: context.uid,
      statusCode: response.statusCode,
      durationMs: Date.now() - context.receivedAt,
    })
  );
  response.once('close', () => {
    if (!response.writableFinished)
      application.log('warn', '客户端断开', { requestId: context.uid });
  });
  try {
    context.pathname = new URL(request.url, 'http://gateway.local').pathname;
    context.protocol = detectProtocol(context.pathname, request.headers);
    await waitForOperation(routeRequest(application, context), context.signal);
  } catch (error) {
    application.log('error', '请求失败', {
      requestId: context.uid,
      code: error.code || 'gateway_error',
      message: error.message,
    });
    sendError(context, error);
  } finally {
    try {
      await waitForResponseFinish(response, context.signal);
    } catch (error) {
      application.log('error', '响应交付超时', { requestId: context.uid, code: error.code });
      response.destroy();
    }
    if (!request.readableEnded && !request.destroyed) request.resume();
  }
}
