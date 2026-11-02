# 后端

后端使用 Node.js 内置 HTTP 和文件系统能力。每个函数文件承担一个命名明确的操作，目录按职责分组。

| 目录           | 入口与职责                                                                                              |
| -------------- | ------------------------------------------------------------------------------------------------------- |
| configuration/ | readConfiguration 读取启动参数并转换为毫秒配置。                                                        |
| http/          | createGatewayServer 组合模块；handleRequest 管理请求生命周期；routeRequest 分派五条路径（含空白前端）。 |
| models/        | createModelCatalog 生成固定模型与人工追加的清单。                                                       |
| protocols/     | 识别下游协议，校验基础请求，生成模型列表、文本响应、流式事件和错误结构。                                |
| concurrency/   | 消费者调度、空闲计时、取消与显式重排，详见 [调度约定](concurrency/README.md)。                          |
| storage/       | readFile、writeFile、createDirectory 执行磁盘操作。                                                     |
| testModel/     | serializeRawRequest 保留请求内容，formatHistoryTimestamp 生成时间名，saveTestRequest 排他写入。         |
| logging/       | writeLog 向输出流写入单行 JSON，默认标准输出。                                                          |
| errors/        | createGatewayError 携带状态码、业务错误码和错误类型。                                                   |

## 服务接入

src/service.js 的 createService 返回 models、consumers 和 execute。默认 models 与 consumers 为空，execute 未配置。固定的 default/test 模型由模板生成。

附加模型采用对象数组，每项包含 id，可选 displayName、created（Unix 秒）和 ownedBy。未知创建时间为 0，固定模型 ID 保留给模板。

消费者数据包含 id、可选 resourceId、available 和 busy。一个对象对应一个执行名额，多对象可共享同一 resourceId。资源管理控制 available，调度执行过程维护 busy。

execute 接收以下数据：

| 字段       | 含义                                                                 |
| ---------- | -------------------------------------------------------------------- |
| uid        | 本次下游请求的稳定内部标识。                                         |
| attempt    | 从 1 起算的执行轮次。                                                |
| consumer   | 本轮占用的消费者对象。                                               |
| request    | body、protocol、method、url、headers；body 为解析后的原始业务 JSON。 |
| signal     | 本轮执行的取消信号。                                                 |
| onActivity | 收到上游数据时调用，重置空闲计时。                                   |
| emit       | 异步写出已经转化好的下游流事件，调用方 await 完成。                  |

协议名称为 openai 或 anthropic。服务的请求转化、上游通信和响应转化分别实现，通过 execute 组合。

非流式执行返回 { body, statusCode }，body 已符合下游协议。流式执行逐个 await emit({ event, data })，完成全部终止事件后返回 { streamed: true }。event 为 Anthropic 的 SSE 事件名，OpenAI 可以省略；data 为 JSON 对象或结束标记字符串。

服务抛出的错误可使用 createGatewayError(message, { statusCode, code, type })。普通执行异常转成 502 调用失败。具体上游错误的提取和语义映射归服务实现。

服务可以将失效消费者的 available 置为 false，在实际执行结束后返回 { requeue: true }。调度仅在请求有效且响应尚未提交时重排。多个消费者共用失效账号时，由资源管理同步停用关联消费者。

运行期间新增消费者或恢复 available 后，调用返回的 scheduler.dispatch() 触发领取。createGatewayServer 返回 { server, scheduler, models }，可用于服务组合和测试。

## 请求收尾

整体期限从 HTTP 请求被接收时开始，包含读取请求体、排队、执行和交付。重新入队保留该期限。空闲期限从 execute 开始，每次 onActivity 重置；emit 和日志输出均不重置。

客户端断开和整体超时取消请求。空闲超时取消当前执行。下游等待可以先结束，busy 始终等待 execute 结算后才释放。服务需要在 signal 取消后终止实际执行或等待其真实终止，再结算 execute。

排队按 FIFO 领取，明确重排的请求回到队尾。旧轮次的 emit/onActivity 在轮次结束后失效。

## 本地行为

/health 和空白前端免鉴权。/v1/ 下的接口在 GATEWAY_API_KEY 非空时验证 Bearer 或 x-api-key；空值表示本地实验时关闭鉴权。

测试记录包含原始请求头（包括访问凭证）及请求体。文件使用进程本地时间命名，独占创建，冲突递增序号。测试返回 OK 前必须完成写入。

原始请求指 Node HTTP 层接收的方法、目标地址、HTTP 版本、按原顺序和大小写保存的头及完整 body 字节。传输层的分块编码等网络封装由 HTTP 层解析。

模型元数据的创建时间未知时为 0；本地测试响应的 token 用量为 0。模板校验基础请求字段，具体模型能力、工具与多模态内容由服务适配处理。
