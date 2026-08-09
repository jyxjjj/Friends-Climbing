# Friends Climbing · 山行账本

Friends Climbing 是一个面向小型登山团队的成员、出行计划、完成记录、AA 费用、身体数据、照片和统计看板应用。前端使用 React 与 Material UI，服务端运行在 Cloudflare Workers 兼容环境，数据存入 D1，照片存入私有 R2。

> 本仓库公开分支不包含任何真实团队数据。测试夹具均为明显标记的合成数据；生产数据库首次启动时保持为空，不会自动写入演示成员、身体指标或行程。

## 主要能力

- 成员档案、体重/体脂趋势和个人里程统计
- 爬山计划、路线复用以及从计划生成完成记录
- 精确到分的 AA 费用结算与转账建议
- 四类照片上传、备注、筛选和批量下载
- 团队统计看板与成员排行榜
- JSON、SpreadsheetML/Excel 和图片 ZIP 导出
- 服务端对象级权限、同源写入校验和私有缓存策略

## 技术栈

- React 19、Next.js 16、Vinext、Vite
- Material UI 与 MUI X Charts
- Cloudflare Workers、D1、R2
- Drizzle ORM、Zod
- Vitest、Testing Library、fast-check、Cloudflare Workers 测试池

## 安全边界

本应用依赖 OpenAI Sites 托管入口注入并清洗身份头。不要把生成的 Worker 端点直接暴露到公网，也不要在其他代理后盲目信任 `oai-authenticated-user-email`。计划和记录的创建者权限由服务端逐请求验证；图片对象保存在私有 R2，并通过授权 API 下载。

身体指标、真实姓名、费用和照片均属于敏感数据。公开部署前请配置 Sites 访问策略，并阅读 [SECURITY.md](SECURITY.md)。当前图片入口会验证类型、魔数、结构、尺寸和配额；面向不可信公网用户时，仍建议增加独立的完整解码、重编码、EXIF/GPS 清除与恶意文件扫描服务。

## 本地准备

要求：

- Node.js `>=22.13.0`
- npm 11
- Linux 环境中的 `flock`、`curl` 和 GNU `timeout`

安装依赖：

```bash
npm ci
```

运行前端开发服务器：

```bash
npm run dev
```

本地直接请求 API 不会获得虚构登录身份。完整的身份与存储联调应在受控 Sites 预览环境中完成，或在 Workers 集成测试中显式注入测试身份。

## 数据与迁移

`.openai/hosting.json` 只声明逻辑绑定，不包含生产项目 ID：

- D1：`DB`
- R2：`BUCKET`

版本化 SQL 位于 `drizzle/`。测试使用 `wrangler.test.jsonc` 中的全零本地数据库占位 ID，且明确禁用远程绑定；它不会指向生产资源。

## 质量门禁

```bash
npm run typecheck
npm run lint -- --max-warnings=0
npm run test:coverage
npm run test:worker
npm run test:artifact
npm run security:deps
```

`npm run test:all` 会依次执行类型检查、Lint、单元/属性测试覆盖率、Workers/D1/R2 隔离测试、生产构建和产物烟雾测试。GitHub Actions 使用只读仓库权限运行同一门禁。

## 部署

推荐通过 OpenAI Sites 部署，使身份入口、D1 和 R2 绑定由平台管理。创建自己的 Site 后，平台会为本地清单注入独立的 `project_id`；不要把生产项目 ID、访问令牌或旁路令牌提交到公开仓库。

若迁移到其他平台，必须先替换身份信任模型、逐接口复核对象级授权，并确保 R2 或替代对象存储保持私有。

## 许可证

Copyright © 2026 Friends Climbing contributors.

本项目依据 GNU Affero General Public License v3.0 或更高版本发布（`AGPL-3.0-or-later`）。通过网络向用户提供修改版本时，须按照 AGPL 第 13 条向这些用户提供相应源代码。完整条款见 [LICENSE](LICENSE)。
