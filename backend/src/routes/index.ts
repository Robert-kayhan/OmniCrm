import { Router } from 'express';
import { healthRouter } from './health.routes';
import { authRouter } from '../modules/auth/auth.routes';
import { organizationRouter } from '../modules/organizations/organization.routes';
import { userRouter } from '../modules/users/user.routes';
import { teamRouter } from '../modules/teams/team.routes';
import { integrationRouter } from '../modules/integrations/integration.routes';
import { customerRouter } from '../modules/customers/customer.routes';
import { conversationRouter } from '../modules/conversations/conversation.routes';
import { tagRouter } from '../modules/tags/tag.routes';
import { noteRouter } from '../modules/notes/note.routes';
import { notificationRouter } from '../modules/notifications/notification.routes';
import { auditLogRouter } from '../modules/audit-logs/audit-log.routes';
import { analyticsRouter } from '../modules/analytics/analytics.routes';
import { devToolsRouter } from '../modules/dev-tools/dev-tools.routes';

/**
 * Single mount point for the API. Each module owns its own router and its own
 * auth/permission requirements; nothing is globally authenticated here so that
 * public routes (health) stay explicit.
 *
 * Webhooks are mounted directly in app.ts, ahead of the global rate limiter —
 * see the comment there.
 */
export const apiRouter = Router();

apiRouter.use('/health', healthRouter);
apiRouter.use('/auth', authRouter);
apiRouter.use('/organizations', organizationRouter);
apiRouter.use('/users', userRouter);
apiRouter.use('/teams', teamRouter);
apiRouter.use('/integrations', integrationRouter);
apiRouter.use('/customers', customerRouter);
apiRouter.use('/conversations', conversationRouter);
apiRouter.use('/tags', tagRouter);
apiRouter.use('/notes', noteRouter);
apiRouter.use('/notifications', notificationRouter);
apiRouter.use('/audit-logs', auditLogRouter);
apiRouter.use('/analytics', analyticsRouter);
apiRouter.use('/dev', devToolsRouter);
