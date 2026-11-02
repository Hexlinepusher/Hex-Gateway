import readConfiguration from './backend/configuration/readConfiguration.js';
import createGatewayServer from './backend/http/createGatewayServer.js';
import writeLog from './backend/logging/writeLog.js';
import createService from './service.js';

const configuration = readConfiguration();
const service = createService(configuration);
const { server } = createGatewayServer({ configuration, ...service });

server.on('error', (error) => {
  writeLog('error', '服务启动失败', { message: error.message });
  process.exitCode = 1;
});
server.listen(configuration.port, '0.0.0.0', () => {
  writeLog('info', '网关已启动', { address: '0.0.0.0', port: configuration.port });
});
