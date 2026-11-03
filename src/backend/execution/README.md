# execution/

一轮消费者执行及其上游调用计时、结果处理和收尾。

- [模板使用说明](../../../DOCUMENTS/模板使用说明.md)：服务执行接口与返回结果
- [队列目录](../concurrency/README.md)：请求顺序与消费者占用

## 文件组织

- **[`executeRequest.js`](executeRequest.js)**：调用服务，处理执行结果并交给收尾入口
- **[`isExecutionActive.js`](isExecutionActive.js)**：检查结束状态和请求、消费者的本轮引用
- **[`validateExecutionResult.js`](validateExecutionResult.js)**：检查服务返回的结果分类及终态响应结构
- **[`createExecutionFailure.js`](createExecutionFailure.js)**：将未处理的内部异常转换为失败结果
- **[`decideRequestDisposition.js`](decideRequestDisposition.js)**：决定终结、原位重试或关闭交接
- **[`finishExecution.js`](finishExecution.js)**：组织一次收尾，清理占用、记录统计与日志并交付响应
- **[`writeExecutionResultLog.js`](writeExecutionResultLog.js)**：按实际结果与请求去向提交唯一结束事件
- **[`startUpstreamCallTracking.js`](startUpstreamCallTracking.js)**：登记一次上游调用并启动两项计时
- **[`refreshUpstreamIdleTimeout.js`](refreshUpstreamIdleTimeout.js)**：替换一次调用的空闲计时
- **[`recordUpstreamData.js`](recordUpstreamData.js)**：记录本轮首次数据，刷新该次调用的空闲计时
- **[`reportUpstreamTimeout.js`](reportUpstreamTimeout.js)**：结算到期计时并通知服务
- **[`reportTimeoutCallbackError.js`](reportTimeoutCallbackError.js)**：保存首次回调错误，并通知正在等待的上游操作失败
- **[`finishUpstreamCallTracking.js`](finishUpstreamCallTracking.js)**：结束调用跟踪、清理计时并解除登记
