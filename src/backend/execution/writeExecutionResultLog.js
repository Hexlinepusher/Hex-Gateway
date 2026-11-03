export default function writeExecutionResultLog(log, execution, result, disposition) {
  const { uid, downstreamAbortController } = execution.queueEntry.requestContext;
  const parameters = { uid, consumerId: execution.consumer.id, attempt: execution.number };
  if (downstreamAbortController.signal.aborted) {
    log('execution.safefinished', { consumerId: execution.consumer.id, id: uid });
  } else if (result.outcome === 'succeeded') {
    log('execution.completed', parameters);
  } else if (result.outcome === 'unknown') {
    log('execution.unkownresult', {
      ...parameters,
      code: result.upstreamResponse.code,
      status: result.upstreamResponse.status,
    });
  } else {
    const actions = {
      retry: '请求已解锁，继续等待',
      retry_limit: '重试次数已用尽，请求已终结',
      shutdown: '请求已解锁，等待网关关闭处理',
      discard: '请求已终结',
      respond: '请求已终结',
    };
    log('execution.failed', { ...parameters, reason: result.reason, action: actions[disposition] });
  }
}
