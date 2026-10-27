import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { execFileSync } from 'node:child_process';
const secrets = [];
if (existsSync('.env.m04.local')) {
  const env = parseEnv(readFileSync('.env.m04.local', 'utf8'));
  for (const key of ['M04_GOOGLE_CLIENT_SECRET', 'M04_GOOGLE_REFRESH_TOKEN', 'M04_SIGNING_SECRET']) if (env[key]) secrets.push(env[key]);
  if (env.M04_FIREBASE_SERVICE_ACCOUNT_JSON) { const credential = JSON.parse(env.M04_FIREBASE_SERVICE_ACCOUNT_JSON); secrets.push(credential.private_key, JSON.stringify(credential.private_key).slice(1, -1)); }
}
if (existsSync('.local/m04-accounts.json')) {
  const pool = JSON.parse(readFileSync('.local/m04-accounts.json')); for (const account of [...pool.students, pool.faculty, pool.admin, pool.pending].filter(Boolean)) secrets.push(account.password);
}
const paths = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean);
function collect(path) { if (existsSync(path)) for (const entry of readdirSync(path, { withFileTypes: true })) entry.isDirectory() ? collect(`${path}/${entry.name}`) : paths.push(`${path}/${entry.name}`); }
for (const path of ['dist-m04', 'output/m04']) collect(path);
const hits = [...new Set(paths)].filter(path => existsSync(path) && secrets.some(secret => secret?.length > 12 && readFileSync(path, 'utf8').includes(secret)));
if (hits.length) { console.error('M04 secret scan failed; filenames only:', hits); process.exitCode = 1; } else console.log(`M04 secret scan passed across ${new Set(paths).size} files; values suppressed.`);
