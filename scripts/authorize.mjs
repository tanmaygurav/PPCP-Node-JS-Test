import { createServer } from 'node:http';
import { randomBytes, createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { loadLocalEnv } from '../src/config.mjs';
import { equal } from '../src/security.mjs';

loadLocalEnv();
const clientId = process.env.GOOGLE_CLIENT_ID;
const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
if (!clientId || !clientSecret) throw new Error('Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env.local first.');
const redirect = new URL(process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3001/oauth/callback');
if (redirect.protocol !== 'http:' || !['localhost', '127.0.0.1'].includes(redirect.hostname) || redirect.pathname !== '/oauth/callback') {
  throw new Error('This bootstrap accepts only a local HTTP callback at /oauth/callback.');
}
const state = randomBytes(32).toString('base64url');
const verifier = randomBytes(48).toString('base64url');
const authorization = new URL('https://accounts.google.com/o/oauth2/v2/auth');
authorization.search = new URLSearchParams({
  client_id: clientId, redirect_uri: redirect.href, response_type: 'code',
  // Full Drive is needed for a pre-existing folder without a Google Picker flow.
  // Authorize a dedicated personal TEST account only, not the REDX production account.
  scope: 'https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive',
  access_type: 'offline', prompt: 'consent', state,
  code_challenge: createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256'
}).toString();
let handling = false;
const server = createServer(async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Referrer-Policy', 'no-referrer');
  const url = new URL(req.url, redirect.origin);
  if (url.pathname !== redirect.pathname) { res.writeHead(404); return res.end('Not found'); }
  if (!equal(url.searchParams.get('state') || '', state)) { res.writeHead(400); return res.end('OAuth state mismatch.'); }
  if (handling) { res.writeHead(409); return res.end('Authorization is already being handled.'); }
  handling = true;
  try {
    if (url.searchParams.has('error') || !url.searchParams.has('code')) throw new Error();
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST', signal: AbortSignal.timeout(20_000), body: new URLSearchParams({
        client_id: clientId, client_secret: clientSecret, redirect_uri: redirect.href,
        code: url.searchParams.get('code'), code_verifier: verifier, grant_type: 'authorization_code'
      })
    });
    if (!response.ok) throw new Error();
    const tokens = await response.json();
    if (!tokens.refresh_token) throw new Error();
    const granted = new Set((tokens.scope || '').split(' '));
    if (!granted.has('https://www.googleapis.com/auth/drive') || !granted.has('https://www.googleapis.com/auth/spreadsheets')) throw new Error();
    mkdirSync('.local', { recursive: true });
    writeFileSync('.local/google-oauth.json', JSON.stringify({ refresh_token: tokens.refresh_token }, null, 2), { mode: 0o600 });
    res.end('Google authorization saved locally. Return to the terminal and run npm start. No token needs to be shared.');
    console.log('Authorization complete. Refresh token saved in ignored .local/google-oauth.json. Restart the app if it is running.');
  } catch {
    res.writeHead(400);
    res.end('Authorization failed. Confirm redirect URI, test user, API access, and that both scopes were granted. Then retry the command.');
    console.error('Authorization failed; no credential details logged.');
    process.exitCode = 1;
  } finally { clearTimeout(timeout); server.close(); }
});
const timeout = setTimeout(() => { console.error('Authorization timed out after 5 minutes. Run the command again.'); server.close(); }, 300_000);
server.on('error', error => { clearTimeout(timeout); console.error(`Callback server could not start (${error.code}).`); process.exitCode = 1; });
server.listen(Number(redirect.port), redirect.hostname, () => {
  console.log(`Open the following consent URL in your browser. Authorize the personal test account.\n${authorization.href}`);
});
