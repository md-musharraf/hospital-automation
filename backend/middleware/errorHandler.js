/**
 * The single place an unhandled route error becomes an HTTP response.
 *
 * Previously each handler decided for itself, which produced three problems:
 * inconsistent response shapes, `error.message` leaking internals (including
 * Mongo error text) to unauthenticated clients, and errors logged in a dozen
 * different formats — or not at all.
 */

const logger = require('../utils/logger');

/** 404 for anything that reached the end of the router stack. */
function notFoundHandler(req, res) {
  res.status(404).json({
    message: `No such endpoint: ${req.method} ${req.originalUrl.split('?')[0]}`,
    requestId: req.requestId
  });
}

// eslint-disable-next-line no-unused-vars -- Express identifies error middleware by arity (4 args)
function errorHandler(err, req, res, next) {
  const status = err.status || err.statusCode || 500;

  logger.error('unhandled route error', {
    method: req.method,
    path: req.originalUrl.split('?')[0],
    status,
    err,
    ...(status >= 500 ? { stack: err.stack } : {})
  });

  // Client errors (4xx) are the caller's fault and safe to explain. Server
  // errors are ours: return the request id so a user can quote it in a report,
  // and keep the internals in the logs where they belong.
  const body = {
    message: status < 500 ? err.message : 'Something went wrong on our side. Please try again.',
    requestId: req.requestId
  };
  if (status < 500 && err.details) body.details = err.details;

  res.status(status).json(body);
}

module.exports = { errorHandler, notFoundHandler };
