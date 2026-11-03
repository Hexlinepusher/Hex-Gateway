export default function findAvailableConsumer(consumers) {
  return consumers.find((consumer) => consumer.available === true && !consumer.currentExecution);
}
