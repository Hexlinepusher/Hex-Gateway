export default function readConfiguration(environment = process.env) {
  const port = Number(environment.PORT || 3000);
  const idleTimeoutMs = Number(environment.REQUEST_IDLE_TIMEOUT_SECONDS || 300) * 1000;
  const totalTimeoutMs = Number(environment.REQUEST_TOTAL_TIMEOUT_SECONDS || 600) * 1000;
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT 必须是 1 到 65535 之间的整数。');
  }
  for (const [name, value] of Object.entries({ idleTimeoutMs, totalTimeoutMs })) {
    if (!Number.isFinite(value) || value < 1 || value > 2147483647) {
      throw new Error(`${name} 必须对应 1 到 2147483647 毫秒之间的时长。`);
    }
  }
  return {
    port,
    apiKey: environment.GATEWAY_API_KEY || '',
    serviceName: environment.UPSTREAM_SERVICE_NAME?.trim() || 'gateway',
    idleTimeoutMs,
    totalTimeoutMs,
  };
}
