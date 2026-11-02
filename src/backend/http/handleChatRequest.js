import enqueueRequest from '../concurrency/enqueueRequest.js';
import validateChatRequest from '../protocols/validateChatRequest.js';
import saveTestRequest from '../testModel/saveTestRequest.js';

import parseRequestBody from './parseRequestBody.js';
import readRequestBody from './readRequestBody.js';
import sendExecutionResult from './sendExecutionResult.js';
import sendTextResponse from './sendTextResponse.js';
import writeStreamChunk from './writeStreamChunk.js';

export default async function handleChatRequest(application, context) {
  const rawBody = await readRequestBody(context.request, context.signal);
  const body = parseRequestBody(rawBody);
  validateChatRequest(body, application.models, context.protocol);
  context.signal.throwIfAborted();
  if (body.model === `${application.configuration.serviceName}-test`) {
    const filename = await saveTestRequest(
      application.dataDirectory,
      context.request,
      rawBody,
      new Date(context.receivedAt)
    );
    application.log('info', '测试请求已记录', { requestId: context.uid, filename });
    await sendTextResponse(context, body, 'OK');
    return;
  }
  const result = await enqueueRequest(application.scheduler, {
    uid: context.uid,
    deadline: context.deadline,
    signal: context.signal,
    request: {
      body,
      protocol: context.protocol,
      method: context.request.method,
      url: context.request.url,
      headers: context.request.headers,
    },
    onChunk: (chunk, executionSignal) => writeStreamChunk(context.response, chunk, executionSignal),
  });
  sendExecutionResult(context, result);
}
