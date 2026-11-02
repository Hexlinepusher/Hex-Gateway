import createTextResponse from './createTextResponse.js';

export default function createTextChunks({ uid, model, text, created }, protocol) {
  if (protocol === 'anthropic') {
    const message = createTextResponse({ uid, model, text, created }, protocol);
    return [
      {
        event: 'message_start',
        data: {
          type: 'message_start',
          message: { ...message, content: [], stop_reason: null },
        },
      },
      {
        event: 'content_block_start',
        data: {
          type: 'content_block_start',
          index: 0,
          content_block: { type: 'text', text: '' },
        },
      },
      {
        event: 'content_block_delta',
        data: { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } },
      },
      {
        event: 'content_block_stop',
        data: { type: 'content_block_stop', index: 0 },
      },
      {
        event: 'message_delta',
        data: {
          type: 'message_delta',
          delta: { stop_reason: 'end_turn', stop_sequence: null },
          usage: { output_tokens: 0 },
        },
      },
      { event: 'message_stop', data: { type: 'message_stop' } },
    ];
  }

  const chunk = {
    id: `chatcmpl-${uid}`,
    object: 'chat.completion.chunk',
    created,
    model,
  };
  return [
    {
      data: {
        ...chunk,
        choices: [{ index: 0, delta: { role: 'assistant', content: '' }, finish_reason: null }],
      },
    },
    {
      data: {
        ...chunk,
        choices: [{ index: 0, delta: { content: text }, finish_reason: null }],
      },
    },
    {
      data: {
        ...chunk,
        choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
      },
    },
    { data: '[DONE]' },
  ];
}
