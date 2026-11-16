/**
 * Minimal standalone build for dsh-dev-hub.
 *
 * Host half: ESM in lib/index.js (DSH resolves the package and loads the
 * plugin's apply()). Client half: the browser's __ModuleLoader__ closure
 * artifact in lib/client.js; React and cordis are provided by the shell.
 */
const CLIENT_EXTERNALS = [
  'react',
  'react-dom',
  'react-dom/client',
  '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-ui-conversation',
  '@deepseek-ai/dsh-client-ui-renderer',
  '@deepseek-ai/dsh-client-ui-settings',
]

export default [
  {
    name: 'dsh-dev-hub',
    entry: ['src/index.mjs'],
    outDir: 'lib',
    format: ['esm'],
    platform: 'node',
    target: 'es2022',
    fixedExtension: false,
    dts: false,
    clean: false,
    external: [/^@deepseek-ai\//],
  },
  {
    name: 'dsh-dev-hub/client',
    entry: { client: 'src/client/index.mjs' },
    outDir: 'lib',
    format: 'cjs',
    platform: 'browser',
    target: 'es2022',
    dts: false,
    sourcemap: true,
    clean: false,
    external: CLIENT_EXTERNALS,
    define: {
      'process.env.NODE_ENV': JSON.stringify('production'),
    },
    outputOptions: {
      entryFileNames: 'client.js',
      banner: `window.__ModuleLoader__.load({ id: "dsh-dev-hub", factory: (require) => {`,
      footer: 'return module.exports; } });',
      intro: 'var module = { exports: {} }; var exports = module.exports;',
    },
  },
]
