import { NextFunction, Request, RequestHandler, Response } from 'express';

// Express 4 does not catch rejected promises from async handlers.
// This wrapper forwards any thrown error to the global error handler.
export const asyncHandler =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler =>
  (req, res, next) => {
    fn(req, res, next).catch(next);
  };
