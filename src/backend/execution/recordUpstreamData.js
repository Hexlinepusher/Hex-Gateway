import isExecutionActive from './isExecutionActive.js';
import refreshUpstreamIdleTimeout from './refreshUpstreamIdleTimeout.js';

export default function recordUpstreamData(upstreamCall, idleTimeoutMs, receivedAt = Date.now()) {
  if (!upstreamCall || upstreamCall.isFinished || !isExecutionActive(upstreamCall.execution))
    return;
  upstreamCall.execution.firstUpstreamDataAt ??= receivedAt;
  refreshUpstreamIdleTimeout(upstreamCall, idleTimeoutMs);
}
