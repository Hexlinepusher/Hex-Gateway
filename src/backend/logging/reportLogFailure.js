import writeLogLine from './writeLogLine.js';

export default function reportLogFailure(logOutput, error) {
  if (logOutput.firstError !== null) return;
  logOutput.firstError =
    error instanceof Error ? error : new Error('日志处理失败', { cause: error });
  let reason = '日志处理失败';
  try {
    reason = String(logOutput.firstError.message).replace(/\r/g, '\\r').replace(/\n/g, '\\n');
  } catch {
    reason = '无法读取日志错误原因';
  }
  writeLogLine(logOutput, logOutput.errorOutput, `日志处理失败：${reason}\n`, () => undefined);
}
