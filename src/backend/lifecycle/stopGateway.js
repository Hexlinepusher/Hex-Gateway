import clearRequestQueue from '../concurrency/clearRequestQueue.js';
import getCurrentExecutions from '../concurrency/getCurrentExecutions.js';
import closeHttpServer from '../http/closeHttpServer.js';
import sendShutdownResponse from '../http/sendShutdownResponse.js';
import releaseLogOutput from '../logging/releaseLogOutput.js';
import waitForLogWrites from '../logging/waitForLogWrites.js';

import recordShutdownFailure from './recordShutdownFailure.js';
import waitForExecutions from './waitForExecutions.js';
import waitForTestRecords from './waitForTestRecords.js';

export default function stopGateway(gateway) {
  const { httpServer, service, scheduler, lifecycle, logOutput, log } = gateway;
  if (lifecycle.stopPromise) return lifecycle.stopPromise;
  const completion = Promise.withResolvers();
  lifecycle.stopPromise = completion.promise;
  lifecycle.isStopping = true;
  const failures = [];
  log('gateway.stopping');
  const httpClosed = closeHttpServer(httpServer).catch((error) =>
    recordShutdownFailure(failures, log, 'HTTP 关闭失败', error)
  );
  const executions = getCurrentExecutions(scheduler.consumers);
  lifecycle.shutdownController.abort(new Error('网关关闭'));

  void Promise.resolve()
    .then(async () => {
      const executionResults = await waitForExecutions(executions);
      let executionsFinished = true;
      for (const [index, result] of executionResults.entries()) {
        if (result.status === 'rejected') {
          executionsFinished = false;
          recordShutdownFailure(
            failures,
            log,
            `消费者${executions[index].consumer.id}执行收尾失败`,
            result.reason
          );
        }
      }
      if (
        executionsFinished &&
        (getCurrentExecutions(scheduler.consumers).length > 0 ||
          scheduler.requestQueue.entries.some((entry) => entry.lockedExecution !== null))
      ) {
        executionsFinished = false;
        recordShutdownFailure(failures, log, '执行收尾失败', new Error('仍有未释放的执行或锁定。'));
      }
      const pendingCleanup = [
        waitForTestRecords(lifecycle.pendingTestRecords).then((results) => {
          for (const result of results) {
            if (result.status === 'rejected') {
              recordShutdownFailure(failures, log, '测试记录等待失败', result.reason);
            }
          }
        }),
      ];
      if (executionsFinished) {
        for (const entry of clearRequestQueue(scheduler.requestQueue)) {
          try {
            sendShutdownResponse(entry.requestContext, log);
          } catch (error) {
            recordShutdownFailure(failures, log, '关闭响应交付失败', error);
            entry.requestContext.httpResponse.destroy();
          }
        }
        pendingCleanup.push(
          httpClosed,
          Promise.resolve()
            .then(() => service.closeResources?.())
            .catch((error) => recordShutdownFailure(failures, log, '服务资源释放失败', error))
        );
      }
      await Promise.all(pendingCleanup);
      const resourcesClosed = failures.length === 0;
      if (resourcesClosed) log('gateway.stopped');
      const logFailure = await waitForLogWrites(logOutput);
      if (resourcesClosed && lifecycle.ownsLogOutput) releaseLogOutput(logOutput);
      if (logFailure) failures.push(logFailure);
      if (failures.length > 0) throw new AggregateError(failures, '网关停止失败。');
    })
    .then(completion.resolve, completion.reject);
  return lifecycle.stopPromise;
}
