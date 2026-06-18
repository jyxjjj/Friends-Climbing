# Friends Climbing

Friends Climbing 是一个 Cloudflare Workers + TypeScript + React UMD 单页应用，用于单团队爬山计划、记录、图片、AA 费用和导出管理。项目保持 `AGPL-3.0-or-later`。

## 当前安全与数据模型

- **单团队系统**：所有活动成员都必须拥有登录账号；`User.memberId` 与 `Member.username` 严格一对一绑定，不支持没有登录账号的活动成员。
- **认证模型**：登录后签发 Ed25519 JWT（`alg=EdDSA`）Access + Refresh Cookie。Access Cookie 为 `__Host-access_token`，默认 15 分钟有效；Refresh Cookie 为 `__Host-refresh_token`，默认 30 天有效。Refresh session 仍保存在 KV 的 `refreshSessions:{jti}`，每次 refresh 都轮换 token。
- **后端状态**：密码修改、角色修改、禁用用户会提升 `tokenVersion` 并撤销旧 refresh session；旧 access token 在敏感读取/写入时也会被用户当前 `tokenVersion` 校验拒绝。
- **初始化 Owner**：`/api/init-owner` 仍仅在没有任何 `users:` 记录时可用。首次抢注窗口由部署者人工 review KV 实际数据接受；部署后应立即初始化并检查 KV。
- **权限**：Owner 全权限；Member 可读取团队数据；Member 可创建计划/记录，但只能修改/删除自己创建的计划/记录。图片上传/删除仅 Owner 或对应记录创建者可执行。
- **同源写保护**：所有登录后的 `POST`、`PUT`、`DELETE`、`PATCH` 必须携带严格匹配当前 origin 的 `Origin`。
- **错误响应**：对用户返回稳定、可读、不泄露内部实现的错误字符串；详细异常只写 Cloudflare 日志。

## 功能

- Owner/User/Member 一对一管理、禁用、角色变更和密码重置。
- 路线模板、计划、完成记录 CRUD；计划/记录支持成员、预算、费用、身体数据、体脂、装备和备注字段。
- R2 图片批量上传、MIME + magic bytes 校验、分类、备注、下载清单和附件下载。
- AA 费用使用整数分配：`floor(total / n)` 为基础份额，余数归 Owner 的 `memberId`，保证收支总额一致。
- Dashboard 团队汇总、趋势、成员统计。
- 导出全量或单条记录：CSV、真正 XLSX、JSON、JSONC、JSONL、MySQL / MariaDB SQL。未知格式返回 `400`，单条不存在返回 `404`。
- 列表接口返回 `{ items, nextCursor, hasMore }`，按更新时间/创建时间稳定排序。当前实现仍依赖 Workers KV list 后排序，适合小团队规模；如团队数据显著增长，应迁移到带索引的存储。

## 安装与本地开发

```bash
npm ci --ignore-scripts
npm run dev
npm run typecheck
npm test
npm audit --audit-level=high
npm run format:check
```

本地开发需要可用 Wrangler、KV namespace、R2 bucket 与 JWT Ed25519 JWK secrets。

## Cloudflare 资源

KV：

```bash
npx wrangler kv namespace create CLIMB_KV
npx wrangler kv namespace create CLIMB_KV --preview
```

R2：

```bash
npx wrangler r2 bucket create friends-climbing-images
npx wrangler r2 bucket create friends-climbing-images-dev
npx wrangler r2 bucket info friends-climbing-images
```

JWT secrets 必须写入 Worker Secret，Worker 不会在运行时静默生成临时密钥：

- `JWT_ED25519_PRIVATE_JWK`
- `JWT_ED25519_PUBLIC_JWK`
- `JWT_KEY_ID`

## 部署流程

GitHub Actions 仅支持 `workflow_dispatch` 手动触发，不再随 `main` push 自动部署。Workflow 会执行：

1. `npm ci --ignore-scripts`
2. `npm audit --audit-level=high`
3. `npm run typecheck`
4. `npm test`
5. `npm run format:check`
6. 检查/创建 KV 与 R2，结构化更新并校验 `wrangler.toml`
7. `wrangler deploy`

需要配置 GitHub Secrets：

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`
- `WORKER_NAME`
- `KV_NAMESPACE_TITLE`
- `PREVIEW_KV_NAMESPACE_TITLE`
- `R2_BUCKET_NAME`
- `PREVIEW_R2_BUCKET_NAME`

## API 摘要

### Auth

- `POST /api/init-owner`：初始化 Owner，同时创建 Owner User 与 Owner Member。
- `POST /api/login`：登录，失败统一返回 `账号或密码错误`，并执行 dummy PBKDF2 与 IP/用户名限流。
- `POST /api/refresh`：轮换 refresh token。
- `POST /api/logout`：撤销当前 refresh session 并清除 cookies。
- `GET /api/me`：当前用户。

所有认证 API 响应带 `Cache-Control: private, no-store` 与 `Vary: Cookie`。

### CRUD

- `GET /api/users|members|templates|plans|records?pageSize=50&cursor=...`
- `GET /api/users|members|templates|plans|records/{id}`
- `POST /api/users|templates|plans|records`
- `PUT /api/users|templates|plans|records/{id}`（必须提交当前 `version`）
- `DELETE /api/templates|plans|records/{id}?version=...`

成员必须通过用户管理创建/修改；成员/用户存在历史引用时默认禁用而非硬删除。

### Images

- `GET /api/records/{recordId}/images`
- `POST /api/records/{recordId}/images`
- `DELETE /api/records/{recordId}/images/{imageId}`
- `GET /api/records/{recordId}/images/download`
- `GET /api/records/{recordId}/images/{imageId}/file`

限制：单文件 10 MiB，最多 10 个文件，总大小 50 MiB。允许 JPEG/PNG/WebP/GIF，并验证 magic bytes。用户文件名只用于下载展示，不进入 R2 key。

## 前端供应链与 CSP

React、ReactDOM、Chart.js 继续使用固定版本 CDN UMD + SRI。SPA 内联脚本/样式仍存在，因此 CSP 使用固定 CDN 来源并保留必要的内联许可；后续可拆成 Worker 静态资源并改用 hash/nonce 进一步收紧。设置页提供源码仓库链接以满足 AGPL 网络服务源码可得性提示。

## License / AGPL Section 13

Friends Climbing is licensed under the GNU Affero General Public License v3.0 or later (`AGPL-3.0-or-later`). If you modify and run it as a network service, AGPL Section 13 requires offering Corresponding Source to remote users. Keep a prominent link to the source repository or complete source distribution in the deployed service.
