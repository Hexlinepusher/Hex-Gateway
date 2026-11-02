import assert from 'node:assert/strict';
import test from 'node:test';

import createModelCatalog from '../src/backend/models/createModelCatalog.js';
import createErrorResponse from '../src/backend/protocols/createErrorResponse.js';
import createModelList from '../src/backend/protocols/createModelList.js';
import createTextChunks from '../src/backend/protocols/createTextChunks.js';
import createTextResponse from '../src/backend/protocols/createTextResponse.js';
import detectProtocol from '../src/backend/protocols/detectProtocol.js';
import validateChatRequest from '../src/backend/protocols/validateChatRequest.js';

const models = createModelCatalog('example');
const message = {
  uid: 'request-123',
  model: 'example-test',
  text: 'OK\n中文内容',
  created: 1700000000,
};

test('模型清单保留固定入口，附加模型不会修改输入', () => {
  const additionalModel = Object.freeze({ id: 'manual-agent', displayName: '人工入口' });
  const catalog = createModelCatalog('example', Object.freeze([additionalModel]));
  assert.deepEqual(
    catalog.map((model) => model.id),
    ['example-default', 'example-test', 'manual-agent']
  );
  assert.equal(catalog[2].displayName, '人工入口');
  assert.equal(catalog[2].created, 0);
  assert.equal(catalog[2].ownedBy, 'example');
  assert.throws(() => createModelCatalog('example', [{ id: 'example-test' }]), /重复/);
  assert.throws(() => createModelCatalog('example', [{ id: 'x' }, { id: 'x' }]), /重复/);
  assert.throws(() => createModelCatalog('example', [{ id: '' }]), /id/);
});

test('模型列表按协议标记识别，凭证头不代替协议标记', () => {
  assert.equal(detectProtocol('/v1/models', {}), 'openai');
  assert.equal(detectProtocol('/v1/models', { 'x-api-key': 'example' }), 'openai');
  assert.equal(detectProtocol('/v1/models', { 'Anthropic-Version': '' }), 'anthropic');
  assert.equal(detectProtocol('/v1/messages', {}), 'anthropic');
  assert.equal(
    detectProtocol('/v1/chat/completions', { 'anthropic-version': '2023-06-01' }),
    'openai'
  );
});

test('两种列表暴露相同模型 ID 并提供各自的元数据结构', () => {
  const openai = createModelList(models, 'openai');
  const anthropic = createModelList(models, 'anthropic');
  assert.deepEqual(
    openai.data.map((model) => model.id),
    anthropic.data.map((model) => model.id)
  );
  assert.equal(openai.object, 'list');
  assert.equal(openai.data[0].object, 'model');
  assert.equal(anthropic.data[0].type, 'model');
  assert.equal(Date.parse(anthropic.data[0].created_at), openai.data[0].created * 1000);
  assert.equal(anthropic.first_id, models[0].id);
  assert.equal(anthropic.last_id, models.at(-1).id);
  assert.equal(anthropic.has_more, false);
  assert.equal(createModelList([], 'anthropic').first_id, null);
  assert.equal(createModelList([], 'anthropic').last_id, null);
});

test('本地完整响应保留调用模型和文本，并以零表示未调用上游', () => {
  const openai = createTextResponse(message, 'openai');
  const anthropic = createTextResponse(message, 'anthropic');
  assert.equal(openai.choices[0].message.content, message.text);
  assert.equal(anthropic.content[0].text, message.text);
  assert.equal(openai.model, message.model);
  assert.equal(anthropic.model, message.model);
  assert.equal(openai.choices[0].finish_reason, 'stop');
  assert.equal(anthropic.stop_reason, 'end_turn');
  assert.equal(openai.usage.total_tokens, 0);
  assert.equal(anthropic.usage.input_tokens + anthropic.usage.output_tokens, 0);
});

test('OpenAI 流可按增量重新拼出完整文本，结束标记与响应 ID 一致', () => {
  const chunks = createTextChunks(message, 'openai');
  const complete = createTextResponse(message, 'openai');
  let content = '';
  let finished = false;
  let roles = 0;
  let doneMarkers = 0;

  for (const { data } of chunks) {
    if (data === '[DONE]') {
      assert.equal(finished, true);
      doneMarkers += 1;
      continue;
    }
    assert.equal(doneMarkers, 0);
    assert.equal(finished, false);
    assert.equal(data.id, complete.id);
    assert.equal(data.object, 'chat.completion.chunk');
    assert.equal(data.model, complete.model);
    assert.equal(data.created, complete.created);
    const choice = data.choices[0];
    content += choice.delta.content ?? '';
    roles += choice.delta.role === 'assistant' ? 1 : 0;
    finished = choice.finish_reason !== null;
  }

  assert.equal(content, complete.choices[0].message.content);
  assert.equal(roles, 1);
  assert.equal(doneMarkers, 1);
});

test('Anthropic 流遵循消息和内容块的生命周期，并能聚合完整响应', () => {
  const chunks = createTextChunks(message, 'anthropic');
  const complete = createTextResponse(message, 'anthropic');
  let content = '';
  let state = 'pending';
  let stopReason;

  for (const { event, data } of chunks) {
    assert.equal(event, data.type);
    switch (event) {
      case 'message_start':
        assert.equal(state, 'pending');
        assert.equal(data.message.id, complete.id);
        assert.equal(data.message.model, complete.model);
        assert.equal(data.message.stop_reason, null);
        assert.deepEqual(data.message.content, []);
        state = 'message';
        break;
      case 'content_block_start':
        assert.equal(state, 'message');
        assert.equal(data.index, 0);
        content = data.content_block.text;
        state = 'block';
        break;
      case 'content_block_delta':
        assert.equal(state, 'block');
        assert.equal(data.index, 0);
        assert.equal(data.delta.type, 'text_delta');
        content += data.delta.text;
        break;
      case 'content_block_stop':
        assert.equal(state, 'block');
        state = 'closed-block';
        break;
      case 'message_delta':
        assert.equal(state, 'closed-block');
        stopReason = data.delta.stop_reason;
        state = 'finished';
        break;
      case 'message_stop':
        assert.equal(state, 'finished');
        state = 'closed-message';
        break;
      default:
        assert.fail(`未知事件：${event}`);
    }
  }

  assert.equal(state, 'closed-message');
  assert.equal(content, complete.content[0].text);
  assert.equal(stopReason, complete.stop_reason);
});

test('最小请求校验不改写原始字段和服务专用参数', () => {
  const body = {
    model: 'example-default',
    messages: [{ role: 'user', content: '内容' }],
    stream: false,
    custom_resource: { id: 'agent-id' },
  };
  const original = structuredClone(body);
  validateChatRequest(body, models, 'openai');
  assert.deepEqual(body, original);
  validateChatRequest({ ...body, max_tokens: 0 }, models, 'anthropic');
  validateChatRequest({ ...body, max_tokens: 100 }, models, 'anthropic');
});

test('无效请求与未知模型分别报告 400 和 404', () => {
  const valid = { model: 'example-test', messages: [{ role: 'user', content: '内容' }] };
  for (const body of [null, [], {}, { ...valid, messages: [] }, { ...valid, stream: 'true' }]) {
    assert.throws(() => validateChatRequest(body, models, 'openai'), {
      statusCode: 400,
      code: 'invalid_request_error',
    });
  }
  assert.throws(() => validateChatRequest({ ...valid, model: 'missing' }, models, 'openai'), {
    statusCode: 404,
    code: 'model_not_found',
  });
  for (const maxTokens of [undefined, -1, 0.5, '100']) {
    assert.throws(
      () => validateChatRequest({ ...valid, max_tokens: maxTokens }, models, 'anthropic'),
      { statusCode: 400 }
    );
  }
});

test('错误响应保留业务错误码和消息，并采用下游协议封装', () => {
  const error = { message: '账号额度耗尽', type: 'rate_limit_error', code: 0 };
  const openai = createErrorResponse(error, 'openai', message.uid);
  const anthropic = createErrorResponse(error, 'anthropic', message.uid);
  assert.equal(openai.error.code, 0);
  assert.equal(anthropic.error.code, 0);
  assert.equal(openai.error.message, error.message);
  assert.equal(anthropic.error.message, error.message);
  assert.equal(anthropic.type, 'error');
  assert.equal(anthropic.request_id, message.uid);
  assert.equal(openai.error.param, null);
});
