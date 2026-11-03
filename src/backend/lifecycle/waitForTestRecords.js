export default function waitForTestRecords(pendingTestRecords) {
  return Promise.allSettled([...pendingTestRecords]);
}
