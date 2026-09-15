import { prisma } from '../../database/prisma';
import type { Prisma } from '../../generated/prisma/client';
import { BadRequestError, NotFoundError } from '../../utils/errors';
import { buildPaginationMeta } from '../../utils/response';
import { toSkipTake } from '../../utils/pagination';
import { recordAudit } from '../audit-logs/audit-log.service';
import { AUDIT_ACTIONS, AUDIT_ENTITIES } from '../audit-logs/audit-log.actions';
import type { AuthContext } from '../../types/auth';
import type { ClientContext } from '../auth/auth.service';
import type {
  CreateTeamInput,
  ListTeamsQuery,
  TeamMembersInput,
  UpdateTeamInput,
} from './team.schema';

const teamSelect = {
  id: true,
  organizationId: true,
  name: true,
  description: true,
  createdAt: true,
  updatedAt: true,
  _count: { select: { members: true, assignedConversations: true } },
  members: {
    select: {
      user: { select: { id: true, name: true, email: true, avatar: true, role: true } },
    },
    orderBy: { createdAt: 'asc' },
  },
} satisfies Prisma.TeamSelect;

type TeamRow = Prisma.TeamGetPayload<{ select: typeof teamSelect }>;

export interface TeamDto {
  id: string;
  organizationId: string;
  name: string;
  description: string | null;
  memberCount: number;
  openConversationCount: number;
  members: { id: string; name: string; email: string; avatar: string | null; role: string }[];
  createdAt: Date;
  updatedAt: Date;
}

function toTeamDto(row: TeamRow): TeamDto {
  return {
    id: row.id,
    organizationId: row.organizationId,
    name: row.name,
    description: row.description,
    memberCount: row._count.members,
    openConversationCount: row._count.assignedConversations,
    members: row.members.map((membership) => membership.user),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/** Rejects ids that belong to another tenant before they reach a write. */
async function assertUsersBelongToOrganization(
  organizationId: string,
  userIds: string[],
): Promise<void> {
  if (userIds.length === 0) return;
  const count = await prisma.user.count({ where: { id: { in: userIds }, organizationId } });
  if (count !== userIds.length) {
    throw new BadRequestError('One or more users do not exist', 'USER_NOT_FOUND');
  }
}

export async function listTeams(organizationId: string, query: ListTeamsQuery) {
  const where: Prisma.TeamWhereInput = {
    organizationId,
    ...(query.search ? { name: { contains: query.search, mode: 'insensitive' } } : {}),
  };

  const { skip, take } = toSkipTake(query);

  const [rows, total] = await Promise.all([
    prisma.team.findMany({ where, skip, take, orderBy: { name: 'asc' }, select: teamSelect }),
    prisma.team.count({ where }),
  ]);

  return {
    items: rows.map(toTeamDto),
    meta: buildPaginationMeta(query.page, query.limit, total),
  };
}

export async function getTeamById(organizationId: string, teamId: string): Promise<TeamDto> {
  const team = await prisma.team.findFirst({
    where: { id: teamId, organizationId },
    select: teamSelect,
  });
  if (!team) throw new NotFoundError('Team', 'TEAM_NOT_FOUND');
  return toTeamDto(team);
}

export async function createTeam(
  actor: AuthContext,
  input: CreateTeamInput,
  context: ClientContext,
): Promise<TeamDto> {
  const memberIds = input.memberIds ?? [];
  await assertUsersBelongToOrganization(actor.organizationId, memberIds);

  const created = await prisma.team.create({
    data: {
      organizationId: actor.organizationId,
      name: input.name,
      description: input.description ?? null,
      ...(memberIds.length > 0
        ? { members: { create: memberIds.map((userId) => ({ userId })) } }
        : {}),
    },
    select: teamSelect,
  });

  await recordAudit({
    organizationId: actor.organizationId,
    userId: actor.userId,
    action: AUDIT_ACTIONS.TEAM_CREATED,
    entityType: AUDIT_ENTITIES.TEAM,
    entityId: created.id,
    newData: { name: created.name, description: created.description },
    ...context,
  });

  return toTeamDto(created);
}

export async function updateTeam(
  actor: AuthContext,
  teamId: string,
  input: UpdateTeamInput,
  context: ClientContext,
): Promise<TeamDto> {
  const existing = await prisma.team.findFirst({
    where: { id: teamId, organizationId: actor.organizationId },
    select: { id: true, name: true, description: true },
  });
  if (!existing) throw new NotFoundError('Team', 'TEAM_NOT_FOUND');

  if (input.memberIds) {
    await assertUsersBelongToOrganization(actor.organizationId, input.memberIds);
  }

  const updated = await prisma.$transaction(async (tx) => {
    if (input.memberIds) {
      await tx.userTeam.deleteMany({ where: { teamId } });
      if (input.memberIds.length > 0) {
        await tx.userTeam.createMany({
          data: input.memberIds.map((userId) => ({ teamId, userId })),
        });
      }
    }
    return tx.team.update({
      where: { id: teamId },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
      },
      select: teamSelect,
    });
  });

  await recordAudit({
    organizationId: actor.organizationId,
    userId: actor.userId,
    action: AUDIT_ACTIONS.TEAM_UPDATED,
    entityType: AUDIT_ENTITIES.TEAM,
    entityId: teamId,
    oldData: existing,
    newData: { name: updated.name, description: updated.description },
    ...context,
  });

  return toTeamDto(updated);
}

export async function deleteTeam(
  actor: AuthContext,
  teamId: string,
  context: ClientContext,
): Promise<void> {
  const existing = await prisma.team.findFirst({
    where: { id: teamId, organizationId: actor.organizationId },
    select: { id: true, name: true },
  });
  if (!existing) throw new NotFoundError('Team', 'TEAM_NOT_FOUND');

  // Conversations assigned to this team fall back to unassigned (SetNull).
  await prisma.team.delete({ where: { id: teamId } });

  await recordAudit({
    organizationId: actor.organizationId,
    userId: actor.userId,
    action: AUDIT_ACTIONS.TEAM_DELETED,
    entityType: AUDIT_ENTITIES.TEAM,
    entityId: teamId,
    oldData: existing,
    ...context,
  });
}

export async function addTeamMembers(
  actor: AuthContext,
  teamId: string,
  input: TeamMembersInput,
  context: ClientContext,
): Promise<TeamDto> {
  const team = await prisma.team.findFirst({
    where: { id: teamId, organizationId: actor.organizationId },
    select: { id: true },
  });
  if (!team) throw new NotFoundError('Team', 'TEAM_NOT_FOUND');

  await assertUsersBelongToOrganization(actor.organizationId, input.userIds);

  await prisma.userTeam.createMany({
    data: input.userIds.map((userId) => ({ teamId, userId })),
    // Re-adding an existing member is a no-op rather than a 409.
    skipDuplicates: true,
  });

  await recordAudit({
    organizationId: actor.organizationId,
    userId: actor.userId,
    action: AUDIT_ACTIONS.TEAM_MEMBER_ADDED,
    entityType: AUDIT_ENTITIES.TEAM,
    entityId: teamId,
    newData: { userIds: input.userIds },
    ...context,
  });

  return getTeamById(actor.organizationId, teamId);
}

export async function removeTeamMember(
  actor: AuthContext,
  teamId: string,
  userId: string,
  context: ClientContext,
): Promise<TeamDto> {
  const team = await prisma.team.findFirst({
    where: { id: teamId, organizationId: actor.organizationId },
    select: { id: true },
  });
  if (!team) throw new NotFoundError('Team', 'TEAM_NOT_FOUND');

  const result = await prisma.userTeam.deleteMany({ where: { teamId, userId } });
  if (result.count === 0) {
    throw new NotFoundError('Team member', 'TEAM_MEMBER_NOT_FOUND');
  }

  await recordAudit({
    organizationId: actor.organizationId,
    userId: actor.userId,
    action: AUDIT_ACTIONS.TEAM_MEMBER_REMOVED,
    entityType: AUDIT_ENTITIES.TEAM,
    entityId: teamId,
    oldData: { userId },
    ...context,
  });

  return getTeamById(actor.organizationId, teamId);
}
