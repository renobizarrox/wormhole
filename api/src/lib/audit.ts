import type { Prisma } from '@prisma/client';
import { prisma } from '../db.js';

export interface AuditParams {
  tenantId: string;
  userId: string | null;
  action: string;
  resource: string;
  resourceId?: string | null;
  meta?: Record<string, unknown>;
}

export async function audit(params: AuditParams): Promise<void> {
  await prisma.auditEvent.create({
    data: {
      tenantId: params.tenantId,
      userId: params.userId,
      action: params.action,
      resource: params.resource,
      resourceId: params.resourceId ?? null,
      meta: (params.meta as Prisma.InputJsonValue | undefined) ?? undefined,
    },
  });
}
