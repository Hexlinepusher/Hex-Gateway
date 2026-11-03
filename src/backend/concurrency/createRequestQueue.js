export default function createRequestQueue(capacity) {
  return { capacity, entries: [] };
}
