import type { Prisma } from '../../generated/prisma/client';

/**
 * The only shape of a user that leaves the API. `password` is absent by
 * construction, so no serializer can leak it by accident.
 */
export const userSelect = {
  id: true,
  organizationId: true,
  name: true,
  email: true,
  role: true,
  status: true,
  avatar: true,
  lastSeenAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.UserSelect;

export const userWithTeamsSelect = {
  ...userSelect,
  teams: {
    select: {
      team: { select: { id: true, name: true } },
    },
  },
} satisfies Prisma.UserSelect;

export type UserDto = Prisma.UserGetPayload<{ select: typeof userSelect }>;
export type UserWithTeamsRow = Prisma.UserGetPayload<{ select: typeof userWithTeamsSelect }>;

export interface UserWithTeamsDto extends UserDto {
  teams: { id: string; name: string }[];
}

export function toUserWithTeamsDto(row: UserWithTeamsRow): UserWithTeamsDto {
  const { teams, ...rest } = row;
  return { ...rest, teams: teams.map((membership) => membership.team) };
}
