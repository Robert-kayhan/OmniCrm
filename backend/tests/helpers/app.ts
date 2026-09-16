import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import type { Server } from 'node:http';
import { AppModule } from '../../src/app.module';
import { bodyParserErrors } from '../../src/common/middleware/body-parser-errors.middleware';
import { assignRequestId } from '../../src/common/middleware/request-id.middleware';
import { PrismaService } from '../../src/database/prisma.service';

/**
 * One Nest application for the whole run.
 *
 * Booting the real AppModule — not a hand-assembled subset — is the point:
 * the global validation pipe, the auth and permission guards, the throttler,
 * the response envelope and the exception filter are all registered there, so
 * a request in a test travels exactly the path a production request does.
 *
 * The bits `main.ts` adds around the app (helmet, compression, CORS) are
 * deliberately left out; they shape headers rather than behaviour, and supertest
 * talks to the server directly.
 */
let app: INestApplication | null = null;

export async function initTestApp(): Promise<INestApplication> {
  if (app) return app;

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();

  const nestApp = moduleRef.createNestApplication<NestExpressApplication>({
    // The webhook signature check reads the exact bytes Meta signed.
    rawBody: true,
    bodyParser: false,
    logger: false,
  });
  app = nestApp;

  // The same order main.ts uses. It is not cosmetic: the correlation id has to
  // be assigned before the parsers, and the parser error translator has to sit
  // between them and the router, so a test sees the codes production returns.
  nestApp.use(assignRequestId);
  nestApp.use(cookieParser());
  nestApp.useBodyParser('json', { limit: '1mb' });
  nestApp.useBodyParser('urlencoded', { limit: '1mb', extended: true });
  nestApp.use(bodyParserErrors);
  nestApp.setGlobalPrefix('api');

  await app.init();
  return app;
}

export function testApp(): INestApplication {
  if (!app) throw new Error('The test application has not been initialised');
  return app;
}

/** The HTTP server supertest drives. */
export function httpServer(): Server {
  return testApp().getHttpServer() as Server;
}

/** The container's Prisma client, so fixtures and assertions share one pool. */
export function db(): PrismaService {
  return testApp().get(PrismaService);
}

export async function closeTestApp(): Promise<void> {
  if (!app) return;
  await app.close();
  app = null;
}
