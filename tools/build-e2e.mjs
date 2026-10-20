// The build the online end-to-end tests use: the production build, pointed
// at a matchmaking server on localhost:3000, in dist-e2e/.
//
//   npm run build:e2e
import { build } from 'vite';

process.env.VITE_SERVER_URL = 'http://localhost:3000';
await build({ build: { outDir: 'dist-e2e', emptyOutDir: true }, logLevel: 'warn' });
