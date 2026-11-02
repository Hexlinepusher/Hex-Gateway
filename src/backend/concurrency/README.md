# 消费者调度

本目录管理内存请求队列和执行轮次。消费者与凭证/账号的对应关系、可用性和实际网络调用由服务适配提供。

## 入口

| 文件                       | 职责                                         |
| -------------------------- | -------------------------------------------- |
| createScheduler.js         | 建立调度状态并绑定派发入口。                 |
| enqueueRequest.js          | 创建请求任务、绑定取消信号并进入队列。       |
| dispatchRequests.js        | 按队列顺序把任务派发给空闲且可用的消费者。   |
| executeRequest.js          | 管理单次执行、执行结果和消费者占用的结束。   |
| refreshIdleTimeout.js      | 根据上游活动更新本轮空闲期限。               |
| emitChunk.js               | 过滤失效轮次的输出并转交下游写出。           |
| isAttemptActive.js         | 判断回调是否属于仍然有效的执行轮次。         |
| enforceRequestDeadline.js  | 在派发和回调时检查原始整体截止时间。         |
| cancelRequest.js           | 移除排队任务、结束等待并通知当前执行取消。   |
| settleRequest.js           | 完成一次请求结果结算并解绑请求监听。         |
| normalizeExecutionError.js | 将无 HTTP 状态的执行异常表达为上游调用失败。 |

## 调度状态

createScheduler 接收 consumers、execute、idleTimeoutMs 和 log。

consumers 是由服务适配持有的对象数组。每个消费者具有 id、available 和 busy 字段，可附带 resourceId 等资源标识。available 为 false 时停止领取新请求；busy 由调度流程在执行期间维护。服务适配更新可用状态后调用 dispatchRequests。

所有需要上游执行的请求先入队。空闲消费者按先入先出的顺序领取请求。消费者在 execute 返回的 Promise 结算后释放，即使下游等待已因取消或超时提前结束。

## 请求任务

enqueueRequest 接收 uid、deadline、signal、request 和 onChunk，返回执行结果 Promise。

- uid：请求整个生命周期内保持不变的内部标识。
- deadline：从请求接受时计算的整体截止时间，使用毫秒时间戳。
- signal：请求生命周期的取消信号，HTTP 层负责整体计时与客户端断开。
- request：交给具体服务的请求上下文。
- onChunk：接收已转换成下游格式的流式块和本轮 AbortSignal，返回写出完成的 Promise；等待背压时响应取消信号。

排队请求在取消时移除。调度过程也会在派发、活动通知和写出前检查 deadline。整体期限由 HTTP 层持续计时，排队时间包含在该期限内。

## 服务执行约定

execute 接收以下上下文：

| 字段       | 含义                                     |
| ---------- | ---------------------------------------- |
| uid        | 原来的请求标识。                         |
| attempt    | 从 1 开始递增的执行轮次。                |
| consumer   | 本轮占用的消费者。                       |
| request    | 原始传入的请求上下文。                   |
| signal     | 本轮取消信号，服务应据此终止上游操作。   |
| onActivity | 收到上游响应数据时调用，重置空闲期限。   |
| emit       | 异步转交下游协议块，适配器等待写出完成。 |

emit 接收 { event, data }。event 用于有事件名称的 SSE 协议，data 可以是 JSON 对象或结束标记字符串。第一次有效 emit 将请求标记为已提交响应。下游写出本身不刷新上游空闲期限。

非流式执行返回 { body, statusCode }，流式执行完成后返回 { streamed: true }。结果的协议结构由服务适配负责。

服务适配可以停用消费者后返回 { requeue: true }。满足期限、连接及未提交响应等条件时，请求进入队列尾部，保留 uid 和 deadline。重排后的回调使用新的 attempt，旧轮次回调失效。

显式重排在下一轮事件循环继续派发，使外部取消与整体超时能够及时处理。普通异常只结束当前请求。服务适配自行决定资源失效、重试和回退策略。

## 日志

log 的参数为 level、event、details。调度记录入队、执行、重排与取消事件，附加 requestId、attempt 和 consumerId 等关联信息。
