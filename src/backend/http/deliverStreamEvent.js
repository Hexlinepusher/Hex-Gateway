import isExecutionActive from '../execution/isExecutionActive.js';

import writeStreamChunk from './writeStreamChunk.js';

export default async function deliverStreamEvent(execution, lifecycle, chunk) {
  if (!isExecutionActive(execution) || lifecycle.isStopping) return;
  const context = execution.queueEntry.requestContext;
  const downstreamSignal = context.downstreamAbortController.signal;
  const shutdownSignal = lifecycle.shutdownController.signal;
  if (downstreamSignal.aborted || shutdownSignal.aborted) return;
  try {
    await writeStreamChunk(
      context.httpResponse,
      chunk,
      AbortSignal.any([downstreamSignal, shutdownSignal])
    );
  } catch (error) {
    if (!downstreamSignal.aborted && !shutdownSignal.aborted) throw error;
  }
}
