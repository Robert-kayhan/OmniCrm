/**
 * Canonical audit action keys. Kept in one place so dashboards and retention
 * rules can rely on a closed vocabulary rather than free-text strings.
 */
export const AUDIT_ACTIONS = {
  AUTH_REGISTER: 'auth.register',
  AUTH_LOGIN: 'auth.login',
  AUTH_LOGIN_FAILED: 'auth.login_failed',
  AUTH_LOGOUT: 'auth.logout',
  AUTH_REFRESH_REUSE_DETECTED: 'auth.refresh_reuse_detected',

  ORGANIZATION_UPDATED: 'organization.updated',

  USER_CREATED: 'user.created',
  USER_UPDATED: 'user.updated',
  USER_DELETED: 'user.deleted',
  USER_ROLE_CHANGED: 'user.role_changed',
  USER_PASSWORD_CHANGED: 'user.password_changed',

  TEAM_CREATED: 'team.created',
  TEAM_UPDATED: 'team.updated',
  TEAM_DELETED: 'team.deleted',
  TEAM_MEMBER_ADDED: 'team.member_added',
  TEAM_MEMBER_REMOVED: 'team.member_removed',

  INTEGRATION_CONNECTED: 'integration.connected',
  INTEGRATION_UPDATED: 'integration.updated',
  INTEGRATION_DISCONNECTED: 'integration.disconnected',

  CUSTOMER_CREATED: 'customer.created',
  CUSTOMER_UPDATED: 'customer.updated',
  CUSTOMER_DELETED: 'customer.deleted',

  CONVERSATION_CREATED: 'conversation.created',
  CONVERSATION_ASSIGNED: 'conversation.assigned',
  CONVERSATION_UNASSIGNED: 'conversation.unassigned',
  CONVERSATION_STATUS_CHANGED: 'conversation.status_changed',
  CONVERSATION_PRIORITY_CHANGED: 'conversation.priority_changed',

  MESSAGE_SENT: 'message.sent',
} as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS];

export const AUDIT_ENTITIES = {
  ORGANIZATION: 'Organization',
  USER: 'User',
  TEAM: 'Team',
  INTEGRATION: 'Integration',
  CUSTOMER: 'Customer',
  CONVERSATION: 'Conversation',
  MESSAGE: 'Message',
  SESSION: 'Session',
} as const;

export type AuditEntity = (typeof AUDIT_ENTITIES)[keyof typeof AUDIT_ENTITIES];
