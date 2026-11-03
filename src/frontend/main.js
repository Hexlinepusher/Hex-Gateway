import refreshOverview from './refreshOverview.js';
import renderModelList from './renderModelList.js';
import requestModelList from './requestModelList.js';
import resetOverviewMetric from './resetOverviewMetric.js';
import runOverviewOperation from './runOverviewOperation.js';
import startOverviewRefresh from './startOverviewRefresh.js';

const consoleState = {
  elements: {
    serviceName: document.getElementById('service-name'),
    queueLength: document.getElementById('queue-length'),
    consumerCapacity: document.getElementById('consumer-capacity'),
    upstreamLatency: document.getElementById('upstream-latency'),
    executionDuration: document.getElementById('execution-duration'),
    successRate: document.getElementById('success-rate'),
    overviewStatus: document.getElementById('overview-status'),
    modelList: document.getElementById('model-list'),
    modelStatus: document.getElementById('model-status'),
    resetButtons: document.querySelectorAll('button[data-metric]'),
  },
  refreshTimer: null,
  overviewOperation: null,
};

for (const button of consoleState.elements.resetButtons) {
  button.addEventListener('click', () => void resetOverviewMetric(consoleState, button));
}
void runOverviewOperation(consoleState, () => refreshOverview(consoleState));
void requestModelList().then(
  ({ models }) => renderModelList(consoleState.elements.modelList, models),
  (error) => {
    consoleState.elements.modelList.replaceChildren();
    consoleState.elements.modelStatus.textContent = error.message;
  }
);
startOverviewRefresh(consoleState);
