export default function recordShutdownFailure(failures, log, step, error) {
  const cause = error instanceof Error ? error : new Error(String(error));
  const failure = new Error(`${step}：${cause.message}`, { cause });
  failures.push(failure);
  log('gateway.stop_failed', { reason: failure.message });
}
