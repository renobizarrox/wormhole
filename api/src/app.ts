import Fastify from 'fastify';
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
