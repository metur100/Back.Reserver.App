/* eslint-disable */
/**
 * Generates Expo Router typed-route declarations (.expo/types/router.d.ts) and expo-env.d.ts without starting the
 * dev server, so `npm run typecheck` works in CI and on fresh clones. `npx expo start` regenerates the same files.
 */
const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const appRoot = path.join(projectRoot, 'src', 'app');
const typesDir = path.join(projectRoot, '.expo', 'types');
process.env.EXPO_ROUTER_APP_ROOT = appRoot;

function resolveFromCli(request) {
  const cliDir = path.dirname(require.resolve('@expo/cli/package.json', { paths: [path.dirname(require.resolve('expo/package.json', { paths: [projectRoot] }))] }));
  return require.resolve(request, { paths: [cliDir, projectRoot] });
}

const { requireContext } = require(require.resolve('expo-router/internal/testing', { paths: [projectRoot] }));
const { EXPO_ROUTER_CTX_IGNORE } = require(require.resolve('expo-router/_ctx-shared', { paths: [projectRoot] }));
const { getTypedRoutesDeclarationFile } = require(path.join(path.dirname(resolveFromCli('@expo/router-server/build/typed-routes')), 'generate.js'));

const ctx = requireContext(appRoot, true, EXPO_ROUTER_CTX_IGNORE);
const file = getTypedRoutesDeclarationFile(ctx, {});
if (!file) {
  console.error('typegen: could not generate typed routes');
  process.exit(1);
}
fs.mkdirSync(typesDir, { recursive: true });
fs.writeFileSync(path.join(typesDir, 'router.d.ts'), file);

const envFile = path.join(projectRoot, 'expo-env.d.ts');
if (!fs.existsSync(envFile)) {
  fs.writeFileSync(envFile, '/// <reference types="expo/types" />\n\n// NOTE: This file should not be edited and should be in your git ignore\n');
}
console.log('typegen: wrote .expo/types/router.d.ts');
