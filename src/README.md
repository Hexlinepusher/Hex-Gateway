# src/

应用源码，由一个 Node.js 进程提供后端接口和前端页面。

- **[`main.js`](main.js)**：调用统一启动入口，登记停止信号并处理启动与关闭的退出状态
- **[`service.js`](service.js)**：具体服务的初始化入口，提供附加模型、消费者与执行函数；模板提供空实现，供具体服务接入
- **[`backend/`](backend/README.md)**：下游接口、模型管理、消费者调度、磁盘读写与日志
- **[`frontend/`](frontend/README.md)**：运行概览、统计重置与模型列表
