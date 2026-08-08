# Contributing to CareeAi

How this codebase is laid out, the conventions it follows, and how to get a
change from your machine to `main` without breaking a live hospital.

---

## Quick start

```bash
npm run install:all          # root + backend + frontend dependencies
```

Atlas is not reachable from every dev machine. To run fully locally, on an
in-memory database with demo data:

```bash
cd backend && AUTO_SEED=true node index.js     # terminal 1  (port 5000)
npm run dev:frontend                           # terminal 2  (port 5173)
```

`USE_MOCK_DB=true` is already set in `backend/.env`. `AUTO_SEED` is **not** — without
it the server starts with an empty database and no doctors, so nothing can be booked.

| Command                    | What it does                                                |
| -------------------------- | ----------------------------------------------------------- |
| `npm run lint`             | ESLint over backend + frontend                               |
| `npm run lint:fix`         | …and fix what can be fixed automatically                     |
| `npm run format`           | Prettier over the repo                                       |
| `npm test`                 | Chat-engine suite — no DB, no server, ~1s                    |
| `npm run test:integration` | Full cross-role flow — **needs a running backend**           |
| `npm run verify`           | `lint` + `test`; run this before you push                    |
| `npm run build`            | Production frontend build                                    |

---

## Folder structure

```
backend/
  index.js            Express + Socket.io bootstrap, cron jobs, server startup
  models/             Mongoose schemas — one file per collection, nouns
  routes/             HTTP endpoints, one file per role/domain
  middleware/         Cross-cutting request concerns (auth, errors, observability)
  utils/              Pure-ish domain logic and helpers, no HTTP awareness

frontend/src/
  App.jsx             Router, the shared socket, BACKEND_URL resolution
  components/         One file per portal/screen (PascalCase, matches the export)
  hooks/              Reusable behaviour (use* prefix)
  lib/                Non-React utilities — the API client lives here
  theme/              Design tokens

tests/
  *.test.js           Suites, run directly with node
  helpers/            Shared mock DB and assertions
  manual/             Probes you run by hand to watch live behaviour
```

**Where does new code go?**

- Talking to the database or shaping domain data → `backend/utils/`
- Something every request needs → `backend/middleware/`
- A new endpoint → the `backend/routes/` file for that role
- Behaviour shared by two or more React components → `frontend/src/hooks/`
- Anything non-React and reusable → `frontend/src/lib/`

---

## Conventions

**Naming**

- Files: `camelCase.js` for backend modules, `PascalCase.jsx` for React components.
- Functions are verbs (`facilityTokens`, `consumeStock`, `setStage`);
  booleans read as questions (`hasPendingTests`, `allTestsComplete`).
- No abbreviations that need a glossary — `prescription`, not `presc`.

**Comments explain _why_, never _what_.** The code already says what it does. A
comment earns its place by recording the reason a decision was made — the
constraint, the bug it prevents, the thing that looks wrong but isn't.

**Every route handler follows the same shape:**

```js
router.get(
  '/thing',
  authenticateToken,
  ensureRole('doctor'),
  asyncHandler(async (req, res) => {
    const hospital = facilityOf(req);              // never read req.user.hospital raw
    const thing = await Thing.findById(req.params.id);
    if (!thing) throw new HttpError(404, 'Not found');   // no hand-written 500s
    res.json(thing);
  })
);
```

`backend/routes/ops.js` is the reference implementation.

**Do not re-implement these — they already exist:**

| Need                              | Use                                            |
| --------------------------------- | ---------------------------------------------- |
| "today" boundary, elapsed minutes | `utils/dates.js`                               |
| id from a maybe-populated ref     | `utils/ids.js` (`toId`, `sameId`)              |
| only this facility's data         | `utils/tenancy.js`                             |
| role guard                        | `ensureRole('lab')` from `middleware/auth.js`  |
| try/catch in a handler            | `asyncHandler`                                 |
| logging                           | `utils/logger.js` — never bare `console.log`   |
| calling the API from React        | `lib/api.js` (`createApi(token)`)              |
| reacting to socket events         | `hooks/useLiveRefresh.js`                      |
| joining facility rooms            | `hooks/useFacilitySocket.js`                   |

### SOLID in practice here

- **Single responsibility** — `utils/` modules do one thing: `dates` knows time,
  `ids` knows references, `tenancy` knows facility boundaries, `stockHelper`
  knows medicine stock. When a file starts needing "and" to describe it, split it.
- **Open/closed** — add a new journey stage by extending the enum in
  `models/Token.js` and `utils/journeyHelper.js`; no route needs editing because
  they all derive the stage rather than hard-coding transitions.
- **Dependency inversion** — routes depend on helper functions, not on Mongoose
  query syntax. That is what lets the test suite swap in an in-memory store with
  no changes to the code under test.

---

## Branching model

`main` is deployed. It must always be green.

```
main
 └── <type>/<short-description>        e.g. fix/lab-result-race
                                            feat/patient-sms-reminders
                                            chore/engineering-hygiene
```

Types: `feat`, `fix`, `chore`, `refactor`, `docs`, `perf`.

**The flow:**

1. `git checkout main && git pull`
2. `git checkout -b fix/thing-that-is-broken`
3. Commit as you go — the pre-commit hook lints staged files and runs `npm test`.
4. Before opening a PR, run the full check against a live server:
   ```bash
   cd backend && AUTO_SEED=true node index.js     # fresh DB
   npm run verify && npm run test:integration
   ```
   The integration suite asserts absolute counts, so it needs a **freshly
   restarted** backend.
5. Push the branch and open a PR into `main`.
6. Merge once green, then delete the branch.

**Never commit straight to `main`**, and never `--no-verify` past the hook. If the
hook is in your way, the fix is to make the hook faster or the test correct — not
to skip it.

---

## Testing

Two suites, deliberately different in cost:

**`npm test`** — the chat state engine against in-memory models. No database, no
server, no network. Fast enough to run on every commit, which is why the hook does.

**`npm run test:integration`** — the real HTTP API, walking one patient through
Reception → Doctor → Lab → Doctor → Pharmacy and asserting that every role sees
the same shared state. Needs a running, freshly-seeded backend.

Adding a test: copy the shape in `tests/chat-engine.test.js`. `section()` groups,
`check(label, condition, detail)` asserts, `report()` sets the exit code. If your
feature touches more than one role, it belongs in the integration suite.

---

## Logging and observability

```js
const logger = require('../utils/logger');

logger.info('token booked', { tokenNumber, doctorId });
logger.error('dispense failed', { err, tokenNumber });
```

- Levels: `error` `warn` `info` `debug`, filtered by `LOG_LEVEL` (default `info`).
- `LOG_FORMAT=json` emits one JSON object per line for log collectors.
- Every request gets an `X-Request-Id`; every log line written while handling it
  carries the same id, so one patient's journey is greppable.
- Pass context as **fields**, not string concatenation — `{ tokenNumber }`, not
  `` `token ${n}` ``.
- `GET /api/v1/health` reports uptime, memory, database state, request volume,
  status mix and the slowest recent routes. It returns **503** when the database
  is down, so a monitor treats it as an outage rather than a healthy 200.

---

## Performance notes

Two things that are easy to undo by accident:

- **Coalesce socket refreshes.** One clinical action fans out into several
  events. Subscribing each one to its own loader means a single click triggers
  four full refetches. Use `useLiveRefresh`, which collapses a burst into one.
- **Keep the vendor chunks split.** `vite.config.js` separates React, the router
  and socket.io from app code so a routine deploy doesn't invalidate them in
  everyone's browser cache.
