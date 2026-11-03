import reportUpstreamTimeout from './reportUpstreamTimeout.js';

export default function refreshUpstreamIdleTimeout(upstreamCall, idleTimeoutMs) {
  clearTimeout(upstreamCall.idleTimer);
  const timer = setTimeout(() => reportUpstreamTimeout(upstreamCall, 'idle', timer), idleTimeoutMs);
  upstreamCall.idleTimer = timer;
}
