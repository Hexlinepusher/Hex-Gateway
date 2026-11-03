export default function readConfiguration(environment = process.env) {
  const port = Number(environment.PORT || 8800);
  const queueCapacity = Number(environment.REQUEST_QUEUE_CAPACITY || 32);
  const retryTimes = Number(environment.RETRY_TIMES || 0);
  const idleTimeoutMs = Number(environment.REQUEST_IDLE_TIMEOUT_SECONDS || 300) * 1000;
  const totalTimeoutMs = Number(environment.REQUEST_TOTAL_TIMEOUT_SECONDS || 600) * 1000;
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT 必须是 1 到 65535 之间的整数。');
  }
  if (!Number.isSafeInteger(queueCapacity) || queueCapacity < 1) {
    throw new Error('REQUEST_QUEUE_CAPACITY 必须是正整数。');
  }
  if (!Number.isSafeInteger(retryTimes) || retryTimes < 0) {
    throw new Error('RETRY_TIMES 必须是非负整数。');
  }
  for (const [name, value] of Object.entries({ idleTimeoutMs, totalTimeoutMs })) {
    if (!Number.isFinite(value) || value < 1 || value > 2147483647) {
      throw new Error(`${name} 必须对应 1 到 2147483647 毫秒之间的时长。`);
    }
  }
  return {
    port,
    apiKey: environment.GATEWAY_API_KEY || '',
    serviceName: environment.UPSTREAM_SERVICE_NAME?.trim() || 'default_service_name',
    queueCapacity,
    retryTimes,
    idleTimeoutMs,
    totalTimeoutMs,
  };
}
