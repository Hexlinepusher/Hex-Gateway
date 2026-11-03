import formatLogLine from './formatLogLine.js';
import reportLogFailure from './reportLogFailure.js';
import writeLogLine from './writeLogLine.js';

export default function writeLog(logOutput, event, parameters = {}) {
  try {
    const line = formatLogLine(event, parameters);
    writeLogLine(logOutput, logOutput.output, line, (error) => reportLogFailure(logOutput, error));
  } catch (error) {
    reportLogFailure(logOutput, error);
  }
}
