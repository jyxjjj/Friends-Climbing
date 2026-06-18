#!/usr/bin/env node
import { writeFile } from 'node:fs/promises';

const accountId = must('CLOUDFLARE_ACCOUNT_ID');
const token = must('CLOUDFLARE_API_TOKEN');
const workerName = process.env.CLOUDFLARE_WORKER_NAME || 'friends-climbing';
const kvTitle = process.env.CLOUDFLARE_KV_NAMESPACE || 'friends-climbing-kv';
const previewKvTitle = process.env.CLOUDFLARE_PREVIEW_KV_NAMESPACE || `${kvTitle}-preview`;
const bucket = process.env.CLOUDFLARE_R2_BUCKET || 'friends-climbing-images';
const previewBucket = process.env.CLOUDFLARE_PREVIEW_R2_BUCKET || `${bucket}-dev`;
const compatibilityDate = process.env.CLOUDFLARE_COMPATIBILITY_DATE || '2026-06-18';

function must(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

async function cf(path, init = {}) {
  const response = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      ...(init.headers || {}),
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.success === false) {
    const message = data.errors?.map((e) => e.message).join('; ') || response.statusText;
    throw new Error(`Cloudflare API ${init.method || 'GET'} ${path} failed: ${message}`);
  }
  return data.result;
}

async function ensureKvNamespace(title) {
  const namespaces = await cf(`/accounts/${accountId}/storage/kv/namespaces?per_page=100`);
  const found = namespaces.find((namespace) => namespace.title === title);
  if (found) return found.id;
  const created = await cf(`/accounts/${accountId}/storage/kv/namespaces`, {
    method: 'POST',
    body: JSON.stringify({ title }),
  });
  return created.id;
}

async function ensureR2Bucket(name) {
  const buckets = await cf(`/accounts/${accountId}/r2/buckets`);
  const list = Array.isArray(buckets) ? buckets : buckets.buckets || [];
  if (list.some((candidate) => candidate.name === name)) return name;
  await cf(`/accounts/${accountId}/r2/buckets`, {
    method: 'POST',
    body: JSON.stringify({ name }),
  });
  return name;
}

const kvId = await ensureKvNamespace(kvTitle);
const previewKvId = await ensureKvNamespace(previewKvTitle);
await ensureR2Bucket(bucket);
await ensureR2Bucket(previewBucket);

const toml = `name = "${workerName}"
main = "src/index.ts"
compatibility_date = "${compatibilityDate}"

[[kv_namespaces]]
binding = "CLIMB_KV"
id = "${kvId}"
preview_id = "${previewKvId}"

[[r2_buckets]]
binding = "CLIMB_IMAGES"
bucket_name = "${bucket}"
preview_bucket_name = "${previewBucket}"
`;

await writeFile('wrangler.generated.toml', toml);
console.log(`Generated wrangler.generated.toml for Worker ${workerName}`);
console.log(`KV namespace: ${kvTitle} (${kvId})`);
console.log(`Preview KV namespace: ${previewKvTitle} (${previewKvId})`);
console.log(`R2 bucket: ${bucket}`);
console.log(`Preview R2 bucket: ${previewBucket}`);
