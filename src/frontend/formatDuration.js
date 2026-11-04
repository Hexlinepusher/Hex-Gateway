export default function formatDuration(milliseconds) {
  return milliseconds === null ? '—' : `${(milliseconds / 1000).toFixed(2)} s`;
}
