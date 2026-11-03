import renderOverview from './renderOverview.js';
import requestMetricReset from './requestMetricReset.js';
import runOverviewOperation from './runOverviewOperation.js';

export default async function resetOverviewMetric(state, button) {
  if (button.disabled) return;
  button.disabled = true;
  try {
    await runOverviewOperation(state, async () => {
      try {
        renderOverview(state.elements, await requestMetricReset(button.dataset.metric));
        state.elements.overviewStatus.textContent = '';
      } catch (error) {
        state.elements.overviewStatus.textContent = error.message;
      }
    });
  } finally {
    button.disabled = false;
  }
}
