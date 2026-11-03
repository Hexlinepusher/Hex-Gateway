# concurrency/

进程内请求队列、原位锁定和消费者分配。

- [模板使用说明](../../../DOCUMENTS/模板使用说明.md)：消费者与执行接口
- [执行目录](../execution/README.md)：执行结果、调用计时与收尾

## 文件组织

- **[`createRequestQueue.js`](createRequestQueue.js)**：创建空队列与容量状态
- **[`createScheduler.js`](createScheduler.js)**：连接共享依赖，初始化消费者占用并绑定派发入口
- **[`enqueueRequest.js`](enqueueRequest.js)**：检查接收条件与容量，同步追加请求条目
- **[`dispatchRequests.js`](dispatchRequests.js)**：匹配请求与消费者，登记完成 Promise 后启动执行
- **[`findNextQueueEntry.js`](findNextQueueEntry.js)**：查询最早的未锁定、未终结请求
- **[`findAvailableConsumer.js`](findAvailableConsumer.js)**：查询空闲且可用的消费者
- **[`lockRequest.js`](lockRequest.js)**：递增轮数，创建本轮状态并建立双方锁定引用
- **[`unlockRequest.js`](unlockRequest.js)**：清除仍指向本轮的请求锁定引用
- **[`removeQueueEntry.js`](removeQueueEntry.js)**：移除指定队列条目
- **[`releaseConsumer.js`](releaseConsumer.js)**：清除仍指向本轮的消费者占用
- **[`getCurrentExecutions.js`](getCurrentExecutions.js)**：取得仍占用消费者的执行快照
- **[`clearRequestQueue.js`](clearRequestQueue.js)**：同步清空队列，返回待终结条目
