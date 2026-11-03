import isExecutionActive from './isExecutionActive.js';
import refreshUpstreamIdleTimeout from './refreshUpstreamIdleTimeout.js';
import reportUpstreamTimeout from './reportUpstreamTimeout.js';

export default function startUpstreamCallTracking(
  execution,
  configuration,
  { onTimeout, onError }
) {
  if (!isExecutionActive(execution)) return null;
  if (typeof onTimeout !== 'function' || typeof onError !== 'function') {
    throw new TypeError('上游调用跟踪需要 onTimeout 和 onError 回调。');
  }
  const upstreamCall = {
    execution,
    idleTimer: null,
    totalTimer: null,
    onTimeout,
    onError,
    isFinished: false,
  };
  execution.activeUpstreamCalls.add(upstreamCall);
  refreshUpstreamIdleTimeout(upstreamCall, configuration.idleTimeoutMs);
  const timer = setTimeout(
    () => reportUpstreamTimeout(upstreamCall, 'total', timer),
    configuration.totalTimeoutMs
  );
  upstreamCall.totalTimer = timer;
  return upstreamCall;
}
