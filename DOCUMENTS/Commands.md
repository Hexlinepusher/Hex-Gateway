# 命令速查

Hex-Gateway 的常用命令以 [package.json](../package.json) 为准，启动配置见 [.env.example](../.env.example)。以下命令在项目根目录执行。

## 启动

### Docker

```powershell
docker compose up --build -d # 构建并后台启动，data/ 挂载至容器的 /app/data
docker compose logs -f gateway # 持续查看网关日志
docker compose stop # 停止服务，一直等待网关收尾
docker compose kill gateway # 手动强制结束，跳过尚未完成的收尾
```

### Node.js

```powershell
npm ci # 按锁文件安装依赖
npm start # 常规启动，与开发启动二选一，Ctrl+C 等待收尾后停止
npm run dev # 开发启动，监听源码变化并自动重启，Ctrl+C 停止
```

## 检查

```powershell
npm run form:check # 检查代码与文档格式
npm run lint:check # 运行 ESLint 检查
npm test # 运行基础测试，临时数据位于 .docs/trashcan/basic-test-*，按需清理
Invoke-RestMethod -Uri 'http://localhost:${port}/health' # 将 ${port} 替换为配置的端口，正常时 status 为 ok
```

## 修复

```powershell
npm run form:fix # 运行 Prettier 格式化
npm run lint:fix # 修复 ESLint 可修复问题
```
