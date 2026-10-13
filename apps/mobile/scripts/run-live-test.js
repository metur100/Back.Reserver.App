/* eslint-disable */
/** Runs the live API integration test (cross-platform env handling). Usage: npm run test:live [-- <api-url>] */
const { spawnSync } = require('child_process');
const url = process.argv[2] || process.env.LIVE_API_URL || 'http://localhost:5280';
const result = spawnSync(process.execPath, [require.resolve('jest/bin/jest'), 'src/__tests__/live.integration.test.ts', '--runInBand'], {
  stdio: 'inherit',
  env: { ...process.env, LIVE_API_URL: url },
  cwd: require('path').resolve(__dirname, '..'),
});
process.exit(result.status ?? 1);
