import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { execFileSync } from 'node:child_process';
const secrets = [];
for (const path of readdirSync('.').filter(file => file.startsWith('.env.m03-') && file.endsWith('.local'))) if (existsSync(path)) {
  const values = parseEnv(readFileSync(path, 'utf8'));
  for (const key of ['GOOGLE_CLIENT_SECRET', 'GOOGLE_REFRESH_TOKEN', 'M03_SIGNING_SECRET', 'UPSTASH_REDIS_REST_TOKEN']) if (values[key]) secrets.push(values[key]);
  if (values.GOOGLE_APPLICATION_CREDENTIALS && existsSync(values.GOOGLE_APPLICATION_CREDENTIALS)) {
    const account = JSON.parse(readFileSync(values.GOOGLE_APPLICATION_CREDENTIALS, 'utf8')); secrets.push(account.private_key, JSON.stringify(account.private_key).slice(1, -1), account.private_key_id);
  }
}
if (existsSync('.local/m03-accounts.json')) for (const account of JSON.parse(readFileSync('.local/m03-accounts.json', 'utf8')).accounts) secrets.push(account.password);
if (existsSync('.local/vercel-cli/auth.json')) secrets.push(JSON.parse(readFileSync('.local/vercel-cli/auth.json', 'utf8')).token);
const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean);
function collect(path) { if (existsSync(path)) for (const entry of readdirSync(path, { withFileTypes: true })) entry.isDirectory() ? collect(`${path}/${entry.name}`) : files.push(`${path}/${entry.name}`); }
for (const path of ['dist-m03', 'dist-deployment']) collect(path);
const hits = [...new Set(files)].filter(path => existsSync(path) && secrets.some(secret => secret?.length > 12 && readFileSync(path, 'utf8').includes(secret)));
if (hits.length) { console.error('Secret scan failed; filenames only:', hits); process.exitCode = 1; }
else console.log(`M03 credential scan passed across ${new Set(files).size} files; no values printed.`);
