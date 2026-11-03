import createGatewayError from '../errors/createGatewayError.js';
import createModelList from '../protocols/createModelList.js';

import authorizeRequest from './authorizeRequest.js';
import handleChatRequest from './handleChatRequest.js';
import handleConsoleRequest from './handleConsoleRequest.js';
import sendJson from './sendJson.js';
import sendShutdownResponse from './sendShutdownResponse.js';
import serveFrontendAsset from './serveFrontendAsset.js';

export default async function routeRequest(application, context) {
  const { httpRequest: request, httpResponse: response, pathname } = context;
  if (application.lifecycle.isStopping || application.lifecycle.shutdownController.signal.aborted) {
    sendShutdownResponse(context, application.log);
    return;
  }
  if (pathname.startsWith('/api/')) {
    handleConsoleRequest(application, context);
    return;
  }
  const methods = {
    '/': 'GET',
    '/health': 'GET',
    '/v1/models': 'GET',
    '/v1/chat/completions': 'POST',
    '/v1/messages': 'POST',
  };
  const expectedMethod = pathname.startsWith('/assets/') ? 'GET' : methods[pathname];
  if (!expectedMethod) {
    throw createGatewayError('Resource Not Found', {
      statusCode: 404,
      code: 'not_found',
      type: 'not_found_error',
    });
  }
  if (request.method !== expectedMethod) {
    response.setHeader('Allow', expectedMethod);
    throw createGatewayError('Invalid Request Method', {
      statusCode: 405,
      code: 'method_not_allowed',
      type: 'invalid_request_error',
    });
  }
  if (pathname === '/' || pathname.startsWith('/assets/')) {
    await serveFrontendAsset(application, context);
    return;
  }
  if (pathname === '/health') {
    sendJson(response, 200, { status: 'ok' });
    return;
  }
  try {
    authorizeRequest(request, application.configuration.apiKey);
  } catch (error) {
    if (error.code === 'invalid_api_key') {
      application.log('request.rejected', { uid: context.uid, reason: error.message });
    }
    throw error;
  }
  if (pathname === '/v1/models') {
    sendJson(response, 200, createModelList(application.modelCatalog, context.protocol));
    return;
  }
  await handleChatRequest(application, context);
}
