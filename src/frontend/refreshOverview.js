import renderOverview from './renderOverview.js';
import requestOverview from './requestOverview.js';

export default async function refreshOverview(state) {
  try {
    renderOverview(state.elements, await requestOverview());
    state.elements.overviewStatus.textContent = '';
  } catch (error) {
    state.elements.overviewStatus.textContent = error.message;
  }
}
