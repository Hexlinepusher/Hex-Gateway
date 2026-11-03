import detectProtocol from '../protocols/detectProtocol.js';

import cancelDownstreamRequest from './cancelDownstreamRequest.js';
import createRequestContext from './createRequestContext.js';
import observeDownstreamConnection from './observeDownstreamConnection.js';
import routeRequest from './routeRequest.js';
import sendError from './sendError.js';
import sendShutdownResponse from './sendShutdownResponse.js';
import waitForOperation from './waitForOperation.js';
import waitForResponseFinish from './waitForResponseFinish.js';

export default async function handleRequest(application, httpRequest, httpResponse) {
  const context = createRequestContext(httpRequest, httpResponse);
  const downstreamSignal = context.downstreamAbortController.signal;
  httpResponse.setHeader('x-request-id', context.uid);
  const stopObserving = observeDownstreamConnection(context, () =>
    cancelDownstreamRequest(context, application.requestQueue, application.log)
  );
  try {
    context.pathname = new URL(httpRequest.url, 'http://gateway.local').pathname;
    context.protocol = detectProtocol(context.pathname, httpRequest.headers);
    await waitForOperation(routeRequest(application, context), downstreamSignal);
  } catch (error) {
    if (!downstreamSignal.aborted) {
      if (application.lifecycle.shutdownController.signal.aborted) {
        sendShutdownResponse(context, application.log);
      } else {
        if (error.code === 'not_found' || error.code === 'method_not_allowed') {
          application.log('request.rejected', { uid: context.uid, reason: error.message });
        }
        sendError(context, error);
      }
    }
  } finally {
    try {
      await waitForResponseFinish(httpResponse);
    } catch {
      httpResponse.destroy();
    }
    stopObserving();
    if (!httpRequest.readableEnded && !httpRequest.destroyed) httpRequest.resume();
  }
}
