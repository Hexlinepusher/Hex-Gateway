export default function releaseConsumer(consumer, execution) {
  if (consumer.currentExecution === execution) consumer.currentExecution = null;
}
