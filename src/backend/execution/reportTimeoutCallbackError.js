import isExecutionActive from './isExecutionActive.js';

export default function reportTimeoutCallbackError(upstreamCall, error) {
  const { execution } = upstreamCall;
  if (!isExecutionActive(execution)) return;
  const failure = error instanceof Error ? error : new Error(String(error));
  execution.callbackError ??= failure;
  try {
    void Promise.resolve(upstreamCall.onError(failure)).catch((forwardingError) => {
      if (isExecutionActive(execution)) execution.callbackError ??= forwardingError;
    });
  } catch (forwardingError) {
    execution.callbackError ??= forwardingError;
  }
}
