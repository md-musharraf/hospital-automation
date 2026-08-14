import type { Request, Response, NextFunction } from 'express';
import logger from '../utils/logger';

/** 404 for anything that reached the end of the router stack. */
export function notFoundHandler(req: Request & { requestId?: string }, res: Response): void {
  res.status(404).json({
    message: `No such endpoint: ${req.method} ${req.originalUrl.split('?')[0]}`,
    requestId: req.requestId
  });
}

export function errorHandler(
  err: any,
  req: Request & { requestId?: string },
  res: Response,
  _next: NextFunction
): void {
  const status = err.status || err.statusCode || 500;

  logger.error('unhandled route error', {
    method: req.method,
    path: req.originalUrl.split('?')[0],
    status,
    err,
    ...(status >= 500 ? { stack: err.stack } : {})
  });

  const body: Record<string, any> = {
    message: status < 500 ? err.message : 'Something went wrong on our side. Please try again.',
    requestId: req.requestId
  };
  if (status < 500 && err.details) body.details = err.details;

  res.status(status).json(body);
}
