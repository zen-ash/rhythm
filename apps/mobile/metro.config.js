// Metro config for using Expo inside a pnpm + Turborepo monorepo.
// Watches the workspace root so changes in packages/* are picked up, and points
// module resolution at both the app's and the root's node_modules.
const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

// Keep Metro's defaults and also watch the workspace root so changes in
// packages/* are picked up.
config.watchFolders = [...(config.watchFolders ?? []), workspaceRoot];

// Resolve from the app first, then the hoisted workspace root. Hierarchical
// lookup is left enabled (node-linker=hoisted makes it safe), per Expo's
// recommended monorepo config.
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];

module.exports = config;
