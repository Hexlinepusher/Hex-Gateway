import refreshOverview from './refreshOverview.js';
import runOverviewOperation from './runOverviewOperation.js';

export default function startOverviewRefresh(state) {
  state.refreshTimer = setInterval(() => {
    if (state.overviewOperation !== null) return;
    void runOverviewOperation(state, () => refreshOverview(state));
  }, 5000);
}
