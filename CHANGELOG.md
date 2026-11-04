# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

### Changed

- 测试模型统一命名为 `[${服务名}]Gateway-Test`。
- 测试请求记录中的 JSON 正文按 2 个空格缩进，直接显示 Unicode 字符，保留必要的字符串转义和原始请求头。
- 运行概览的耗时以秒显示，统计日期提示统一为 `UTC0:00更新`。
- Docker 镜像名称随 Compose 项目名生成。

### Deprecated

### Removed

- 自动内置的 `<服务名>-default` 模型；普通模型由具体服务显式提供。

### Fixed

- 将未纳入版本控制的本地设计文档引用改为路径说明，避免发布后的失效链接。

### Security
