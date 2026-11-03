export default function formatDuration(milliseconds) {
  return milliseconds === null ? '—' : `${Math.round(milliseconds)} ms`;
}
