# Security Policy

## Supported versions

仅公开分支的最新提交接受安全修复。历史提交和自行修改的部署不提供安全支持。

## Reporting a vulnerability

请优先使用 GitHub 的 [Private Vulnerability Reporting](https://github.com/jyxjjj/Friends-Climbing/security/advisories/new) 私密报告漏洞。不要在公开 Issue、Discussion、截图或日志中提交真实姓名、邮箱、身体指标、费用、照片、对象存储键、Cookie、身份头或访问令牌。

报告应尽量包含：受影响提交、最小复现、预期与实际结果、影响范围以及已经采取的缓解措施。请勿访问、修改或下载不属于你的团队数据。

## Trust boundaries

- 身份头只在 OpenAI Sites 托管入口清洗并注入后可信；禁止直接公开裸 Worker 端点。
- D1 保存成员、计划、记录、费用和身体数据，应由部署访问策略限制团队范围。
- R2 必须保持私有，图片读取与删除必须经过应用 API 的对象级授权。
- 浏览器草稿只允许保存非敏感字段；真实姓名、身体指标、费用和照片不得写入持久浏览器缓存。
- 所有公开仓库示例和测试数据必须是合成数据，生产数据库不得自动填充演示数据。

## Deployment hardening

- 保留 CSP、HSTS、`nosniff`、`frame-ancestors`、`no-store` 和同源资源策略。
- 不要绕过 Origin、Fetch Metadata 或 `X-Summit-Request` 写请求检查。
- 面向不可信公网上传时，接入完整图片解码、重编码、EXIF/GPS 清除、恶意文件扫描和隔离区。
- 定期运行 `npm run security:deps`，并审阅 Dependabot 或 GitHub Advisory 通知后再升级。

## Verification

```bash
npm run test:all
npm run security:deps
```

安全拒绝路径必须同时验证 HTTP 结果以及 D1/R2 零副作用。

