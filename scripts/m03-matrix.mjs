import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
const checkpoint = process.env.M03_CHECKPOINT;
if (!['M03-A', 'M03-B'].includes(checkpoint) || !process.argv.includes('--write')) throw new Error('Set M03_CHECKPOINT and pass --write.');
const dataset = Number(process.argv.find(arg => arg.startsWith('--dataset='))?.slice(10) || 1200);
if (![1200, 3000].includes(dataset)) throw new Error('Approved dataset required.');
const target = `https://ppcp-m03-${checkpoint.slice(-1).toLowerCase()}-test.vercel.app`;
const rows = [], runId = `matrix-${checkpoint}-${dataset}-${Date.now()}`;
const wait = async seconds => { for (let remaining = seconds; remaining > 0; remaining -= 15) { console.log(`Quota isolation cooldown: ${remaining} seconds remaining.`); await new Promise(resolve => setTimeout(resolve, Math.min(15, remaining) * 1000)); } };
for (const [users, scenario] of [[5, 'burst'], [10, 'burst'], [20, 'burst'], [60, 'burst'], [60, 'classroom']]) {
  await wait(65);
  console.log(`Starting ${checkpoint}, ${dataset} seeds, ${users} users, ${scenario}.`);
  const startedAt = new Date().toISOString();
  const exitCode = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['scripts/m03-capacity.mjs', `--target=${target}`, `--users=${users}`, `--dataset=${dataset}`, `--scenario=${scenario}`, '--write'], { stdio: 'inherit', env: process.env });
    child.on('error', reject); child.on('exit', resolve);
  });
  rows.push({ users, scenario, startedAt, exitCode });
  mkdirSync('output/m03', { recursive: true }); writeFileSync(`output/m03/${runId}.json`, JSON.stringify({ checkpoint, dataset, runId, rows }, null, 2));
  // A failed larger run is still a measurement. Each child enforces the circuit
  // breaker and reconciles before this runner permits another isolated scenario.
}
console.log(`Matrix completed: output/m03/${runId}.json`);
