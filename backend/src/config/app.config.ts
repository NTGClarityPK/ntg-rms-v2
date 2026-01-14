import { registerAs } from '@nestjs/config';

/**
 * Application configuration
 * Centralized configuration values to avoid hardcoding
 */
export default registerAs('app', () => ({
  port: parseInt(process.env.PORT || '8001', 10),
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:8000',
  apiUrl: process.env.API_URL || 'http://localhost:8001',
  environment: process.env.NODE_ENV || 'development',
  apiPrefix: 'api/v1',
  servers: {
    production: process.env.PRODUCTION_URL || 'http://192.168.50.50:5001',
    staging: process.env.STAGING_URL || 'http://192.168.50.50:8001',
    development: process.env.DEVELOPMENT_URL || 'http://localhost:3001',
  },
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:8000',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  },
}));
