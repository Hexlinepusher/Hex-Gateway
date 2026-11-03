export default async function runOverviewOperation(state, operation) {
  const previous = state.overviewOperation ?? Promise.resolve();
  const current = previous.catch(() => undefined).then(operation);
  state.overviewOperation = current;
  try {
    return await current;
  } finally {
    if (state.overviewOperation === current) state.overviewOperation = null;
  }
}
