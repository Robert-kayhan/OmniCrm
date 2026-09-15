/**
 * The API's shapes, mirrored.
 *
 * Hand-written rather than generated: the backend is a separate deployable, so
 * a compile error here when a field is renamed is the point — it is far better
 * than a runtime `undefined` in the inbox.
 *
 * Every `Date` on the server arrives as an ISO string, so every timestamp here
 * is typed `string`.
 */

export type UserRole = 'SUPER_ADMIN' | 'ADMIN' | 'MANAGER' | 'AGENT';
export type UserStatus = 'ACTIVE' | 'INACTIVE' | 'INVITED';

export type Channel = 'FACEBOOK' | 'INSTAGRAM' | 'EMAIL' | 'WEBSITE' | 'WHATSAPP';
export type IntegrationType = Channel;
export type IntegrationStatus = 'PENDING' | 'CONNECTED' | 'DISCONNECTED' | 'ERROR';

export type CustomerStatus = 'LEAD' | 'PROSPECT' | 'CUSTOMER' | 'INACTIVE' | 'LOST';
export type CustomerSource =
  | 'MANUAL'
  | 'IMPORT'
  | 'API'
  | 'FACEBOOK'
  | 'INSTAGRAM'
  | 'EMAIL'
  | 'WEBSITE'
  | 'WHATSAPP';

export type ConversationStatus = 'OPEN' | 'PENDING' | 'CLOSED';
export type ConversationPriority = 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';

export type SenderType = 'CUSTOMER' | 'AGENT' | 'SYSTEM';
export type MessageType = 'TEXT' | 'IMAGE' | 'VIDEO' | 'AUDIO' | 'FILE' | 'SYSTEM';
export type MessageStatus = 'PENDING' | 'SENT' | 'DELIVERED' | 'READ' | 'FAILED';

export type NotificationType =
  | 'NEW_MESSAGE'
  | 'CONVERSATION_ASSIGNED'
  | 'CONVERSATION_REASSIGNED'
  | 'CONVERSATION_STATUS_CHANGED'
  | 'NEW_CUSTOMER'
  | 'SYSTEM';

// --- Envelopes ------------------------------------------------------------

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

export interface CursorMeta {
  nextCursor: string | null;
  hasMore: boolean;
  limit: number;
}

export interface Paginated<T> {
  items: T[];
  meta: PaginationMeta;
}

export interface CursorPaginated<T> {
  items: T[];
  meta: CursorMeta;
}

// --- Identity -------------------------------------------------------------

export interface Organization {
  id: string;
  name: string;
  slug: string;
}

export interface TeamSummary {
  id: string;
  name: string;
}

export interface User {
  id: string;
  organizationId: string;
  name: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  avatar: string | null;
  lastSeenAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UserWithTeams extends User {
  teams: TeamSummary[];
}

export interface CurrentUser extends User {
  organization: Organization;
  teams: TeamSummary[];
  permissions: string[];
}

export interface Session {
  user: User;
  organization: Organization;
  permissions: string[];
  accessToken: string;
  tokenType: string;
  expiresIn: number;
}

export interface Team {
  id: string;
  organizationId: string;
  name: string;
  description: string | null;
  members: Array<{
    id: string;
    name: string;
    email: string;
    avatar: string | null;
    role: UserRole;
  }>;
  memberCount: number;
  createdAt: string;
  updatedAt: string;
}

// --- Domain ---------------------------------------------------------------

export interface Tag {
  id: string;
  name: string;
  color: string;
}

export interface TagDetail extends Tag {
  organizationId: string;
  description: string | null;
  customerCount: number;
  conversationCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface IntegrationSummary {
  id: string;
  type: IntegrationType;
  name: string;
  status: IntegrationStatus;
}

export interface Integration extends IntegrationSummary {
  organizationId: string;
  externalAccountId: string | null;
  externalPageId: string | null;
  metadata: Record<string, unknown> | null;
  lastError: string | null;
  lastSyncedAt: string | null;
  conversationCount: number;
  customerChannelCount: number;
  /** True once a token is stored. The token itself is never exposed. */
  hasCredentials: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ChannelCapability {
  channel: Channel;
  integrationType: IntegrationType;
  displayName: string;
  /** A provider is implemented in this build. */
  available: boolean;
  /** Process-level credentials are present, so it can actually be connected. */
  configured: boolean;
  integrations: Integration[];
}

export interface CustomerChannel {
  id: string;
  customerId: string;
  channel: Channel;
  externalUserId: string;
  username: string | null;
  profileUrl: string | null;
  avatar: string | null;
  createdAt: string;
  updatedAt: string;
  integration: IntegrationSummary | null;
}

export interface Customer {
  id: string;
  organizationId: string;
  firstName: string;
  lastName: string | null;
  fullName: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  avatar: string | null;
  location: string | null;
  status: CustomerStatus;
  source: CustomerSource;
  channels: CustomerChannel[];
  tags: Tag[];
  conversationCount: number;
  lastContactAt: string | null;
  lastConversationId: string | null;
  assignedUser: { id: string; name: string; avatar: string | null } | null;
  createdAt: string;
  updatedAt: string;
}

export interface Attachment {
  id: string;
  type: MessageType;
  url: string;
  name: string | null;
  mimeType: string | null;
  size: number | null;
}

export interface Message {
  id: string;
  conversationId: string;
  organizationId: string;
  senderType: SenderType;
  senderUserId: string | null;
  externalMessageId: string | null;
  messageType: MessageType;
  content: string | null;
  isInternal: boolean;
  status: MessageStatus;
  failureReason: string | null;
  deliveredAt: string | null;
  readAt: string | null;
  createdAt: string;
  updatedAt: string;
  sender: { id: string; name: string; avatar: string | null; role: UserRole } | null;
  attachments: Attachment[];
}

export interface LastMessage {
  id: string;
  senderType: SenderType;
  messageType: MessageType;
  content: string | null;
  isInternal: boolean;
  status: MessageStatus;
  createdAt: string;
}

export interface ConversationCustomer {
  id: string;
  firstName: string;
  lastName: string | null;
  fullName: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  avatar: string | null;
  status: CustomerStatus;
}

export interface Conversation {
  id: string;
  organizationId: string;
  customerId: string;
  integrationId: string | null;
  customerChannelId: string | null;
  channel: Channel;
  subject: string | null;
  status: ConversationStatus;
  priority: ConversationPriority;
  customer: ConversationCustomer;
  customerChannel: {
    id: string;
    channel: Channel;
    externalUserId: string;
    username: string | null;
    profileUrl: string | null;
    avatar: string | null;
  } | null;
  integration: IntegrationSummary | null;
  assignedUser: { id: string; name: string; email: string; avatar: string | null } | null;
  assignedTeam: TeamSummary | null;
  tags: Tag[];
  lastMessage: LastMessage | null;
  messageCount: number;
  noteCount: number;
  unreadCount: number;
  lastMessageAt: string | null;
  lastCustomerMessageAt: string | null;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ConversationStats {
  total: number;
  byStatus: Partial<Record<ConversationStatus, number>>;
  byChannel: Partial<Record<Channel, number>>;
  byPriority: Partial<Record<ConversationPriority, number>>;
  unread: number;
  assignedToMe: number;
}

export interface Assignment {
  id: string;
  conversationId: string;
  assignedUserId: string | null;
  assignedTeamId: string | null;
  assignedById: string | null;
  assignedAt: string;
  unassignedAt: string | null;
  assignedUser: { id: string; name: string; avatar: string | null } | null;
  assignedTeam: TeamSummary | null;
  assignedBy: { id: string; name: string; avatar: string | null } | null;
}

export interface Note {
  id: string;
  organizationId: string;
  userId: string;
  customerId: string | null;
  conversationId: string | null;
  content: string;
  createdAt: string;
  updatedAt: string;
  user: { id: string; name: string; avatar: string | null } | null;
}

export interface Notification {
  id: string;
  organizationId: string;
  userId: string;
  conversationId: string | null;
  type: NotificationType;
  title: string;
  message: string;
  isRead: boolean;
  readAt: string | null;
  data: Record<string, unknown> | null;
  createdAt: string;
}

export interface AuditLog {
  id: string;
  organizationId: string;
  userId: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  oldData: unknown;
  newData: unknown;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
  user: { id: string; name: string; email: string; avatar: string | null } | null;
}

// --- Analytics ------------------------------------------------------------

export interface VolumePoint {
  date: string;
  inbound: number;
  outbound: number;
}

export interface AgentPerformance {
  userId: string;
  name: string;
  avatar: string | null;
  messagesSent: number;
  conversationsClosed: number;
  conversationsAssigned: number;
}

export interface AnalyticsOverview {
  range: { days: number; from: string; to: string };
  totals: {
    conversationsOpened: number;
    conversationsClosed: number;
    messagesInbound: number;
    messagesOutbound: number;
    newCustomers: number;
    openNow: number;
    unassignedNow: number;
    unreadNow: number;
  };
  responseTime: {
    averageFirstResponseSeconds: number | null;
    medianFirstResponseSeconds: number | null;
    averageResolutionSeconds: number | null;
    answeredConversations: number;
  };
  byChannel: Array<{ channel: Channel; conversations: number; messages: number }>;
  byStatus: Array<{ status: ConversationStatus; count: number }>;
  byPriority: Array<{ priority: ConversationPriority; count: number }>;
  volume: VolumePoint[];
  agents: AgentPerformance[];
  tags: Array<Tag & { count: number }>;
}

// --- Realtime -------------------------------------------------------------

export interface MessageCreatedPayload {
  conversationId: string;
  message: Message;
  conversation: Conversation | null;
}

export interface MessageUpdatedPayload {
  conversationId: string;
  message: Message;
}

export interface ConversationChangedPayload {
  conversation: Conversation;
  reason: 'created' | 'message' | 'status' | 'priority' | 'assignment' | 'read' | 'tags';
}

export interface TypingPayload {
  conversationId: string;
  userId: string;
  name: string;
  isTyping: boolean;
}

export interface PresencePayload {
  userId: string;
  online: boolean;
  lastSeenAt: string | null;
}

/** Whether a given inbox can be claimed by this workspace. */
interface InboxAvailability {
  /** Claimed by another workspace, so it cannot be connected here. */
  unavailable: boolean;
  /** Already connected to this workspace. */
  connectedHere: boolean;
}

/** The Instagram Professional account linked to a Page, if there is one. */
export interface SelectableInstagram extends InboxAvailability {
  id: string;
  username: string | null;
  name: string | null;
  pictureUrl: string | null;
}

/**
 * A Facebook Page offered by the connect flow.
 *
 * Note there is no token field: Page access tokens stay on the server, held
 * encrypted between the OAuth callback and the operator's choice. One Page can
 * yield two inboxes — Messenger and Instagram Direct — which connect
 * independently.
 */
export interface SelectablePage extends InboxAvailability {
  id: string;
  name: string;
  category: string | null;
  pictureUrl: string | null;
  /** Already delivering to this app's webhook. */
  alreadySubscribed: boolean;
  /** Null when no Professional Instagram account is linked to this Page. */
  instagram: SelectableInstagram | null;
}

export interface FacebookLoginResult {
  handoffId: string;
  pages: SelectablePage[];
}

/** What the one-off history backfill found when the Page was connected. */
export interface ImportSummary {
  threads: number;
  messagesCreated: number;
  duplicates: number;
  failures: number;
}

export interface ConnectPageResult {
  integration: Integration;
  import: ImportSummary;
}
