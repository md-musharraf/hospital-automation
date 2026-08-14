/**
 * Where the tests load the backend from.
 * ---------------------------------------------------------------------------
 * The backend is TypeScript now, and Node cannot `require()` a `.ts` file. So
 * the suite runs against the COMPILED output in `backend/dist` — the same
 * artifact `npm start` boots in production, which is the point: a test that
 * exercises source the deployed process never runs is testing a different
 * program.
 *
 * `npm test` builds before it runs (see the root package.json), so this path is
 * always fresh. If it is missing, say so in one clear line rather than letting
 * ten suites each fail with an unexplained MODULE_NOT_FOUND.
 */
const fs = require('fs');
const path = require('path');

const BACKEND_DIST = path.resolve(__dirname, '..', '..', 'backend', 'dist');

if (!fs.existsSync(BACKEND_DIST)) {
  console.error(
    `\n[tests] backend/dist not found.\n` +
      `The backend is TypeScript and the suite runs against its compiled output.\n` +
      `Build it first:  npm run build:backend\n`
  );
  process.exit(1);
}

module.exports = { BACKEND_DIST };
