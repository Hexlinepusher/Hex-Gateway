# Hex-Gateway

轻量 JavaScript 本地应用空架子。后端监听 `0.0.0.0:{PORT}`，返回空白 HTML 页面。

## 启动

在项目根目录执行：

```powershell
npm ci
npm start
```

端口读取根目录的 `.env`，默认 `3000`。也可以执行 `docker compose up --build -d` 使用 Docker 启动。

## 工作区结构

```text
@/
├── .docs/
├── .github/workflows/
├── DOCUMENTS/
│   ├── Commands.md
│   └── TechStack.md
├── src/
│   ├── frontend/
│   │   └── index.html
│   └── main.js
├── data/
├── test/
├── .env.example
├── .env
├── compose.yaml
├── Dockerfile
├── .dockerignore
├── package.json
├── package-lock.json
├── eslint.config.js
├── .prettierrc.cjs
├── .prettierignore
├── .editorconfig
├── .gitattributes
├── .gitignore
├── CLAUDE.md
├── CHANGELOG.md
├── README.md
└── LICENSE
```

`main.js` 是后端入口，`frontend/index.html` 是空白页。`data/` 和 `test/` 为预留目录。

## 许可证

本项目根据 GPL-2.0-only 许可证授权，详细内容请参阅 [LICENSE](LICENSE) 文件。
