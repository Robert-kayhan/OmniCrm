import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import {
  CursorMetaDto,
  ErrorBodyDto,
  PaginationMetaDto,
} from '../common/http/api-response.dto';
import type { AppConfigService } from './app-config.service';

export const DOCS_PATH = 'api/docs';

const DESCRIPTION = `
Omnichannel CRM API.

**Response shape.** Every 2xx body is \`{ "success": true, "data": … }\`, with a
\`meta\` object alongside \`data\` on paginated lists. Every non-2xx body is
\`{ "success": false, "message", "code" }\`. Branch on \`code\` — it is a stable
part of the contract, while \`message\` is human-facing and may be reworded.

**Authentication.** \`POST /api/auth/login\` returns an access token; send it as
\`Authorization: Bearer <token>\`. The refresh token is set as an httpOnly cookie
scoped to \`/api/auth\` and is not returned in the body. Routes are authenticated
by default — the few public ones say so.

**Authorization.** Permissions are checked per route and derive from the
caller's role. A 403 means the role lacks the permission, not that the record is
missing; a record the caller may not see returns 404 rather than confirming it
exists.

**Tenancy.** The organization is taken from the verified token and never from a
request parameter, so there is no tenant id to pass anywhere.

**Correlation.** Send \`X-Request-Id\` to have it echoed back on the response and
included in every log line and error body for that request.
`.trim();

/**
 * Publishes the OpenAPI document and its browser UI.
 *
 * Gated rather than unconditional: the document enumerates every route, the
 * permission each one needs and the exact shape of its payloads, which is a map
 * of the attack surface. It follows NODE_ENV unless ENABLE_API_DOCS overrides.
 */
export function setupSwagger(app: INestApplication, config: AppConfigService): void {
  if (!config.apiDocsEnabled) return;

  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('Omni CRM API')
      .setDescription(DESCRIPTION)
      .setVersion('0.1.0')
      .addServer(config.backendUrl)
      .addBearerAuth(
        {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'The access token from POST /api/auth/login.',
        },
        'bearer',
      )
      .build(),
    {
      // Referenced by the envelope helpers rather than by a handler's return
      // type, so the generator needs telling they exist.
      extraModels: [PaginationMetaDto, CursorMetaDto, ErrorBodyDto],
    },
  );

  SwaggerModule.setup(DOCS_PATH, app, document, {
    jsonDocumentUrl: `${DOCS_PATH}-json`,
    customSiteTitle: 'Omni CRM API',
    swaggerOptions: {
      // The inbox has a lot of routes; collapsed tags make the page navigable.
      docExpansion: 'none',
      tagsSorter: 'alpha',
      operationsSorter: 'alpha',
      // Keeps the token across a page reload while exploring.
      persistAuthorization: true,
    },
  });
}
