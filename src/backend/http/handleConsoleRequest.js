import createOverview from '../console/createOverview.js';
import createGatewayError from '../errors/createGatewayError.js';
import resetStatisticsMetric from '../statistics/resetStatisticsMetric.js';
import summarizeStatistics from '../statistics/summarizeStatistics.js';
import updateStatisticsWindow from '../statistics/updateStatisticsWindow.js';

import sendJson from './sendJson.js';

export default function handleConsoleRequest(application, context) {
  const { pathname, httpRequest, httpResponse } = context;
  const resetMatch = /^\/api\/statistics\/([^/]+)\/reset$/.exec(pathname);
  const method = resetMatch
    ? 'POST'
    : ['/api/overview', '/api/models'].includes(pathname)
      ? 'GET'
      : null;
  if (!method) {
    throw createGatewayError('Resource Not Found', {
      statusCode: 404,
      code: 'not_found',
      type: 'not_found_error',
    });
  }
  if (httpRequest.method !== method) {
    httpResponse.setHeader('Allow', method);
    throw createGatewayError('Invalid Request Method', {
      statusCode: 405,
      code: 'method_not_allowed',
      type: 'invalid_request_error',
    });
  }
  httpResponse.setHeader('Cache-Control', 'no-store');
  if (pathname === '/api/models') {
    sendJson(httpResponse, 200, { models: application.modelCatalog });
    return;
  }
  const date = new Date();
  if (resetMatch) {
    const label = resetStatisticsMetric(application.statistics, resetMatch[1], date);
    if (label === null) {
      throw createGatewayError('Resource Not Found', {
        statusCode: 404,
        code: 'not_found',
        type: 'not_found_error',
      });
    }
    application.log('stats.reset', { metric: label });
  } else {
    updateStatisticsWindow(application.statistics, date);
  }
  const overview = createOverview(
    application.configuration.serviceName,
    application.requestQueue,
    application.scheduler.consumers,
    summarizeStatistics(application.statistics)
  );
  sendJson(httpResponse, 200, overview);
}
