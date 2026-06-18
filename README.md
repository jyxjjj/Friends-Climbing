# Friends Climbing

一个可直接部署到 Cloudflare Workers 的团队爬山记录与活动管理系统。前端为 React（CDN UMD）单页应用；后端为 TypeScript Worker，使用 Cloudflare KV 保存结构化数据与 Session，使用 R2 保存图片文件。

## 功能

- 登录、登出、30 天 Cookie Session、自动续期
- Owner / Member 权限模型：Owner 全权限，Member 默认只读，计划/记录创建者可编辑自身数据
- 成员管理、成员详情统计、路线模板、爬山计划 CRUD、从计划生成完成记录
- 完成记录 CRUD、AA 费用核算（金额使用整数分）
- R2 图片批量上传、删除、分类、备注、下载
- Dashboard 团队汇总、月/年趋势、成员排行榜
- 导出单条或全量记录：CSV、XLSX（Excel 可打开 HTML 表格）、JSON、JSONC、JSONL、MySQL / MariaDB SQL

## 安装与本地开发

```bash
npm ci
npm run dev
```

本地开发需要可用的 Cloudflare Workers / Wrangler 环境，并在 `wrangler.toml` 中配置 KV namespace 与 R2 bucket 绑定。

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

## 部署流程

```bash
npm run typecheck
npm run deploy
```

也可以使用仓库内置 GitHub Actions workflow。需要在 GitHub Secrets 中配置：

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`
- `WORKER_NAME`
- `KV_NAMESPACE_TITLE`
- `PREVIEW_KV_NAMESPACE_TITLE`
- `R2_BUCKET_NAME`
- `PREVIEW_R2_BUCKET_NAME`

Workflow 会安装依赖、运行 `npm audit --audit-level=high`、运行 TypeScript 类型检查、创建缺失的 KV/R2 资源，并部署 Worker。Secrets 不会写入仓库；`wrangler.toml` 中的占位符仅在 CI 临时替换。

## 初始化管理员账号

首次部署后调用初始化接口。账号必须匹配 `[A-Za-z0-9]{4,32}`；密码长度至少 12。

```bash
curl -X POST https://你的域名/api/init-owner \
  -H 'Content-Type: application/json' \
  -d '{"username":"Owner001","password":"ChangeMe-At-Least-12"}'
```

该接口仅在没有任何 `users:` 记录时可用，并使用初始化锁降低并发创建风险。成功后请访问站点登录。

## 权限模型说明

- `Owner`：可读取、创建、编辑、删除任意成员、模板、计划、记录与图片。
- `Member`：可读取数据；不可创建成员、路线模板、计划或记录。
- 计划创建者：可编辑/删除自己的计划。
- 记录创建者：可编辑/删除自己的记录。
- 图片上传/删除：仅 Owner 或对应记录创建者可执行。
- 文件访问：必须登录；图片文件通过记录图片接口读取，不提供公开 R2 URL。

后端通过统一权限函数 `canRead(...)`、`canCreate(...)`、`canUpdate(...)`、`canDelete(...)` 执行授权判断。

## API 文档

所有 `/api/*` 接口除 `/api/init-owner` 与 `/api/login` 外都需要登录 Cookie。所有登录后的 `POST`、`PUT`、`DELETE` 会执行 Same-Origin CSRF 校验。

### Auth

- `POST /api/init-owner`：初始化 Owner。Body: `{ username, password }`。
- `POST /api/login`：登录并设置 `sid` Cookie。
- `POST /api/logout`：删除服务端 Session 并清除 Cookie。
- `GET /api/me`：当前用户。

Cookie 使用 `HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=2592000`。

### CRUD

- `GET /api/members|templates|plans|records?page=1&pageSize=50`
- `GET /api/members|templates|plans|records/{id}`
- `POST /api/members|templates|plans|records`
- `PUT /api/members|templates|plans|records/{id}`
- `DELETE /api/members|templates|plans|records/{id}`

运行时会丢弃未在 schema 中声明的字段，防止 mass assignment 与 prototype pollution。

### Records

- `POST /api/records/from-plan/{planId}`：由计划生成记录。
- `GET /api/records/{recordId}/aa`：计算 AA 费用。

### Images

- `GET /api/records/{recordId}/images`：列出图片元数据。
- `POST /api/records/{recordId}/images`：上传 multipart/form-data，字段 `files`，可选 `category`、`note`。
- `DELETE /api/records/{recordId}/images/{imageId}`：删除图片。
- `GET /api/records/{recordId}/images/download`：获取下载清单。
- `GET /api/records/{recordId}/images/{imageId}/file`：下载文件。

图片限制：单文件最大 10 MiB；只接受 `image/jpeg`、`image/png`、`image/webp`、`image/gif`；服务端会规范化文件名、忽略用户提供路径、强制 R2 key 使用服务端生成 ID 和扩展名。

## 数据导出

- 全量：`/api/export/all?format=json|csv|xlsx|jsonc|jsonl|mysql|mariadb`
- 单条：`/api/export/record/{recordId}?format=json|csv|xlsx|jsonc|jsonl|mysql|mariadb`

CSV/XLSX 导出会转义 HTML 与表格公式前缀，缓解 CSV Injection。

## PBKDF2 实现说明

密码永不明文保存。每个用户创建独立 32 bytes 随机 salt，并用 WebCrypto API 执行 PBKDF2-SHA-256，524288 次迭代，派生 64 bytes key。登录失败统一返回 `账号或密码错误`。

## KV 数据结构说明

- `users:{username}`：用户、角色、PBKDF2 密码派生结果
- `sessions:{sessionId}`：随机 256bit Session ID，KV TTL 30 天
- `members:{memberId}`：成员资料
- `routeTemplates:{routeId}`：路线模板
- `plans:{planId}`：爬山计划
- `records:{recordId}`：完成记录、费用、身体数据、备注
- `images:{recordId}:{imageId}`：图片元数据

## R2 图片存储说明

图片二进制文件存储于 R2，key 格式为：

```text
records/{recordId}/{imageId}.{serverExtension}
```

## License

Friends Climbing is licensed under the GNU Affero General Public License v3.0 or later (`AGPL-3.0-or-later`). See `LICENSE`.

## Source Code Availability (AGPL Section 13)

If you modify this project and run it as a network service, AGPL Section 13 requires you to offer the Corresponding Source of your modified version to users who interact with it remotely through a computer network. Keep a prominent link to the source repository or another complete source distribution location in your deployed service.
