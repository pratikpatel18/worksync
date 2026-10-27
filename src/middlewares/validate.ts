import { NextFunction, Request, Response } from 'express';
import { ZodTypeAny } from 'zod';

// Validates req.body against a Zod schema and replaces it with the parsed (cleaned) data.
// Unknown fields are stripped by the schemas themselves.
export const validateBody =
  (schema: ZodTypeAny) => (req: Request, _res: Response, next: NextFunction) => {
    req.body = schema.parse(req.body);
    next();
  };
