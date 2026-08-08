/**
 * Removes the try/catch + `res.status(500)` block that was copy-pasted into
 * every single route handler (~50 of them, each subtly different: some logged,
 * some leaked `error.message` to the client, some forgot to return).
 *
 * Wrap a handler and any thrown or rejected error is forwarded to the central
 * error middleware, which logs it once, with the request id, and returns one
 * consistent response shape.
 *
 *   router.get('/thing', authenticateToken, asyncHandler(async (req, res) => {
 *     res.json(await doWork());       // no try/catch needed
 *   }));
 */
function asyncHandler(handler) {
  return function wrapped(req, res, next) {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

/**
 * An error carrying the HTTP status it should produce, so a handler can fail
 * meaningfully without hand-writing a response:
 *
 *   if (!token) throw new HttpError(404, 'Token not found');
 */
class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    if (details) this.details = details;
  }
}

module.exports = { asyncHandler, HttpError };
