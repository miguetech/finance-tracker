import { build } from 'esbuild'

await build({
  entryPoints: ['src/backend.ts'],
  outfile: 'dist/Code.js',
  bundle: true,
  format: 'iife',
  platform: 'neutral',
  target: 'es2020',
  minify: false,
  sourcemap: false,
  logLevel: 'info'
})
