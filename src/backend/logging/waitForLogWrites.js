export default async function waitForLogWrites(logOutput) {
  let writesCompleted;
  do {
    writesCompleted = logOutput.writesCompleted;
    await writesCompleted;
  } while (writesCompleted !== logOutput.writesCompleted);
  return logOutput.firstError;
}
