import createGatewayError from '../errors/createGatewayError.js';
import createModelList from '../protocols/createModelList.js';
import readFile from '../storage/readFile.js';

import authorizeRequest from './authorizeRequest.js';
import handleChatRequest from './handleChatRequest.js';
import sendJson from './sendJson.js';

export default async function routeRequest(application, context) {
  const { request, response, pathname } = context;
  const methods = {
    '/': 'GET',
    '/health': 'GET',
    '/v1/models': 'GET',
    '/v1/chat/completions': 'POST',
    '/v1/messages': 'POST',
  };
  if (!Object.hasOwn(methods, pathname)) {
    throw createGatewayError('接口不存在。', {
      statusCode: 404,
      code: 'not_found',
      type: 'not_found_error',
    });
  }
  if (request.method !== methods[pathname]) {
    response.setHeader('Allow', methods[pathname]);
    throw createGatewayError('请求方法不受支持。', {
      statusCode: 405,
      code: 'method_not_allowed',
      type: 'invalid_request_error',
    });
  }
  if (pathname === '/') {
    const page = await readFile(application.frontendPath);
    context.signal.throwIfAborted();
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    response.end(page);
    return;
  }
  if (pathname === '/health') {
    sendJson(response, 200, { status: 'ok' });
    return;
  }
  authorizeRequest(request, application.configuration.apiKey);
  if (pathname === '/v1/models') {
    sendJson(response, 200, createModelList(application.models, context.protocol));
    return;
  }
  await handleChatRequest(application, context);
}
