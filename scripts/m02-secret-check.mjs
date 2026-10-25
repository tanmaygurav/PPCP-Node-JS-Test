import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { loadM02Env } from '../src/m02/config.mjs';
loadM02Env();
const secrets = ['GOOGLE_CLIENT_SECRET', 'GOOGLE_REFRESH_TOKEN', 'M02_SIGNING_SECRET'].map(key => process.env[key]).filter(value => value?.length > 12);
if (process.env.GOOGLE_APPLICATION_CREDENTIALS && existsSync(process.env.GOOGLE_APPLICATION_CREDENTIALS)) {
  const key = JSON.parse(readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS, 'utf8'));
  secrets.push(key.private_key, JSON.stringify(key.private_key).slice(1, -1), key.private_key_id);
}
if (existsSync('.local/vercel-cli/auth.json')) secrets.push(JSON.parse(readFileSync('.local/vercel-cli/auth.json', 'utf8')).token);
const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean);
function assets(dir) { if (existsSync(dir)) for (const entry of readdirSync(dir, { withFileTypes: true })) entry.isDirectory() ? assets(`${dir}/${entry.name}`) : files.push(`${dir}/${entry.name}`); }
assets('dist-m02');
const hits = [];
for (const file of new Set(files)) {
  if (!existsSync(file)) continue;
  const contents = readFileSync(file, 'utf8');
  if (secrets.some(value => value && contents.includes(value))) hits.push(file);
}
if (hits.length) { console.error('Credential scan failed; affected filenames only:', hits.join(', ')); process.exitCode = 1; }
else console.log(`Credential scan passed across ${new Set(files).size} source/evidence/build files. No secret values printed.`);
