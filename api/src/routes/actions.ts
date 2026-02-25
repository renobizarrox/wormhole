import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '../db.js';
import type { JwtPayload } from '../types/auth.js';

const json = (v: Record<string, unknown> | null | undefined): Prisma.InputJsonValue | undefined =>
  v === null || v === undefined ? undefined : (v as Prisma.InputJsonValue);

const actionOperationEnum = z.enum(['NONE', 'READ', 'CREATE', 'UPDATE', 'DELETE']);
const createActionBody = z.object({
  key: z.string().min(1).regex(/^[a-zA-Z0-9_-]+$/),
  name: z.string().min(1),
  description: z.string().optional(),
  method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']),
  endpointTemplate: z.string().min(1),
  headersTemplate: z.record(z.unknown()).nullable().optional(),
  querySchema: z.record(z.unknown()).nullable().optional(),
  pathSchema: z.record(z.unknown()).nullable().optional(),
  bodySchema: z.record(z.unknown()).nullable().optional(),
  outputSchema: z.record(z.unknown()).nullable().optional(),
  retryStrategy: z.enum(['NONE', 'FIXED', 'EXPONENTIAL']).optional(),
  maxAttempts: z.number().int().min(0).optional(),
  initialDelayMs: z.number().int().min(0).optional(),
  maxDelayMs: z.number().int().min(0).nullable().optional(),
  timeoutMs: z.number().int().min(1000).optional(),
  // Schema / properties
  model: z.string().nullable().optional(),
  operation: actionOperationEnum.nullable().optional(),
  isGraphQL: z.boolean().optional(),
  hasPaginationLimit: z.boolean().optional(),
  hasPaginationOffset: z.boolean().optional(),
  hasCustomArguments: z.boolean().optional(),
  hasFilters: z.boolean().optional(),
  hasSorting: z.boolean().optional(),
  notes: z.string().nullable().optional(),
  notesAppearance: z.string().nullable().optional(),
});

const updateActionBody = createActionBody.partial();

async function ensureActionTenant(actionId: string, tenantId: string) {
  const action = await prisma.action.findUnique({
    where: { id: actionId },
    include: { appVersion: { include: { app: true } } },
  });
  if (!action || action.appVersion.app.tenantId !== tenantId) {
    return null;
  }
  return action;
}

export default async function actionsRoutes(app: FastifyInstance) {
  const canWrite = [app.authenticate, app.requireRole('Owner', 'Admin', 'Builder')];
  const canRead = [app.authenticate, app.requireRole('Owner', 'Admin', 'Builder', 'Viewer')];

  app.get<{ Params: { id: string } }>(
    '/app-versions/:id/actions',
    { preHandler: canRead },
    async (request, reply) => {
      const payload = request.user as JwtPayload;
      const { id: appVersionId } = request.params;
      const version = await prisma.appVersion.findFirst({
        where: { id: appVersionId, app: { tenantId: payload.tenantId } },
      });
      if (!version) {
        return reply.status(404).send({ code: 'NOT_FOUND', message: 'App version not found' });
      }
      const actions = await prisma.action.findMany({
        where: { appVersionId },
      });
      return reply.send({ items: actions });
    }
  );

  app.get<{ Params: { id: string } }>(
    '/actions/:id',
    { preHandler: canRead },
    async (request, reply) => {
      const payload = request.user as JwtPayload;
      const action = await ensureActionTenant(request.params.id, payload.tenantId);
      if (!action) {
        return reply.status(404).send({ code: 'NOT_FOUND', message: 'Action not found' });
      }
      return reply.send(action);
    }
  );

  app.post<{ Params: { id: string }; Body: z.infer<typeof createActionBody> }>(
    '/app-versions/:id/actions',
    { preHandler: canWrite },
    async (request, reply) => {
      const payload = request.user as JwtPayload;
      const { id: appVersionId } = request.params;
      const body = createActionBody.safeParse(request.body);
      if (!body.success) {
        return reply.status(400).send({ code: 'VALIDATION_ERROR', message: 'Invalid body', details: body.error.flatten() });
      }
      const version = await prisma.appVersion.findFirst({
        where: { id: appVersionId, app: { tenantId: payload.tenantId } },
      });
      if (!version) {
        return reply.status(404).send({ code: 'NOT_FOUND', message: 'App version not found' });
      }
      const existing = await prisma.action.findUnique({
        where: { appVersionId_key: { appVersionId, key: body.data.key } },
      });
      if (existing) {
        return reply.status(409).send({ code: 'CONFLICT', message: 'Action key already exists for this app version' });
      }
      const action = await prisma.action.create({
        data: {
          appVersionId,
          key: body.data.key,
          name: body.data.name,
          description: body.data.description ?? null,
          method: body.data.method,
          endpointTemplate: body.data.endpointTemplate,
          headersTemplate: json(body.data.headersTemplate ?? undefined),
          querySchema: json(body.data.querySchema ?? undefined),
          pathSchema: json(body.data.pathSchema ?? undefined),
          bodySchema: json(body.data.bodySchema ?? undefined),
          outputSchema: json(body.data.outputSchema ?? undefined),
          retryStrategy: body.data.retryStrategy ?? 'FIXED',
          maxAttempts: body.data.maxAttempts ?? 3,
          initialDelayMs: body.data.initialDelayMs ?? 1000,
          maxDelayMs: body.data.maxDelayMs ?? undefined,
          timeoutMs: body.data.timeoutMs ?? 30000,
          model: body.data.model ?? null,
          operation: body.data.operation ?? null,
          isGraphQL: body.data.isGraphQL ?? false,
          hasPaginationLimit: body.data.hasPaginationLimit ?? false,
          hasPaginationOffset: body.data.hasPaginationOffset ?? false,
          hasCustomArguments: body.data.hasCustomArguments ?? false,
          hasFilters: body.data.hasFilters ?? false,
          hasSorting: body.data.hasSorting ?? false,
          notes: body.data.notes ?? null,
          notesAppearance: body.data.notesAppearance ?? null,
        },
      });
      return reply.status(201).send(action);
    }
  );

  app.patch<{ Params: { id: string }; Body: z.infer<typeof updateActionBody> }>(
    '/actions/:id',
    { preHandler: canWrite },
    async (request, reply) => {
      const payload = request.user as JwtPayload;
      const action = await ensureActionTenant(request.params.id, payload.tenantId);
      if (!action) {
        return reply.status(404).send({ code: 'NOT_FOUND', message: 'Action not found' });
      }
      const body = updateActionBody.safeParse(request.body);
      if (!body.success) {
        return reply.status(400).send({ code: 'VALIDATION_ERROR', message: 'Invalid body', details: body.error.flatten() });
      }
      const updated = await prisma.action.update({
        where: { id: action.id },
        data: {
          ...(body.data.key != null && { key: body.data.key }),
          ...(body.data.name != null && { name: body.data.name }),
          ...(body.data.description !== undefined && { description: body.data.description ?? null }),
          ...(body.data.method != null && { method: body.data.method }),
          ...(body.data.endpointTemplate != null && { endpointTemplate: body.data.endpointTemplate }),
          ...(body.data.headersTemplate !== undefined && { headersTemplate: json(body.data.headersTemplate ?? undefined) }),
          ...(body.data.querySchema !== undefined && { querySchema: json(body.data.querySchema ?? undefined) }),
          ...(body.data.pathSchema !== undefined && { pathSchema: json(body.data.pathSchema ?? undefined) }),
          ...(body.data.bodySchema !== undefined && { bodySchema: json(body.data.bodySchema ?? undefined) }),
          ...(body.data.outputSchema !== undefined && { outputSchema: json(body.data.outputSchema ?? undefined) }),
          ...(body.data.retryStrategy != null && { retryStrategy: body.data.retryStrategy }),
          ...(body.data.maxAttempts != null && { maxAttempts: body.data.maxAttempts }),
          ...(body.data.initialDelayMs != null && { initialDelayMs: body.data.initialDelayMs }),
          ...(body.data.maxDelayMs !== undefined && { maxDelayMs: body.data.maxDelayMs }),
          ...(body.data.timeoutMs != null && { timeoutMs: body.data.timeoutMs }),
          ...(body.data.model !== undefined && { model: body.data.model ?? null }),
          ...(body.data.operation !== undefined && { operation: body.data.operation ?? null }),
          ...(body.data.isGraphQL !== undefined && { isGraphQL: body.data.isGraphQL }),
          ...(body.data.hasPaginationLimit !== undefined && { hasPaginationLimit: body.data.hasPaginationLimit }),
          ...(body.data.hasPaginationOffset !== undefined && { hasPaginationOffset: body.data.hasPaginationOffset }),
          ...(body.data.hasCustomArguments !== undefined && { hasCustomArguments: body.data.hasCustomArguments }),
          ...(body.data.hasFilters !== undefined && { hasFilters: body.data.hasFilters }),
          ...(body.data.hasSorting !== undefined && { hasSorting: body.data.hasSorting }),
          ...(body.data.notes !== undefined && { notes: body.data.notes ?? null }),
          ...(body.data.notesAppearance !== undefined && { notesAppearance: body.data.notesAppearance ?? null }),
        },
      });
      return reply.send(updated);
    }
  );

  app.delete<{ Params: { id: string } }>(
    '/actions/:id',
    { preHandler: canWrite },
    async (request, reply) => {
      const payload = request.user as JwtPayload;
      const action = await ensureActionTenant(request.params.id, payload.tenantId);
      if (!action) {
        return reply.status(404).send({ code: 'NOT_FOUND', message: 'Action not found' });
      }
      await prisma.action.delete({ where: { id: action.id } });
      return reply.status(204).send();
    }
  );

  const testActionBody = z.object({
    connectionId: z.string().uuid().optional(),
    input: z.record(z.unknown()).optional(),
  });

  app.post<{ Params: { id: string }; Body: z.infer<typeof testActionBody> }>(
    '/actions/:id/test',
    { preHandler: canWrite },
    async (request, reply) => {
      const payload = request.user as JwtPayload;
      const action = await ensureActionTenant(request.params.id, payload.tenantId);
      if (!action) {
        return reply.status(404).send({ code: 'NOT_FOUND', message: 'Action not found' });
      }
      const body = testActionBody.safeParse(request.body ?? {});
      if (!body.success) {
        return reply.status(400).send({ code: 'VALIDATION_ERROR', message: 'Invalid body', details: body.error.flatten() });
      }

      let connection: { id: string; config: unknown; secretCipher: Buffer } | null = null;
      if (body.data.connectionId) {
        const conn = await prisma.connection.findFirst({
          where: {
            id: body.data.connectionId,
            tenantId: payload.tenantId,
            appId: action.appVersion.appId,
            isActive: true,
          },
        });
        if (!conn) {
          return reply.status(404).send({ code: 'NOT_FOUND', message: 'Connection not found or not active' });
        }
        connection = { id: conn.id, config: conn.config, secretCipher: conn.secretCipher };
      }

      try {
        const { decrypt } = await import('../lib/encryption.js');
        const secrets = connection
          ? (JSON.parse(decrypt(connection.secretCipher)) as Record<string, string>)
          : {};
        const baseUrl = (connection?.config as { baseUrl?: string })?.baseUrl ?? '';
        const url = baseUrl + action.endpointTemplate.replace(/\{(\w+)\}/g, (_, k) => String((body.data.input ?? {})[k] ?? ''));
        const headers: Record<string, string> = {};
        if (action.headersTemplate && typeof action.headersTemplate === 'object') {
          for (const [k, v] of Object.entries(action.headersTemplate)) {
            if (typeof v === 'string') {
              headers[k] = v.replace(/\{(\w+)\}/g, (_, key) => secrets[key] ?? (body.data.input as Record<string, string>)?.[key] ?? '');
            }
          }
        }
        if (secrets.apiKey) headers['Authorization'] = `Bearer ${secrets.apiKey}`;
        if (secrets.api_key) headers['X-API-Key'] = secrets.api_key;

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), action.timeoutMs);
        const res = await fetch(url, {
          method: action.method,
          headers: { 'Content-Type': 'application/json', ...headers },
          body: action.method !== 'GET' && body.data.input ? JSON.stringify(body.data.input) : undefined,
          signal: controller.signal,
        });
        clearTimeout(timeout);
        const text = await res.text();
        let output: unknown;
        try {
          output = text ? JSON.parse(text) : null;
        } catch {
          output = text;
        }
        if (!res.ok) {
          return reply.send({
            success: false,
            error: `HTTP ${res.status}`,
            diagnostics: { status: res.status, body: output },
          });
        }
        return reply.send({ success: true, output });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        return reply.send({
          success: false,
          error: message,
          diagnostics: { name: err instanceof Error ? err.name : undefined },
        });
      }
    }
  );
}
