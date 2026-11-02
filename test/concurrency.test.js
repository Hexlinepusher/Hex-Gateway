import assert from 'node:assert/strict';
import test from 'node:test';
import { setImmediate as nextTurn } from 'node:timers/promises';

import createScheduler from '../src/backend/concurrency/createScheduler.js';
import dispatchRequests from '../src/backend/concurrency/dispatchRequests.js';
import enqueueRequest from '../src/backend/concurrency/enqueueRequest.js';

function enqueue(scheduler, uid, options = {}) {
  return enqueueRequest(scheduler, {
    uid,
    deadline: Date.now() + 5_000,
    signal: new AbortController().signal,
    request: { model: 'example-default' },
    onChunk: async () => undefined,
    ...options,
  });
}

test('共享同一账号的多个消费者按队列顺序并发执行，每个请求仅派发一次', async () => {
  const consumers = [
    { id: 'first', resourceId: 'same-account', available: true, busy: false },
    { id: 'second', resourceId: 'same-account', available: true, busy: false },
  ];
  const gates = Array.from({ length: 5 }, () => Promise.withResolvers());
  const started = [];
  let running = 0;
  let maximumRunning = 0;
  const scheduler = createScheduler({
    consumers,
    execute: async ({ uid }) => {
      started.push(uid);
      running += 1;
      maximumRunning = Math.max(maximumRunning, running);
      await gates[Number(uid)].promise;
      running -= 1;
      return { body: { uid } };
    },
  });
  const requests = gates.map((_, index) => enqueue(scheduler, String(index)));
  assert.deepEqual(started, ['0', '1']);
  assert.equal(scheduler.queue.length, 3);
  gates[0].resolve();
  await requests[0];
  assert.deepEqual(started, ['0', '1', '2']);
  gates[1].resolve();
  await requests[1];
  assert.deepEqual(started, ['0', '1', '2', '3']);
  gates[2].resolve();
  await requests[2];
  assert.deepEqual(started, ['0', '1', '2', '3', '4']);
  gates[3].resolve();
  gates[4].resolve();
  const responses = await Promise.all(requests);
  assert.equal(maximumRunning, 2);
  assert.deepEqual(
    responses.map(({ body }) => body.uid),
    ['0', '1', '2', '3', '4']
  );
  assert.ok(consumers.every((consumer) => !consumer.busy));
});

test('没有消费者时保持排队，取消会移除请求', async () => {
  const scheduler = createScheduler();
  const controller = new AbortController();
  const request = enqueue(scheduler, 'waiting', { signal: controller.signal });
  const rejection = assert.rejects(request, { message: '客户端已断开' });
  assert.equal(scheduler.queue.length, 1);
  controller.abort(new Error('客户端已断开'));
  await rejection;
  assert.equal(scheduler.queue.length, 0);
});

test('已取消和已超时的请求不会占用消费者', async () => {
  let executions = 0;
  const consumer = { id: 'only', available: true, busy: false };
  const scheduler = createScheduler({
    consumers: [consumer],
    execute: async () => {
      executions += 1;
      return { body: {} };
    },
  });
  const controller = new AbortController();
  controller.abort(new Error('已取消'));
  await assert.rejects(enqueue(scheduler, 'cancelled', { signal: controller.signal }), {
    message: '已取消',
  });
  await assert.rejects(enqueue(scheduler, 'expired', { deadline: Date.now() - 1 }), {
    statusCode: 504,
    code: 'total_timeout',
  });
  assert.equal(executions, 0);
  assert.equal(consumer.busy, false);
  assert.equal(scheduler.queue.length, 0);
});

test('排队不启动空闲计时，超时拒绝请求但等待实际执行结束才释放消费者', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const consumer = { id: 'only', available: false, busy: false };
  const gate = Promise.withResolvers();
  let execution;
  const scheduler = createScheduler({
    consumers: [consumer],
    idleTimeoutMs: 100,
    execute: async (context) => {
      execution = context;
      await gate.promise;
      return { body: {} };
    },
  });
  const request = enqueue(scheduler, 'idle');
  const rejection = assert.rejects(request, { statusCode: 504, code: 'idle_timeout' });
  t.mock.timers.tick(1_000);
  assert.equal(execution, undefined);
  assert.equal(scheduler.queue.length, 1);
  consumer.available = true;
  dispatchRequests(scheduler);
  t.mock.timers.tick(99);
  assert.equal(execution.signal.aborted, false);
  t.mock.timers.tick(1);
  await rejection;
  assert.equal(execution.signal.aborted, true);
  assert.equal(consumer.busy, true);
  gate.resolve();
  await nextTurn();
  assert.equal(consumer.busy, false);
});

test('上游活动重置空闲期限，下游写出不重置上游空闲期限', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const gate = Promise.withResolvers();
  const chunks = [];
  let execution;
  const scheduler = createScheduler({
    consumers: [{ id: 'only', available: true, busy: false }],
    idleTimeoutMs: 100,
    execute: async (context) => {
      execution = context;
      await gate.promise;
      return { streamed: true };
    },
  });
  const request = enqueue(scheduler, 'activity', { onChunk: async (chunk) => chunks.push(chunk) });
  const rejection = assert.rejects(request, { code: 'idle_timeout' });
  t.mock.timers.tick(80);
  execution.onActivity();
  t.mock.timers.tick(80);
  assert.equal(execution.signal.aborted, false);
  await execution.emit({ data: { text: '内容' } });
  t.mock.timers.tick(20);
  await rejection;
  assert.deepEqual(chunks, [{ data: { text: '内容' } }]);
  gate.resolve();
  await nextTurn();
});

test('执行中取消后保持占用，后续请求等待 execute 真正结算', async () => {
  const controller = new AbortController();
  const gate = Promise.withResolvers();
  const started = [];
  let cancelledExecution;
  const consumer = { id: 'only', available: true, busy: false };
  const scheduler = createScheduler({
    consumers: [consumer],
    execute: async (context) => {
      started.push(context.uid);
      if (context.uid === 'cancelled') {
        cancelledExecution = context;
        await gate.promise;
      }
      return { body: { uid: context.uid } };
    },
  });
  const first = enqueue(scheduler, 'cancelled', { signal: controller.signal });
  const rejection = assert.rejects(first, { message: '整体超时' });
  const second = enqueue(scheduler, 'next');
  controller.abort(new Error('整体超时'));
  await rejection;
  assert.equal(cancelledExecution.signal.aborted, true);
  assert.equal(consumer.busy, true);
  assert.deepEqual(started, ['cancelled']);
  gate.resolve();
  assert.deepEqual(await second, { body: { uid: 'next' } });
  assert.deepEqual(started, ['cancelled', 'next']);
  assert.equal(consumer.busy, false);
});

test('资源失效后显式尾部重排，UID 和截止时间保持，旧轮次数据被忽略', async () => {
  const failingConsumer = { id: 'failing', available: true, busy: false };
  const healthyConsumer = { id: 'healthy', available: false, busy: false };
  const firstGate = Promise.withResolvers();
  const secondGate = Promise.withResolvers();
  const started = [];
  const chunks = [];
  const deadline = Date.now() + 5_000;
  let oldExecution;
  let currentExecution;
  const scheduler = createScheduler({
    consumers: [failingConsumer, healthyConsumer],
    execute: async (context) => {
      started.push([context.uid, context.attempt, context.consumer.id]);
      if (context.uid === 'requeued' && context.attempt === 1) {
        oldExecution = context;
        await firstGate.promise;
        context.consumer.available = false;
        return { requeue: true };
      }
      if (context.uid === 'requeued') {
        currentExecution = context;
        await secondGate.promise;
      }
      return { body: { uid: context.uid } };
    },
  });
  const request = enqueue(scheduler, 'requeued', {
    deadline,
    onChunk: async (chunk) => chunks.push(chunk),
  });
  const waiting = enqueue(scheduler, 'waiting');
  firstGate.resolve();
  await nextTurn();
  assert.deepEqual(
    scheduler.queue.map((task) => task.uid),
    ['waiting', 'requeued']
  );
  assert.equal(scheduler.queue[1].deadline, deadline);
  assert.equal(failingConsumer.available, false);
  assert.equal(failingConsumer.busy, false);
  healthyConsumer.available = true;
  dispatchRequests(scheduler);
  await waiting;
  assert.deepEqual(started, [
    ['requeued', 1, 'failing'],
    ['waiting', 1, 'healthy'],
    ['requeued', 2, 'healthy'],
  ]);
  await oldExecution.emit({ data: '旧结果' });
  oldExecution.onActivity();
  await currentExecution.emit({ data: '新结果' });
  assert.deepEqual(chunks, [{ data: '新结果' }]);
  secondGate.resolve();
  assert.deepEqual(await request, { body: { uid: 'requeued' } });
  await oldExecution.emit({ data: '已完成请求的旧结果' });
  assert.deepEqual(chunks, [{ data: '新结果' }]);
});

test('旧轮次活动不会延长当前轮次的空闲期限', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const gate = Promise.withResolvers();
  const executionReady = Promise.withResolvers();
  let oldExecution;
  let currentExecution;
  const scheduler = createScheduler({
    consumers: [{ id: 'only', available: true, busy: false }],
    idleTimeoutMs: 100,
    execute: async (context) => {
      if (context.attempt === 1) {
        oldExecution = context;
        return { requeue: true };
      }
      currentExecution = context;
      executionReady.resolve();
      await gate.promise;
      return { body: {} };
    },
  });
  const request = enqueue(scheduler, 'same-uid');
  const rejection = assert.rejects(request, { code: 'idle_timeout' });
  await executionReady.promise;
  assert.equal(currentExecution.attempt, 2);
  t.mock.timers.tick(95);
  oldExecution.onActivity();
  t.mock.timers.tick(5);
  await rejection;
  gate.resolve();
  await nextTurn();
});

test('已提交流式数据的请求拒绝重新入队', async () => {
  let executions = 0;
  const chunks = [];
  const consumer = { id: 'only', available: true, busy: false };
  const scheduler = createScheduler({
    consumers: [consumer],
    execute: async ({ emit }) => {
      executions += 1;
      await emit({ data: '已经输出' });
      return { requeue: true };
    },
  });
  await assert.rejects(
    enqueue(scheduler, 'committed', { onChunk: async (chunk) => chunks.push(chunk) }),
    { statusCode: 502, code: 'response_already_started' }
  );
  assert.equal(executions, 1);
  assert.equal(scheduler.queue.length, 0);
  assert.equal(consumer.busy, false);
  assert.deepEqual(chunks, [{ data: '已经输出' }]);
});

test('上游明确错误保留状态码，普通异常转为调用失败，均不自动重试', async () => {
  let executions = 0;
  const upstreamError = Object.assign(new Error('上游额度耗尽'), {
    statusCode: 429,
    code: 'quota_exhausted',
  });
  const scheduler = createScheduler({
    consumers: [{ id: 'only', available: true, busy: false }],
    execute: async ({ uid }) => {
      executions += 1;
      if (uid === 'quota') throw upstreamError;
      throw new Error('连接失败');
    },
  });
  await assert.rejects(enqueue(scheduler, 'quota'), (error) => error === upstreamError);
  await assert.rejects(enqueue(scheduler, 'connection'), {
    message: '连接失败',
    statusCode: 502,
    code: 'upstream_error',
  });
  assert.equal(executions, 2);
});

test('下游写出失败会结束请求并释放已结束执行的消费者', async () => {
  const consumer = { id: 'only', available: true, busy: false };
  const scheduler = createScheduler({
    consumers: [consumer],
    execute: async ({ emit }) => {
      await emit({ data: '内容' });
      return { streamed: true };
    },
  });
  await assert.rejects(
    enqueue(scheduler, 'write-error', {
      onChunk: async () => {
        throw new Error('客户端写出失败');
      },
    }),
    { statusCode: 502, message: '客户端写出失败' }
  );
  assert.equal(consumer.busy, false);
});

test('空闲超时中止等待背压的写出，执行结算后释放消费者', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const consumer = { id: 'only', available: true, busy: false };
  let outputSignal;
  const scheduler = createScheduler({
    consumers: [consumer],
    idleTimeoutMs: 100,
    execute: async ({ emit }) => {
      await emit({ data: '等待写出' });
      return { streamed: true };
    },
  });
  const request = enqueue(scheduler, 'backpressure', {
    onChunk: (chunk, signal) =>
      new Promise((_resolve, reject) => {
        assert.equal(chunk.data, '等待写出');
        outputSignal = signal;
        signal.addEventListener('abort', () => reject(signal.reason), { once: true });
      }),
  });
  const rejection = assert.rejects(request, { code: 'idle_timeout' });
  assert.equal(outputSignal.aborted, false);
  t.mock.timers.tick(100);
  await rejection;
  await nextTurn();
  assert.equal(outputSignal.aborted, true);
  assert.equal(consumer.busy, false);
});

test('立即重排会让出事件循环，使外部取消能够终止请求', async () => {
  const controller = new AbortController();
  let executions = 0;
  const scheduler = createScheduler({
    consumers: [{ id: 'only', available: true, busy: false }],
    execute: async () => {
      executions += 1;
      return { requeue: true };
    },
  });
  const request = enqueue(scheduler, 'yielding', { signal: controller.signal });
  const rejection = assert.rejects(request, { message: '停止轮询' });
  setImmediate(() => controller.abort(new Error('停止轮询')));
  await rejection;
  await nextTurn();
  assert.equal(executions, 1);
  assert.equal(scheduler.queue.length, 0);
});
