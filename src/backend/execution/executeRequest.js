import deliverStreamEvent from '../http/deliverStreamEvent.js';

import createExecutionFailure from './createExecutionFailure.js';
import finishExecution from './finishExecution.js';
import finishUpstreamCallTracking from './finishUpstreamCallTracking.js';
import recordUpstreamData from './recordUpstreamData.js';
import startUpstreamCallTracking from './startUpstreamCallTracking.js';
import validateExecutionResult from './validateExecutionResult.js';

export default async function executeRequest(scheduler, execution) {
  const { requestContext } = execution.queueEntry;
  const { httpRequest } = requestContext;
  let result;
  try {
    result = await scheduler.execute({
      uid: requestContext.uid,
      attempt: execution.number,
      consumer: execution.consumer,
      request: {
        body: requestContext.parsedBody,
        protocol: requestContext.protocol,
        method: httpRequest.method,
        url: httpRequest.url,
        headers: httpRequest.headers,
      },
      shutdownSignal: scheduler.lifecycle.shutdownController.signal,
      startUpstreamCallTracking: (callbacks) =>
        startUpstreamCallTracking(execution, scheduler.configuration, callbacks),
      recordUpstreamData: (upstreamCall) =>
        recordUpstreamData(upstreamCall, scheduler.configuration.idleTimeoutMs),
      finishUpstreamCallTracking,
      deliverStreamEvent: (chunk) => deliverStreamEvent(execution, scheduler.lifecycle, chunk),
    });
    validateExecutionResult(result);
  } catch (error) {
    result = createExecutionFailure(execution.callbackError ?? error);
  }
  finishExecution(scheduler, execution, result);
}
