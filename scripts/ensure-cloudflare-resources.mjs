import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import TOML from '@iarna/toml';
const accountId = must('CLOUDFLARE_ACCOUNT_ID');
const workerName = must('WORKER_NAME');
const kvTitle = must('KV_NAMESPACE_TITLE');
const previewKvTitle = must('PREVIEW_KV_NAMESPACE_TITLE');
const r2Bucket = must('R2_BUCKET_NAME');
const previewR2Bucket = must('PREVIEW_R2_BUCKET_NAME');
const jwtSecretNames = ['JWT_ED25519_PRIVATE_JWK', 'JWT_ED25519_PUBLIC_JWK', 'JWT_KEY_ID'];
for (const name of jwtSecretNames) mustGithubSecret(name);
const headers = {
  Authorization: `Bearer ${must('CLOUDFLARE_API_TOKEN')}`,
  'Content-Type': 'application/json',
};
function must(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}
function mustGithubSecret(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing GitHub Actions secret: ${name}. Configure it in GitHub repository settings > Secrets and variables > Actions. Secret values are never printed.`,
    );
  }
  return value;
}
async function cf(path, options = {}) {
  const res = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    ...options,
    headers: { ...headers, ...(options.headers || {}) },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.success === false) {
    const codes = json.errors?.map((e) => e.code).join(',') || res.status;
    throw new Error(`Cloudflare API ${options.method || 'GET'} ${path} failed (codes: ${codes})`);
  }
  return json.result;
}
async function ensureKv(title) {
  const namespaces = await cf(`/accounts/${accountId}/storage/kv/namespaces?per_page=100`);
  const existing = namespaces.find((ns) => ns.title === title);
  if (existing) return existing.id;
  return (
    await cf(`/accounts/${accountId}/storage/kv/namespaces`, {
      method: 'POST',
      body: JSON.stringify({ title }),
    })
  ).id;
}
function wrangler(args, opts = {}) {
  return execFileSync('npx', ['wrangler', ...args], {
    stdio: opts.capture ? 'pipe' : 'inherit',
    encoding: opts.capture ? 'utf8' : undefined,
  });
}
function ensureR2Bucket(name) {
  try {
    wrangler(['r2', 'bucket', 'info', name], { capture: true });
  } catch {
    wrangler(['r2', 'bucket', 'create', name]);
  }
  return name;
}
async function ensureJwtSecrets() {
  const scriptExists = await cf(`/accounts/${accountId}/workers/scripts/${workerName}`).then(
    () => true,
    () => false,
  );
  if (!scriptExists) {
    console.log(
      'Worker script does not exist yet; deploying a bootstrap worker before syncing secrets.',
    );
    wrangler(['deploy']);
  }
  for (const name of jwtSecretNames) {
    const value = mustGithubSecret(name);
    execFileSync('npx', ['wrangler', 'secret', 'put', name], {
      input: value,
      stdio: ['pipe', 'inherit', 'inherit'],
      encoding: 'utf8',
    });
  }
  console.log(
    'JWT Worker secrets synchronized from GitHub Actions secrets. Secret values were not printed.',
  );
}
const [kvId, previewKvId] = await Promise.all([ensureKv(kvTitle), ensureKv(previewKvTitle)]);
ensureR2Bucket(r2Bucket);
ensureR2Bucket(previewR2Bucket);
const config = TOML.parse(readFileSync('wrangler.toml', 'utf8'));
config.name = workerName;
config.kv_namespaces = [{ binding: 'CLIMB_KV', id: kvId, preview_id: previewKvId }];
config.r2_buckets = [
  { binding: 'CLIMB_IMAGES', bucket_name: r2Bucket, preview_bucket_name: previewR2Bucket },
];
const output = TOML.stringify(config);
const parsed = TOML.parse(output);
if (
  parsed.name !== workerName ||
  parsed.main !== config.main ||
  parsed.compatibility_date !== config.compatibility_date ||
  parsed.kv_namespaces?.[0]?.id !== kvId ||
  parsed.kv_namespaces?.[0]?.preview_id !== previewKvId ||
  parsed.r2_buckets?.[0]?.bucket_name !== r2Bucket ||
  parsed.r2_buckets?.[0]?.preview_bucket_name !== previewR2Bucket
)
  throw new Error('wrangler.toml validation failed after structured update');
writeFileSync('wrangler.toml', output);
await ensureJwtSecrets();
wrangler(['deploy']);
