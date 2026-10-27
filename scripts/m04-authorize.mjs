import { createServer } from 'node:http';
import { randomBytes, createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { equal } from '../src/security.mjs';
import { formatEnv } from '../src/m04/envfile.mjs';
const path = '.env.m04.local', env = parseEnv(readFileSync(path, 'utf8'));
if (!env.M04_GOOGLE_CLIENT_ID || !env.M04_GOOGLE_CLIENT_SECRET) throw new Error('Run m04-setup with the new Desktop OAuth client first.');
const state = randomBytes(32).toString('base64url'), verifier = randomBytes(48).toString('base64url'), redirect = 'http://127.0.0.1:3006/oauth/callback';
const authorization = new URL('https://accounts.google.com/o/oauth2/v2/auth');
authorization.search = new URLSearchParams({ client_id: env.M04_GOOGLE_CLIENT_ID, redirect_uri: redirect, response_type: 'code', scope: 'https://www.googleapis.com/auth/drive.file', access_type: 'offline', prompt: 'consent', state, code_challenge: createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256' }).toString();
// drive.file restricts this new OAuth client to resources it creates. If the
// folder was created manually, use Drive Picker to grant it to this client, or
// explicitly opt into full Drive scope for the configured folder below.
if (process.argv.includes('--existing-folder')) authorization.searchParams.set('scope', 'https://www.googleapis.com/auth/drive');
let handling = false;
const server = createServer(async (req, res) => {
  res.setHeader('Cache-Control', 'no-store'); res.setHeader('Referrer-Policy', 'no-referrer'); res.setHeader('Content-Type', 'text/plain');
  const url = new URL(req.url, redirect);
  if (url.pathname !== '/oauth/callback') { res.writeHead(404); return res.end(); }
  if (!equal(url.searchParams.get('state') || '', state) || handling) { res.writeHead(400); return res.end('Invalid callback.'); }
  handling = true;
  try {
    if (!url.searchParams.get('code')) throw new Error();
    const response = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', signal: AbortSignal.timeout(20000), body: new URLSearchParams({ client_id: env.M04_GOOGLE_CLIENT_ID, client_secret: env.M04_GOOGLE_CLIENT_SECRET, redirect_uri: redirect, code: url.searchParams.get('code'), code_verifier: verifier, grant_type: 'authorization_code' }) });
    if (!response.ok) throw new Error(); const tokens = await response.json();
    const scope = process.argv.includes('--existing-folder') ? 'https://www.googleapis.com/auth/drive' : 'https://www.googleapis.com/auth/drive.file';
    if (!tokens.refresh_token || !tokens.scope?.split(' ').includes(scope)) throw new Error();
    const current = parseEnv(readFileSync(path, 'utf8')); current.M04_GOOGLE_REFRESH_TOKEN = tokens.refresh_token;
    writeFileSync(path, formatEnv(current), { mode: 0o600 });
    res.end('M04 authorization saved locally. Return to Codex.'); console.log('New M04 Drive authorization saved; no credentials printed.');
  } catch { res.writeHead(400); res.end('Authorization failed. Check the OAuth test user and consent settings.'); process.exitCode = 1; }
  finally { clearTimeout(timeout); server.close(); }
});
const timeout = setTimeout(() => { console.error('M04 authorization timed out.'); server.close(); }, 300000);
server.on('error', () => { clearTimeout(timeout); console.error('Local OAuth callback could not start.'); process.exitCode = 1; });
server.listen(3006, '127.0.0.1', () => console.log(`Open this new-client consent URL in your browser:\n${authorization.href}`));
