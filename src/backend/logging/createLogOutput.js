import reportLogFailure from './reportLogFailure.js';

export default function createLogOutput(output = process.stdout, errorOutput = process.stderr) {
  const logOutput = {
    output,
    errorOutput,
    writesCompleted: Promise.resolve(),
    firstError: null,
    releaseRequested: false,
    observedStreamErrors: new WeakSet(),
  };
  logOutput.onStreamError = function (error) {
    logOutput.observedStreamErrors.add(this);
    if (!logOutput.releaseRequested) reportLogFailure(logOutput, error);
  };
  output.on('error', logOutput.onStreamError);
  if (errorOutput !== output) errorOutput.on('error', logOutput.onStreamError);
  return logOutput;
}
