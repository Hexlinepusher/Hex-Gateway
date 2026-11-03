export default function releaseLogOutput(logOutput) {
  if (logOutput.releaseRequested) return;
  logOutput.releaseRequested = true;
  for (const output of new Set([logOutput.output, logOutput.errorOutput])) {
    const stopObserving = () => {
      output.off('error', logOutput.onStreamError);
      output.off('error', stopObserving);
      output.off('close', stopObserving);
    };
    if (
      (output.destroyed && !output.closed) ||
      (output.errored && !logOutput.observedStreamErrors.has(output))
    ) {
      output.once('error', stopObserving);
      output.once('close', stopObserving);
    } else {
      stopObserving();
    }
  }
}
