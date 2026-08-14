/**
 * Structured, levelled logger.
 *
 * The backend previously wrote ~190 bare `console.log` / `console.error` calls with
 * no level, no timestamp and no way to correlate the lines belonging to one
 * request. When a patient reports "the booking failed at 11:40", you could not
 * find their request in the noise.
 *
 * What this gives you:
 *   - LEVELS, filterable via LOG_LEVEL (error < warn < info < debug). Set
 *     LOG_LEVEL=warn in production to silence the chatter without code changes.
 *   - a REQUEST ID on every line emitted while handling a request, so one
 *     patient's journey through the logs is greppable.
 *   - CONTEXT as real fields rather than string-concatenated prose, so the output
 *     can be shipped to any log aggregator later without reparsing.
 *   - JSON output when LOG_FORMAT=json (for hosted log collectors), otherwise a
 *     compact human-readable line for local development.
 *
 * Deliberately dependency-free: adding winston/pino for this codebase's volume
 * would be weight without benefit, and this keeps `npm install` small.
 */

import { AsyncLocalStorage } from 'async_hooks';

export type LogLevel = 'error' | 'warn' | 'info' | 'debug';

export interface RequestStore {
  requestId?: string;
  [key: string]: any;
}

export const LEVELS: Record<LogLevel, number> = { error: 0, warn: 1, info: 2, debug: 3 };
export const activeLevel: number =
  LEVELS[(process.env.LOG_LEVEL || 'info').toLowerCase() as LogLevel] ?? LEVELS.info;
const asJson = process.env.LOG_FORMAT === 'json';

// Carries the current request's id through async calls without every function
// having to thread it down as an argument.
const requestContext = new AsyncLocalStorage<RequestStore>();

const COLOURS: Record<LogLevel, string> = {
  error: '\x1b[31m',
  warn: '\x1b[33m',
  info: '\x1b[36m',
  debug: '\x1b[90m'
};
const RESET = '\x1b[0m';
const useColour = Boolean(process.stdout.isTTY && !asJson);

/** Errors serialise to `{}` through JSON.stringify — pull the useful bits out. */
function serialise(value: any): any {
  if (value instanceof Error) {
    return {
      message: value.message,
      name: value.name,
      ...(typeof (value as any).code !== 'undefined' ? { code: (value as any).code } : {})
    };
  }
  return value;
}

function emit(level: LogLevel, message: string, context?: Record<string, any>) {
  if (LEVELS[level] > activeLevel) return;

  const store = requestContext.getStore();
  const entry: Record<string, any> = {
    time: new Date().toISOString(),
    level,
    message,
    ...(store && store.requestId ? { requestId: store.requestId } : {}),
    ...(context ? Object.fromEntries(Object.entries(context).map(([k, v]) => [k, serialise(v)])) : {})
  };

  const line = asJson
    ? JSON.stringify(entry)
    : (() => {
        const { time, level: lvl, message: msg, ...rest } = entry;
        const tag = useColour
          ? `${COLOURS[lvl as LogLevel]}${(lvl as string).toUpperCase().padEnd(5)}${RESET}`
          : (lvl as string).toUpperCase().padEnd(5);
        const extras = Object.keys(rest).length ? ` ${JSON.stringify(rest)}` : '';
        return `${(time as string).slice(11, 23)} ${tag} ${msg}${extras}`;
      })();

  // Anything at warn or above goes to stderr so process managers and hosting
  // platforms surface it as a problem rather than burying it in stdout.
  if (level === 'error' || level === 'warn') console.error(line);
  else console.log(line);
}

export interface LoggerInstance {
  error: (message: string, context?: Record<string, any>) => void;
  warn: (message: string, context?: Record<string, any>) => void;
  info: (message: string, context?: Record<string, any>) => void;
  debug: (message: string, context?: Record<string, any>) => void;
  child: (more?: Record<string, any>) => LoggerInstance;
}

const logger = {
  error: (message: string, context?: Record<string, any>) => emit('error', message, context),
  warn: (message: string, context?: Record<string, any>) => emit('warn', message, context),
  info: (message: string, context?: Record<string, any>) => emit('info', message, context),
  debug: (message: string, context?: Record<string, any>) => emit('debug', message, context),

  /**
   * A logger bound to a fixed set of fields, e.g.
   *   const log = logger.child({ module: 'whatsapp' });
   * Keeps call sites short and makes filtering by module trivial.
   */
  child(bound: Record<string, any> = {}): LoggerInstance {
    const wrap = (level: LogLevel) => (message: string, context?: Record<string, any>) =>
      emit(level, message, { ...bound, ...context });
    return {
      error: wrap('error'),
      warn: wrap('warn'),
      info: wrap('info'),
      debug: wrap('debug'),
      child: (more: Record<string, any> = {}) => logger.child({ ...bound, ...more })
    };
  },

  /** Run `fn` with `requestId` attached to every log line it produces. */
  withRequestId<T>(requestId: string, fn: () => T): T {
    return requestContext.run({ requestId }, fn);
  },

  /** The id of the request currently being handled, if any. */
  currentRequestId(): string | undefined {
    const store = requestContext.getStore();
    return store && store.requestId;
  },

  LEVELS,
  activeLevel
};

export default logger;
module.exports = logger;
