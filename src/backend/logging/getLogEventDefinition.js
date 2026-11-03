const eventDefinitions = {
  'gateway.started': ['INFO', '启动成功，开始监听 ${address}:${port}'],
  'gateway.start_failed': ['ERROR', '启动失败：${reason}'],
  'gateway.stopping': ['INFO', '进程停止中'],
  'gateway.stopped': ['INFO', '进程已停止'],
  'gateway.stop_failed': ['ERROR', '停止失败：${reason}'],
  'request.queued': ['INFO', '新请求${uid}：${protocol}|${model}'],
  'execution.started': ['INFO', '消费者${consumerId}：请求${uid}（第${attempt}轮）开始执行'],
  'execution.completed': ['INFO', '消费者${consumerId}：请求${uid}（第${attempt}轮）执行完成'],
  'execution.safefinished': ['INFO', '消费者${consumerId}已完成被取消的请求${id}'],
  'execution.failed': [
    'WARN',
    '消费者${consumerId}：请求${uid}（第${attempt}轮）执行失败：${reason}；${action}',
  ],
  'execution.unkownresult': [
    'WARN',
    '消费者${consumerId}：请求${uid}（第${attempt}轮）收到未知响应：${code} ${status}',
  ],
  'request.rejected': ['WARN', '请求${uid}被拒绝：${reason}'],
  'request.terminated': ['WARN', '请求${uid}提前结束：${reason}'],
  'consumer.available': ['INFO', '消费者${consumerId}已可用'],
  'consumer.unavailable': ['WARN', '消费者${consumerId}已不可用：${reason}'],
  'test.saved': ['INFO', '已将测试请求${uid}保存至${path}'],
  'test.save_failed': ['ERROR', '测试请求${uid}保存失败：${reason}'],
  'stats.reset': ['INFO', '${metric}已重置'],
};

export default function getLogEventDefinition(event) {
  if (!Object.hasOwn(eventDefinitions, event)) {
    throw new Error(`未知日志事件：${event}`);
  }
  const [level, messageTemplate] = eventDefinitions[event];
  return { level, messageTemplate };
}
