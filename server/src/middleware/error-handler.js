import { ZodError } from 'zod';
import { config } from '../config.js';

export class AppError extends Error {
  constructor(statusCode, code, message, fields = null, extra = null) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.fields = fields;
    this.extra = extra;
  }
}

export const errorHandler = (err, req, res, next) => {
  // If headers already sent, delegate to Express default handler
  if (res.headersSent) {
    return next(err);
  }

  // Handle Zod validation errors
  if (err instanceof ZodError) {
    const fields = {};
    for (const issue of err.issues) {
      const fieldPath = issue.path.join('.');
      fields[fieldPath || 'body'] = issue.message;
    }
    return res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid request data',
        fields,
      },
    });
  }

  // Handle explicit application errors
  if (err instanceof AppError) {
    const errorBody = {
      code: err.code,
      message: err.message,
    };
    if (err.fields) {
      errorBody.fields = err.fields;
    }
    if (err.extra && typeof err.extra === 'object') {
      Object.assign(errorBody, err.extra);
    }
    return res.status(err.statusCode).json({
      error: errorBody,
    });
  }

  // Unexpected / unhandled errors
  console.error('[Internal Error]:', err);

  return res.status(500).json({
    error: {
      code: 'INTERNAL',
      message: config.isProduction ? 'Internal server error' : err.message || 'Internal server error',
    },
  });
};

