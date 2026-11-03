# Hex-Gateway

本地实验性代理网关模板，采用 Web 前端与 JavaScript 后端，用于接入不同上游服务并比较使用体验。

## 文档索引

- [技术栈](DOCUMENTS/TechStack.md)
- [命令说明](DOCUMENTS/Commands.md)
- [模板使用说明](DOCUMENTS/模板使用说明.md)
- [适配需求清单](DOCUMENTS/适配需求清单.md)
- [源码索引](src/README.md)
- [工作区规范](CLAUDE.md)

## 快速开始

在项目根目录的 `.env` 中填写配置，变量见 [.env.example](.env.example)。

Docker 启动：

```powershell
docker compose up --build -d
```

Node.js 22.21.1 或兼容的 Node.js 22 版本启动：

```powershell
npm ci
npm start
```

启动后访问 `http://localhost:8800` 查看控制台；修改端口后使用对应地址。

## 工作区结构

```text
@/
├── .docs/                  # 维护者文档
│   ├── wanto/              # 原始需求
│   ├── design/             # 方案设计
│   ├── plan/               # 执行计划
│   ├── history/            # 完成记录
│   ├── references/         # 参考资料
│   └── trashcan/           # 待清理内容
│
├── DOCUMENTS/              # 使用者文档
│   ├── TechStack.md        # 技术栈
│   ├── Commands.md         # 命令说明
│   ├── 适配需求清单.md      # 检查上游形态差异
│   └── 模板使用说明.md      # 指导上游服务接入
│
├── src/                    # 应用源码
│   ├── backend/            # 后端公共模块
│   ├── frontend/           # 前端页面
│   │   ├── index.html      # 运行概览与模型列表
│   │   └── README.md       # 前端源码索引
│   ├── main.js             # 启动入口
│   ├── service.js          # 具体服务接入
│   └── README.md           # 源码索引
├── data/                   # 本地运行数据
│   └── README.md           # 数据目录说明
├── test/                   # 基础测试
│   ├── basic.test.js       # 统一基础回归
│   └── README.md           # 测试说明
│
├── .env                    # 本地启动配置
├── .env.example            # 启动配置示例
├── compose.yaml            # 容器编排
├── Dockerfile              # 镜像构建
├── .dockerignore           # 构建上下文忽略规则
│
├── package.json            # Node 项目配置
├── package-lock.json       # 依赖锁定
├── eslint.config.js        # ESLint 配置
├── .prettierrc.cjs         # Prettier 配置
├── .prettierignore         # 格式检查忽略规则
├── .editorconfig           # 编辑器配置
│
├── .github/workflows/      # GitHub Actions
├── .gitattributes          # Git 文件属性
├── .gitignore              # Git 忽略规则
├── CLAUDE.md               # 工作区规范
├── CHANGELOG.md            # 变更日志
├── README.md               # 项目自述
└── LICENSE                 # 许可证
```

## 许可证

本项目根据 GPL-2.0-only 许可证授权，详细内容请参阅 [LICENSE](LICENSE) 文件。
