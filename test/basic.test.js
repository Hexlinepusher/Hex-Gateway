import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, mkdtemp, readFile, readdir } from 'node:fs/promises';
import { createConnection, createServer } from 'node:net';
import { join } from 'node:path';
import { PassThrough, Writable } from 'node:stream';
import test from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

import createOverview from '../src/backend/console/createOverview.js';
import createGatewayError from '../src/backend/errors/createGatewayError.js';
import finishExecution from '../src/backend/execution/finishExecution.js';
import isExecutionActive from '../src/backend/execution/isExecutionActive.js';
import createGatewayServer from '../src/backend/http/createGatewayServer.js';
import createRequestContext from '../src/backend/http/createRequestContext.js';
import handleChatRequest from '../src/backend/http/handleChatRequest.js';
import handleRequest from '../src/backend/http/handleRequest.js';
import listenGatewayServer from '../src/backend/http/listenGatewayServer.js';
import startGateway from '../src/backend/lifecycle/startGateway.js';
import stopGateway from '../src/backend/lifecycle/stopGateway.js';
import createLogOutput from '../src/backend/logging/createLogOutput.js';
import formatLogLine from '../src/backend/logging/formatLogLine.js';
import releaseLogOutput from '../src/backend/logging/releaseLogOutput.js';
import waitForLogWrites from '../src/backend/logging/waitForLogWrites.js';
import writeLog from '../src/backend/logging/writeLog.js';
import createStatistics from '../src/backend/statistics/createStatistics.js';
import recordExecutionStatistics from '../src/backend/statistics/recordExecutionStatistics.js';
import resetStatisticsMetric from '../src/backend/statistics/resetStatisticsMetric.js';
import summarizeStatistics from '../src/backend/statistics/summarizeStatistics.js';
import createTestRequestSnapshot from '../src/backend/testModel/createTestRequestSnapshot.js';
import handleTestRequest from '../src/backend/testModel/handleTestRequest.js';
import runOverviewOperation from '../src/frontend/runOverviewOperation.js';

test('基础测试', { timeout: 15_000 }, async (context) => {
  const trashDirectory = fileURLToPath(new URL('../.docs/trashcan/', import.meta.url));
  await mkdir(trashDirectory, { recursive: true });
  const dataDirectory = await mkdtemp(join(trashDirectory, 'basic-test-'));
  const portProbe = createServer();
  await listenGatewayServer(portProbe, '127.0.0.1', 0);
  const environment = {
    PORT: String(portProbe.address().port),
    GATEWAY_API_KEY: 'basic-test-key',
    UPSTREAM_SERVICE_NAME: 'basic',
  };
  await new Promise((resolve) => portProbe.close(resolve));
  const consumer = { id: 'basic', available: false };
  const backupConsumer = { id: 'backup', available: false };
  let queueReady = Promise.withResolvers();
  const attempts = [];
  const executions = [];
  const serviceOperations = [];
  let nextQueued = null;
  let executionObserved;
  let executionRelease;
  let cancellationObserved;
  let safeFinishObserved;
  const logLines = [];
  const diagnosticLines = [];
  const serviceInputs = [];
  let notifyConsumersChanged = null;
  const diagnosticReady = Promise.withResolvers();
  let outputError = null;
  let finishDiagnostic;
  const logOutput = createLogOutput(
    new Writable({
      write(chunk, _encoding, callback) {
        if (outputError) {
          setImmediate(() => callback(outputError));
        } else {
          const line = chunk.toString();
          logLines.push(line);
          if (line.includes('[request.queued]')) nextQueued?.resolve();
          if (line.includes('[request.terminated]')) cancellationObserved?.resolve();
          if (line.includes('[execution.safefinished]')) safeFinishObserved?.resolve();
          if (line.includes('[request.queued]') && requestQueue.entries.length === 2) {
            queueReady.resolve();
          }
          callback();
        }
      },
    }),
    new Writable({
      write(chunk, _encoding, callback) {
        diagnosticLines.push(chunk.toString());
        finishDiagnostic = callback;
        diagnosticReady.resolve();
      },
    })
  );
  const gateway = await startGateway({
    environment,
    dataDirectory,
    logOutput,
    createService: async (dependencies) => {
      serviceInputs.push(dependencies);
      await Promise.resolve();
      return {
        additionalModels: [],
        consumers: [consumer, backupConsumer],
        execute: async (operations) => {
          const {
            uid,
            attempt,
            consumer: activeConsumer,
            request,
            shutdownSignal,
            startUpstreamCallTracking,
            recordUpstreamData,
            finishUpstreamCallTracking,
            deliverStreamEvent,
          } = operations;
          const content = request.body.messages[0].content;
          attempts.push({ uid, attempt });
          executions.push(activeConsumer.currentExecution);
          serviceOperations.push(operations);
          if (content.startsWith('取消后')) {
            executionObserved.resolve({ uid, shutdownSignal });
            await executionRelease.promise;
            await deliverStreamEvent({ data: { text: '应丢弃的响应' } });
            if (content === '取消后失败') throw new Error('服务执行失败');
            if (content === '取消后重排') {
              return {
                outcome: 'failed',
                reason: '资源不可用',
                retryRequested: true,
                response: { error: createGatewayError('资源不可用', { statusCode: 503 }) },
              };
            }
          }
          if (content === '上游拒绝') {
            return {
              outcome: 'failed',
              reason: '上游密钥不正确',
              response: {
                error: createGatewayError('上游密钥不正确', {
                  statusCode: request.body.upstreamStatusCode ?? 403,
                  code: request.body.upstreamErrorCode ?? 'invalid_api_key',
                }),
              },
            };
          }
          if (content === '意外抛错') throw new Error('服务内部错误');
          if (content === '未知响应') {
            return {
              outcome: 'unknown',
              upstreamResponse: { code: 409, status: 'Unrecognized Result' },
              response: { statusCode: 409, body: { message: '原始未知响应' } },
            };
          }
          if (
            (content === '重排' && attempt === 1) ||
            ['重试超限', '消费者仍可用', '流式后重试'].includes(content)
          ) {
            if (content === '流式后重试') await deliverStreamEvent({ data: { text: '已发送' } });
            if (content !== '消费者仍可用') {
              activeConsumer.available = false;
              backupConsumer.available = true;
            }
            return {
              outcome: 'failed',
              reason: '资源不可用',
              retryRequested: true,
              response: { error: createGatewayError('资源不可用', { statusCode: 503 }) },
            };
          }
          if (['空闲超时', '整体超时', '同步计时回调异常', '异步计时回调异常'].includes(content)) {
            const timeout = Promise.withResolvers();
            const call = startUpstreamCallTracking({
              onTimeout(kind) {
                if (content.includes('计时回调异常')) {
                  finishUpstreamCallTracking(call);
                  if (content.startsWith('同步')) throw new Error('计时通知失败');
                  return Promise.reject(new Error('计时通知失败'));
                }
                timeout.resolve(kind);
              },
              onError: timeout.reject,
            });
            recordUpstreamData(call);
            try {
              const kind = await timeout.promise;
              return {
                outcome: 'failed',
                reason: kind,
                response: {
                  error: createGatewayError(kind, { statusCode: 504, code: kind + '_timeout' }),
                },
              };
            } finally {
              finishUpstreamCallTracking(call);
            }
          }
          if (content === '调用计时') {
            const callbacks = {
              onTimeout: () => {},
              onError: (error) => {
                throw error;
              },
            };
            const first = startUpstreamCallTracking(callbacks);
            const initialIdle = first.idleTimer;
            const initialTotal = first.totalTimer;
            recordUpstreamData(first);
            assert.notEqual(first.idleTimer, initialIdle);
            assert.equal(first.totalTimer, initialTotal);
            const firstDataAt = activeConsumer.currentExecution.firstUpstreamDataAt;
            finishUpstreamCallTracking(first);
            recordUpstreamData(first);
            assert.equal(first.idleTimer, null);
            const second = startUpstreamCallTracking(callbacks);
            assert.notEqual(second.totalTimer, initialTotal);
            recordUpstreamData(second);
            assert.equal(activeConsumer.currentExecution.firstUpstreamDataAt, firstDataAt);
            finishUpstreamCallTracking(second);
            assert.equal(activeConsumer.currentExecution.activeUpstreamCalls.size, 0);
          }
          return { outcome: 'succeeded', response: { body: { requestId: uid, content } } };
        },
        setConsumersChangedHandler(handler) {
          notifyConsumersChanged = handler;
          handler();
        },
      };
    },
  });
  const {
    httpServer: server,
    scheduler,
    configuration,
    requestQueue,
    statistics,
    lifecycle,
  } = gateway;
  context.after(async () => {
    server.closeAllConnections();
    if (server.listening) await new Promise((resolve) => server.close(resolve));
  });
  assert.equal(serviceInputs.length, 1);
  assert.equal(serviceInputs[0].configuration, configuration);
  assert.equal(serviceInputs[0].shutdownSignal, lifecycle.shutdownController.signal);
  assert.equal(scheduler.requestQueue, requestQueue);
  assert.equal(scheduler.consumers, gateway.service.consumers);
  assert.equal(scheduler.statistics, statistics);
  assert.equal(scheduler.lifecycle, lifecycle);
  assert.equal(requestQueue.capacity, 32);
  assert.equal(requestQueue.entries.length, 0);
  assert.equal(lifecycle.isStopping, false);
  assert.equal(lifecycle.ownsLogOutput, false);
  assert.equal(lifecycle.pendingTestRecords.size, 0);
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const sendRequest = (path, body, headers = {}) =>
    fetch(baseUrl + path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: 'Bearer basic-test-key',
        ...headers,
      },
      body: typeof body === 'string' ? body : JSON.stringify(body),
      signal: context.signal,
    });
  const testBody = {
    model: 'basic-test',
    messages: [{ role: 'user', content: '你好' }],
    max_tokens: 16,
  };

  const home = await sendRequest('/', undefined, { authorization: '' });
  assert.equal(home.status, 200);
  const homePage = await home.text();
  assert.match(homePage, /id="overview-heading"/);
  assert.match(homePage, /id="model-list"/);
  assert.match(homePage, /type="module" src="\/assets\/main.js"/);
  for (const [asset, contentType] of [
    ['main.js', 'text/javascript'],
    ['styles.css', 'text/css'],
  ]) {
    const response = await fetch(baseUrl + '/assets/' + asset, { signal: context.signal });
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), new RegExp(contentType));
    assert.notEqual(await response.text(), '');
  }
  if (process.platform === 'win32') {
    const uppercaseAsset = await fetch(baseUrl + '/assets/main.JS', { signal: context.signal });
    assert.equal(uppercaseAsset.status, 200);
    assert.match(uppercaseAsset.headers.get('content-type'), /text\/javascript/);
    await uppercaseAsset.text();
  }
  const emptyOverview = await fetch(baseUrl + '/api/overview', { signal: context.signal });
  assert.deepEqual((await emptyOverview.json()).metrics, {
    averageUpstreamLatencyMs: null,
    averageExecutionDurationMs: null,
    successRate: null,
  });
  const health = await sendRequest('/health', undefined, { authorization: '' });
  assert.deepEqual(await health.json(), { status: 'ok' });
  for (const [path, method, status, allowedMethod] of [
    ['/missing', 'GET', 404, null],
    ['/api/missing', 'GET', 404, null],
    ['/assets/missing.js', 'GET', 404, null],
    ['/assets/invalid.txt', 'GET', 404, null],
    ['/health', 'POST', 405, 'GET'],
    ['/v1/chat/completions', 'GET', 405, 'POST'],
    ['/v1/messages', 'GET', 405, 'POST'],
    ['/api/overview', 'POST', 405, 'GET'],
    ['/api/statistics/successRate/reset', 'GET', 405, 'POST'],
    ['/assets/main.js', 'POST', 405, 'GET'],
  ]) {
    const response = await fetch(baseUrl + path, { method, signal: context.signal });
    const body = await response.json();
    const uid = response.headers.get('x-request-id');
    const missingResource = status === 404;
    assert.equal(response.status, status);
    assert.equal(response.statusText, missingResource ? 'Not Found' : 'Method Not Allowed');
    assert.equal(response.headers.get('allow'), allowedMethod);
    assert.equal(
      body.error.message,
      missingResource ? 'Resource Not Found' : 'Invalid Request Method'
    );
    assert.equal(body.error.code, missingResource ? 'not_found' : 'method_not_allowed');
    assert.equal(body.error.type, missingResource ? 'not_found_error' : 'invalid_request_error');
    assert.ok(uid);
    if (path === '/v1/messages') {
      assert.equal(body.type, 'error');
      assert.equal(body.request_id, uid);
    } else {
      assert.equal(body.error.param, null);
    }
    const rejectionLogs = logLines.filter(
      (line) => line.includes('[request.rejected]') && line.includes(uid)
    );
    assert.equal(rejectionLogs.length, 1);
    assert.ok(rejectionLogs[0].includes(body.error.message));
  }
  assert.equal(attempts.length, 0);
  assert.equal(requestQueue.entries.length, 0);
  for (const headers of [{}, { 'anthropic-version': '2023-06-01' }]) {
    const response = await sendRequest('/v1/models', undefined, headers);
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.deepEqual(
      body.data.map((model) => model.id),
      ['basic-default', 'basic-test']
    );
    if (headers['anthropic-version']) assert.equal(body.has_more, false);
    else assert.equal(body.object, 'list');
  }

  const originalBodies = [];
  for (const path of ['/v1/chat/completions', '/v1/messages']) {
    const anthropic = path === '/v1/messages';
    for (const stream of [false, true]) {
      const originalBody = JSON.stringify({ ...testBody, stream }, null, 2) + '\n';
      originalBodies.push(Buffer.from(originalBody).toString('base64'));
      const response = await sendRequest(path + '?source=basic', originalBody, {
        'x-test-header': 'caf\u00e9',
        ...(anthropic ? { authorization: '', 'x-api-key': 'basic-test-key' } : {}),
      });
      assert.equal(response.status, 200);
      assert.ok(response.headers.get('x-request-id'));
      if (!stream) {
        const body = await response.json();
        assert.equal(anthropic ? body.content[0].text : body.choices[0].message.content, 'OK');
        continue;
      }
      assert.match(response.headers.get('content-type'), /^text\/event-stream/);
      const events = (await response.text())
        .split('\n')
        .filter((line) => line.startsWith('data: '))
        .map((line) => line.slice(6))
        .map((data) => (data === '[DONE]' ? data : JSON.parse(data)));
      const text = events
        .map((event) =>
          anthropic ? event.delta?.text || '' : event.choices?.[0].delta?.content || ''
        )
        .join('');
      assert.equal(text, 'OK');
      assert.equal(
        anthropic ? events.at(-1).type : events.at(-1),
        anthropic ? 'message_stop' : '[DONE]'
      );
    }
  }
  assert.equal(attempts.length, 0);
  await Promise.all([...lifecycle.pendingTestRecords]);
  const historyDirectory = join(dataDirectory, 'test_history');
  const filenames = await readdir(historyDirectory);
  assert.equal(filenames.length, 4);
  const recordedBodies = [];
  for (const filename of filenames) {
    const record = await readFile(join(historyDirectory, filename));
    const separator = record.indexOf('\r\n\r\n');
    assert.notEqual(separator, -1);
    assert.ok(record.subarray(0, separator).includes(Buffer.from('caf\u00e9', 'latin1')));
    recordedBodies.push(record.subarray(separator + 4).toString('base64'));
  }
  assert.deepEqual(recordedBodies.sort(), originalBodies.sort());

  const saveFailureServer = createGatewayServer(
    handleRequest.bind(null, {
      configuration,
      modelCatalog: gateway.modelCatalog,
      dataDirectory: join(historyDirectory, filenames[0]),
      lifecycle,
      requestQueue,
      log: gateway.log,
    })
  );
  context.after(async () => {
    saveFailureServer.closeAllConnections();
    if (saveFailureServer.listening) {
      await new Promise((resolve) => saveFailureServer.close(resolve));
    }
  });
  const listeningListeners = saveFailureServer.listeners('listening');
  const errorListeners = saveFailureServer.listeners('error');
  await listenGatewayServer(saveFailureServer, '127.0.0.1', 0);
  assert.deepEqual(saveFailureServer.listeners('listening'), listeningListeners);
  assert.deepEqual(saveFailureServer.listeners('error'), errorListeners);
  const saveFailureResponse = await fetch(
    `http://127.0.0.1:${saveFailureServer.address().port}/v1/chat/completions`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer basic-test-key' },
      body: JSON.stringify(testBody),
      signal: context.signal,
    }
  );
  assert.equal(saveFailureResponse.status, 200);
  assert.equal((await saveFailureResponse.json()).choices[0].message.content, 'OK');
  await Promise.all([...lifecycle.pendingTestRecords]);
  assert.ok(logLines.some((line) => line.includes('[test.save_failed]')));

  const unauthorized = await sendRequest('/v1/models', undefined, { authorization: '' });
  assert.equal(unauthorized.status, 403);
  assert.equal((await unauthorized.json()).error.message, 'Invalid API Key');
  assert.equal(
    logLines.filter(
      (line) =>
        line.includes('[request.rejected]') &&
        line.includes(unauthorized.headers.get('x-request-id'))
    ).length,
    1
  );
  for (const path of ['/v1/chat/completions', '/v1/messages']) {
    for (const body of [
      '{',
      '[]',
      'null',
      '{}',
      { model: 3 },
      { model: ' ' },
      { ...testBody, stream: 'false' },
    ]) {
      const rejectedBefore = logLines.filter((line) => line.includes('[request.rejected]')).length;
      const response = await sendRequest(path, body);
      assert.equal(response.status, 400);
      assert.equal((await response.json()).error.message, 'Invalid Request Body');
      assert.equal(
        logLines.filter((line) => line.includes('[request.rejected]')).length,
        rejectedBefore + 1
      );
    }
    const unknownModel = await sendRequest(path, { model: 'missing' });
    assert.equal(unknownModel.status, 404);
    assert.equal((await unknownModel.json()).error.message, 'Invalid Model ID');
    assert.equal(
      logLines.filter(
        (line) =>
          line.includes('[request.rejected]') &&
          line.includes(unknownModel.headers.get('x-request-id'))
      ).length,
      1
    );
    const minimal = await sendRequest(path, { model: 'basic-test' });
    assert.equal(minimal.status, 200);
    await minimal.json();
  }
  const flexible = await sendRequest('/v1/chat/completions', {
    model: 'basic-test',
    stream: null,
    messages: { serviceSpecific: true },
    temperature: 9,
  });
  assert.equal(flexible.status, 200);
  assert.equal((await flexible.json()).choices[0].message.content, 'OK');
  configuration.apiKey = '';
  for (const authorization of ['', 'Bearer anything']) {
    const publicModels = await sendRequest('/v1/models', undefined, { authorization });
    assert.equal(publicModels.status, 200);
    await publicModels.json();
  }
  configuration.apiKey = environment.GATEWAY_API_KEY;

  const first = sendRequest('/v1/chat/completions', { ...testBody, model: 'basic-default' });
  const second = sendRequest('/v1/chat/completions', {
    ...testBody,
    model: 'basic-default',
    messages: [{ role: 'user', content: '第二条' }],
  });
  await queueReady.promise;
  assert.equal(attempts.length, 0);
  const queuedRequestIds = requestQueue.entries.map((entry) => entry.requestContext.uid);
  consumer.available = true;
  notifyConsumersChanged();
  const responses = await Promise.all([first, second]);
  const answers = await Promise.all(responses.map((response) => response.json()));
  assert.deepEqual(
    answers.map((answer) => answer.content),
    ['你好', '第二条']
  );
  assert.deepEqual(
    answers.map((answer) => answer.requestId),
    responses.map((response) => response.headers.get('x-request-id'))
  );
  assert.deepEqual(
    attempts.map((execution) => execution.uid),
    queuedRequestIds
  );
  assert.equal(new Set(answers.map((answer) => answer.requestId)).size, 2);
  assert.equal(consumer.currentExecution, null);
  consumer.available = false;
  configuration.retryTimes = 1;
  queueReady = Promise.withResolvers();
  nextQueued = Promise.withResolvers();
  const requeued = sendRequest('/v1/chat/completions', {
    ...testBody,
    model: 'basic-default',
    messages: [{ role: 'user', content: '重排' }],
  });
  await nextQueued.promise;
  const afterRetry = sendRequest('/v1/chat/completions', {
    ...testBody,
    model: 'basic-default',
    messages: [{ role: 'user', content: '重试后下一条' }],
  });
  await queueReady.promise;
  const originalRetryEntry = requestQueue.entries[0];
  consumer.available = true;
  notifyConsumersChanged();
  const requeuedBody = await (await requeued).json();
  const afterRetryBody = await (await afterRetry).json();
  assert.deepEqual(attempts.slice(-3), [
    { uid: requeuedBody.requestId, attempt: 1 },
    { uid: requeuedBody.requestId, attempt: 2 },
    { uid: afterRetryBody.requestId, attempt: 1 },
  ]);
  assert.equal(executions.at(-3).queueEntry, originalRetryEntry);
  assert.equal(executions.at(-2).queueEntry, originalRetryEntry);
  assert.equal(originalRetryEntry.executionCount, 2);
  await serviceOperations.at(-3).deliverStreamEvent({ data: { late: true } });
  assert.equal(isExecutionActive(executions.at(-3)), false);
  const countBeforeRepeatedFinish = Object.values(statistics.resultsByDate).reduce(
    (sum, day) => sum + day.total,
    0
  );
  finishExecution(scheduler, executions.at(-3), { outcome: 'succeeded' });
  assert.equal(
    Object.values(statistics.resultsByDate).reduce((sum, day) => sum + day.total, 0),
    countBeforeRepeatedFinish
  );

  configuration.retryTimes = 0;
  consumer.available = true;
  backupConsumer.available = false;
  const retryLimitResponse = await sendRequest('/v1/chat/completions', {
    ...testBody,
    model: 'basic-default',
    messages: [{ role: 'user', content: '重试超限' }],
  });
  const terminatedRequestIds = [retryLimitResponse.headers.get('x-request-id')];
  assert.equal(retryLimitResponse.status, 429);
  assert.equal((await retryLimitResponse.json()).error.message, 'Retry Limit Exceeded');
  assert.equal(attempts.at(-1).attempt, 1);
  assert.equal(requestQueue.entries.length, 0);
  for (const content of ['消费者仍可用', '流式后重试']) {
    consumer.available = true;
    backupConsumer.available = false;
    configuration.retryTimes = 1;
    const attemptsBefore = attempts.length;
    const response = await sendRequest('/v1/chat/completions', {
      ...testBody,
      model: 'basic-default',
      messages: [{ role: 'user', content }],
    });
    assert.equal(response.status, content === '流式后重试' ? 200 : 503);
    assert.match(await response.text(), /资源不可用/);
    assert.equal(attempts.length, attemptsBefore + 1);
  }
  configuration.retryTimes = 0;
  backupConsumer.available = false;

  consumer.available = false;
  configuration.totalTimeoutMs = 20;
  nextQueued = Promise.withResolvers();
  const waitingRequest = sendRequest('/v1/chat/completions', {
    ...testBody,
    model: 'basic-default',
  });
  await nextQueued.promise;
  await delay(60, undefined, { signal: context.signal });
  assert.equal(requestQueue.entries.length, 1);
  consumer.available = true;
  notifyConsumersChanged();
  const waitingResponse = await waitingRequest;
  assert.equal(waitingResponse.status, 200);
  assert.equal((await waitingResponse.json()).content, '你好');

  for (const content of ['空闲超时', '整体超时', '同步计时回调异常', '异步计时回调异常']) {
    configuration.idleTimeoutMs = content === '整体超时' ? 100 : 20;
    configuration.totalTimeoutMs = content === '整体超时' ? 20 : 100;
    const response = await sendRequest('/v1/chat/completions', {
      ...testBody,
      model: 'basic-default',
      messages: [{ role: 'user', content }],
    });
    assert.equal(response.status, content.includes('计时回调异常') ? 500 : 504);
    const error = (await response.json()).error;
    assert.equal(
      error.code,
      content.includes('计时回调异常')
        ? 'internal_execution_error'
        : content === '整体超时'
          ? 'total_timeout'
          : 'idle_timeout'
    );
    assert.equal(consumer.currentExecution, null);
    assert.equal(executions.at(-1).activeUpstreamCalls.size, 0);
  }
  configuration.totalTimeoutMs = 5_000;
  const tracked = await sendRequest('/v1/chat/completions', {
    ...testBody,
    model: 'basic-default',
    messages: [{ role: 'user', content: '调用计时' }],
  });
  assert.equal(tracked.status, 200);
  await tracked.json();

  configuration.idleTimeoutMs = 5_000;
  for (const content of ['取消后成功', '取消后失败', '取消后重排']) {
    executionObserved = Promise.withResolvers();
    executionRelease = Promise.withResolvers();
    cancellationObserved = Promise.withResolvers();
    safeFinishObserved = Promise.withResolvers();
    const cancellation = new AbortController();
    const attemptsBefore = attempts.length;
    const cancelledResponse = fetch(baseUrl + '/v1/chat/completions', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer basic-test-key' },
      body: JSON.stringify({
        ...testBody,
        model: 'basic-default',
        messages: [{ role: 'user', content }],
      }),
      signal: AbortSignal.any([context.signal, cancellation.signal]),
    });
    const cancelledResult = assert.rejects(cancelledResponse, { name: 'AbortError' });
    const execution = await executionObserved.promise;
    assert.equal(requestQueue.entries.length, 1);
    assert.equal(requestQueue.entries[0].lockedExecution, consumer.currentExecution);
    assert.ok(consumer.currentExecution.completion instanceof Promise);
    if (content === '取消后成功') {
      requestQueue.capacity = 1;
      const overflow = await sendRequest('/v1/chat/completions', {
        ...testBody,
        model: 'basic-default',
      });
      assert.equal(overflow.status, 429);
      assert.equal((await overflow.json()).error.message, 'Out of Request Queue Capacity');
      const localTest = await sendRequest('/v1/messages', { model: 'basic-test' });
      assert.equal(localTest.status, 200);
      await localTest.json();
      requestQueue.capacity = 32;
    }
    terminatedRequestIds.push(execution.uid);
    cancellation.abort();
    await cancelledResult;
    await cancellationObserved.promise;
    assert.ok(consumer.currentExecution);
    assert.equal(execution.shutdownSignal.aborted, false);
    assert.equal(requestQueue.entries.length, 0);
    executionRelease.resolve();
    await safeFinishObserved.promise;
    assert.equal(consumer.currentExecution, null);
    assert.equal(attempts.length, attemptsBefore + 1);
    assert.equal(requestQueue.entries.length, 0);
    assert.equal(
      logLines.filter(
        (line) => line.includes('[execution.safefinished]') && line.includes(execution.uid)
      ).length,
      1
    );
  }

  for (const [statusCode, errorCode] of [
    [403, 'invalid_api_key'],
    [404, 'not_found'],
    [405, 'method_not_allowed'],
  ]) {
    const rejectedBeforeUpstream = logLines.filter((line) =>
      line.includes('[request.rejected]')
    ).length;
    const upstreamRejection = await sendRequest('/v1/chat/completions', {
      ...testBody,
      model: 'basic-default',
      messages: [{ role: 'user', content: '上游拒绝' }],
      upstreamStatusCode: statusCode,
      upstreamErrorCode: errorCode,
    });
    assert.equal(upstreamRejection.status, statusCode);
    const upstreamError = (await upstreamRejection.json()).error;
    assert.equal(upstreamError.code, errorCode);
    assert.equal(upstreamError.message, '上游密钥不正确');
    assert.equal(
      logLines.filter((line) => line.includes('[request.rejected]')).length,
      rejectedBeforeUpstream
    );
  }

  for (const [content, status] of [
    ['未知响应', 409],
    ['意外抛错', 500],
  ]) {
    const response = await sendRequest('/v1/chat/completions', {
      ...testBody,
      model: 'basic-default',
      messages: [{ role: 'user', content }],
    });
    assert.equal(response.status, status);
    const body = await response.json();
    assert.equal(
      content === '未知响应' ? body.message : body.error.message,
      content === '未知响应' ? '原始未知响应' : 'Internal Execution Error'
    );
  }
  const resultDays = Object.values(statistics.resultsByDate);
  assert.equal(
    resultDays.reduce((sum, day) => sum + day.total, 0),
    attempts.length
  );
  assert.equal(
    resultDays.reduce((sum, day) => sum + day.unknown, 0),
    1
  );
  const endingEvents = /\[execution\.(?:completed|failed|unkownresult|safefinished)\]/;
  assert.equal(logLines.filter((line) => endingEvents.test(line)).length, attempts.length);

  const consoleModels = await fetch(baseUrl + '/api/models', { signal: context.signal });
  assert.equal(consoleModels.status, 200);
  assert.deepEqual((await consoleModels.json()).models, gateway.modelCatalog);
  const savedStatistics = structuredClone(statistics);
  const statisticsDate = new Date();
  const today = statisticsDate.toISOString().slice(0, 10);
  const sampleStatistics = createStatistics(statisticsDate);
  const days = Object.keys(sampleStatistics.resultsByDate);
  sampleStatistics.resultsByDate[days[0]] = { total: 8, succeeded: 5, failed: 2, unknown: 1 };
  sampleStatistics.resultsByDate[days[1]] = { total: 4, succeeded: 1, failed: 2, unknown: 1 };
  sampleStatistics.latencyByDate[days[0]] = { totalMs: 1000, sampleCount: 10 };
  sampleStatistics.latencyByDate[days[1]] = { totalMs: 900, sampleCount: 1 };
  sampleStatistics.durationByDate[days[0]] = { totalMs: 6000, sampleCount: 12 };
  assert.deepEqual(summarizeStatistics(sampleStatistics), {
    averageUpstreamLatencyMs: 1900 / 11,
    averageExecutionDurationMs: 500,
    successRate: 0.5,
  });
  const currentQueue = {
    entries: [{ lockedExecution: null }, { lockedExecution: {} }],
    capacity: 32,
  };
  const capacityOverview = createOverview(
    'basic',
    currentQueue,
    [{ available: true }, { available: true, currentExecution: {} }, { available: false }],
    summarizeStatistics(sampleStatistics)
  );
  assert.deepEqual(capacityOverview.queue, { length: 2, capacity: 32 });
  assert.deepEqual(capacityOverview.consumers, { idleAvailable: 1, available: 2 });
  const queueEntries = requestQueue.entries;
  const activeExecution = consumer.currentExecution;
  for (const [metric, field, value, label] of [
    ['upstreamLatency', 'latencyByDate', 'averageUpstreamLatencyMs', '上游平均延迟'],
    ['executionDuration', 'durationByDate', 'averageExecutionDurationMs', '请求平均耗时'],
    ['successRate', 'resultsByDate', 'successRate', '请求成功率'],
  ]) {
    Object.assign(statistics, structuredClone(sampleStatistics));
    const resetLogCount = logLines.filter((line) => line.includes('[stats.reset]')).length;
    const response = await fetch(baseUrl + '/api/statistics/' + metric + '/reset', {
      method: 'POST',
      signal: context.signal,
    });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal((await response.json()).metrics[value], null);
    assert.deepEqual(statistics[field], createStatistics(statisticsDate)[field]);
    for (const otherField of Object.keys(statistics).filter((key) => key !== field)) {
      assert.deepEqual(statistics[otherField], sampleStatistics[otherField]);
    }
    assert.equal(requestQueue.entries, queueEntries);
    assert.equal(consumer.currentExecution, activeExecution);
    const resetLogs = logLines.filter((line) => line.includes('[stats.reset]'));
    assert.equal(resetLogs.length, resetLogCount + 1);
    assert.match(resetLogs.at(-1), new RegExp(label + '已重置'));
  }
  statistics.resultsByDate['1900-01-01'] = { total: 50, succeeded: 50, failed: 0, unknown: 0 };
  const overviewResponse = await fetch(baseUrl + '/api/overview', { signal: context.signal });
  assert.equal(overviewResponse.status, 200);
  assert.equal((await overviewResponse.json()).serviceName, 'basic');
  assert.equal(Object.hasOwn(statistics.resultsByDate, '1900-01-01'), false);
  const beforeInvalidReset = structuredClone(statistics);
  const invalidReset = await fetch(baseUrl + '/api/statistics/invalid/reset', {
    method: 'POST',
    signal: context.signal,
  });
  assert.equal(invalidReset.status, 404);
  const invalidResetError = (await invalidReset.json()).error;
  assert.equal(invalidResetError.message, 'Resource Not Found');
  assert.equal(invalidResetError.code, 'not_found');
  assert.equal(
    logLines.filter(
      (line) =>
        line.includes('[request.rejected]') &&
        line.includes(invalidReset.headers.get('x-request-id'))
    ).length,
    1
  );
  assert.deepEqual(statistics, beforeInvalidReset);
  Object.assign(statistics, savedStatistics);

  const inProgressStatistics = createStatistics(statisticsDate);
  const endedAt = statisticsDate.getTime();
  resetStatisticsMetric(inProgressStatistics, 'upstreamLatency', statisticsDate);
  recordExecutionStatistics(inProgressStatistics, {
    startedAt: endedAt - 500,
    firstUpstreamDataAt: endedAt - 400,
    endedAt,
    outcome: 'failed',
  });
  assert.deepEqual(inProgressStatistics.latencyByDate[today], { totalMs: 100, sampleCount: 1 });
  const emptyStatistics = createStatistics(statisticsDate);
  assert.deepEqual(summarizeStatistics(emptyStatistics), {
    averageUpstreamLatencyMs: null,
    averageExecutionDurationMs: null,
    successRate: null,
  });
  recordExecutionStatistics(emptyStatistics, {
    startedAt: endedAt,
    firstUpstreamDataAt: endedAt,
    endedAt,
    outcome: 'succeeded',
  });
  assert.deepEqual(summarizeStatistics(emptyStatistics), {
    averageUpstreamLatencyMs: 0,
    averageExecutionDurationMs: 0,
    successRate: 1,
  });
  resetStatisticsMetric(emptyStatistics, 'successRate', new Date(endedAt + 4 * 86400000));
  assert.equal(Object.hasOwn(emptyStatistics.resultsByDate, today), false);
  assert.equal(summarizeStatistics(emptyStatistics).averageUpstreamLatencyMs, null);

  const overviewState = { overviewOperation: null };
  const overviewGate = Promise.withResolvers();
  const overviewOrder = [];
  const readOverview = runOverviewOperation(overviewState, async () => {
    await overviewGate.promise;
    overviewOrder.push('read');
  });
  const resetOverview = runOverviewOperation(overviewState, () => overviewOrder.push('reset'));
  overviewGate.resolve();
  await Promise.all([readOverview, resetOverview]);
  assert.deepEqual(overviewOrder, ['read', 'reset']);
  await assert.rejects(
    runOverviewOperation(overviewState, () => {
      throw new Error('读取失败');
    })
  );
  await runOverviewOperation(overviewState, () => overviewOrder.push('recovered'));
  assert.equal(overviewOrder.at(-1), 'recovered');
  assert.equal(overviewState.overviewOperation, null);

  assert.equal(logOutput.firstError, null);
  assert.match(logLines[0], /^\[\d{4}-\d{2}-\d{2}T[^\]]+Z\] \[INFO\] \[gateway.started\] /);
  const terminated = logLines.filter((line) => line.includes('[request.terminated]'));
  assert.equal(terminated.length, terminatedRequestIds.length);
  for (const uid of terminatedRequestIds) {
    assert.equal(terminated.filter((line) => line.includes(uid)).length, 1);
  }
  assert.equal(
    formatLogLine(
      'request.queued',
      { uid: 'id\r\nnext', protocol: 'openai', model: 'basic-default' },
      new Date('2026-11-03T00:00:00.000Z')
    ),
    '[2026-11-03T00:00:00.000Z] [INFO] [request.queued] 新请求id\\r\\nnext：openai|basic-default\n'
  );

  await Promise.all([...lifecycle.pendingTestRecords]);
  const responseWriteStarted = Promise.withResolvers();
  let finishLocalResponse;
  const localResponse = new Writable({
    write(_chunk, _encoding, callback) {
      assert.equal(lifecycle.pendingTestRecords.size, 1);
      finishLocalResponse = callback;
      responseWriteStarted.resolve();
    },
  });
  localResponse.writeHead = () => {};
  const localContext = createRequestContext(
    {
      method: 'POST',
      url: '/v1/messages',
      httpVersion: '1.1',
      rawHeaders: [],
    },
    localResponse
  );
  localContext.protocol = 'anthropic';
  localContext.parsedBody = { model: 'basic-test' };
  const localSnapshot = createTestRequestSnapshot(
    localContext,
    Buffer.from('{"model":"basic-test"}')
  );
  const localRecordsDirectory = join(dataDirectory, 'local-response-order');
  const localResponseCompleted = handleTestRequest(
    {
      lifecycle,
      log: gateway.log,
      dataDirectory: localRecordsDirectory,
    },
    localContext,
    localSnapshot
  );
  await responseWriteStarted.promise;
  await assert.rejects(readdir(localRecordsDirectory), { code: 'ENOENT' });
  finishLocalResponse();
  await localResponseCompleted;
  await Promise.all([...lifecycle.pendingTestRecords]);
  assert.equal((await readdir(join(localRecordsDirectory, 'test_history'))).length, 1);

  const disconnectedResponse = new Writable({
    write(_chunk, _encoding, callback) {
      callback();
    },
  });
  const disconnectedContext = createRequestContext(localContext.httpRequest, disconnectedResponse);
  disconnectedContext.parsedBody = { model: 'basic-test' };
  const disconnectedSnapshot = createTestRequestSnapshot(
    disconnectedContext,
    localSnapshot.rawBody
  );
  disconnectedContext.downstreamAbortController.abort(new Error('测试连接已断开'));
  disconnectedResponse.destroy();
  await assert.rejects(
    handleTestRequest(
      {
        lifecycle,
        log: gateway.log,
        dataDirectory: localRecordsDirectory,
      },
      disconnectedContext,
      disconnectedSnapshot
    ),
    /测试连接已断开/
  );
  await Promise.all([...lifecycle.pendingTestRecords]);
  assert.equal((await readdir(join(localRecordsDirectory, 'test_history'))).length, 2);
  assert.equal(lifecycle.pendingTestRecords.size, 0);

  const boundaryStatistics = createStatistics(new Date('2024-03-01T00:30:00+01:00'));
  assert.deepEqual(Object.keys(boundaryStatistics.resultsByDate), [
    '2024-02-29',
    '2024-02-28',
    '2024-02-27',
  ]);
  assert.deepEqual(boundaryStatistics.resultsByDate['2024-02-29'], {
    total: 0,
    succeeded: 0,
    failed: 0,
    unknown: 0,
  });
  assert.notEqual(
    boundaryStatistics.resultsByDate['2024-02-29'],
    boundaryStatistics.resultsByDate['2024-02-28']
  );
  assert.notEqual(
    boundaryStatistics.latencyByDate['2024-02-29'],
    boundaryStatistics.durationByDate['2024-02-29']
  );

  recordExecutionStatistics(boundaryStatistics, {
    startedAt: Date.parse('2024-02-29T23:59:59.000Z'),
    firstUpstreamDataAt: Date.parse('2024-02-29T23:59:59.500Z'),
    endedAt: Date.parse('2024-03-01T00:00:00.000Z'),
    outcome: 'failed',
  });
  assert.deepEqual(Object.keys(boundaryStatistics.resultsByDate).sort(), [
    '2024-02-28',
    '2024-02-29',
    '2024-03-01',
  ]);
  assert.equal(boundaryStatistics.resultsByDate['2024-03-01'].failed, 1);
  assert.deepEqual(boundaryStatistics.latencyByDate['2024-03-01'], {
    totalMs: 500,
    sampleCount: 1,
  });
  assert.deepEqual(boundaryStatistics.durationByDate['2024-03-01'], {
    totalMs: 1000,
    sampleCount: 1,
  });

  let cleanupCompleted = false;
  await assert.rejects(
    startGateway({
      environment,
      logOutput,
      createService: async () => ({
        additionalModels: [],
        consumers: [],
        async closeResources() {
          await new Promise((resolve) => setImmediate(resolve));
          cleanupCompleted = true;
        },
      }),
    }),
    { code: 'EADDRINUSE' }
  );
  assert.equal(cleanupCompleted, true);
  const cleanupError = new Error('资源清理失败');
  await assert.rejects(
    startGateway({
      environment,
      logOutput,
      createService: () => ({
        additionalModels: [{ id: 'basic-default' }],
        consumers: [],
        async closeResources() {
          throw cleanupError;
        },
      }),
    }),
    (error) => {
      assert.ok(error instanceof AggregateError);
      assert.match(error.errors[0].message, /模型 ID 重复/);
      assert.equal(error.errors[1], cleanupError);
      assert.equal(error.cause, error.errors[0]);
      return true;
    }
  );
  assert.equal(logLines.filter((line) => line.includes('[gateway.start_failed]')).length, 2);
  assert.ok(logOutput.output.listeners('error').includes(logOutput.onStreamError));
  assert.ok(logOutput.errorOutput.listeners('error').includes(logOutput.onStreamError));

  consumer.available = true;
  configuration.totalTimeoutMs = 5_000;
  outputError = new Error('输出不可用');
  const healthyResponse = await sendRequest('/v1/chat/completions', {
    ...testBody,
    model: 'basic-default',
  });
  assert.equal(healthyResponse.status, 200);
  assert.equal((await healthyResponse.json()).content, '你好');
  let writesFinished = false;
  const writesCompleted = waitForLogWrites(logOutput).then((error) => {
    writesFinished = true;
    return error;
  });
  await diagnosticReady.promise;
  assert.equal(writesFinished, false);
  assert.equal(diagnosticLines.length, 1);
  assert.match(diagnosticLines[0], /输出不可用/);
  finishDiagnostic();
  assert.equal(await writesCompleted, outputError);
  writeLog(logOutput, 'gateway.stopping');
  assert.equal(await waitForLogWrites(logOutput), outputError);
  assert.equal(diagnosticLines.length, 1);

  const synchronousError = new Error('同步写入失败');
  const synchronousOutput = new Writable({
    write(_chunk, _encoding, callback) {
      callback();
    },
  });
  synchronousOutput.write = () => {
    throw synchronousError;
  };
  let failedDiagnosticCount = 0;
  const failedOutput = createLogOutput(
    synchronousOutput,
    new Writable({
      write(_chunk, _encoding, callback) {
        failedDiagnosticCount += 1;
        callback(new Error('诊断也无法写出'));
      },
    })
  );
  assert.doesNotThrow(() => writeLog(failedOutput, 'gateway.stopping'));
  assert.doesNotThrow(() => writeLog(failedOutput, 'gateway.stopped'));
  assert.equal(await waitForLogWrites(failedOutput), synchronousError);
  assert.equal(failedDiagnosticCount, 1);

  const formatDiagnostics = [];
  const formatOutput = createLogOutput(
    new Writable({
      write(_chunk, _encoding, callback) {
        callback();
      },
    }),
    new Writable({
      write(chunk, _encoding, callback) {
        formatDiagnostics.push(chunk.toString());
        callback();
      },
    })
  );
  assert.doesNotThrow(() => writeLog(formatOutput, 'gateway.started', { address: '0.0.0.0' }));
  assert.match((await waitForLogWrites(formatOutput)).message, /缺少参数：port/);
  assert.doesNotThrow(() => writeLog(formatOutput, 'missing.event'));
  assert.equal(await waitForLogWrites(formatOutput), formatOutput.firstError);
  assert.equal(formatDiagnostics.length, 1);

  const shutdownPortProbe = createServer();
  await listenGatewayServer(shutdownPortProbe, '127.0.0.1', 0);
  const shutdownEnvironment = { ...environment, PORT: String(shutdownPortProbe.address().port) };
  await new Promise((resolve) => shutdownPortProbe.close(resolve));
  const shutdownConsumers = ['普通', '流式', '取消'].map((id) => ({ id, available: true }));
  const shutdownExecutionsReady = Promise.withResolvers();
  const shutdownQueueReady = Promise.withResolvers();
  const shutdownCancellation = Promise.withResolvers();
  const releaseShutdownExecutions = Promise.withResolvers();
  const releaseShutdownResources = Promise.withResolvers();
  const shutdownResourcesStarted = Promise.withResolvers();
  const shutdownRecordStarted = Promise.withResolvers();
  const shutdownLines = [];
  let shutdownStarts = 0;
  let shutdownQueued = 0;
  let shutdownResourceCalls = 0;
  let finishShutdownRecord;
  const shutdownLogOutput = createLogOutput(
    new Writable({
      write(chunk, _encoding, callback) {
        const line = chunk.toString();
        shutdownLines.push(line);
        if (line.includes('[request.queued]') && ++shutdownQueued === 5)
          shutdownQueueReady.resolve();
        if (line.includes('[request.terminated]') && line.includes('客户端已断开'))
          shutdownCancellation.resolve();
        callback();
      },
    })
  );
  const shutdownGateway = await startGateway({
    environment: shutdownEnvironment,
    dataDirectory: join(dataDirectory, 'shutdown'),
    logOutput: shutdownLogOutput,
    createService: ({ shutdownSignal, log }) => {
      shutdownSignal.addEventListener(
        'abort',
        () => {
          for (const item of shutdownConsumers) {
            item.available = false;
            log('consumer.unavailable', { consumerId: item.id, reason: '网关关闭' });
          }
        },
        { once: true }
      );
      return {
        additionalModels: [],
        consumers: shutdownConsumers,
        execute: async ({ request, deliverStreamEvent }) => {
          if (request.body.stream) {
            await deliverStreamEvent({
              event: 'content_block_delta',
              data: { delta: { text: '开始' } },
            });
          }
          if (++shutdownStarts === 3) shutdownExecutionsReady.resolve();
          await releaseShutdownExecutions.promise;
          return {
            outcome: 'succeeded',
            response: request.body.stream ? { streamed: true } : { body: { text: '完成' } },
          };
        },
        async closeResources() {
          shutdownResourceCalls += 1;
          shutdownResourcesStarted.resolve();
          await releaseShutdownResources.promise;
        },
      };
    },
  });
  context.after(async () => {
    releaseShutdownExecutions.resolve();
    releaseShutdownResources.resolve();
    finishShutdownRecord?.();
    shutdownGateway.httpServer.closeAllConnections();
    if (shutdownGateway.httpServer.listening)
      await new Promise((resolve) => shutdownGateway.httpServer.close(resolve));
  });
  const shutdownUrl = 'http://127.0.0.1:' + shutdownEnvironment.PORT;
  const shutdownRequest = (path, body, signal = context.signal) =>
    fetch(shutdownUrl + path, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer basic-test-key' },
      body: JSON.stringify(body),
      signal,
    });
  const closingNormal = shutdownRequest('/v1/chat/completions', {
    ...testBody,
    model: 'basic-default',
  });
  const closingStream = await shutdownRequest('/v1/messages', {
    ...testBody,
    model: 'basic-default',
    stream: true,
  });
  const cancelDuringExecution = new AbortController();
  const closingCancelled = assert.rejects(
    shutdownRequest(
      '/v1/chat/completions',
      { ...testBody, model: 'basic-default' },
      AbortSignal.any([context.signal, cancelDuringExecution.signal])
    ),
    { name: 'AbortError' }
  );
  await shutdownExecutionsReady.promise;
  cancelDuringExecution.abort();
  await closingCancelled;
  await shutdownCancellation.promise;
  assert.ok(shutdownConsumers.every((item) => item.currentExecution));

  const pipelinedSocket = createConnection({
    host: '127.0.0.1',
    port: Number(shutdownEnvironment.PORT),
  });
  context.after(() => pipelinedSocket.destroy());
  await once(pipelinedSocket, 'connect');
  let pipelinedResponse = '';
  pipelinedSocket.on('data', (chunk) => {
    pipelinedResponse += chunk.toString();
  });
  const pipelinedClosed = once(pipelinedSocket, 'close');
  const pipelinedBody = JSON.stringify({ ...testBody, model: 'basic-default' });
  const pipelinedRequest =
    'POST /v1/chat/completions HTTP/1.1\r\nHost: localhost\r\nAuthorization: Bearer basic-test-key\r\nContent-Type: application/json\r\nContent-Length: ' +
    Buffer.byteLength(pipelinedBody) +
    '\r\n\r\n' +
    pipelinedBody;
  pipelinedSocket.write(pipelinedRequest + pipelinedRequest);
  await shutdownQueueReady.promise;

  const incompleteSocket = createConnection({
    host: '127.0.0.1',
    port: Number(shutdownEnvironment.PORT),
  });
  context.after(() => incompleteSocket.destroy());
  await once(incompleteSocket, 'connect');
  const incompleteServerSocket = await new Promise((resolve) => {
    const onConnection = (socket) => {
      if (socket.remotePort !== incompleteSocket.localPort) return;
      shutdownGateway.httpServer.off('connection', onConnection);
      resolve(socket);
    };
    shutdownGateway.httpServer.on('connection', onConnection);
    for (const socket of shutdownGateway.httpServer.activeResponsesBySocket.keys())
      onConnection(socket);
  });
  await new Promise((resolve) =>
    incompleteSocket.write('GET /health HTTP/1.1\r\nHost: local', resolve)
  );
  assert.equal(
    shutdownGateway.httpServer.activeResponsesBySocket.get(incompleteServerSocket).size,
    0
  );
  const incompleteClosed = once(incompleteSocket, 'close');

  const bodyRequestArrived = once(shutdownGateway.httpServer, 'request');
  const incompleteBodySocket = createConnection({
    host: '127.0.0.1',
    port: Number(shutdownEnvironment.PORT),
  });
  context.after(() => incompleteBodySocket.destroy());
  await once(incompleteBodySocket, 'connect');
  let incompleteBodyResponse = '';
  incompleteBodySocket.on('data', (chunk) => {
    incompleteBodyResponse += chunk.toString();
  });
  const incompleteBodyClosed = once(incompleteBodySocket, 'close');
  incompleteBodySocket.write(
    'POST /v1/chat/completions HTTP/1.1\r\nHost: localhost\r\nAuthorization: Bearer basic-test-key\r\nContent-Length: 9999\r\n\r\n{'
  );
  await bodyRequestArrived;

  const shutdownRecordResponse = new Writable({
    write(_chunk, _encoding, callback) {
      finishShutdownRecord = callback;
      shutdownRecordStarted.resolve();
    },
  });
  shutdownRecordResponse.writeHead = () => {};
  const shutdownRecordContext = createRequestContext(
    {
      method: 'POST',
      url: '/v1/chat/completions',
      httpVersion: '1.1',
      rawHeaders: [],
    },
    shutdownRecordResponse
  );
  shutdownRecordContext.parsedBody = { model: 'basic-test' };
  const shutdownRecordSnapshot = createTestRequestSnapshot(
    shutdownRecordContext,
    Buffer.from('{"model":"basic-test"}')
  );
  const shutdownRecordResponseCompleted = handleTestRequest(
    {
      lifecycle: shutdownGateway.lifecycle,
      log: shutdownGateway.log,
      dataDirectory: join(dataDirectory, 'shutdown-record'),
    },
    shutdownRecordContext,
    shutdownRecordSnapshot
  );
  await shutdownRecordStarted.promise;
  assert.equal(shutdownGateway.lifecycle.pendingTestRecords.size, 1);

  let shutdownCompleted = false;
  const shutdownPromise = stopGateway(shutdownGateway);
  const observedShutdown = shutdownPromise.then(() => {
    shutdownCompleted = true;
  });
  assert.equal(stopGateway(shutdownGateway), shutdownPromise);
  assert.equal(shutdownGateway.lifecycle.isStopping, true);
  assert.equal(shutdownGateway.httpServer.listening, false);
  assert.ok(shutdownConsumers.every((item) => !item.available));
  await incompleteClosed;
  await incompleteBodyClosed;
  assert.match(incompleteBodyResponse, /503 Service Unavailable/);
  assert.equal(shutdownCompleted, false);
  assert.equal(shutdownGateway.requestQueue.entries.length, 4);
  assert.equal(
    shutdownGateway.requestQueue.entries.filter((entry) => entry.lockedExecution).length,
    2
  );
  assert.equal(shutdownResourceCalls, 0);

  releaseShutdownExecutions.resolve();
  await shutdownResourcesStarted.promise;
  const normalShutdownResponse = await closingNormal;
  assert.equal(normalShutdownResponse.status, 503);
  assert.equal((await normalShutdownResponse.json()).error.message, 'Gateway Is Stopping');
  assert.match(await closingStream.text(), /event: error[\s\S]*Gateway Is Stopping/);
  await pipelinedClosed;
  assert.equal((pipelinedResponse.match(/HTTP\/1.1 503/g) || []).length, 2);
  assert.equal((pipelinedResponse.match(/Gateway Is Stopping/g) || []).length, 2);
  assert.equal(shutdownGateway.requestQueue.entries.length, 0);
  assert.ok(shutdownConsumers.every((item) => item.currentExecution === null));
  assert.equal(shutdownCompleted, false);
  finishShutdownRecord();
  await shutdownRecordResponseCompleted;
  await Promise.all([...shutdownGateway.lifecycle.pendingTestRecords]);
  assert.equal((await readdir(join(dataDirectory, 'shutdown-record', 'test_history'))).length, 1);
  assert.equal(shutdownCompleted, false);
  releaseShutdownResources.resolve();
  await observedShutdown;
  assert.equal(stopGateway(shutdownGateway), shutdownPromise);
  assert.equal(shutdownResourceCalls, 1);
  assert.ok(shutdownLogOutput.output.listeners('error').includes(shutdownLogOutput.onStreamError));
  assert.equal(shutdownLines.filter((line) => line.includes('[gateway.stopping]')).length, 1);
  assert.equal(shutdownLines.filter((line) => line.includes('[gateway.stopped]')).length, 1);
  assert.equal(shutdownLines.filter((line) => line.includes('[gateway.stop_failed]')).length, 0);
  assert.equal(shutdownLines.filter((line) => line.includes('[execution.safefinished]')).length, 1);

  const failedExecutionCompletion = Promise.withResolvers();
  const remainingExecutionCompletion = Promise.withResolvers();
  const failedShutdownRecord = Promise.withResolvers();
  const failedShutdownLines = [];
  const failedShutdownOutput = createLogOutput(
    new Writable({
      write(chunk, _encoding, callback) {
        failedShutdownLines.push(chunk.toString());
        callback();
      },
    })
  );
  const failedExecution = { completion: failedExecutionCompletion.promise };
  const remainingExecution = { completion: remainingExecutionCompletion.promise };
  const failedConsumer = { id: '收尾失败', currentExecution: failedExecution };
  const remainingConsumer = { id: '仍在收尾', currentExecution: remainingExecution };
  failedExecution.consumer = failedConsumer;
  remainingExecution.consumer = remainingConsumer;
  const retainedEntry = { lockedExecution: failedExecution };
  let finishFailedHttpClose;
  let failedResourceCalls = 0;
  const failedGateway = {
    httpServer: {
      close(callback) {
        finishFailedHttpClose = callback;
      },
    },
    service: {
      closeResources() {
        failedResourceCalls += 1;
      },
    },
    scheduler: {
      consumers: [failedConsumer, remainingConsumer],
      requestQueue: { entries: [retainedEntry] },
    },
    lifecycle: {
      isStopping: false,
      shutdownController: new AbortController(),
      stopPromise: null,
      pendingTestRecords: new Set([failedShutdownRecord.promise]),
    },
    logOutput: failedShutdownOutput,
    log: writeLog.bind(null, failedShutdownOutput),
  };
  const failedStop = stopGateway(failedGateway);
  let failedStopReturned = false;
  const failedStopObserved = assert
    .rejects(failedStop, (error) => {
      assert.ok(error instanceof AggregateError);
      assert.match(error.errors[0].message, /消费者收尾失败执行收尾失败/);
      return true;
    })
    .then(() => {
      failedStopReturned = true;
    });
  failedExecutionCompletion.reject(new Error('无法完成本轮收尾'));
  await delay(0);
  assert.equal(failedStopReturned, false);
  assert.equal(
    failedShutdownLines.filter((line) => line.includes('[gateway.stop_failed]')).length,
    0
  );
  remainingConsumer.currentExecution = null;
  remainingExecutionCompletion.resolve();
  await delay(0);
  assert.equal(failedStopReturned, false);
  assert.equal(failedResourceCalls, 0);
  failedShutdownRecord.resolve();
  await failedStopObserved;
  assert.equal(failedGateway.lifecycle.isStopping, true);
  assert.equal(failedGateway.scheduler.requestQueue.entries[0], retainedEntry);
  assert.equal(failedConsumer.currentExecution, failedExecution);
  assert.equal(failedShutdownLines.filter((line) => line.includes('[gateway.stopped]')).length, 0);
  assert.equal(
    failedShutdownLines.filter((line) => line.includes('[gateway.stop_failed]')).length,
    1
  );
  assert.equal(stopGateway(failedGateway), failedStop);
  finishFailedHttpClose(new Error('迟到的 HTTP 关闭失败'));
  await waitForLogWrites(failedShutdownOutput);
  await delay(0);
  assert.equal(
    failedShutdownLines.filter((line) => line.includes('[gateway.stop_failed]')).length,
    2
  );

  const independentRecord = Promise.withResolvers();
  let independentResourceCalls = 0;
  const independentGateway = {
    ...failedGateway,
    httpServer: {
      close(callback) {
        callback(new Error('HTTP 关闭失败'));
      },
    },
    service: {
      closeResources() {
        independentResourceCalls += 1;
        throw new Error('资源释放失败');
      },
    },
    scheduler: { consumers: [], requestQueue: { entries: [] } },
    lifecycle: {
      isStopping: false,
      shutdownController: new AbortController(),
      stopPromise: null,
      pendingTestRecords: new Set([independentRecord.promise]),
    },
  };
  let independentStopReturned = false;
  const independentStop = assert
    .rejects(stopGateway(independentGateway), (error) => {
      assert.equal(error.errors.length, 2);
      return true;
    })
    .then(() => {
      independentStopReturned = true;
    });
  await delay(0);
  assert.equal(independentResourceCalls, 1);
  assert.equal(independentStopReturned, false);
  independentRecord.resolve();
  await independentStop;

  const racingRequest = new PassThrough();
  Object.assign(racingRequest, {
    method: 'POST',
    url: '/v1/messages',
    httpVersion: '1.1',
    headers: {},
    rawHeaders: [],
  });
  const racingResponse = new Writable({
    write(_chunk, _encoding, callback) {
      callback();
    },
  });
  racingResponse.setHeader = () => {};
  racingResponse.writeHead = (status) => {
    racingResponse.statusCode = status;
  };
  const racingContext = createRequestContext(racingRequest, racingResponse);
  racingContext.protocol = 'anthropic';
  const racingLifecycle = {
    isStopping: false,
    shutdownController: new AbortController(),
    pendingTestRecords: new Set(),
  };
  const racingHandling = handleChatRequest(
    {
      configuration,
      modelCatalog: gateway.modelCatalog,
      lifecycle: racingLifecycle,
      log: shutdownGateway.log,
    },
    racingContext
  );
  racingRequest.end('{"model":"basic-test"}');
  racingLifecycle.isStopping = true;
  await racingHandling;
  assert.equal(racingResponse.statusCode, 503);
  assert.equal(racingLifecycle.pendingTestRecords.size, 0);

  const cliScript =
    'await import(' +
    JSON.stringify(new URL('../src/main.js', import.meta.url).href) +
    '); process.on("message", () => { process.emit("SIGTERM"); process.emit("SIGINT"); process.disconnect(); }); process.send("ready");';
  const cli = spawn(process.execPath, ['--input-type=module', '-e', cliScript], {
    cwd: fileURLToPath(new URL('../', import.meta.url)),
    env: { ...process.env, ...shutdownEnvironment },
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    windowsHide: true,
  });
  context.after(() => {
    if (cli.exitCode === null && cli.signalCode === null) cli.kill();
  });
  let cliOutput = '';
  let cliError = '';
  cli.stdout.on('data', (chunk) => {
    cliOutput += chunk.toString();
  });
  cli.stderr.on('data', (chunk) => {
    cliError += chunk.toString();
  });
  const cliExited = once(cli, 'exit');
  await Promise.race([
    once(cli, 'message'),
    cliExited.then(() => {
      throw new Error('命令入口未启动：' + cliOutput + cliError);
    }),
  ]);
  const cliHealth = await fetch(shutdownUrl + '/health', { signal: context.signal });
  assert.deepEqual(await cliHealth.json(), { status: 'ok' });
  cli.send('stop');
  const [cliExitCode] = await cliExited;
  assert.equal(cliExitCode, 0, cliError);
  assert.equal((cliOutput.match(/\[gateway.stopping\]/g) || []).length, 1);
  assert.equal((cliOutput.match(/\[gateway.stopped\]/g) || []).length, 1);

  const stdoutErrorListeners = process.stdout.listeners('error');
  const stderrErrorListeners = process.stderr.listeners('error');
  for (const failLogging of [false, true]) {
    const ownedLoggingGateway = await startGateway({ environment: shutdownEnvironment });
    context.after(async () => {
      await stopGateway(ownedLoggingGateway).catch(() => undefined);
      releaseLogOutput(ownedLoggingGateway.logOutput);
    });
    assert.equal(ownedLoggingGateway.lifecycle.ownsLogOutput, true);
    assert.equal(process.stdout.listenerCount('error'), stdoutErrorListeners.length + 1);
    assert.equal(process.stderr.listenerCount('error'), stderrErrorListeners.length + 1);
    if (failLogging) {
      ownedLoggingGateway.log('missing.event');
      const logFailure = ownedLoggingGateway.logOutput.firstError;
      await assert.rejects(stopGateway(ownedLoggingGateway), (error) =>
        error.errors.includes(logFailure)
      );
    } else {
      await stopGateway(ownedLoggingGateway);
    }
    assert.deepEqual(process.stdout.listeners('error'), stdoutErrorListeners);
    assert.deepEqual(process.stderr.listeners('error'), stderrErrorListeners);
  }
  await assert.rejects(startGateway({ environment: { PORT: '0' } }), /PORT/);
  assert.deepEqual(process.stdout.listeners('error'), stdoutErrorListeners);
  assert.deepEqual(process.stderr.listeners('error'), stderrErrorListeners);

  const sharedDiagnostics = [];
  const sharedOutput = new Writable({
    write(_chunk, _encoding, callback) {
      callback();
    },
  });
  const sharedErrorOutput = new Writable({
    write(chunk, _encoding, callback) {
      sharedDiagnostics.push(chunk.toString());
      callback();
    },
  });
  const retiredLogOutputs = [];
  for (let index = 0; index < 3; index += 1) {
    const retired = createLogOutput(sharedOutput, sharedErrorOutput);
    writeLog(retired, 'gateway.stopped');
    await waitForLogWrites(retired);
    releaseLogOutput(retired);
    releaseLogOutput(retired);
    retiredLogOutputs.push(retired);
  }
  assert.equal(sharedOutput.listenerCount('error'), 0);
  assert.equal(sharedErrorOutput.listenerCount('error'), 0);
  const currentLogOutput = createLogOutput(sharedOutput, sharedErrorOutput);
  const sharedFailure = new Error('共享输出故障');
  sharedOutput.emit('error', sharedFailure);
  assert.equal(await waitForLogWrites(currentLogOutput), sharedFailure);
  assert.equal(sharedDiagnostics.length, 1);
  assert.ok(retiredLogOutputs.every((retired) => retired.firstError === null));
  releaseLogOutput(currentLogOutput);

  for (const [emitClose, reportDestroyError] of [
    [true, true],
    [false, true],
    [false, false],
  ]) {
    const finishDestroy = Promise.withResolvers();
    const streamFailure = new Error('异步销毁中的写入故障');
    const delayedDiagnostics = [];
    const delayedStream = new Writable({
      emitClose,
      write(_chunk, _encoding, callback) {
        callback(streamFailure);
      },
      destroy(error, callback) {
        void finishDestroy.promise.then(() => callback(reportDestroyError ? error : null));
      },
    });
    const delayedLogOutput = createLogOutput(
      delayedStream,
      new Writable({
        write(chunk, _encoding, callback) {
          delayedDiagnostics.push(chunk.toString());
          callback();
        },
      })
    );
    writeLog(delayedLogOutput, 'gateway.stopped');
    assert.equal(await waitForLogWrites(delayedLogOutput), streamFailure);
    assert.equal(delayedStream.destroyed, true);
    assert.equal(delayedStream.closed, false);
    releaseLogOutput(delayedLogOutput);
    releaseLogOutput(delayedLogOutput);
    assert.ok(delayedStream.listeners('error').includes(delayedLogOutput.onStreamError));
    assert.equal(delayedLogOutput.errorOutput.listenerCount('error'), 0);
    finishDestroy.resolve();
    await delay(0);
    assert.equal(delayedStream.closed, true);
    assert.equal(delayedDiagnostics.length, 1);
    if (emitClose || reportDestroyError) {
      assert.equal(delayedStream.listenerCount('error'), 0);
      assert.equal(delayedStream.listenerCount('close'), 0);
    }
  }

  const sharedStreamOutput = createLogOutput(sharedOutput, sharedOutput);
  assert.equal(sharedOutput.listenerCount('error'), 1);
  releaseLogOutput(sharedStreamOutput);
  assert.equal(sharedOutput.listenerCount('error'), 0);

  await assert.rejects(stopGateway(gateway), (error) => error.errors.includes(outputError));
  assert.ok(logOutput.output.listeners('error').includes(logOutput.onStreamError));
  assert.ok(logOutput.errorOutput.listeners('error').includes(logOutput.onStreamError));
});
