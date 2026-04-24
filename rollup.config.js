import typescript from '@rollup/plugin-typescript';
import { dts } from 'rollup-plugin-dts';

const name = 'SJAudio';
const input = 'src/index.ts';

export default [
  // ESM + CJS
  {
    input,
    output: [
      { file: 'dist/sj-audio.esm.js', format: 'esm', sourcemap: true },
      { file: 'dist/sj-audio.cjs.js', format: 'cjs', sourcemap: true, exports: 'named' },
    ],
    plugins: [typescript({ tsconfig: './tsconfig.json' })],
  },
  // UMD — browser drop-in, exposes window.SJAudio
  {
    input,
    output: {
      file: 'dist/sj-audio.umd.js',
      format: 'umd',
      name,
      sourcemap: true,
      exports: 'named',
    },
    plugins: [typescript({ tsconfig: './tsconfig.json', declaration: false, declarationMap: false })],
  },
  // .d.ts bundle
  {
    input,
    output: { file: 'dist/index.d.ts', format: 'esm' },
    plugins: [dts()],
  },
];
