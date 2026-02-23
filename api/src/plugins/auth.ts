import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import fp from 'fastify-plugin';
import fjwt from '@fastify/jwt';
import type { JwtPayload } from '../types/auth.js';
import { config } from '../config.js';

async function authPlugin(app: FastifyInstance) {
  await app.register(fjwt, {
    secret: config.JWT_SECRET,
    sign: {
      iss: config.JWT_ISSUER,
      expiresIn: config.JWT_EXPIRES_IN,
    },
  });

  app.decorate('authenticate', async function (request: FastifyRequest, reply: FastifyReply) {
    try {
      await request.jwtVerify();
    } catch {
      return reply.status(401).send({
        code: 'UNAUTHORIZED',
        message: 'Invalid or missing token',
      });
    }
  });

  app.decorate('requireRole', function (...allowed: Array<'Owner' | 'Admin' | 'Builder' | 'Viewer'>) {
    return async (request: FastifyRequest, reply: FastifyReply) => {
      const payload = request.user as JwtPayload;
      if (!payload?.role || !allowed.includes(payload.role)) {
        return reply.status(403).send({
          code: 'FORBIDDEN',
          message: 'Insufficient role',
        });
      }
    };
  });
}

export default fp(authPlugin, { name: 'auth' });

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requireRole: (
      ...roles: Array<'Owner' | 'Admin' | 'Builder' | 'Viewer'>
    ) => (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: JwtPayload;
    user: JwtPayload;
  }
}
