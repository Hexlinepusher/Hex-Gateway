# 技术栈

应用使用 JavaScript 与 Node.js 内置能力，第三方依赖用于开发检查。

## 应用框架

- **JavaScript / ES Modules**：应用语言与模块系统
- **Node.js 22.21.1 及兼容的 Node.js 22 版本**：运行环境，单进程提供 HTTP 服务
- **Docker / Docker Compose**：镜像构建、容器启动、环境变量传入与本地数据挂载

## 前端

采用原生 HTML、CSS 和 JavaScript 实现最简 SPA，入口为 [src/frontend/index.html](../src/frontend/index.html)。页面提供运行概览、三个统计指标的独立重置和模型列表；概览每 5 秒刷新。

## 后端

- **`node:http`**：下游 HTTP 接口、前端页面及 SSE 流式响应
- **`node:fs/promises`**：统一的文件读取、写入与目录创建
- **`node:crypto`**：通过 `randomUUID` 生成内部请求标识
- **`AbortController` / `AbortSignal` / 定时器**：执行控制信号与超时计时
- **标准输出**：统一输出运行日志，通过终端或 Docker 日志查看
- **进程环境变量**：通过 `--env-file-if-exists=.env` 加载本地启动配置

具体服务的入口与接口见[模板使用说明](模板使用说明.md)，源文件导航见[后端索引](../src/backend/README.md)。

## 开发时工具

- **npm**：依赖安装、锁文件与项目命令
- **ESLint**：`@eslint/js` 提供基础规则，`eslint-plugin-import` 检查导入，`globals` 声明运行环境
- **Prettier**：源码与文档格式化
- **`node:test` / `node:assert/strict`**：基础测试与断言
- **GitHub Actions**：检查工作区骨架文件是否存在

具体命令见[命令说明](Commands.md)。
