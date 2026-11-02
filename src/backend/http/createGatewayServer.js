import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';

import createScheduler from '../concurrency/createScheduler.js';
import readConfiguration from '../configuration/readConfiguration.js';
import writeLog from '../logging/writeLog.js';
import createModelCatalog from '../models/createModelCatalog.js';

import handleRequest from './handleRequest.js';

export default function createGatewayServer({
  configuration = readConfiguration(),
  dataDirectory = fileURLToPath(new URL('../../../data/', import.meta.url)),
  models = [],
  consumers = [],
  execute,
  log = writeLog,
} = {}) {
  const application = {
    configuration,
    dataDirectory,
    frontendPath: fileURLToPath(new URL('../../frontend/index.html', import.meta.url)),
    models: createModelCatalog(configuration.serviceName, models),
    scheduler: createScheduler({
      consumers,
      execute,
      idleTimeoutMs: configuration.idleTimeoutMs,
      log,
    }),
    log,
  };
  const server = createServer((request, response) => {
    void handleRequest(application, request, response);
  });
  server.requestTimeout = 0;
  server.timeout = 0;
  return { server, scheduler: application.scheduler, models: application.models };
}
