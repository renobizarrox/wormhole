import { config } from './config.js';
import { buildApp } from './app.js';

async function main() {
  const app = await buildApp();
  try {
    await app.listen({ host: config.HOST, port: config.PORT });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

main();
