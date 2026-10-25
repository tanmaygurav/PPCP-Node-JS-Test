import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
const checkpoint = process.argv.find(arg => arg.startsWith('--checkpoint='))?.slice(13) || 'M03-B';
const suffix = checkpoint.slice(-1).toLowerCase(), ids = { a: 'prj_mH12fBmpYgAMbzNpI9i97Cr8wnqv', b: 'prj_LZL4nesFDJRUkwWxcJOtjyyKY9ha' };
if (!ids[suffix] || !['M03-A', 'M03-B'].includes(checkpoint)) throw new Error('M03 checkpoint required.');
const { token } = JSON.parse(readFileSync('.local/vercel-cli/auth.json', 'utf8'));
async function get(path) { const response = await fetch(`https://api.vercel.com${path}${path.includes('?') ? '&' : '?'}teamId=team_abf9xIKj95Kv5Rei3QPOU6Gb`, { headers: { Authorization: `Bearer ${token}` } }); if (!response.ok) throw new Error(`Deployment metadata read failed: ${response.status}`); return response.json(); }
const project = await get(`/v9/projects/${ids[suffix]}`), alias = await get(`/v4/aliases/ppcp-m03-${suffix}-test.vercel.app`);
if (project.name !== `ppcp-m03-${suffix}-test` || alias.projectId !== ids[suffix]) throw new Error('Pilot project/alias identity mismatch.');
const deployment = await get(`/v13/deployments/${alias.deploymentId || alias.deployment?.id}`);
const branch = suffix === 'a' ? 'milestone/m03-a-submission-baseline' : 'milestone/m03-b-editing';
const report = { checkedAt: new Date().toISOString(), checkpoint, projectId: ids[suffix], url: `https://ppcp-m03-${suffix}-test.vercel.app`, deploymentId: deployment.id, sourceCommit: deployment.meta?.githubCommitSha, deploymentBranch: deployment.meta?.githubCommitRef, productionBranch: project.link?.productionBranch, expectedBranch: branch, ready: deployment.readyState === 'READY', regions: deployment.regions, frozen: deployment.meta?.githubCommitRef === branch && project.link?.productionBranch === branch };
mkdirSync('output/m03', { recursive: true }); writeFileSync(`output/m03/deployment-${checkpoint}.json`, JSON.stringify(report, null, 2)); console.log(JSON.stringify(report));
if (process.argv.includes('--require-frozen') && !report.frozen) throw new Error('Pilot is not frozen on its milestone branch.');
