import getLogEventDefinition from './getLogEventDefinition.js';

export default function formatLogLine(event, parameters, date = new Date()) {
  const { level, messageTemplate } = getLogEventDefinition(event);
  const message = messageTemplate.replace(/\$\{([^}]+)\}/g, (_placeholder, parameter) => {
    if (!Object.hasOwn(parameters, parameter) || parameters[parameter] == null) {
      throw new Error(`日志事件${event}缺少参数：${parameter}`);
    }
    return String(parameters[parameter]);
  });
  const escapedMessage = message.replace(/\r/g, '\\r').replace(/\n/g, '\\n');
  return `[${date.toISOString()}] [${level}] [${event}] ${escapedMessage}\n`;
}
