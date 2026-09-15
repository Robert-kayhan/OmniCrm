import pino, { type LoggerOptions } from 'pino';
import { env, isDevelopment, isTest } from './env';

/**
 * Values that must never reach the log stream. Pino's redaction runs on the
 * serialised object, so nesting variants are listed explicitly.
 */
const REDACTED_PATHS = [
  'password',
  '*.password',
  'accessToken',
  '*.accessToken',
  'refreshToken',
  '*.refreshToken',
  'access_token',
  '*.access_token',
  'pageAccessToken',
  '*.pageAccessToken',
  'authorization',
  'req.headers.authorization',
  'req.headers.cookie',
  'res.headers["set-cookie"]',
  'META_APP_SECRET',
  'META_PAGE_ACCESS_TOKEN',
  'JWT_SECRET',
  'JWT_REFRESH_SECRET',
  'ENCRYPTION_KEY',
];

const options: LoggerOptions = {
  level: isTest ? 'silent' : env.LOG_LEVEL,
  redact: { paths: REDACTED_PATHS, censor: '[redacted]' },
  base: { service: 'omni-crm-api' },
  formatters: {
    level: (label) => ({ level: label }),
  },
  ...(isDevelopment
    ? {
        transport: {
          target: 'pino-pretty',
          options: { colorize: true, translateTime: 'HH:MM:ss', ignore: 'pid,hostname,service' },
        },
      }
    : {}),
};

export const logger = pino(options);

export type Logger = typeof logger;
