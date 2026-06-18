import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const accountId = must('CLOUDFLARE_ACCOUNT_ID');
const workerName = must('WORKER_NAME');
const kvTitle = must('KV_NAMESPACE_TITLE');
const previewKvTitle = must('PREVIEW_KV_NAMESPACE_TITLE');
const r2Bucket = must('R2_BUCKET_NAME');
const previewR2Bucket = must('PREVIEW_R2_BUCKET_NAME');

const headers = {
  Authorization: `Bearer ${must('CLOUDFLARE_API_TOKEN')}`,
  'Content-Type': 'application/json',
};

function must(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

async function cf(path, options = {}) {
  const res = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    ...options,
    headers: { ...headers, ...(options.headers || {}) },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.success === false) {
    const message = json.errors?.map((e) => `${e.code}: ${e.message}`).join('; ') || res.statusText;
    throw new Error(`Cloudflare API ${options.method || 'GET'} ${path} failed: ${message}`);
  }
  return json.result;
}

async function ensureKv(title) {
  const result = await cf(`/accounts/${accountId}/storage/kv/namespaces?per_page=100`);
  const namespaces = Array.isArray(result) ? result : result.result || [];
  const existing = namespaces.find((ns) => ns.title === title);
  if (existing) return existing.id;
  const created = await cf(`/accounts/${accountId}/storage/kv/namespaces`, {
    method: 'POST',
    body: JSON.stringify({ title }),
  });
  return created.id;
}

async function ensureR2Bucket(name) {
  try {
    await cf(`/accounts/${accountId}/r2/buckets/${encodeURIComponent(name)}`);
  } catch (error) {
    if (!String(error.message).includes('10006') && !String(error.message).includes('not found'))
      throw error;
    await cf(`/accounts/${accountId}/r2/buckets`, {
      method: 'POST',
      body: JSON.stringify({ name }),
    });
  }
  return name;
}

const [kvId, previewKvId] = await Promise.all([ensureKv(kvTitle), ensureKv(previewKvTitle)]);
await Promise.all([ensureR2Bucket(r2Bucket), ensureR2Bucket(previewR2Bucket)]);

let toml = readFileSync('wrangler.toml', 'utf8');
toml = toml
  .replace(/^name = .*/m, `name = "${workerName}"`)
  .replace(/id = "replace-with-kv-namespace-id"/, `id = "${kvId}"`)
  .replace(/preview_id = "replace-with-preview-kv-namespace-id"/, `preview_id = "${previewKvId}"`)
  .replace(/bucket_name = "friends-climbing-images"/, `bucket_name = "${r2Bucket}"`)
  .replace(
    /preview_bucket_name = "friends-climbing-images-dev"/,
    `preview_bucket_name = "${previewR2Bucket}"`,
  );
writeFileSync('wrangler.toml', toml);
execFileSync('npx', ['wrangler', 'deploy'], { stdio: 'inherit' });
