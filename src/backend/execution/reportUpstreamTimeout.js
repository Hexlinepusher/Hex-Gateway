import isExecutionActive from './isExecutionActive.js';
import reportTimeoutCallbackError from './reportTimeoutCallbackError.js';

export default function reportUpstreamTimeout(upstreamCall, kind, expectedTimer) {
  const timerField = kind === 'idle' ? 'idleTimer' : 'totalTimer';
  if (
    upstreamCall.isFinished ||
    !isExecutionActive(upstreamCall.execution) ||
    upstreamCall[timerField] === null ||
    upstreamCall[timerField] !== expectedTimer
  )
    return;
  clearTimeout(upstreamCall[timerField]);
  upstreamCall[timerField] = null;
  try {
    void Promise.resolve(upstreamCall.onTimeout(kind)).catch((error) =>
      reportTimeoutCallbackError(upstreamCall, error)
    );
  } catch (error) {
    reportTimeoutCallbackError(upstreamCall, error);
  }
}
