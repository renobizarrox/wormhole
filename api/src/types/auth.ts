import type { Role } from '@prisma/client';

export interface JwtPayload {
  sub: string;
  email: string;
  tenantId: string;
  membershipId: string;
  role: Role;
  iat?: number;
  exp?: number;
  iss?: string;
}

export type AuthUser = JwtPayload;
