import { spawnSync } from 'node:child_process';
if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST) throw new Error('Run inside the M04 Auth/Firestore emulators.');
for (const args of [['--test', 'test-m04/domain.test.mjs', 'test-m04/store.test.mjs', 'test-m04/api.test.mjs', 'test-m04/drive.test.mjs', 'test-m04/test-runs.test.mjs'], ['scripts/m04-browser.mjs']]) {
  const result = spawnSync(process.execPath, args, { stdio: 'inherit', env: process.env });
  if (result.status !== 0) process.exit(result.status || 1);
}
