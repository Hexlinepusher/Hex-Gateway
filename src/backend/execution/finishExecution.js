import releaseConsumer from '../concurrency/releaseConsumer.js';
import removeQueueEntry from '../concurrency/removeQueueEntry.js';
import unlockRequest from '../concurrency/unlockRequest.js';
import createGatewayError from '../errors/createGatewayError.js';
import recordRequestTermination from '../http/recordRequestTermination.js';
import sendExecutionResult from '../http/sendExecutionResult.js';
import recordExecutionStatistics from '../statistics/recordExecutionStatistics.js';

import decideRequestDisposition from './decideRequestDisposition.js';
import finishUpstreamCallTracking from './finishUpstreamCallTracking.js';
import isExecutionActive from './isExecutionActive.js';
import writeExecutionResultLog from './writeExecutionResultLog.js';

export default function finishExecution(scheduler, execution, result) {
  if (!isExecutionActive(execution)) return;
  execution.endedAt = Date.now();
  const disposition = decideRequestDisposition(scheduler, execution, result);
  const { queueEntry, consumer } = execution;
  const context = queueEntry.requestContext;
  if (disposition !== 'retry' && disposition !== 'shutdown') {
    removeQueueEntry(scheduler.requestQueue, queueEntry);
  }
  for (const upstreamCall of execution.activeUpstreamCalls) {
    finishUpstreamCallTracking(upstreamCall);
  }
  unlockRequest(queueEntry, execution);
  releaseConsumer(consumer, execution);
  recordExecutionStatistics(scheduler.statistics, { ...execution, outcome: result.outcome });
  writeExecutionResultLog(scheduler.log, execution, result, disposition);
  if (disposition === 'retry_limit') {
    recordRequestTermination(context, scheduler.log, '重试次数已用尽');
    sendExecutionResult(context, {
      error: createGatewayError('Retry Limit Exceeded', {
        statusCode: 429,
        code: 'retry_limit_exceeded',
        type: 'rate_limit_error',
      }),
    });
  } else if (disposition === 'respond') {
    sendExecutionResult(context, result.response);
  }
  scheduler.dispatch();
}
