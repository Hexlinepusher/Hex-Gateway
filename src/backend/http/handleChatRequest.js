import enqueueRequest from '../concurrency/enqueueRequest.js';
import createGatewayError from '../errors/createGatewayError.js';
import findModel from '../models/findModel.js';
import validateChatRequest from '../protocols/validateChatRequest.js';
import createTestRequestSnapshot from '../testModel/createTestRequestSnapshot.js';
import handleTestRequest from '../testModel/handleTestRequest.js';

import parseRequestBody from './parseRequestBody.js';
import readRequestBody from './readRequestBody.js';
import sendShutdownResponse from './sendShutdownResponse.js';

export default async function handleChatRequest(application, context) {
  const { httpRequest } = context;
  const downstreamSignal = context.downstreamAbortController.signal;
  const shutdownSignal = application.lifecycle.shutdownController.signal;
  const rawBody = await readRequestBody(httpRequest, downstreamSignal, shutdownSignal);
  if (application.lifecycle.isStopping || shutdownSignal.aborted) {
    sendShutdownResponse(context, application.log);
    return;
  }
  try {
    context.parsedBody = parseRequestBody(rawBody);
    validateChatRequest(context.parsedBody, context.protocol);
    if (!findModel(application.modelCatalog, context.parsedBody.model)) {
      throw createGatewayError('Invalid Model ID', {
        statusCode: 404,
        code: 'model_not_found',
        type: 'not_found_error',
      });
    }
  } catch (error) {
    application.log('request.rejected', { uid: context.uid, reason: error.message });
    throw error;
  }
  if (context.parsedBody.model === `[${application.configuration.serviceName}]Gateway-Test`) {
    const snapshot = createTestRequestSnapshot(context, rawBody);
    await handleTestRequest(application, context, snapshot);
    return;
  }
  downstreamSignal.throwIfAborted();
  try {
    enqueueRequest(application.scheduler, context);
  } catch (error) {
    if (error.code === 'gateway_stopping') {
      sendShutdownResponse(context, application.log);
      return;
    }
    if (!downstreamSignal.aborted) {
      application.log('request.rejected', { uid: context.uid, reason: error.message });
    }
    throw error;
  }
  application.log('request.queued', {
    uid: context.uid,
    protocol: context.protocol,
    model: context.parsedBody.model,
  });
  application.scheduler.dispatch();
}
