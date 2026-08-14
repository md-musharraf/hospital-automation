import type { Request, Response, NextFunction, RequestHandler } from 'express';

/**
 * Removes the try/catch + `res.status(500)` block that was copy-pasted into
 * every single route handler.
 *
 * Wrap a handler and any thrown or rejected error is forwarded to the central
 * error middleware, which logs it once, with the request id, and returns one
 * consistent response shape.
 */
export function asyncHandler(
  handler: (req: Request, res: Response, next: NextFunction) => Promise<any> | any
): RequestHandler {
  return function wrapped(req: Request, res: Response, next: NextFunction) {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

/**
 * An error carrying the HTTP status it should produce, so a handler can fail
 * meaningfully without hand-writing a response:
 *
 *   if (!token) throw new HttpError(404, 'Token not found');
 */
export class HttpError extends Error {
  status: number;
  details?: any;

  constructor(status: number, message: string, details?: any) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    if (details) this.details = details;
  }
}
