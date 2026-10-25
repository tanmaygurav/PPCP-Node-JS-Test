import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
const teamId = 'team_abf9xIKj95Kv5Rei3QPOU6Gb', projectId = 'prj_VSQ1HfIdZmNiFOhIT81Bja3jrAi2';
const { token } = JSON.parse(readFileSync('.local/vercel-cli/auth.json', 'utf8'));
async function get(path) {
  const response = await fetch(`https://api.vercel.com${path}${path.includes('?') ? '&' : '?'}teamId=${teamId}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) throw new Error(`Vercel metadata request failed (HTTP ${response.status}).`);
  return response.json();
}
const project = await get(`/v9/projects/${projectId}`);
if (project.name !== 'ppcp-m02-auth-test') throw new Error('Wrong project.');
const alias = await get('/v4/aliases/ppcp-m02-auth-test.vercel.app');
if (alias.projectId !== projectId) throw new Error('Wrong alias project.');
const deployment = await get(`/v13/deployments/${alias.deploymentId}`);
const report = {
  timestamp: new Date().toISOString(), projectId, projectName: project.name,
  productionBranch: project.link?.productionBranch || null,
  productionBranchEvidence: project.link?.productionBranch ? 'Vercel project.link.productionBranch' : 'Unavailable; verify Branch Tracking in dashboard.',
  alias: { name: alias.alias, projectId: alias.projectId, deploymentId: alias.deploymentId },
  deployment: { id: deployment.id, readyState: deployment.readyState, target: deployment.target,
    branch: deployment.meta?.githubCommitRef || null, commit: deployment.meta?.githubCommitSha || null },
  expectedAppCommit: 'c1c27314b165c267ad4a6329a63646c643d8f4d3',
  expectedMilestoneBranch: 'milestone/m02-firebase-auth'
};
report.sourceMatches = report.deployment.commit === report.expectedAppCommit;
report.branchTrackingMatches = report.productionBranch === report.expectedMilestoneBranch;
mkdirSync('test-evidence/m02', { recursive: true });
writeFileSync('test-evidence/m02/vercel-production-verification.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify(report));
