const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

/**
 * Metro moet buiten apps/mobile kunnen kijken, want @game/shared staat in
 * packages/shared en wordt als TypeScript-bron meegebundeld.
 */
const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];
config.resolver.disableHierarchicalLookup = true;

/**
 * Three.js maar één keer in de bundel.
 *
 * three levert zowel een CommonJS- als een ESM-versie. Metro koos daar per
 * importeur een andere van, waardoor er twee kopieen in de app zaten — met de
 * waarschuwing "Multiple instances of Three.js being imported" tot gevolg.
 * Dat is niet alleen een halve megabyte extra: twee kopieen betekent twee keer
 * dezelfde klasse, en dan gaat elke `instanceof` tussen die twee werelden mis.
 *
 * Door de conditienamen vast te zetten kiest Metro overal dezelfde variant.
 */
config.resolver.unstable_conditionNames = ['react-native', 'browser', 'require'];

module.exports = config;
