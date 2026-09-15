/**
 * Demo data seed.
 *
 * Produces an organization that makes every screen in the CRM usable before any
 * channel is connected: users across all four roles, teams, tags, customers
 * with multi-channel identities, conversations and message history.
 *
 * Deliberately self-contained — it builds its own Prisma client rather than
 * importing the app's, so seeding needs only DATABASE_URL and not the full
 * runtime environment.
 */
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';
import {
  Channel,
  ConversationPriority,
  ConversationStatus,
  CustomerSource,
  CustomerStatus,
  IntegrationStatus,
  IntegrationType,
  MessageStatus,
  MessageType,
  NotificationType,
  SenderType,
  UserRole,
  UserStatus,
} from '../src/generated/prisma/enums';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('DATABASE_URL is not set. Copy .env.example to .env before seeding.');
  process.exit(1);
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

const ORGANIZATION_SLUG = 'demo-company';
const DEMO_PASSWORD = 'Password123!';

/** Minutes ago as a Date, so seeded timestamps look natural in the inbox. */
const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000);
const daysAgo = (days: number) => new Date(Date.now() - days * 86_400_000);

async function main() {
  console.log('Seeding demo data...');

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);

  // A fresh start each run: the cascade clears every child row, so the seed is
  // repeatable and never accumulates duplicates.
  const existing = await prisma.organization.findUnique({
    where: { slug: ORGANIZATION_SLUG },
    select: { id: true },
  });
  if (existing) {
    console.log(`  Removing previous "${ORGANIZATION_SLUG}" organization`);
    await prisma.organization.delete({ where: { id: existing.id } });
  }

  // ---------------------------------------------------------------- org ---
  const organization = await prisma.organization.create({
    data: { name: 'Demo Company', slug: ORGANIZATION_SLUG },
  });

  // -------------------------------------------------------------- users ---
  const [admin, manager, agentRahul, agentKaran, invitedUser] = await Promise.all([
    prisma.user.create({
      data: {
        organizationId: organization.id,
        name: 'Aisha Nair',
        email: 'admin@demo.test',
        password: passwordHash,
        role: UserRole.SUPER_ADMIN,
        status: UserStatus.ACTIVE,
        lastSeenAt: minutesAgo(3),
      },
    }),
    prisma.user.create({
      data: {
        organizationId: organization.id,
        name: 'Marcus Feld',
        email: 'manager@demo.test',
        password: passwordHash,
        role: UserRole.MANAGER,
        status: UserStatus.ACTIVE,
        lastSeenAt: minutesAgo(12),
      },
    }),
    prisma.user.create({
      data: {
        organizationId: organization.id,
        name: 'Rahul Mehta',
        email: 'rahul@demo.test',
        password: passwordHash,
        role: UserRole.AGENT,
        status: UserStatus.ACTIVE,
        lastSeenAt: minutesAgo(1),
      },
    }),
    prisma.user.create({
      data: {
        organizationId: organization.id,
        name: 'Karan Sharma',
        email: 'karan@demo.test',
        password: passwordHash,
        role: UserRole.AGENT,
        status: UserStatus.ACTIVE,
        lastSeenAt: minutesAgo(45),
      },
    }),
    prisma.user.create({
      data: {
        organizationId: organization.id,
        name: 'Priya Desai',
        email: 'priya@demo.test',
        role: UserRole.AGENT,
        // No password: demonstrates the INVITED state in the users table.
        status: UserStatus.INVITED,
      },
    }),
  ]);

  // -------------------------------------------------------------- teams ---
  const sales = await prisma.team.create({
    data: {
      organizationId: organization.id,
      name: 'Sales',
      description: 'Inbound leads and pre-sales questions',
      members: { create: [{ userId: manager.id }, { userId: agentKaran.id }] },
    },
  });

  const support = await prisma.team.create({
    data: {
      organizationId: organization.id,
      name: 'Support',
      description: 'Post-purchase support and refunds',
      members: { create: [{ userId: agentRahul.id }, { userId: admin.id }] },
    },
  });

  await prisma.team.create({
    data: {
      organizationId: organization.id,
      name: 'Marketing',
      description: 'Campaign replies and partnerships',
      members: { create: [{ userId: manager.id }] },
    },
  });

  // --------------------------------------------------------------- tags ---
  const tagDefinitions = [
    { name: 'VIP', color: '#a855f7', description: 'High value account' },
    { name: 'HOT_LEAD', color: '#ef4444', description: 'Ready to buy' },
    { name: 'REFUND', color: '#f59e0b', description: 'Refund requested' },
    { name: 'HIGH_PRIORITY', color: '#dc2626', description: 'Needs a fast reply' },
    { name: 'REPEAT_CUSTOMER', color: '#0ea5e9', description: 'Has ordered before' },
  ];
  const tags = await Promise.all(
    tagDefinitions.map((tag) =>
      prisma.tag.create({ data: { organizationId: organization.id, ...tag } }),
    ),
  );
  const tagByName = new Map(tags.map((tag) => [tag.name, tag]));

  // ------------------------------------------------------- integrations ---
  // Facebook and Instagram are left PENDING: connecting them is a real OAuth /
  // credential step, and the UI must show "Not connected" until it happens.
  const facebookIntegration = await prisma.integration.create({
    data: {
      organizationId: organization.id,
      type: IntegrationType.FACEBOOK,
      name: 'Facebook Messenger',
      status: IntegrationStatus.PENDING,
      metadata: { demo: true, note: 'Connect a Facebook Page from Settings > Integrations' },
    },
  });

  const instagramIntegration = await prisma.integration.create({
    data: {
      organizationId: organization.id,
      type: IntegrationType.INSTAGRAM,
      name: 'Instagram Direct',
      status: IntegrationStatus.PENDING,
      metadata: { demo: true, note: 'Planned channel — the data model already supports it' },
    },
  });

  const websiteIntegration = await prisma.integration.create({
    data: {
      organizationId: organization.id,
      type: IntegrationType.WEBSITE,
      name: 'Website Chat',
      status: IntegrationStatus.CONNECTED,
      externalPageId: 'demo-company-website',
      metadata: { demo: true, widgetOrigin: 'https://demo-company.test' },
    },
  });

  const emailIntegration = await prisma.integration.create({
    data: {
      organizationId: organization.id,
      type: IntegrationType.EMAIL,
      name: 'Support Mailbox',
      status: IntegrationStatus.CONNECTED,
      externalPageId: 'support@demo-company.test',
      metadata: { demo: true, mailbox: 'support@demo-company.test' },
    },
  });

  // ---------------------------------------------------------- customers ---
  interface SeedMessage {
    from: 'customer' | 'agent' | 'system';
    text: string;
    minutesAgo: number;
    agentId?: string;
    internal?: boolean;
  }

  interface SeedCustomer {
    firstName: string;
    lastName: string;
    email?: string;
    phone?: string;
    company?: string;
    location?: string;
    status: CustomerStatus;
    source: CustomerSource;
    tags: string[];
    channels: {
      integrationId: string;
      channel: Channel;
      externalUserId: string;
      username?: string;
      profileUrl?: string;
    }[];
    conversation: {
      channel: Channel;
      integrationId: string;
      subject: string;
      status: ConversationStatus;
      priority: ConversationPriority;
      assignedUserId?: string;
      assignedTeamId?: string;
      unreadCount: number;
      tags: string[];
      messages: SeedMessage[];
    };
    note?: { userId: string; content: string };
  }

  const seedCustomers: SeedCustomer[] = [
    {
      firstName: 'John',
      lastName: 'Smith',
      email: 'john.smith@example.com',
      phone: '+1 415 555 0132',
      company: 'Northwind Traders',
      location: 'San Francisco, US',
      status: CustomerStatus.CUSTOMER,
      source: CustomerSource.FACEBOOK,
      tags: ['VIP', 'REPEAT_CUSTOMER'],
      channels: [
        {
          integrationId: facebookIntegration.id,
          channel: Channel.FACEBOOK,
          externalUserId: 'demo-psid-1000000000001',
          username: 'john.smith.94',
          profileUrl: 'https://facebook.com/john.smith.94',
        },
        {
          integrationId: emailIntegration.id,
          channel: Channel.EMAIL,
          externalUserId: 'john.smith@example.com',
          username: 'john.smith@example.com',
        },
      ],
      conversation: {
        channel: Channel.FACEBOOK,
        integrationId: facebookIntegration.id,
        subject: 'Order #4821 has not arrived',
        status: ConversationStatus.OPEN,
        priority: ConversationPriority.HIGH,
        assignedUserId: agentKaran.id,
        assignedTeamId: support.id,
        unreadCount: 2,
        tags: ['HIGH_PRIORITY'],
        messages: [
          { from: 'customer', text: 'Hello, I ordered a week ago and nothing has shipped.', minutesAgo: 95 },
          { from: 'agent', text: 'Hi John, sorry about that. Let me pull up order #4821.', minutesAgo: 90, agentId: agentKaran.id },
          { from: 'agent', text: 'Courier shows a delay at the sorting hub. Refund pre-approved if it slips past Friday.', minutesAgo: 88, agentId: agentKaran.id, internal: true },
          { from: 'customer', text: 'Any update? I need it before the weekend.', minutesAgo: 6 },
          { from: 'customer', text: 'Also, can I change the delivery address?', minutesAgo: 2 },
        ],
      },
      note: { userId: agentKaran.id, content: 'Long-standing account. Escalate immediately if the delivery slips again.' },
    },
    {
      firstName: 'Sarah',
      lastName: 'Wilson',
      email: 'sarah.wilson@example.com',
      company: 'Lumen Studio',
      location: 'Manchester, UK',
      status: CustomerStatus.PROSPECT,
      source: CustomerSource.INSTAGRAM,
      tags: ['HOT_LEAD'],
      channels: [
        {
          integrationId: instagramIntegration.id,
          channel: Channel.INSTAGRAM,
          externalUserId: 'demo-igsid-2000000000002',
          username: 'sarah.builds',
          profileUrl: 'https://instagram.com/sarah.builds',
        },
      ],
      conversation: {
        channel: Channel.INSTAGRAM,
        integrationId: instagramIntegration.id,
        subject: 'Pricing for the team plan',
        status: ConversationStatus.OPEN,
        priority: ConversationPriority.NORMAL,
        assignedTeamId: sales.id,
        unreadCount: 1,
        tags: ['HOT_LEAD'],
        messages: [
          { from: 'customer', text: 'Hi! What does the team plan cost for 12 seats?', minutesAgo: 22 },
          { from: 'agent', text: 'Hi Sarah, that would be the Growth tier. Sending a breakdown now.', minutesAgo: 18, agentId: manager.id },
          { from: 'customer', text: 'Is there an annual discount?', minutesAgo: 11 },
        ],
      },
    },
    {
      firstName: 'Mike',
      lastName: 'Donovan',
      email: 'mike.donovan@example.com',
      phone: '+44 7700 900123',
      company: 'Harborline Ltd',
      location: 'Bristol, UK',
      status: CustomerStatus.CUSTOMER,
      source: CustomerSource.EMAIL,
      tags: ['REFUND'],
      channels: [
        {
          integrationId: emailIntegration.id,
          channel: Channel.EMAIL,
          externalUserId: 'mike.donovan@example.com',
          username: 'mike.donovan@example.com',
        },
      ],
      conversation: {
        channel: Channel.EMAIL,
        integrationId: emailIntegration.id,
        subject: 'Refund request for invoice INV-2291',
        status: ConversationStatus.PENDING,
        priority: ConversationPriority.NORMAL,
        assignedUserId: agentRahul.id,
        assignedTeamId: support.id,
        unreadCount: 0,
        tags: ['REFUND'],
        messages: [
          { from: 'customer', text: 'We were billed twice this month. Please refund the duplicate charge.', minutesAgo: 60 * 26 },
          { from: 'agent', text: 'Thanks Mike, I can see both charges. Refund raised with finance.', minutesAgo: 60 * 25, agentId: agentRahul.id },
          { from: 'system', text: 'Conversation marked as pending while finance processes the refund.', minutesAgo: 60 * 25 },
        ],
      },
      note: { userId: agentRahul.id, content: 'Finance ticket FIN-884. Chase on Thursday if no confirmation.' },
    },
    {
      firstName: 'Elena',
      lastName: 'Rossi',
      email: 'elena.rossi@example.com',
      company: 'Studio Rossi',
      location: 'Milan, IT',
      status: CustomerStatus.LEAD,
      source: CustomerSource.WEBSITE,
      tags: [],
      channels: [
        {
          integrationId: websiteIntegration.id,
          channel: Channel.WEBSITE,
          externalUserId: 'demo-web-visitor-3003',
          username: 'visitor-3003',
        },
      ],
      conversation: {
        channel: Channel.WEBSITE,
        integrationId: websiteIntegration.id,
        subject: 'Question from the pricing page',
        status: ConversationStatus.OPEN,
        priority: ConversationPriority.LOW,
        unreadCount: 1,
        tags: [],
        messages: [
          { from: 'customer', text: 'Does the starter plan include the API?', minutesAgo: 8 },
        ],
      },
    },
    {
      firstName: 'Tomás',
      lastName: 'Herrera',
      email: 'tomas.herrera@example.com',
      phone: '+34 600 123 456',
      company: 'Cadena Verde',
      location: 'Valencia, ES',
      status: CustomerStatus.CUSTOMER,
      source: CustomerSource.WEBSITE,
      tags: ['REPEAT_CUSTOMER'],
      channels: [
        {
          integrationId: websiteIntegration.id,
          channel: Channel.WEBSITE,
          externalUserId: 'demo-web-visitor-3004',
          username: 'visitor-3004',
        },
      ],
      conversation: {
        channel: Channel.WEBSITE,
        integrationId: websiteIntegration.id,
        subject: 'Renewal confirmed',
        status: ConversationStatus.CLOSED,
        priority: ConversationPriority.LOW,
        assignedUserId: agentKaran.id,
        unreadCount: 0,
        tags: [],
        messages: [
          { from: 'customer', text: 'We would like to renew for another year.', minutesAgo: 60 * 72 },
          { from: 'agent', text: 'Renewal processed, invoice is on its way. Thanks Tomás!', minutesAgo: 60 * 71, agentId: agentKaran.id },
          { from: 'system', text: 'Conversation closed by Karan Sharma.', minutesAgo: 60 * 71 },
        ],
      },
    },
    {
      firstName: 'Grace',
      lastName: 'Okafor',
      email: 'grace.okafor@example.com',
      company: 'Bluepeak',
      location: 'Lagos, NG',
      status: CustomerStatus.PROSPECT,
      source: CustomerSource.FACEBOOK,
      tags: ['HOT_LEAD', 'VIP'],
      channels: [
        {
          integrationId: facebookIntegration.id,
          channel: Channel.FACEBOOK,
          externalUserId: 'demo-psid-1000000000005',
          username: 'grace.okafor',
          profileUrl: 'https://facebook.com/grace.okafor',
        },
      ],
      conversation: {
        channel: Channel.FACEBOOK,
        integrationId: facebookIntegration.id,
        subject: 'Enterprise onboarding timeline',
        status: ConversationStatus.OPEN,
        priority: ConversationPriority.URGENT,
        assignedTeamId: sales.id,
        unreadCount: 3,
        tags: ['HIGH_PRIORITY', 'HOT_LEAD'],
        messages: [
          { from: 'customer', text: 'We need to be live before the end of the quarter.', minutesAgo: 40 },
          { from: 'customer', text: 'Can your team handle a 300-seat rollout?', minutesAgo: 33 },
          { from: 'customer', text: 'Happy to jump on a call today.', minutesAgo: 30 },
        ],
      },
    },
  ];

  for (const seed of seedCustomers) {
    const customer = await prisma.customer.create({
      data: {
        organizationId: organization.id,
        firstName: seed.firstName,
        lastName: seed.lastName,
        email: seed.email ?? null,
        phone: seed.phone ?? null,
        company: seed.company ?? null,
        location: seed.location ?? null,
        status: seed.status,
        source: seed.source,
        channels: {
          create: seed.channels.map((channel) => ({
            integrationId: channel.integrationId,
            channel: channel.channel,
            externalUserId: channel.externalUserId,
            username: channel.username ?? null,
            profileUrl: channel.profileUrl ?? null,
          })),
        },
        tags: {
          create: seed.tags
            .map((name) => tagByName.get(name))
            .filter((tag): tag is NonNullable<typeof tag> => Boolean(tag))
            .map((tag) => ({ tagId: tag.id })),
        },
      },
      include: { channels: true },
    });

    const primaryChannel = customer.channels.find(
      (channel) => channel.channel === seed.conversation.channel,
    );

    const sortedMessages = [...seed.conversation.messages].sort(
      (a, b) => b.minutesAgo - a.minutesAgo,
    );
    const lastMessage = sortedMessages[sortedMessages.length - 1];
    const lastCustomerMessage = [...sortedMessages]
      .reverse()
      .find((message) => message.from === 'customer');

    const conversation = await prisma.conversation.create({
      data: {
        organizationId: organization.id,
        customerId: customer.id,
        integrationId: seed.conversation.integrationId,
        customerChannelId: primaryChannel?.id ?? null,
        channel: seed.conversation.channel,
        subject: seed.conversation.subject,
        status: seed.conversation.status,
        priority: seed.conversation.priority,
        assignedUserId: seed.conversation.assignedUserId ?? null,
        assignedTeamId: seed.conversation.assignedTeamId ?? null,
        unreadCount: seed.conversation.unreadCount,
        lastMessageAt: lastMessage ? minutesAgo(lastMessage.minutesAgo) : null,
        lastCustomerMessageAt: lastCustomerMessage
          ? minutesAgo(lastCustomerMessage.minutesAgo)
          : null,
        closedAt:
          seed.conversation.status === ConversationStatus.CLOSED ? minutesAgo(60 * 71) : null,
        createdAt: sortedMessages[0] ? minutesAgo(sortedMessages[0].minutesAgo) : new Date(),
        tags: {
          create: seed.conversation.tags
            .map((name) => tagByName.get(name))
            .filter((tag): tag is NonNullable<typeof tag> => Boolean(tag))
            .map((tag) => ({ tagId: tag.id })),
        },
      },
    });

    for (const [index, message] of sortedMessages.entries()) {
      const createdAt = minutesAgo(message.minutesAgo);
      await prisma.message.create({
        data: {
          conversationId: conversation.id,
          organizationId: organization.id,
          senderType:
            message.from === 'customer'
              ? SenderType.CUSTOMER
              : message.from === 'agent'
                ? SenderType.AGENT
                : SenderType.SYSTEM,
          senderUserId: message.from === 'agent' ? (message.agentId ?? null) : null,
          messageType: message.from === 'system' ? MessageType.SYSTEM : MessageType.TEXT,
          content: message.text,
          isInternal: message.internal ?? false,
          status: MessageStatus.DELIVERED,
          deliveredAt: createdAt,
          // Seeded ids are namespaced so they can never collide with real
          // provider message ids arriving over a webhook.
          externalMessageId:
            message.from === 'customer'
              ? `demo-${conversation.id}-${index}`
              : null,
          createdAt,
        },
      });
    }

    // Assignment history mirrors the denormalised fields on the conversation.
    if (seed.conversation.assignedUserId || seed.conversation.assignedTeamId) {
      await prisma.conversationAssignment.create({
        data: {
          conversationId: conversation.id,
          assignedUserId: seed.conversation.assignedUserId ?? null,
          assignedTeamId: seed.conversation.assignedTeamId ?? null,
          assignedById: manager.id,
          assignedAt: lastMessage ? minutesAgo(lastMessage.minutesAgo + 5) : new Date(),
        },
      });
    }

    if (seed.note) {
      await prisma.note.create({
        data: {
          organizationId: organization.id,
          userId: seed.note.userId,
          customerId: customer.id,
          conversationId: conversation.id,
          content: seed.note.content,
        },
      });
    }

    if (seed.conversation.unreadCount > 0 && seed.conversation.assignedUserId) {
      await prisma.notification.create({
        data: {
          organizationId: organization.id,
          userId: seed.conversation.assignedUserId,
          conversationId: conversation.id,
          type: NotificationType.NEW_MESSAGE,
          title: `New message from ${customer.firstName} ${customer.lastName}`,
          message: lastMessage?.text.slice(0, 140) ?? '',
          isRead: false,
        },
      });
    }
  }

  await prisma.auditLog.create({
    data: {
      organizationId: organization.id,
      userId: admin.id,
      action: 'organization.seeded',
      entityType: 'Organization',
      entityId: organization.id,
      newData: { seededAt: new Date().toISOString() },
      createdAt: daysAgo(1),
    },
  });

  const counts = {
    users: await prisma.user.count({ where: { organizationId: organization.id } }),
    teams: await prisma.team.count({ where: { organizationId: organization.id } }),
    customers: await prisma.customer.count({ where: { organizationId: organization.id } }),
    conversations: await prisma.conversation.count({ where: { organizationId: organization.id } }),
    messages: await prisma.message.count({ where: { organizationId: organization.id } }),
  };

  console.log('\nSeed complete.');
  console.table(counts);
  console.log(`\n  Organization : Demo Company (${ORGANIZATION_SLUG})`);
  console.log('  Sign in with any of:');
  console.log(`    admin@demo.test    ${DEMO_PASSWORD}   SUPER_ADMIN`);
  console.log(`    manager@demo.test  ${DEMO_PASSWORD}   MANAGER`);
  console.log(`    rahul@demo.test    ${DEMO_PASSWORD}   AGENT`);
  console.log(`    karan@demo.test    ${DEMO_PASSWORD}   AGENT`);
  console.log(`  (priya@demo.test is INVITED and cannot sign in until a password is issued)`);
  console.log(`  Invited user id: ${invitedUser.id}\n`);
}

main()
  .catch((error: unknown) => {
    console.error('Seed failed:', error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
