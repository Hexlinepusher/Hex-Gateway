# backend/

代理网关的公共后端，提供下游接口、模型管理、消费者调度、磁盘读写和日志。

- [模板使用说明](../../DOCUMENTS/模板使用说明.md)：具体服务的入口、模型、消费者与执行接口
- [适配需求清单](../../DOCUMENTS/适配需求清单.md)：由上游服务形态决定的设计问题

## 文件组织

### lifecycle/ — 启动与生命周期

- **[`startGateway.js`](lifecycle/startGateway.js)**：创建共享状态，等待服务初始化、接通消费者通知并开始监听；启动失败时等待资源与日志收尾

- **[`stopGateway.js`](lifecycle/stopGateway.js)**：组织执行、队列、HTTP、测试保存、资源与日志收尾，重复调用共用完成结果
- **[`registerShutdownSignals.js`](lifecycle/registerShutdownSignals.js)**：登记进程停止信号，关闭失败时设置退出状态
- **[`waitForExecutions.js`](lifecycle/waitForExecutions.js)**：等待执行快照中的全部轮次，返回各自完成结果
- **[`waitForTestRecords.js`](lifecycle/waitForTestRecords.js)**：等待已登记测试任务，返回各自完成结果
- **[`recordShutdownFailure.js`](lifecycle/recordShutdownFailure.js)**：收集关闭步骤错误并记录停止失败事件

### configuration/ — 启动配置

- **[`readConfiguration.js`](configuration/readConfiguration.js)**：读取并校验启动参数，将超时秒数转换为毫秒

### http/ — 下游接口

- **[`createGatewayServer.js`](http/createGatewayServer.js)**：创建 HTTP 服务器，登记连接与活动响应
- **[`observeHttpConnections.js`](http/observeHttpConnections.js)**：记录连接的活动响应，关闭期间在全部响应结束后断开连接
- **[`closeInactiveConnections.js`](http/closeInactiveConnections.js)**：断开没有活动响应的连接
- **[`closeHttpServer.js`](http/closeHttpServer.js)**：停止接收连接，等待 HTTP 关闭
- **[`listenGatewayServer.js`](http/listenGatewayServer.js)**：等待 HTTP 监听成功或失败，解除本次启动监听
- **[`handleRequest.js`](http/handleRequest.js)**：管理请求路由、错误、日志及响应收尾
- **[`createRequestContext.js`](http/createRequestContext.js)**：创建请求 UID、接收时刻、连接引用和下游取消状态
- **[`observeDownstreamConnection.js`](http/observeDownstreamConnection.js)**：登记连接中断监听，返回解除监听入口
- **[`cancelDownstreamRequest.js`](http/cancelDownstreamRequest.js)**：标记下游取消、清除队列条目并停止下游读写
- **[`recordRequestTermination.js`](http/recordRequestTermination.js)**：记录首次提前终结的原因与日志
- **[`routeRequest.js`](http/routeRequest.js)**：按路径和方法分派接口
- **[`authorizeRequest.js`](http/authorizeRequest.js)**：验证下游 API Key
- **[`handleConsoleRequest.js`](http/handleConsoleRequest.js)**：查询概览与模型清单，重置指定统计指标
- **[`serveFrontendAsset.js`](http/serveFrontendAsset.js)**：读取并交付前端页面、JavaScript 和 CSS
- **[`handleChatRequest.js`](http/handleChatRequest.js)**：分派本地测试模型或将请求加入执行队列
- **[`readRequestBody.js`](http/readRequestBody.js)**：收集请求体原始字节，处理取消和读取错误
- **[`parseRequestBody.js`](http/parseRequestBody.js)**：解析 JSON，将解析失败转换为请求错误
- **[`sendJson.js`](http/sendJson.js)**：写出 JSON 响应与 HTTP 状态
- **[`sendTextResponse.js`](http/sendTextResponse.js)**：按下游协议和流式选项发送本地文本响应
- **[`deliverStreamEvent.js`](http/deliverStreamEvent.js)**：过滤过期、取消或关闭中的输出，交付本轮流事件
- **[`sendExecutionResult.js`](http/sendExecutionResult.js)**：交付已确定的终态响应，自行处理尾部写出错误
- **[`sendError.js`](http/sendError.js)**：写出协议对应的错误响应或流内错误
- **[`sendShutdownResponse.js`](http/sendShutdownResponse.js)**：记录关闭终结并写出关闭响应
- **[`serializeStreamChunk.js`](http/serializeStreamChunk.js)**：将事件名称和数据序列化为 SSE 文本
- **[`writeStreamChunk.js`](http/writeStreamChunk.js)**：写出 SSE 数据，等待背压时响应取消
- **[`waitForOperation.js`](http/waitForOperation.js)**：等待异步操作，在取消时结束等待
- **[`waitForResponseFinish.js`](http/waitForResponseFinish.js)**：等待响应交付或连接关闭，清理本次监听

### protocols/ — 下游协议

- **[`detectProtocol.js`](protocols/detectProtocol.js)**：根据路径和请求头识别协议
- **[`validateChatRequest.js`](protocols/validateChatRequest.js)**：检查 JSON 对象、非空模型 ID 和流式开关
- **[`createModelList.js`](protocols/createModelList.js)**：生成协议对应的模型列表
- **[`createTextResponse.js`](protocols/createTextResponse.js)**：生成非流式文本响应
- **[`createTextChunks.js`](protocols/createTextChunks.js)**：生成文本流事件与结束标记
- **[`createErrorResponse.js`](protocols/createErrorResponse.js)**：生成协议对应的错误结构

### models/ — 模型管理

- **[`createModelCatalog.js`](models/createModelCatalog.js)**：合并动态测试模型 `[${服务名}]Gateway-Test` 与服务显式提供的普通模型，校验 ID 并补齐元数据

- **[`findModel.js`](models/findModel.js)**：按模型 ID 查询清单

### concurrency/ — 消费者调度

- **[`README.md`](concurrency/README.md)**：请求入队、容量检查、原位锁定与消费者分配

### execution/ — 执行与收尾

- **[`README.md`](execution/README.md)**：服务执行、每次调用的双超时、结果分类与收尾

### console/ — 控制台数据

- **[`createOverview.js`](console/createOverview.js)**：组合服务名、队列、消费能力与统计汇总，生成运行快照

### statistics/ — 统计状态

- **[`getStatisticsDates.js`](statistics/getStatisticsDates.js)**：计算指定时刻对应的 UTC 今天与前两天
- **[`createStatistics.js`](statistics/createStatistics.js)**：创建三个日期的结果、延迟和耗时初值
- **[`updateStatisticsWindow.js`](statistics/updateStatisticsWindow.js)**：对齐 UTC 今天与前两天，保留窗口内数据
- **[`recordExecutionStatistics.js`](statistics/recordExecutionStatistics.js)**：按执行结束日期记录本轮结果、延迟和耗时

- **[`summarizeStatistics.js`](statistics/summarizeStatistics.js)**：按三天总量和各自样本数计算两个平均值与成功率
- **[`resetStatisticsMetric.js`](statistics/resetStatisticsMetric.js)**：校准日期窗口，清空指定指标并返回日志名称

### storage/ — 磁盘读写

- **[`readFile.js`](storage/readFile.js)**：读取文件并返回字节数据
- **[`writeFile.js`](storage/writeFile.js)**：写入文件，支持独占创建
- **[`createDirectory.js`](storage/createDirectory.js)**：创建目录及其缺失的父目录

### testModel/ — 测试模型

- **[`createTestRequestSnapshot.js`](testModel/createTestRequestSnapshot.js)**：复制独立于 HTTP 连接的请求保存数据
- **[`handleTestRequest.js`](testModel/handleTestRequest.js)**：登记测试任务，先响应再异步保存并记录结果
- **[`formatHistoryTimestamp.js`](testModel/formatHistoryTimestamp.js)**：用本地时间生成历史文件时间名
- **[`formatTestRequestBody.js`](testModel/formatTestRequestBody.js)**：将 JSON 正文格式化为 2 个空格缩进的 UTF-8 内容，解析失败时保留原字节
- **[`serializeTestRequest.js`](testModel/serializeTestRequest.js)**：将独立快照序列化为请求记录，保留请求行与请求头，使用格式化后的正文
- **[`saveTestRequest.js`](testModel/saveTestRequest.js)**：保存测试请求，文件名冲突时递增序号

### logging/ — 统一日志

- **[`createLogOutput.js`](logging/createLogOutput.js)**：建立输出完成状态与首次错误记录，接收输出流错误
- **[`getLogEventDefinition.js`](logging/getLogEventDefinition.js)**：查询事件的固定级别与说明模板
- **[`formatLogLine.js`](logging/formatLogLine.js)**：填充参数，生成带 UTC 时间的单行文本
- **[`writeLog.js`](logging/writeLog.js)**：提交事件日志并隔离格式化与输出错误
- **[`writeLogLine.js`](logging/writeLogLine.js)**：登记并提交一次写入，跟踪其完成结果
- **[`reportLogFailure.js`](logging/reportLogFailure.js)**：保存首次日志错误，仅提交一次标准错误诊断
- **[`waitForLogWrites.js`](logging/waitForLogWrites.js)**：等待日志及诊断写出，返回首次错误
- **[`releaseLogOutput.js`](logging/releaseLogOutput.js)**：解除本份日志状态登记的输出流监听，保留共享流及其他监听

### errors/ — 错误

- **[`createGatewayError.js`](errors/createGatewayError.js)**：创建携带 HTTP 状态码、业务错误码和错误类型的错误
