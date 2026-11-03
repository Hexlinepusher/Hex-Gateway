export default function clearRequestQueue(requestQueue) {
  return requestQueue.entries.splice(0);
}
