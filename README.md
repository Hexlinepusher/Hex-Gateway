# Hex-Gateway

用于本地实验的轻量 JavaScript 代理网关模板。后端监听 0.0.0.0，前端保留空白页面。

main 保存已确认的[设计约定](.docs/design/后端模块划分.md)和最小应用基线，dev 实现模板公共能力。具体服务通过 [src/service.js](src/service.js) 提供模型映射、上游资源与实际调用。

## 启动

使用 Node.js 22.21.1 或兼容的 Node.js 22 版本，在项目根目录执行：

```powershell
npm ci
npm start
```

配置可参考 .env.example，在项目根目录的 .env 中填写或修改。npm run dev 使用 Node 的文件监听模式。

Docker 启动命令：

```powershell
docker compose up --build -d
```

容器通过环境变量接收启动配置，data/ 挂载到容器的 /app/data。前端访问 http://localhost:3000/，端口由 PORT 决定。

## 配置

| 变量                          | 默认值  | 含义                                                      |
| ----------------------------- | ------- | --------------------------------------------------------- |
| PORT                          | 3000    | 监听 0.0.0.0 的端口。                                     |
| GATEWAY_API_KEY               | 空      | 非空时，/v1/ 接口验证 Bearer 或 x-api-key；空值关闭鉴权。 |
| UPSTREAM_SERVICE_NAME         | gateway | 固定模型的服务名前缀。                                    |
| REQUEST_IDLE_TIMEOUT_SECONDS  | 300     | 上游执行期间相邻两次数据之间的最大间隔。                  |
| REQUEST_TOTAL_TIMEOUT_SECONDS | 600     | 请求从被接收到交付完成的整体期限，包含排队。              |

超时值使用秒，可配置小数，必须为正数并处于 Node 定时器可表示的范围内。默认模型为 gateway-default 和 gateway-test。

## 接口

| 方法与路径                | 行为                                                               |
| ------------------------- | ------------------------------------------------------------------ |
| GET /                     | 空白 HTML 页面。                                                   |
| GET /health               | 网关自身的运行状态，免鉴权。                                       |
| GET /v1/models            | 带 anthropic-version 头返回 Anthropic 格式，否则返回 OpenAI 格式。 |
| POST /v1/chat/completions | OpenAI Chat Completions 格式。                                     |
| POST /v1/messages         | Anthropic Messages 格式。                                          |

两个对话接口通过 stream 选择完整 JSON 或 SSE 响应。每个请求生成独立 UID，并通过 x-request-id 响应头返回。

<服务名>-test 保存请求后返回 OK；记录位于 data/test_history/YYYY-MM-DD-HH-mm-ss.txt，同秒冲突递增序号。记录保留原始请求头与请求体，包括调用方传入的访问凭证。data/ 默认不进入 Git。

<服务名>-default 进入消费者队列。模板启动时消费者为空，因此会等待至整体超时并返回 504；接入具体服务后由消费者执行。模型列表、健康检查和测试模型始终在本地完成。

## 服务适配

[src/service.js](src/service.js) 是服务组合入口，返回：

- models：人工添加的模型条目；固定的 default/test 由模板提供。
- consumers：逻辑执行名额，一个账号可提供多个名额。
- execute：组合请求转化、上游调用与响应转化的异步函数。

执行上下文、取消、流式事件、消费者状态及显式重排的完整约定见 [后端说明](src/backend/README.md)。

## 检查

```powershell
npm run lint:check
npm run form:check
npm test
```

测试使用 Node.js 内置测试工具和模拟消费者，覆盖本地 HTTP 接口、两种协议、并发、超时、取消、重排及原始请求记录。测试样本保存到隔离的临时目录。

## 工作区

| 路径                                            | 内容                                  |
| ----------------------------------------------- | ------------------------------------- |
| src/                                            | [源码入口和模块索引](src/README.md)。 |
| data/                                           | 运行数据与测试模型请求历史。          |
| test/                                           | 行为测试。                            |
| .docs/design/                                   | 已确认设计。                          |
| DOCUMENTS/                                      | 项目公开文档预留目录。                |
| .env.example                                    | 启动配置示例。                        |
| compose.yaml、Dockerfile                        | Docker 启动。                         |
| package.json、eslint.config.js、.prettierrc.cjs | Node.js 项目、检查与格式配置。        |

## 许可证

本项目使用 [GPL-2.0-only](LICENSE)。
