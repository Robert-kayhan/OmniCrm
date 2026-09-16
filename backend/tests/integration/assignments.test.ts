import { describe, expect, it } from 'vitest';
import { api, createCustomer, createWorkspace, db } from '../helpers/factories';
import { Channel, NotificationType } from '../../src/generated/prisma/enums';

async function seedConversation(organizationId: string) {
  const customer = await createCustomer(organizationId);
  return db().conversation.create({
    data: { organizationId, customerId: customer.id, channel: Channel.WEBSITE },
  });
}

describe('POST /api/conversations/:id/assign', () => {
  it('assigns to a user and opens a history entry', async () => {
    const { manager, agent, organization } = await createWorkspace();
    const conversation = await seedConversation(organization.id);

    const response = await api()
      .post(`/api/conversations/${conversation.id}/assign`)
      .set('Authorization', manager.auth)
      .send({ assignedUserId: agent.userId })
      .expect(200);

    expect(response.body.data.assignedUser.id).toBe(agent.userId);

    const history = await db().conversationAssignment.findMany({
      where: { conversationId: conversation.id },
    });
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({
      assignedUserId: agent.userId,
      assignedById: manager.userId,
      unassignedAt: null,
    });
  });

  it('closes the previous period on reassignment, leaving one open', async () => {
    const { manager, agent, otherAgent, organization } = await createWorkspace();
    const conversation = await seedConversation(organization.id);

    await api()
      .post(`/api/conversations/${conversation.id}/assign`)
      .set('Authorization', manager.auth)
      .send({ assignedUserId: agent.userId })
      .expect(200);

    await api()
      .post(`/api/conversations/${conversation.id}/assign`)
      .set('Authorization', manager.auth)
      .send({ assignedUserId: otherAgent.userId })
      .expect(200);

    const history = await db().conversationAssignment.findMany({
      where: { conversationId: conversation.id },
      orderBy: { assignedAt: 'asc' },
    });

    expect(history).toHaveLength(2);
    expect(history[0]?.assignedUserId).toBe(agent.userId);
    expect(history[0]?.unassignedAt).not.toBeNull();
    expect(history[1]?.assignedUserId).toBe(otherAgent.userId);
    expect(history[1]?.unassignedAt).toBeNull();
  });

  it('notifies the new assignee but not the person doing the assigning', async () => {
    const { manager, agent, organization } = await createWorkspace();
    const conversation = await seedConversation(organization.id);

    await api()
      .post(`/api/conversations/${conversation.id}/assign`)
      .set('Authorization', manager.auth)
      .send({ assignedUserId: agent.userId })
      .expect(200);

    const forAgent = await db().notification.findMany({ where: { userId: agent.userId } });
    expect(forAgent).toHaveLength(1);
    expect(forAgent[0]?.type).toBe(NotificationType.CONVERSATION_ASSIGNED);

    expect(await db().notification.count({ where: { userId: manager.userId } })).toBe(0);
  });

  it('marks a later change as a reassignment', async () => {
    const { manager, agent, otherAgent, organization } = await createWorkspace();
    const conversation = await seedConversation(organization.id);

    await api()
      .post(`/api/conversations/${conversation.id}/assign`)
      .set('Authorization', manager.auth)
      .send({ assignedUserId: agent.userId })
      .expect(200);
    await api()
      .post(`/api/conversations/${conversation.id}/assign`)
      .set('Authorization', manager.auth)
      .send({ assignedUserId: otherAgent.userId })
      .expect(200);

    const notification = await db().notification.findFirst({
      where: { userId: otherAgent.userId },
    });
    expect(notification?.type).toBe(NotificationType.CONVERSATION_REASSIGNED);
  });

  it('returns the conversation to the queue when cleared', async () => {
    const { manager, agent, organization } = await createWorkspace();
    const conversation = await seedConversation(organization.id);

    await api()
      .post(`/api/conversations/${conversation.id}/assign`)
      .set('Authorization', manager.auth)
      .send({ assignedUserId: agent.userId })
      .expect(200);

    const response = await api()
      .post(`/api/conversations/${conversation.id}/assign`)
      .set('Authorization', manager.auth)
      .send({ assignedUserId: null })
      .expect(200);

    expect(response.body.data.assignedUser).toBeNull();

    // The closed period remains; no new open one is created.
    const open = await db().conversationAssignment.findMany({
      where: { conversationId: conversation.id, unassignedAt: null },
    });
    expect(open).toHaveLength(0);
  });

  it('refuses an assignee from another organization', async () => {
    const alpha = await createWorkspace();
    const beta = await createWorkspace();
    const conversation = await seedConversation(alpha.organization.id);

    const response = await api()
      .post(`/api/conversations/${conversation.id}/assign`)
      .set('Authorization', alpha.manager.auth)
      .send({ assignedUserId: beta.agent.userId })
      .expect(400);

    expect(response.body.code).toBe('USER_NOT_FOUND');
  });
});
