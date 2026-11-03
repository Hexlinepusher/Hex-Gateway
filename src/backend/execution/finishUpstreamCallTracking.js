export default function finishUpstreamCallTracking(upstreamCall) {
  if (!upstreamCall || upstreamCall.isFinished) return;
  upstreamCall.isFinished = true;
  clearTimeout(upstreamCall.idleTimer);
  clearTimeout(upstreamCall.totalTimer);
  upstreamCall.idleTimer = null;
  upstreamCall.totalTimer = null;
  upstreamCall.execution.activeUpstreamCalls.delete(upstreamCall);
}
