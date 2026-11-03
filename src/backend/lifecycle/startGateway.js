import { fileURLToPath } from 'node:url';

import createDefaultService from '../../service.js';
import createRequestQueue from '../concurrency/createRequestQueue.js';
import createScheduler from '../concurrency/createScheduler.js';
import readConfiguration from '../configuration/readConfiguration.js';
import createGatewayServer from '../http/createGatewayServer.js';
import handleRequest from '../http/handleRequest.js';
import listenGatewayServer from '../http/listenGatewayServer.js';
import createLogOutput from '../logging/createLogOutput.js';
import releaseLogOutput from '../logging/releaseLogOutput.js';
import waitForLogWrites from '../logging/waitForLogWrites.js';
import writeLog from '../logging/writeLog.js';
import createModelCatalog from '../models/createModelCatalog.js';
import createStatistics from '../statistics/createStatistics.js';

export default async function startGateway({
  environment = process.env,
  createService = createDefaultService,
  dataDirectory = fileURLToPath(new URL('../../../data/', import.meta.url)),
  logOutput,
} = {}) {
  const ownsLogOutput = logOutput === undefined;
  if (ownsLogOutput) logOutput = createLogOutput();
  const log = writeLog.bind(null, logOutput);
  const lifecycle = {
    isStopping: false,
    shutdownController: new AbortController(),
    stopPromise: null,
    pendingTestRecords: new Set(),
    ownsLogOutput,
  };
  let service;
  try {
    const configuration = readConfiguration(environment);
    const frontendDirectory = fileURLToPath(new URL('../../frontend/', import.meta.url));
    const requestQueue = createRequestQueue(configuration.queueCapacity);
    const statistics = createStatistics(new Date());
    service = await createService({
      configuration,
      dataDirectory,
      log,
      shutdownSignal: lifecycle.shutdownController.signal,
    });
    const modelCatalog = createModelCatalog(configuration.serviceName, service.additionalModels);
    const scheduler = createScheduler({
      requestQueue,
      consumers: service.consumers,
      execute: service.execute,
      configuration,
      statistics,
      lifecycle,
      log,
    });
    service.setConsumersChangedHandler?.(scheduler.dispatch);
    const application = {
      configuration,
      dataDirectory,
      frontendDirectory,
      modelCatalog,
      requestQueue,
      statistics,
      lifecycle,
      scheduler,
      log,
    };
    const httpServer = createGatewayServer(handleRequest.bind(null, application));
    await listenGatewayServer(httpServer, '0.0.0.0', configuration.port);
    log('gateway.started', { address: '0.0.0.0', port: configuration.port });
    return {
      httpServer,
      service,
      configuration,
      modelCatalog,
      requestQueue,
      statistics,
      scheduler,
      lifecycle,
      logOutput,
      log,
    };
  } catch (error) {
    lifecycle.isStopping = true;
    const startupError = error instanceof Error ? error : new Error(String(error));
    let failure = startupError;
    let resourcesClosed = true;
    try {
      await service?.closeResources?.();
    } catch (error) {
      resourcesClosed = false;
      const cleanupError = error instanceof Error ? error : new Error(String(error));
      failure = new AggregateError(
        [startupError, cleanupError],
        `${startupError.message}；资源收尾失败：${cleanupError.message}`,
        { cause: startupError }
      );
    }
    log('gateway.start_failed', { reason: failure.message });
    await waitForLogWrites(logOutput);
    if (ownsLogOutput && resourcesClosed) releaseLogOutput(logOutput);
    throw failure;
  }
}
