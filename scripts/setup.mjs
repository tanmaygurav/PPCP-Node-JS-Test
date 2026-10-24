import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

if (existsSync('.env.local')) {
  console.log('.env.local already exists; it has not been changed.');
} else {
  const template = readFileSync('.env.example', 'utf8');
  writeFileSync('.env.local', template.replace('TEST_ACCESS_KEY=\n', `TEST_ACCESS_KEY=${randomBytes(32).toString('hex')}\n`), { mode: 0o600, flag: 'wx' });
  console.log('Created .env.local with test resource IDs and a random access key. Add OAuth client credentials locally; do not paste them in chat.');
}
