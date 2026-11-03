export default function writeLogLine(logOutput, output, line, onError) {
  const completion = Promise.withResolvers();
  logOutput.writesCompleted = Promise.all([logOutput.writesCompleted, completion.promise]).then(
    () => undefined
  );

  try {
    output.write(line, (error) => {
      try {
        if (error) onError(error);
      } finally {
        completion.resolve();
      }
    });
  } catch (error) {
    try {
      onError(error);
    } finally {
      completion.resolve();
    }
  }
}
