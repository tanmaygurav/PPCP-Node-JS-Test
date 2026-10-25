import { execFileSync } from 'node:child_process';
import { cpSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
const milestone = process.env.M03_CHECKPOINT ? 'm03' : 'm02';
execFileSync(process.execPath, [`check-${milestone}.mjs`], { stdio: 'inherit' });
execFileSync(process.execPath, ['node_modules/vite/bin/vite.js', 'build', '--config', `vite.${milestone}.config.mjs`], { stdio: 'inherit' });
// This fixed, workspace-local generated directory is never a source artifact.
const output = resolve('dist-deployment');
if (!output.startsWith(resolve('.') + (process.platform === 'win32' ? '\\' : '/'))) throw new Error('Invalid build output path.');
rmSync(output, { recursive: true, force: true });
cpSync(`dist-${milestone}`, output, { recursive: true });
