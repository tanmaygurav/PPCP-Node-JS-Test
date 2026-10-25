import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { loadM03Env, m03Config } from '../src/m03/config.mjs';
import { firebaseAuth } from '../src/m02/auth.mjs';
import { M03Store } from '../src/m03/store.mjs';
import { RedisCoordination } from '../src/m03/coordination.mjs';
loadM03Env(); const config = m03Config(), auth = firebaseAuth(config), store = new M03Store(config);
const { token } = JSON.parse(readFileSync('.local/vercel-cli/auth.json', 'utf8'));
const teamResponse = await fetch('https://api.vercel.com/v2/teams/team_abf9xIKj95Kv5Rei3QPOU6Gb', { headers: { Authorization: `Bearer ${token}` } });
if (!teamResponse.ok) throw new Error(`Cannot verify Vercel plan: ${teamResponse.status}`);
const team = await teamResponse.json();
const { access_token } = await auth.app.options.credential.getAccessToken();
const billingResponse = await fetch(`https://cloudbilling.googleapis.com/v1/projects/${config.projectId}/billingInfo`, { headers: { Authorization: `Bearer ${access_token}` } });
const billing = billingResponse.ok ? await billingResponse.json() : null;
const quota = await store.request('https://www.googleapis.com/drive/v3/about?fields=storageQuota');
let redis;
if (config.checkpoint === 'M03-B') {
  const coordination = new RedisCoordination(config.redis);
  const pong = await coordination.command(['PING']);
  const size = await coordination.command(['DBSIZE']);
  redis = { reachable: pong === 'PONG', keys: size, provisionedPlan: 'free', autoUpgradeRequested: false, evictionRequested: false, monthlyCommandAllowance: 500000, monthlyBandwidthBytes: 10000000000, liveProviderUsageUnavailable: true };
}
const report = { checkedAt: new Date().toISOString(), checkpoint: config.checkpoint, vercelPlan: team.billing?.plan || team.plan || null, firebaseBillingReadStatus: billingResponse.status, firebaseBillingEnabled: billing?.billingEnabled ?? null, driveStorageQuota: quota.storageQuota, redis,
  publishedAllowances: { sheetsReadPerMinutePerUserProject: 60, sheetsWritePerMinutePerUserProject: 60, sheetsReadPerMinutePerProject: 300, sheetsWritePerMinutePerProject: 300 }, paidUpgradesEnabledByThisMilestone: false };
mkdirSync('output/m03', { recursive: true }); const path = `output/m03/preflight-${config.checkpoint}-${Date.now()}.json`; writeFileSync(path, JSON.stringify(report, null, 2)); console.log(JSON.stringify(report));
if (report.vercelPlan !== 'hobby' || report.firebaseBillingEnabled === true || (redis && !redis.reachable)) throw new Error('Free-plan preflight requires review; do not schedule capacity runs.');
