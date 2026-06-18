# Open Source Readiness and Security Review

Date: 2026-06-18

## 部署与权限边界确认

- 项目为 Cloudflare Workers **单域名、单团队部署模型**；前端与 API 预期运行在同一 origin，不支持任何跨域 API 调用。
- 已登录用户读取团队内全部成员、路线模板、计划、记录、图片元数据、图片文件和导出数据是设计行为，不是漏洞；不要将 `canRead(...)` 改成按创建者隔离。
- 写权限继续由 `Owner` / 创建者控制；图片上传/删除也仅限 Owner 或对应记录创建者。
- 用户主动通过 DevTools / curl 调用自己有权限的接口不是漏洞；安全边界在服务端认证、授权和同源写保护。

## 未登录 API 访问控制结论

- `/api/init-owner` 可未登录访问，仅用于首次初始化；没有任何 `users:` 记录时才可成功。
- `/api/login` 可未登录访问，用于创建 Cookie session。
- 其他所有 `/api/*` 均在路由分发前调用 `currentUser(...)`，未登录直接返回 `401`。因此 `/api/members`、`/api/templates`、`/api/plans`、`/api/records`、`/api/dashboard`、`/api/export/*`、`/api/records/*/images`、`/api/records/*/images/*/file` 均不能被未登录用户访问。

## 已修复问题

### Critical

- 修复图片上传/删除越权：只有 Owner 或对应记录创建者可上传、删除记录图片。
- 修复 Member 越权写入：Member 不再能创建、修改、删除成员与路线模板；计划和记录仅 Owner 或创建者可修改/删除。
- 为 Cookie Session 下的登录后状态修改接口增加严格 Same-Origin `Origin` 校验；登录后的 `POST`、`PUT`、`DELETE`、`PATCH` 缺失 `Origin` 或跨 origin 均返回 `403`。

### High

- 增加统一权限函数 `canRead(...)`、`canCreate(...)`、`canUpdate(...)`、`canDelete(...)`，避免授权逻辑散落。
- 增加运行时 schema 清洗，避免 mass assignment、任意对象写入和 prototype pollution。
- 图片文件名改为服务端规范化名称；R2 key 不再包含用户原始路径或文件名。
- 图片下载需要登录并通过应用鉴权路径访问；响应增加 `nosniff`、私有缓存控制和安全 `Content-Disposition`。
- HTML 响应增加 `Content-Security-Policy`、`X-Content-Type-Options: nosniff` 和 `Referrer-Policy: same-origin`。
- 限制图片 Content-Type，仅允许常见图片 MIME，并限制单文件 10 MiB。

### Medium

- CSV 与 XLSX/HTML 表格导出增加公式注入与 HTML 转义处理。
- Owner 初始化流程增加短 TTL 初始化锁和二次检查，降低并发初始化风险。
- Session Cookie 已确认使用 `HttpOnly`、`Secure`、`SameSite=Strict`，登出会删除服务端 session。
- README 同步实际安装、部署、权限、API、图片、导出、单域名部署、同源写保护和前端供应链行为。

### Low

- 添加 `LICENSE`、`CONTRIBUTING.md`、`SECURITY.md`、`CODE_OF_CONDUCT.md`。
- `package.json` 增加 license、repository、bugs、homepage 元数据。
- README 增加 License 与 AGPL Section 13 Source Code Availability 说明。
- React、ReactDOM 与 Chart.js 使用固定版本 cdnjs URL、`integrity` 和 `crossorigin="anonymous"`。

## 风险等级

| Area                      | Risk after fixes | Notes                                                                                                                                              |
| ------------------------- | ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Authorization             | Low              | Centralized checks cover CRUD and image mutations.                                                                                                 |
| Authentication / Session  | Low              | Strong random session IDs, HttpOnly/Secure/SameSite cookies, server-side logout.                                                                   |
| CSRF                      | Low              | Strict same-origin `Origin` check for authenticated writes plus SameSite=Strict cookies; login/init reject cross-origin Origin.                    |
| File Upload / Download    | Low              | Authenticated access, MIME allowlist, size cap, normalized names.                                                                                  |
| Input Validation          | Low              | Server-side schemas discard undeclared fields.                                                                                                     |
| XSS                       | Low/Medium       | React escapes rendered values; export HTML is escaped; CSP and nosniff are enabled, but inline SPA code currently requires `unsafe-inline`.        |
| CSV Injection             | Low              | Dangerous formula prefixes are neutralized for CSV and XLSX-like HTML cells are escaped.                                                           |
| Cloudflare CI / Secrets   | Low              | Secrets are read from GitHub Secrets and not printed by resource script.                                                                           |
| CDN Supply Chain          | Low              | External scripts are fixed-version cdnjs URLs with SHA-384 SRI and `crossorigin="anonymous"`; self-hosting remains the preferred future hardening. |
| Cross-Origin API          | Low              | No CORS allow headers are emitted; cross-origin preflight is unsupported; unauthorized/cross-origin calls are blocked by auth and Origin checks.   |
| Owner Initialization Race | Medium           | KV is not a transactional database; a lock and double-check reduce race risk, but true global compare-and-set is not available with plain KV.      |

## 剩余风险

- Cloudflare KV does not provide a strong transactional compare-and-set primitive for the Owner initialization path. For deployments requiring strict single-writer global initialization guarantees under heavy concurrent first-run traffic, use a Durable Object or pre-provision the Owner out-of-band.
- The frontend is still a compact inline SPA. CSP must temporarily keep `script-src 'unsafe-inline'` and style inline permissions for the current inline JavaScript/CSS; this is a Low/Medium residual risk. Recommended follow-up: split JS/CSS into static files and use nonce/hash-based CSP to remove `unsafe-inline`.
- Third-party scripts now use fixed-version cdnjs URLs with SRI. Self-hosting React, ReactDOM, Chart.js, and fonts remains the preferred supply-chain hardening option for deployments that want no external frontend dependencies.
- The repository metadata currently uses a placeholder GitHub organization URL and should be updated by the project owner before publishing.

## 是否建议公开

Ready for Public Release
