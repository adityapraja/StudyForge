import dotenv from 'dotenv';

dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  isProduction: process.env.NODE_ENV === 'production',
  get databaseUrl() {
    return process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/tracker';
  },
  jwtSecret: process.env.JWT_SECRET || 'study-forge-development-secret-key-min-32-chars',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  cookieName: process.env.COOKIE_NAME || 'token',
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',

  // Anti-cheat & Session limits
  dailyCapHours: parseInt(process.env.DAILY_CAP_HOURS || '16', 10),
  maxSessionHours: parseInt(process.env.MAX_SESSION_HOURS || '12', 10),
  sessionXpCapHours: parseInt(process.env.SESSION_XP_CAP_HOURS || '4', 10),
  defaultStreakMinimumMinutes: parseInt(process.env.DEFAULT_STREAK_MINIMUM_MINUTES || '15', 10),
};

