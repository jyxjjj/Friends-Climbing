# Open Source Readiness and Security Review

Date: 2026-06-18

## 已修复问题

### Critical

- 修复图片上传/删除越权：只有 Owner 或对应记录创建者可上传、删除记录图片。
- 修复 Member 越权写入：Member 不再能创建、修改、删除成员与路线模板；计划和记录仅 Owner 或创建者可修改/删除。
- 为 Cookie Session 下的登录后状态修改接口增加 Same-Origin CSRF 校验。

### High

- 增加统一权限函数 `canRead(...)`、`canCreate(...)`、`canUpdate(...)`、`canDelete(...)`，避免授权逻辑散落。
- 增加运行时 schema 清洗，避免 mass assignment、任意对象写入和 prototype pollution。
- 图片文件名改为服务端规范化名称；R2 key 不再包含用户原始路径或文件名。
- 图片下载需要登录并通过应用鉴权路径访问；响应增加 `nosniff`、私有缓存控制和安全 `Content-Disposition`。
- 限制图片 Content-Type，仅允许常见图片 MIME，并限制单文件 10 MiB。

### Medium

- CSV 与 XLSX/HTML 表格导出增加公式注入与 HTML 转义处理。
- Owner 初始化流程增加短 TTL 初始化锁和二次检查，降低并发初始化风险。
- Session Cookie 已确认使用 `HttpOnly`、`Secure`、`SameSite=Strict`，登出会删除服务端 session。
- README 同步实际安装、部署、权限、API、图片与导出行为。

### Low

- 添加 `LICENSE`、`CONTRIBUTING.md`、`SECURITY.md`、`CODE_OF_CONDUCT.md`。
- `package.json` 增加 license、repository、bugs、homepage 元数据。
- README 增加 License 与 AGPL Section 13 Source Code Availability 说明。

## 风险等级

| Area                      | Risk after fixes | Notes                                                                                                                                         |
| ------------------------- | ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Authorization             | Low              | Centralized checks cover CRUD and image mutations.                                                                                            |
| Authentication / Session  | Low              | Strong random session IDs, HttpOnly/Secure/SameSite cookies, server-side logout.                                                              |
| CSRF                      | Low              | Same-Origin Origin check plus SameSite=Strict cookies.                                                                                        |
| File Upload / Download    | Low              | Authenticated access, MIME allowlist, size cap, normalized names.                                                                             |
| Input Validation          | Low              | Server-side schemas discard undeclared fields.                                                                                                |
| XSS                       | Low              | React escapes rendered values; export HTML is escaped; file responses use attachments and nosniff.                                            |
| CSV Injection             | Low              | Dangerous formula prefixes are neutralized for CSV and XLSX-like HTML cells are escaped.                                                      |
| Cloudflare CI / Secrets   | Low              | Secrets are read from GitHub Secrets and not printed by resource script.                                                                      |
| Owner Initialization Race | Medium           | KV is not a transactional database; a lock and double-check reduce race risk, but true global compare-and-set is not available with plain KV. |

## 剩余风险

- Cloudflare KV does not provide a strong transactional compare-and-set primitive for the Owner initialization path. For deployments requiring strict single-writer global initialization guarantees under heavy concurrent first-run traffic, use a Durable Object or pre-provision the Owner out-of-band.
- The frontend is a compact CDN-based SPA. Public deployments should consider pinning third-party script integrity hashes or self-hosting frontend assets for stricter supply-chain control.
- The repository metadata currently uses a placeholder GitHub organization URL and should be updated by the project owner before publishing.

## 是否建议公开

Ready for Public Release
