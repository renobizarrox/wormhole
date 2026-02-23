import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '../db.js';
import { encrypt, decrypt } from '../lib/encryption.js';
import type { JwtPayload } from '../types/auth.js';

const json = (v: Record<string, unknown> | null | undefined): Prisma.InputJsonValue | undefined =>
  v === null || v === undefined ? undefined : (v as Prisma.InputJsonValue);

const createConnectionBody = z.object({
  appId: z.string().uuid(),
  appVersionId: z.string().uuid().optional(),
  name: z.string().min(1),
  description: z.string().optional(),
  authType: z.enum(['API_KEY', 'OAUTH2', 'BASIC', 'CUSTOM_HEADER']),
  config: z.record(z.unknown()).nullable().optional(),
  /** Plaintext credentials; will be encrypted. Never returned in responses. */
  credentials: z.record(z.union([z.string(), z.number(), z.boolean()])),
});

const updateConnectionBody = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  config: z.record(z.unknown()).nullable().optional(),
  isActive: z.boolean().optional(),
  /** If provided, re-encrypt and store; omit to keep existing secret. */
  credentials: z.record(z.union([z.string(), z.number(), z.boolean()])).optional(),
});

const listQuery = z.object({
  limit: z.coerce.number().min(1).max(100).default(20),
  offset: z.coerce.number().min(0).default(0),
  appId: z.string().uuid().optional(),
});

function maskConnection<T extends { secretCipher?: Buffer | null }>(row: T) {
  const { secretCipher, ...rest } = row as T & { secretCipher?: Buffer };
  return { ...rest, secretCipher: secretCipher ? '[REDACTED]' : null };
}

export default async function connectionsRoutes(app: FastifyInstance) {
  const canWrite = [app.authenticate, app.requireRole('Owner', 'Admin', 'Builder')];
  const canRead = [app.authenticate, app.requireRole('Owner', 'Admin', 'Builder', 'Viewer')];

  app.get<{ Querystring: z.infer<typeof listQuery> }>(
    '/connections',
    { preHandler: canRead },
    async (request, reply) => {
      const payload = request.user as JwtPayload;
      const query = listQuery.safeParse(request.query);
      if (!query.success) {
        return reply.status(400).send({ code: 'VALIDATION_ERROR', message: 'Invalid query', details: query.error.flatten() });
      }
      const where = { tenantId: payload.tenantId, ...(query.data.appId && { appId: query.data.appId }) };
      const connections = await prisma.connection.findMany({
        where,
        take: query.data.limit,
        skip: query.data.offset,
      });
      return reply.send({
        items: connections.map((c) => maskConnection(c)),
        limit: query.data.limit,
        offset: query.data.offset,
      });
    }
  );

  app.get<{ Params: { id: string } }>(
    '/connections/:id',
    { preHandler: canRead },
    async (request, reply) => {
      const payload = request.user as JwtPayload;
      const conn = await prisma.connection.findFirst({
        where: { id: request.params.id, tenantId: payload.tenantId },
      });
      if (!conn) {
        return reply.status(404).send({ code: 'NOT_FOUND', message: 'Connection not found' });
      }
      return reply.send(maskConnection(conn));
    }
  );

  app.post<{ Body: z.infer<typeof createConnectionBody> }>(
    '/connections',
    { preHandler: canWrite },
    async (request, reply) => {
      const payload = request.user as JwtPayload;
      const body = createConnectionBody.safeParse(request.body);
      if (!body.success) {
        return reply.status(400).send({ code: 'VALIDATION_ERROR', message: 'Invalid body', details: body.error.flatten() });
      }
      const app = await prisma.app.findFirst({
        where: { id: body.data.appId, tenantId: payload.tenantId },
      });
      if (!app) {
        return reply.status(404).send({ code: 'NOT_FOUND', message: 'App not found' });
      }
      const secretCipher = encrypt(JSON.stringify(body.data.credentials));
      const connection = await prisma.connection.create({
        data: {
          tenantId: payload.tenantId,
          appId: body.data.appId,
          appVersionId: body.data.appVersionId ?? null,
          name: body.data.name,
          description: body.data.description ?? null,
          authType: body.data.authType,
          config: json(body.data.config ?? undefined),
          secretCipher,
        },
      });
      return reply.status(201).send(maskConnection(connection));
    }
  );

  app.patch<{ Params: { id: string }; Body: z.infer<typeof updateConnectionBody> }>(
    '/connections/:id',
    { preHandler: canWrite },
    async (request, reply) => {
      const payload = request.user as JwtPayload;
      const conn = await prisma.connection.findFirst({
        where: { id: request.params.id, tenantId: payload.tenantId },
      });
      if (!conn) {
        return reply.status(404).send({ code: 'NOT_FOUND', message: 'Connection not found' });
      }
      const body = updateConnectionBody.safeParse(request.body);
      if (!body.success) {
        return reply.status(400).send({ code: 'VALIDATION_ERROR', message: 'Invalid body', details: body.error.flatten() });
      }
      const data: Parameters<typeof prisma.connection.update>[0]['data'] = {
        ...(body.data.name != null && { name: body.data.name }),
        ...(body.data.description !== undefined && { description: body.data.description ?? null }),
        ...(body.data.config !== undefined && { config: json(body.data.config ?? undefined) }),
        ...(body.data.isActive != null && { isActive: body.data.isActive }),
      };
      if (body.data.credentials) {
        data.secretCipher = encrypt(JSON.stringify(body.data.credentials));
        data.secretVersion = conn.secretVersion + 1;
        data.rotatedAt = new Date();
      }
      const updated = await prisma.connection.update({
        where: { id: conn.id },
        data,
      });
      return reply.send(maskConnection(updated));
    }
  );

  app.delete<{ Params: { id: string } }>(
    '/connections/:id',
    { preHandler: canWrite },
    async (request, reply) => {
      const payload = request.user as JwtPayload;
      const conn = await prisma.connection.findFirst({
        where: { id: request.params.id, tenantId: payload.tenantId },
      });
      if (!conn) {
        return reply.status(404).send({ code: 'NOT_FOUND', message: 'Connection not found' });
      }
      await prisma.connection.delete({ where: { id: conn.id } });
      return reply.status(204).send();
    }
  );

  app.post<{ Params: { id: string } }>(
    '/connections/:id/test',
    { preHandler: canWrite },
    async (request, reply) => {
      const payload = request.user as JwtPayload;
      const conn = await prisma.connection.findFirst({
        where: { id: request.params.id, tenantId: payload.tenantId },
        include: { app: true },
      });
      if (!conn) {
        return reply.status(404).send({ code: 'NOT_FOUND', message: 'Connection not found' });
      }
      try {
        const credentials = JSON.parse(decrypt(conn.secretCipher)) as Record<string, string>;
        const baseUrl = (conn.config as { baseUrl?: string })?.baseUrl ?? '';
        const testUrl = (conn.config as { testUrl?: string })?.testUrl ?? baseUrl;
        if (!testUrl) {
          return reply.send({
            success: true,
            diagnostics: { message: 'No test URL configured; decryption succeeded' },
          });
        }
        const headers: Record<string, string> = {};
        if (credentials.apiKey) headers['Authorization'] = `Bearer ${credentials.apiKey}`;
        if (credentials.api_key) headers['X-API-Key'] = credentials.api_key;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);
        const res = await fetch(testUrl, { method: 'GET', headers, signal: controller.signal });
        clearTimeout(timeout);
        if (!res.ok) {
          return reply.send({
            success: false,
            error: `HTTP ${res.status}`,
            diagnostics: { status: res.status },
          });
        }
        return reply.send({ success: true, diagnostics: { status: res.status } });
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
