import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdir, mkdtemp, readFile, readdir } from 'node:fs/promises';
import { request as httpRequest } from 'node:http';
import { join } from 'node:path';
import test from 'node:test';
import { setImmediate as nextTurn } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

import createGatewayServer from '../src/backend/http/createGatewayServer.js';
import saveTestRequest from '../src/backend/testModel/saveTestRequest.js';

test('HTTP 入口、原始请求记录及请求生命周期', { timeout: 15_000 }, async (suite) => {
  const dataRoot = fileURLToPath(new URL('../data/', import.meta.url));
  await mkdir(dataRoot, { recursive: true });

  const startGateway = async (context, options = {}) => {
    const dataDirectory = await mkdtemp(join(dataRoot, 'http-test-'));
    const gateway = createGatewayServer({
      ...options,
      configuration: {
        port: 3000,
        apiKey: '',
        serviceName: 'sample',
        idleTimeoutMs: 300_000,
        totalTimeoutMs: 600_000,
        ...options.configuration,
      },
      dataDirectory,
      log: () => undefined,
    });
    const listening = once(gateway.server, 'listening');
    gateway.server.listen(0, '127.0.0.1');
    await listening;
    context.after(async () => {
      gateway.server.closeAllConnections();
      await new Promise((resolve, reject) => {
        gateway.server.close((error) => (error ? reject(error) : resolve()));
      });
    });
    const port = gateway.server.address().port;
    return { ...gateway, port, dataDirectory, baseUrl: `http://127.0.0.1:${port}` };
  };

  const post = (gateway, pathname, body, headers = {}) =>
    fetch(gateway.baseUrl + pathname, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    });

  const parseEvents = (text) =>
    text
      .trim()
      .split(/\r?\n\r?\n/)
      .map((block) => {
        const lines = block.split(/\r?\n/);
        const event = lines
          .find((line) => line.startsWith('event:'))
          ?.slice(6)
          .trim();
        const data = lines
          .filter((line) => line.startsWith('data:'))
          .map((line) => line.slice(5).trim())
          .join('\n');
        return { event, data: data === '[DONE]' ? data : JSON.parse(data) };
      });

  const testBody = {
    model: 'sample-test',
    messages: [{ role: 'user', content: '你好' }],
    max_tokens: 16,
  };

  await suite.test('模型列表根据协议头返回，两种本地入口无需消费者', async (context) => {
    const gateway = await startGateway(context);
    const health = await fetch(gateway.baseUrl + '/health');
    assert.equal(health.status, 200);
    assert.equal((await health.json()).status, 'ok');

    const openaiResponse = await fetch(gateway.baseUrl + '/v1/models');
    const openai = await openaiResponse.json();
    assert.equal(openaiResponse.status, 200);
    assert.equal(openai.object, 'list');
    assert.deepEqual(
      openai.data.map((model) => model.id),
      ['sample-default', 'sample-test']
    );
    assert.ok(
      openai.data.every((model) => model.object === 'model' && Number.isInteger(model.created))
    );

    const anthropicResponse = await fetch(gateway.baseUrl + '/v1/models', {
      headers: { 'anthropic-version': '2023-06-01' },
    });
    const anthropic = await anthropicResponse.json();
    assert.equal(anthropicResponse.status, 200);
    assert.equal(anthropic.has_more, false);
    assert.equal(anthropic.first_id, 'sample-default');
    assert.equal(anthropic.last_id, 'sample-test');
    assert.deepEqual(
      anthropic.data.map((model) => model.id),
      openai.data.map((model) => model.id)
    );
    assert.ok(
      anthropic.data.every(
        (model) => model.type === 'model' && typeof model.created_at === 'string'
      )
    );
    assert.equal(gateway.scheduler.queue.length, 0);
  });

  await suite.test('两种协议的测试模型均支持非流式及完整流式响应', async (context) => {
    const gateway = await startGateway(context, {
      execute: () => assert.fail('本地测试模型不得调用消费者'),
    });
    for (const pathname of ['/v1/chat/completions', '/v1/messages']) {
      const anthropic = pathname === '/v1/messages';
      const response = await post(gateway, pathname, testBody);
      const body = await response.json();
      assert.equal(response.status, 200);
      assert.equal(body.model, 'sample-test');
      assert.ok(response.headers.get('x-request-id'));
      if (anthropic) {
        assert.equal(body.type, 'message');
        assert.equal(body.content[0].text, 'OK');
        assert.equal(body.stop_reason, 'end_turn');
        assert.equal(body.id, `msg_${response.headers.get('x-request-id')}`);
      } else {
        assert.equal(body.object, 'chat.completion');
        assert.equal(body.choices[0].message.content, 'OK');
        assert.equal(body.choices[0].finish_reason, 'stop');
        assert.equal(body.id, `chatcmpl-${response.headers.get('x-request-id')}`);
      }

      const stream = await post(gateway, pathname, { ...testBody, stream: true });
      const events = parseEvents(await stream.text());
      assert.equal(stream.status, 200);
      assert.match(stream.headers.get('content-type'), /^text\/event-stream/);
      if (anthropic) {
        assert.deepEqual(
          events.map((event) => event.event),
          [
            'message_start',
            'content_block_start',
            'content_block_delta',
            'content_block_stop',
            'message_delta',
            'message_stop',
          ]
        );
        assert.equal(events[0].data.message.id, `msg_${stream.headers.get('x-request-id')}`);
        assert.equal(events[2].data.delta.text, 'OK');
        assert.equal(events[4].data.delta.stop_reason, 'end_turn');
      } else {
        assert.equal(events.at(-1).data, '[DONE]');
        const chunks = events.slice(0, -1).map((event) => event.data);
        assert.equal(new Set(chunks.map((chunk) => chunk.id)).size, 1);
        assert.equal(chunks[0].id, `chatcmpl-${stream.headers.get('x-request-id')}`);
        assert.equal(chunks.map((chunk) => chunk.choices[0].delta.content || '').join(''), 'OK');
        assert.equal(chunks.at(-1).choices[0].finish_reason, 'stop');
      }
    }
    assert.equal(gateway.scheduler.queue.length, 0);
    assert.equal((await readdir(join(gateway.dataDirectory, 'test_history'))).length, 4);
  });

  await suite.test('原始记录保留路径、重复请求头、认证头及请求体字节', async (context) => {
    const gateway = await startGateway(context, { configuration: { apiKey: 'test-secret' } });
    const pathname = '/v1/chat/completions?first=%E4%BD%A0&keep=a+b&keep=%2F';
    const originalBody = Buffer.from(
      '{\r\n  "model" : "sample-test", "messages" : [ { "role":"user", "content":"空 格 😀" } ]\r\n}\n'
    );
    const response = await new Promise((resolve, reject) => {
      const request = httpRequest(
        {
          hostname: '127.0.0.1',
          port: gateway.port,
          method: 'POST',
          path: pathname,
          headers: [
            'Host',
            `127.0.0.1:${gateway.port}`,
            'Content-Type',
            'application/json',
            'Content-Length',
            String(originalBody.length),
            'Authorization',
            'Bearer test-secret',
            'X-Repeated',
            'first',
            'X-Repeated',
            'second',
            'X-MiXeD',
            'preserve',
            'Connection',
            'close',
          ],
        },
        (incoming) => {
          const chunks = [];
          incoming.on('data', (chunk) => chunks.push(chunk));
          incoming.once('error', reject);
          incoming.once('end', () =>
            resolve({ statusCode: incoming.statusCode, body: Buffer.concat(chunks) })
          );
        }
      );
      request.once('error', reject);
      request.end(originalBody);
    });
    assert.equal(response.statusCode, 200);
    assert.equal(JSON.parse(response.body).choices[0].message.content, 'OK');
    const historyDirectory = join(gateway.dataDirectory, 'test_history');
    const filenames = await readdir(historyDirectory);
    assert.equal(filenames.length, 1);
    const record = await readFile(join(historyDirectory, filenames[0]));
    const separator = record.indexOf('\r\n\r\n');
    assert.notEqual(separator, -1);
    const headerText = record.subarray(0, separator).toString();
    assert.ok(headerText.startsWith(`POST ${pathname} HTTP/1.1\r\n`));
    assert.ok(headerText.includes('Authorization: Bearer test-secret\r\n'));
    assert.ok(headerText.includes('X-Repeated: first\r\nX-Repeated: second\r\n'));
    assert.ok(headerText.includes('X-MiXeD: preserve'));
    assert.deepEqual(record.subarray(separator + 4), originalBody);
  });

  await suite.test('同一秒并发写入历史记录不会覆盖', async (context) => {
    const gateway = await startGateway(context);
    const date = new Date(2026, 10, 2, 3, 4, 5);
    const request = {
      method: 'POST',
      url: '/v1/messages',
      httpVersion: '1.1',
      rawHeaders: ['Content-Type', 'application/json'],
    };
    const bodies = Array.from({ length: 8 }, (_, index) => Buffer.from(`{"sample":${index}}`));
    const filenames = await Promise.all(
      bodies.map((body) => saveTestRequest(gateway.dataDirectory, request, body, date))
    );
    assert.equal(new Set(filenames).size, bodies.length);
    assert.equal(
      (await readdir(join(gateway.dataDirectory, 'test_history'))).length,
      bodies.length
    );
    for (let index = 0; index < filenames.length; index += 1) {
      const record = await readFile(filenames[index]);
      assert.deepEqual(record.subarray(record.indexOf('\r\n\r\n') + 4), bodies[index]);
      assert.match(filenames[index], /2026-11-02-03-04-05(?:-\d{3})?\.txt$/);
    }
  });

  await suite.test('认证保护 API，首页及健康检查免认证，支持两种认证头', async (context) => {
    const gateway = await startGateway(context, { configuration: { apiKey: 'gateway-key' } });
    const homepage = await fetch(gateway.baseUrl + '/');
    assert.equal(homepage.status, 200);
    assert.match(await homepage.text(), /<body>\s*<\/body>/);
    assert.equal((await fetch(gateway.baseUrl + '/health')).status, 200);

    const rejectedModels = await fetch(gateway.baseUrl + '/v1/models');
    assert.equal(rejectedModels.status, 401);
    assert.equal((await rejectedModels.json()).error.code, 'invalid_api_key');
    for (const headers of [
      { Authorization: 'Bearer gateway-key' },
      { 'x-api-key': 'gateway-key' },
    ]) {
      const accepted = await fetch(gateway.baseUrl + '/v1/models', { headers });
      assert.equal(accepted.status, 200);
      await accepted.json();
    }

    for (const pathname of ['/v1/chat/completions', '/v1/messages']) {
      const rejected = await post(gateway, pathname, testBody, {
        Authorization: 'Bearer wrong-key',
      });
      const body = await rejected.json();
      assert.equal(rejected.status, 401);
      assert.equal(body.error.code, 'invalid_api_key');
      assert.equal(body.error.type, 'authentication_error');
      if (pathname === '/v1/messages') assert.equal(body.type, 'error');
    }
  });

  await suite.test('非法 JSON 和未知模型使用各自协议的错误响应', async (context) => {
    const gateway = await startGateway(context);
    for (const pathname of ['/v1/chat/completions', '/v1/messages']) {
      const malformed = await post(gateway, pathname, '{');
      const invalidBody = await malformed.json();
      assert.equal(malformed.status, 400);
      assert.equal(typeof invalidBody.error.message, 'string');
      if (pathname === '/v1/messages') assert.equal(invalidBody.type, 'error');

      const unknown = await post(gateway, pathname, { ...testBody, model: 'missing' });
      const unknownBody = await unknown.json();
      assert.equal(unknown.status, 404);
      assert.equal(unknownBody.error.code, 'model_not_found');
      if (pathname === '/v1/messages') assert.equal(unknownBody.type, 'error');
    }
    assert.equal(gateway.scheduler.queue.length, 0);
  });

  await suite.test('没有消费者时整体超时会移除排队请求', async (context) => {
    const gateway = await startGateway(context, {
      configuration: { totalTimeoutMs: 80, idleTimeoutMs: 10 },
    });
    const response = await post(gateway, '/v1/chat/completions', {
      ...testBody,
      model: 'sample-default',
    });
    assert.equal(response.status, 504);
    assert.equal((await response.json()).error.code, 'total_timeout');
    assert.equal(gateway.scheduler.queue.length, 0);
  });

  await suite.test('缓慢发送的请求体也受整体期限约束', async (context) => {
    const gateway = await startGateway(context, { configuration: { totalTimeoutMs: 80 } });
    let outgoing;
    context.after(() => outgoing?.destroy());
    const response = await new Promise((resolve, reject) => {
      outgoing = httpRequest(
        {
          hostname: '127.0.0.1',
          port: gateway.port,
          method: 'POST',
          path: '/v1/chat/completions',
          headers: { 'content-type': 'application/json', 'content-length': 1000 },
        },
        (incoming) => {
          const chunks = [];
          incoming.on('data', (chunk) => chunks.push(chunk));
          incoming.once('error', reject);
          incoming.once('end', () =>
            resolve({ statusCode: incoming.statusCode, body: Buffer.concat(chunks) })
          );
        }
      );
      outgoing.once('error', reject);
      outgoing.write('{"model":');
    });
    assert.equal(response.statusCode, 504);
    assert.equal(JSON.parse(response.body).error.code, 'total_timeout');
    assert.equal(gateway.scheduler.queue.length, 0);
    outgoing.destroy();
  });

  await suite.test('空闲超时通知执行取消并保持消费者占用到真实结束', async (context) => {
    const consumer = { id: 'idle-consumer', available: true, busy: false };
    const executionFinished = Promise.withResolvers();
    let executionSignal;
    context.after(() => executionFinished.resolve());
    const gateway = await startGateway(context, {
      consumers: [consumer],
      configuration: { idleTimeoutMs: 80, totalTimeoutMs: 2000 },
      execute: async ({ signal }) => {
        executionSignal = signal;
        await executionFinished.promise;
        return { body: { ignored: true } };
      },
    });
    const response = await post(gateway, '/v1/chat/completions', {
      ...testBody,
      model: 'sample-default',
    });
    assert.equal(response.status, 504);
    assert.equal((await response.json()).error.code, 'idle_timeout');
    assert.equal(executionSignal.aborted, true);
    assert.equal(consumer.busy, true);
    executionFinished.resolve();
    await nextTurn();
    assert.equal(consumer.busy, false);
  });

  await suite.test('响应提交后使用流内错误，不改写 HTTP 状态', async (context) => {
    const consumer = { id: 'stream-consumer', available: true, busy: false };
    const gateway = await startGateway(context, {
      consumers: [consumer],
      execute: async ({ request, emit }) => {
        if (request.protocol === 'anthropic') {
          await emit({
            event: 'content_block_delta',
            data: {
              type: 'content_block_delta',
              index: 0,
              delta: { type: 'text_delta', text: '片段' },
            },
          });
        } else {
          await emit({
            data: {
              object: 'chat.completion.chunk',
              choices: [{ index: 0, delta: { content: '片段' }, finish_reason: null }],
            },
          });
        }
        throw Object.assign(new Error('模拟上游额度错误'), {
          statusCode: 429,
          code: 'quota_exhausted',
          type: 'rate_limit_error',
        });
      },
    });
    for (const pathname of ['/v1/chat/completions', '/v1/messages']) {
      const response = await post(gateway, pathname, {
        ...testBody,
        model: 'sample-default',
        stream: true,
      });
      const events = parseEvents(await response.text());
      assert.equal(response.status, 200);
      assert.equal(events.length, 2);
      assert.equal(events.at(-1).data.error.code, 'quota_exhausted');
      if (pathname === '/v1/messages') {
        assert.equal(events.at(-1).event, 'error');
        assert.equal(events.at(-1).data.type, 'error');
      }
    }
    assert.equal(consumer.busy, false);
  });

  await suite.test('客户端断开会取消当前执行，结束前不得释放消费者', async (context) => {
    const consumer = { id: 'disconnect-consumer', available: true, busy: false };
    const executionStarted = Promise.withResolvers();
    const executionCancelled = Promise.withResolvers();
    const executionFinished = Promise.withResolvers();
    context.after(() => executionFinished.resolve());
    const gateway = await startGateway(context, {
      consumers: [consumer],
      execute: async ({ signal }) => {
        signal.addEventListener('abort', () => executionCancelled.resolve(signal.reason), {
          once: true,
        });
        executionStarted.resolve(signal);
        await executionFinished.promise;
        return { body: { ignored: true } };
      },
    });
    const outgoing = httpRequest({
      hostname: '127.0.0.1',
      port: gateway.port,
      method: 'POST',
      path: '/v1/chat/completions',
      headers: { 'content-type': 'application/json' },
    });
    outgoing.on('error', () => undefined);
    context.after(() => outgoing.destroy());
    outgoing.end(JSON.stringify({ ...testBody, model: 'sample-default' }));
    const signal = await executionStarted.promise;
    assert.equal(consumer.busy, true);
    outgoing.destroy();
    const cancellation = await executionCancelled.promise;
    assert.equal(signal.aborted, true);
    assert.equal(cancellation.code, 'request_cancelled');
    assert.equal(consumer.busy, true);
    executionFinished.resolve();
    await nextTurn();
    assert.equal(consumer.busy, false);
    assert.equal(gateway.scheduler.queue.length, 0);
  });
  await suite.test('多消费者倒序完成时响应仍返回各自客户端并保持请求标识', async (context) => {
    const started = { first: Promise.withResolvers(), second: Promise.withResolvers() };
    const finished = { first: Promise.withResolvers(), second: Promise.withResolvers() };
    const consumers = [
      { id: 'first-consumer', available: true, busy: false },
      { id: 'second-consumer', available: true, busy: false },
    ];
    context.after(() => {
      finished.first.resolve();
      finished.second.resolve();
    });
    const gateway = await startGateway(context, {
      consumers,
      execute: async ({ uid, request }) => {
        const client = request.body.messages[0].content;
        started[client].resolve(uid);
        await finished[client].promise;
        return {
          body: {
            id: `chatcmpl-${uid}`,
            object: 'chat.completion',
            model: request.body.model,
            choices: [
              { index: 0, message: { role: 'assistant', content: client }, finish_reason: 'stop' },
            ],
          },
        };
      },
    });
    let firstResponded = false;
    const firstResponse = post(gateway, '/v1/chat/completions', {
      ...testBody,
      model: 'sample-default',
      messages: [{ role: 'user', content: 'first' }],
    }).then((response) => {
      firstResponded = true;
      return response;
    });
    const firstUid = await started.first.promise;
    const secondResponse = post(gateway, '/v1/chat/completions', {
      ...testBody,
      model: 'sample-default',
      messages: [{ role: 'user', content: 'second' }],
    });
    const secondUid = await started.second.promise;
    assert.notEqual(firstUid, secondUid);
    assert.equal(consumers.filter((consumer) => consumer.busy).length, 2);

    finished.second.resolve();
    const second = await secondResponse;
    const secondBody = await second.json();
    assert.equal(second.status, 200);
    assert.equal(second.headers.get('x-request-id'), secondUid);
    assert.equal(secondBody.id, `chatcmpl-${secondUid}`);
    assert.equal(secondBody.choices[0].message.content, 'second');
    assert.equal(firstResponded, false);
    assert.equal(consumers.filter((consumer) => consumer.busy).length, 1);

    finished.first.resolve();
    const first = await firstResponse;
    const firstBody = await first.json();
    assert.equal(first.status, 200);
    assert.equal(first.headers.get('x-request-id'), firstUid);
    assert.equal(firstBody.id, `chatcmpl-${firstUid}`);
    assert.equal(firstBody.choices[0].message.content, 'first');
    assert.equal(
      consumers.some((consumer) => consumer.busy),
      false
    );
    assert.equal(gateway.scheduler.queue.length, 0);
  });

  await suite.test('请求体未发完时断开不会遗留任务且服务器继续响应', async (context) => {
    const gateway = await startGateway(context);
    const requestReceived = once(gateway.server, 'request');
    const outgoing = httpRequest({
      hostname: '127.0.0.1',
      port: gateway.port,
      method: 'POST',
      path: '/v1/chat/completions',
      headers: { 'content-type': 'application/json', 'content-length': 1000 },
    });
    outgoing.on('error', () => undefined);
    context.after(() => outgoing.destroy());
    outgoing.write('{"model":"sample-default",');
    const [incoming] = await requestReceived;
    const aborted = once(incoming, 'aborted');
    outgoing.destroy();
    await aborted;
    await nextTurn();
    assert.equal(gateway.scheduler.queue.length, 0);
    const health = await fetch(gateway.baseUrl + '/health');
    assert.equal(health.status, 200);
    assert.equal((await health.json()).status, 'ok');
  });
});
