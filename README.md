# Friends Climbing

一个可直接部署到 Cloudflare Workers 的团队爬山记录与活动管理系统。前端为 React（CDN UMD）单页应用，UI 遵循 Material Design 2 风格；后端为 TypeScript Worker，使用 Cloudflare KV 保存结构化数据与 Session，使用 R2 保存图片文件。

## 功能

- 登录、登出、30 天 Session、自动续期
- Owner / Member 权限模型；Owner 全权限，Member 默认只读，计划/记录创建者可编辑自身数据
- 成员管理、成员详情统计、体重/体脂数据结构
- 路线模板库、从模板/历史数据创建计划的接口基础
- 爬山计划 CRUD、从计划生成完成记录
- 完成记录 CRUD、AA 费用核算（金额使用整数分）
- R2 图片批量上传、删除、备注、分类、查看与下载清单
- Dashboard 团队汇总、月/年趋势、成员排行榜
- 导出单条或全量记录：CSV、XLSX（Excel 可打开 HTML 表格）、JSON、JSONC、JSONL、MySQL 8+ / MariaDB 11+ SQL
- 表单必填/数字/日期/金额基础校验与红色错误高亮；浏览器端可扩展 localStorage 草稿

## KV 创建命令

```bash
npx wrangler kv namespace create CLIMB_KV
npx wrangler kv namespace create CLIMB_KV --preview
```

将输出的 `id` 和 `preview_id` 填入 `wrangler.toml`。

## R2 创建命令

```bash
npx wrangler r2 bucket create friends-climbing-images
npx wrangler r2 bucket create friends-climbing-images-dev
```

## 本地开发

```bash
npm install
npm run dev
```

## 部署命令

```bash
npm run deploy
```

## 初始化管理员账号

首次部署后调用初始化接口。账号必须匹配 `[A-Za-z0-9]+`，长度 4-32；密码长度至少 12。

```bash
curl -X POST https://你的域名/api/init-owner \
  -H 'Content-Type: application/json' \
  -d '{"username":"Owner001","password":"ChangeMe-At-Least-12"}'
```

该接口仅在 `users:` 前缀为空时可用，成功后会创建 Owner。之后请访问站点登录。

## PBKDF2 实现说明

密码永不明文保存，也不保存原始 `hash(password)`。每个用户创建独立 32 bytes 随机 salt，并用 WebCrypto API 执行：

```json
{
  "algorithm": "PBKDF2",
  "digest": "SHA-256",
  "iterations": 524288,
  "salt": "<base64url>",
  "derivedKey": "<base64url>",
  "derivedKeyLength": 64
}
```

登录时使用同一 salt 和参数重新派生 64 bytes derivedKey，并用 constant-time compare 比较。失败统一返回 `账号或密码错误`，不暴露账号是否存在。

## KV 数据结构说明

- `users:{username}`：用户、角色、PBKDF2 密码派生结果
- `sessions:{sessionId}`：随机 256bit Session ID，KV TTL 30 天
- `members:{memberId}`：成员资料
- `routeTemplates:{routeId}`：路线模板
- `plans:{planId}`：爬山计划
- `records:{recordId}`：完成记录、费用、身体数据、备注
- `images:{recordId}:{imageId}`：图片元数据
- `indexes:userPlans:{username}` / `indexes:userRecords:{username}` / `indexes:memberRecords:{memberId}`：预留索引键，当前实现可直接通过前缀列表计算

## R2 图片存储说明

图片二进制文件存储于 R2，key 格式：

```text
records/{recordId}/{imageId}-{originalFileName}
```

图片元数据（分类、备注、文件名、MIME、大小、创建时间、R2 key）存储于 KV 的 `images:{recordId}:{imageId}`。上传接口接收 `multipart/form-data` 的 `files` 字段，支持批量上传。

## 权限模型说明

- `Owner`：全部权限，可创建、编辑、删除任意成员、模板、计划、记录与图片。
- `Member`：查看权限。
- 计划创建者：可编辑/删除自身计划。
- 记录创建者：可编辑/删除自身记录。
- 非创建者：只读。

## 数据导出

- 全量：`/api/export/all?format=json|csv|xlsx|jsonc|jsonl|mysql|mariadb`
- 单条：`/api/export/record/{recordId}?format=json|csv|xlsx|jsonc|jsonl|mysql|mariadb`

SQL 导出包含建表语句和 INSERT 语句，兼容 MySQL 8+ 与 MariaDB 11+ 的 JSON 字段用法。

## GitHub Actions 一键部署（无需进入 Cloudflare 后台）

仓库已内置 `.github/workflows/deploy.yml`。你只需要在 GitHub 仓库的 **Settings → Secrets and variables → Actions → Repository secrets** 配置下方全部密钥；之后推送到 `main` 或手动运行 `Deploy to Cloudflare Workers` workflow，即可自动创建 KV/R2 资源并部署 Worker，不需要再去 Cloudflare 后台手动创建命名空间或桶。

必填密钥（全部都要在 GitHub Secrets 中配置，缺少任意一个都会让 workflow 直接失败）：

- `CLOUDFLARE_API_TOKEN`：Cloudflare API Token。需要具备 Workers Scripts 编辑、Account KV Storage 编辑、R2 Storage 编辑权限。
- `CLOUDFLARE_ACCOUNT_ID`：Cloudflare Account ID。
- `WORKER_NAME`：Worker 名称，例如 `friends-climbing`。
- `KV_NAMESPACE_TITLE`：生产 KV 名称，例如 `CLIMB_KV`。
- `PREVIEW_KV_NAMESPACE_TITLE`：预览 KV 名称，例如 `CLIMB_KV_preview`。
- `R2_BUCKET_NAME`：生产 R2 桶名，例如 `friends-climbing-images`。
- `PREVIEW_R2_BUCKET_NAME`：预览 R2 桶名，例如 `friends-climbing-images-dev`。

Workflow 会执行以下操作：

1. 安装依赖并运行 TypeScript 类型检查。
2. 通过 Cloudflare API 检查 KV namespace 和 R2 bucket 是否存在；不存在则自动创建。
3. 在 CI 临时写入真实 KV namespace ID 与 R2 bucket 名称到 `wrangler.toml`。
4. 执行 `wrangler deploy` 发布到 Cloudflare Workers。

供应链安全措施：

- GitHub Actions 使用当前主版本的完整 commit SHA 固定，避免 tag 被篡改后自动执行未知代码。
- CI 使用 `npm ci --ignore-scripts` 按 `package-lock.json` 安装依赖，并默认禁用依赖生命周期脚本。
- CI 在部署前执行 `npm audit --audit-level=high`，发现 high/critical 级别漏洞会阻断部署。
- `package.json` 使用精确版本号，并通过 `overrides` 强制修补存在安全公告的传递依赖版本。

注意：`wrangler.toml` 中保留的 `replace-with-*` 占位符是给 GitHub Actions 自动替换用的；如果你使用 GitHub Actions 部署，不需要手动修改这些值。
