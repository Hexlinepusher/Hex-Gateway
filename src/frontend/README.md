# frontend/

原生 HTML、CSS 和 JavaScript 实现的单页控制台，展示运行概览与模型列表。

- [模板使用说明](../../DOCUMENTS/模板使用说明.md#控制台)：页面使用、统计范围与刷新方式

## 文件组织

- **[`index.html`](index.html)**：页面结构与模块入口
- **[`styles.css`](styles.css)**：概览、模型列表和窄屏样式
- **[`main.js`](main.js)**：建立页面状态，连接按钮并启动首次读取与定时刷新
- **[`startOverviewRefresh.js`](startOverviewRefresh.js)**：每 5 秒在概览操作空闲时发起读取
- **[`runOverviewOperation.js`](runOverviewOperation.js)**：顺序运行概览读取和重置操作
- **[`refreshOverview.js`](refreshOverview.js)**：读取并更新概览，失败时显示提示
- **[`resetOverviewMetric.js`](resetOverviewMetric.js)**：禁用对应按钮，顺序执行重置并更新概览
- **[`requestOverview.js`](requestOverview.js)**：请求运行概览
- **[`requestModelList.js`](requestModelList.js)**：请求控制台模型清单
- **[`requestMetricReset.js`](requestMetricReset.js)**：提交指定指标的重置请求
- **[`renderOverview.js`](renderOverview.js)**：更新服务名、容量与统计值
- **[`renderModelList.js`](renderModelList.js)**：按模型 ID 更新列表
- **[`formatDuration.js`](formatDuration.js)**：格式化耗时与无样本占位
- **[`formatSuccessRate.js`](formatSuccessRate.js)**：格式化成功率与无样本占位
