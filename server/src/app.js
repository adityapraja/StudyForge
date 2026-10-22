import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';

import { config } from './config.js';
import { errorHandler, AppError } from './middleware/error-handler.js';

import authRoutes from './modules/auth/auth.routes.js';
import usersRoutes from './modules/users/users.routes.js';
import subjectsRoutes from './modules/subjects/subjects.routes.js';
import sessionsRoutes from './modules/sessions/sessions.routes.js';
import plannerRoutes from './modules/planner/planner.routes.js';
import statsRoutes from './modules/stats/stats.routes.js';

export const createApp = () => {
  const app = express();

  // Security headers
  app.use(helmet());

  // CORS configuration
  app.use(
    cors({
      origin: config.clientUrl || true,
      credentials: true,
    })
  );

  // Body parsing and cookies
  app.use(express.json());
  app.use(cookieParser());

  // Health check
  app.get('/healthz', (req, res) => {
    res.status(200).json({ ok: true });
  });

  // REST API Routes under /api
  app.use('/api/auth', authRoutes);
  app.use('/api/me', usersRoutes);
  app.use('/api/subjects', subjectsRoutes);
  app.use('/api/sessions', sessionsRoutes);
  app.use('/api/planner', plannerRoutes);
  app.use('/api/stats', statsRoutes);

  // 404 handler for undefined routes
  app.use((req, res, next) => {
    next(new AppError(404, 'NOT_FOUND', `Route not found: ${req.method} ${req.originalUrl}`));
  });

  // Central error handling middleware
  app.use(errorHandler);

  return app;
};

export default createApp;
