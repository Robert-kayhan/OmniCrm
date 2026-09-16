import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR, APP_PIPE, Reflector } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';
import { ChannelModule } from './channels/channel.module';
import { AuthCoreModule } from './common/auth/auth-core.module';
import { CryptoModule } from './common/crypto/crypto.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { PermissionsGuard } from './common/guards/permissions.guard';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { AppValidationPipe } from './common/pipes/validation.pipe';
import { AppThrottlerGuard } from './common/throttler/app-throttler.guard';
import { AppThrottlerModule } from './common/throttler/throttler.module';
import { AppConfigModule } from './config/config.module';
import { isProduction } from './config/env';
import { loggerConfig } from './config/logger.config';
import { PrismaModule } from './database/prisma.module';
import { RedisModule } from './database/redis.module';
import { HealthModule } from './health/health.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { AssignmentModule } from './modules/assignments/assignment.module';
import { AuditLogModule } from './modules/audit-logs/audit-log.module';
import { AuthModule } from './modules/auth/auth.module';
import { ConversationModule } from './modules/conversations/conversation.module';
import { CustomerChannelModule } from './modules/customer-channels/customer-channel.module';
import { CustomerModule } from './modules/customers/customer.module';
import { DevToolsModule } from './modules/dev-tools/dev-tools.module';
import { IntegrationModule } from './modules/integrations/integration.module';
import { MessageModule } from './modules/messages/message.module';
import { NoteModule } from './modules/notes/note.module';
import { NotificationModule } from './modules/notifications/notification.module';
import { OrganizationModule } from './modules/organizations/organization.module';
import { TagModule } from './modules/tags/tag.module';
import { TeamModule } from './modules/teams/team.module';
import { UserModule } from './modules/users/user.module';
import { WebhookModule } from './modules/webhooks/webhook.module';
import { RealtimeModule } from './realtime/realtime.module';
import { AppController } from './app.controller';

/**
 * The application root.
 *
 * The cross-cutting behaviour is registered once here rather than per route,
 * which is the whole point of the move to Nest: authentication, permissions,
 * throttling, validation, the success envelope and the error shape apply to
 * every endpoint by default, and a route opts out explicitly with a decorator.
 *
 * Guard order is the registration order below and it matters: authenticate
 * before checking permissions, and throttle last so a rejected request has
 * still been counted against the right (per-user) key.
 */
@Module({
  imports: [
    // --- Infrastructure, all global ---------------------------------------
    AppConfigModule,
    LoggerModule.forRoot(loggerConfig),
    PrismaModule,
    RedisModule,
    CryptoModule,
    AuthCoreModule,
    ChannelModule,
    RealtimeModule,
    AppThrottlerModule,
    AuditLogModule,

    // --- Features ---------------------------------------------------------
    HealthModule,
    AuthModule,
    OrganizationModule,
    UserModule,
    TeamModule,
    IntegrationModule,
    CustomerModule,
    CustomerChannelModule,
    ConversationModule,
    MessageModule,
    AssignmentModule,
    TagModule,
    NoteModule,
    NotificationModule,
    AnalyticsModule,
    DevToolsModule,
    WebhookModule,
  ],
  controllers: [AppController],
  providers: [
    { provide: APP_PIPE, useClass: AppValidationPipe },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
    { provide: APP_GUARD, useClass: AppThrottlerGuard },
    { provide: APP_INTERCEPTOR, useClass: ResponseInterceptor },
    {
      provide: APP_FILTER,
      inject: [Reflector],
      // The filter needs to know whether to attach stack traces, which is the
      // one thing it cannot read off the exception itself.
      useFactory: () => new AllExceptionsFilter(isProduction),
    },
  ],
})
export class AppModule {}
