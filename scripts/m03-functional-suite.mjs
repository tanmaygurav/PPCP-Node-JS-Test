import { spawn } from 'node:child_process';
if (process.env.M03_CHECKPOINT && process.env.M03_CHECKPOINT !== 'M03-B') throw new Error('M03-B only.');
if (!process.argv.includes('--write')) throw new Error('Pass --write for synthetic live fixtures.');
for (const script of ['m03-live.mjs', 'm03-boundaries.mjs', 'm03-faults.mjs']) {
  console.log(`Starting ${script} on the isolated M03-B Vercel pilot.`);
  const exit = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [`scripts/${script}`, '--target=https://ppcp-m03-b-test.vercel.app', '--write'], { stdio: 'inherit', env: { ...process.env, M03_CHECKPOINT: 'M03-B' } });
    child.on('error', reject); child.on('exit', resolve);
  });
  if (exit !== 0) { process.exitCode = 1; break; }
  if (script !== 'm03-faults.mjs') for (let left = 65; left > 0; left -= 15) {
    console.log(`Quota cooldown before next functional group: ${left} seconds.`);
    await new Promise(resolve => setTimeout(resolve, Math.min(left, 15) * 1000));
  }
}
