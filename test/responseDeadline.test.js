import assert from 'node:assert/strict';
import { ServerResponse } from 'node:http';
import { Duplex, Readable } from 'node:stream';
import test from 'node:test';
import { setImmediate as nextTurn } from 'node:timers/promises';

import handleRequest from '../src/backend/http/handleRequest.js';

for (const [pathname, statusCode, label] of [
  ['/health', 200, '健康检查'],
  ['/missing', 404, '错误响应'],
]) {
  test(`${label}已结束写入但未完成交付时，整体超时终止连接`, async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const events = [];
    const socket = new Duplex({
      read() {},
      write(_chunk, _encoding, callback) {
        setTimeout(callback, 500);
      },
    });
    const request = Readable.from([]);
    Object.assign(request, {
      method: 'GET',
      url: pathname,
      headers: {},
      httpVersionMajor: 1,
      httpVersionMinor: 1,
    });
    const response = new ServerResponse(request);
    response.assignSocket(socket);
    t.after(() => {
      socket.destroy();
      request.destroy();
    });
    const application = {
      configuration: { totalTimeoutMs: 100 },
      log: (level, event, details) => events.push({ level, event, ...details }),
    };

    const handling = handleRequest(application, request, response);
    await nextTurn();
    assert.equal(response.statusCode, statusCode);
    assert.equal(response.writableEnded, true);
    assert.equal(response.writableFinished, false);
    assert.equal(response.destroyed, false);
    t.mock.timers.tick(99);
    await nextTurn();
    assert.equal(response.destroyed, false);
    t.mock.timers.tick(1);
    await handling;
    await nextTurn();

    assert.equal(response.destroyed, true);
    assert.equal(socket.destroyed, true);
    assert.equal(response.writableFinished, false);
    const timeoutEvents = events.filter((entry) => entry.event === '响应交付超时');
    assert.equal(timeoutEvents.length, 1);
    assert.equal(timeoutEvents[0].code, 'total_timeout');
    assert.equal(timeoutEvents[0].requestId, response.getHeader('x-request-id'));
    assert.equal(
      events.some((entry) => entry.event === '请求结束'),
      false
    );
    if (statusCode === 404) {
      assert.equal(
        events.some((entry) => entry.code === 'not_found'),
        true
      );
    }
  });
}
