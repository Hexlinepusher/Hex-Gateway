export default function getCurrentExecutions(consumers) {
  return [...new Set(consumers.map((consumer) => consumer.currentExecution).filter(Boolean))];
}
