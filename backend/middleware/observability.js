/**
 * Request observability: correlation ids, timing, and a rolling metrics window.
 *
 * Answers the questions you actually get asked when a hospital says "the system
 * is slow": which endpoint, how slow, how often, and is it failing?
 */

const crypto = require('crypto');
const logger = require('../utils/logger');

/** Anything slower than this is worth a warning line on its own. */
const SLOW_REQUEST_MS = Number(process.env.SLOW_REQUEST_MS) || 1000;

// Rolling in-process counters. Small and bounded — this is a health signal, not
// a time-series database.
const metrics = {
  startedAt: Date.now(),
  total: 0,
  byStatusClass: { '2xx': 0, '3xx': 0, '4xx': 0, '5xx': 0 },
  byRoute: new Map(), // route -> { count, totalMs, maxMs, errors }
  slowest: [] // bounded list of the slowest recent requests
};

const MAX_SLOW_SAMPLES = 10;

/** Group by the mounted router rather than the exact url, so ids don't explode the key space. */
function routeKey(req) {
  const path = (req.baseUrl || '') + (req.route ? req.route.path : '');
  return `${req.method} ${path || req.path.replace(/\/[0-9a-f]{8,}/gi, '/:id')}`;
}

/**
 * Tags every request with an id, logs it once on completion with its duration,
 * and keeps counters for the health endpoint.
 */
function requestObservability(req, res, next) {
  // Honour an upstream id if a proxy/load balancer already set one, so a trace
  // spans the whole hop chain.
  const requestId = req.headers['x-request-id'] || crypto.randomUUID();
  req.requestId = requestId;
  res.setHeader('X-Request-Id', requestId);

  const startedAt = process.hrtime.bigint();

  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
    const key = routeKey(req);
    const statusClass = `${Math.floor(res.statusCode / 100)}xx`;

    metrics.total += 1;
    if (metrics.byStatusClass[statusClass] !== undefined) metrics.byStatusClass[statusClass] += 1;

    const entry = metrics.byRoute.get(key) || { count: 0, totalMs: 0, maxMs: 0, errors: 0 };
    entry.count += 1;
    entry.totalMs += durationMs;
    entry.maxMs = Math.max(entry.maxMs, durationMs);
    if (res.statusCode >= 500) entry.errors += 1;
    metrics.byRoute.set(key, entry);

    if (durationMs >= SLOW_REQUEST_MS) {
      metrics.slowest.push({ route: key, ms: Math.round(durationMs), at: new Date().toISOString() });
      if (metrics.slowest.length > MAX_SLOW_SAMPLES) metrics.slowest.shift();
    }

    const context = {
      method: req.method,
      path: req.originalUrl.split('?')[0],
      status: res.statusCode,
      ms: Math.round(durationMs)
    };

    // Severity follows the outcome: server errors are errors, client errors are
    // warnings, slow-but-successful is a warning too (it is a real symptom).
    if (res.statusCode >= 500) logger.error('request failed', context);
    else if (res.statusCode >= 400) logger.warn('request rejected', context);
    else if (durationMs >= SLOW_REQUEST_MS) logger.warn('slow request', context);
    else logger.debug('request', context);
  });

  // Everything logged downstream inherits this request id.
  logger.withRequestId(requestId, next);
}

/** Snapshot for the health endpoint. */
function metricsSnapshot() {
  const routes = [...metrics.byRoute.entries()]
    .map(([route, s]) => ({
      route,
      count: s.count,
      avgMs: Math.round(s.totalMs / s.count),
      maxMs: Math.round(s.maxMs),
      errors: s.errors
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 15);

  return {
    uptimeSeconds: Math.round((Date.now() - metrics.startedAt) / 1000),
    totalRequests: metrics.total,
    byStatusClass: metrics.byStatusClass,
    slowestRecent: metrics.slowest,
    topRoutes: routes
  };
}

module.exports = { requestObservability, metricsSnapshot, SLOW_REQUEST_MS };
