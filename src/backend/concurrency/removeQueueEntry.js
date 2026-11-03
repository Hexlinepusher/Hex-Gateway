export default function removeQueueEntry(requestQueue, queueEntry) {
  const index = requestQueue.entries.indexOf(queueEntry);
  if (index !== -1) requestQueue.entries.splice(index, 1);
}
