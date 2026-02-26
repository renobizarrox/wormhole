import Fastify from 'fastify';
import cors from '@fastify/cors';
import { config } from './config.js';
import authPlugin from './plugins/auth.js';
import authRoutes from './routes/auth.js';
import tenantsRoutes from './routes/tenants.js';
import appsRoutes from './routes/apps.js';
import actionsRoutes from './routes/actions.js';
import connectionsRoutes from './routes/connections.js';
import workflowsRoutes from './routes/workflows.js';
import triggersRoutes from './routes/triggers.js';
import runsRoutes from './routes/runs.js';
import webhooksRoutes from './routes/webhooks.js';
import { startCronScheduler } from './lib/cronScheduler.js';
import { startWorker } from './lib/queue.js';

export async function buildApp() {
  const app = Fastify({ logger: config.NODE_ENV !== 'test' });

  await app.register(cors, {
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      if (config.CORS_ORIGIN === 'true' || !config.CORS_ORIGIN) {
        try {
          const u = new URL(origin);
          const host = u.hostname;
          const isLocal =
            host === 'localhost' ||
            host === '127.0.0.1' ||
            host.startsWith('192.168.') ||
            host.startsWith('10.') ||
            /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(host);
          return cb(null, isLocal);
        } catch {
          return cb(null, false);
        }
      }
      const allowed = config.CORS_ORIGIN.split(',').map((s) => s.trim());
      return cb(null, allowed.includes(origin));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  await app.register(authPlugin);

  await app.register(authRoutes, { prefix: '/api' });
  await app.register(tenantsRoutes, { prefix: '/api' });
  await app.register(appsRoutes, { prefix: '/api' });
  await app.register(actionsRoutes, { prefix: '/api' });
  await app.register(connectionsRoutes, { prefix: '/api' });
  await app.register(workflowsRoutes, { prefix: '/api' });
  await app.register(triggersRoutes, { prefix: '/api' });
  await app.register(runsRoutes, { prefix: '/api' });
  await app.register(webhooksRoutes, { prefix: '/api' });

  app.get('/health', async (_, reply) => {
    return reply.send({ status: 'ok', timestamp: new Date().toISOString() });
  });

  if (config.NODE_ENV !== 'test') {
    startCronScheduler(app.log);
    startWorker(app.log);
  }

  return app;
}
