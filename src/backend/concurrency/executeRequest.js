import createGatewayError from '../errors/createGatewayError.js';

import emitChunk from './emitChunk.js';
import enforceRequestDeadline from './enforceRequestDeadline.js';
import isAttemptActive from './isAttemptActive.js';
import normalizeExecutionError from './normalizeExecutionError.js';
import refreshIdleTimeout from './refreshIdleTimeout.js';
import settleRequest from './settleRequest.js';

export default async function executeRequest(scheduler, task, consumer) {
  consumer.busy = true;
  task.attempt += 1;
  const attempt = {
    number: task.attempt,
    controller: new AbortController(),
    idleTimer: null,
    active: true,
  };
  task.activeAttempt = attempt;
  let requeued = false;
  try {
    scheduler.log('info', '请求开始执行', {
      requestId: task.uid,
      attempt: attempt.number,
      consumerId: consumer.id,
    });
    refreshIdleTimeout(scheduler, task, attempt);
    if (!isAttemptActive(task, attempt)) return;
    const result = await scheduler.execute({
      uid: task.uid,
      attempt: attempt.number,
      consumer,
      request: task.request,
      signal: attempt.controller.signal,
      onActivity: () => refreshIdleTimeout(scheduler, task, attempt),
      emit: (chunk) => emitChunk(scheduler, task, attempt, chunk),
    });
    if (!isAttemptActive(task, attempt) || !enforceRequestDeadline(scheduler, task)) return;
    if (result?.requeue) {
      if (task.committed) {
        throw createGatewayError('响应已提交，无法重新入队', {
          statusCode: 502,
          code: 'response_already_started',
          type: 'api_error',
        });
      }
      attempt.active = false;
      clearTimeout(attempt.idleTimer);
      scheduler.queue.push(task);
      requeued = true;
      scheduler.log('info', '请求重新入队', {
        requestId: task.uid,
        attempt: attempt.number,
        consumerId: consumer.id,
      });
    } else {
      settleRequest(task, null, result);
    }
  } catch (error) {
    if (isAttemptActive(task, attempt)) {
      settleRequest(task, normalizeExecutionError(error));
    }
  } finally {
    attempt.active = false;
    clearTimeout(attempt.idleTimer);
    if (task.activeAttempt === attempt) task.activeAttempt = null;
    consumer.busy = false;
    if (requeued) {
      setImmediate(scheduler.dispatch);
    } else {
      scheduler.dispatch();
    }
  }
}
