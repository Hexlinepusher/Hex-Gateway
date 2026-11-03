export default function waitForExecutions(executions) {
  return Promise.allSettled(
    executions.map(
      (execution) => execution.completion ?? Promise.reject(new Error('执行未登记完成状态。'))
    )
  );
}
