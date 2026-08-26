import { createServer } from 'node:http';
import { validateEnv } from './lib/env.ts';
import { handleApiRequest } from './handler.ts';

validateEnv();

const port = Number(process.env.PORT ?? 4000);
const server = createServer(handleApiRequest);

process.on('unhandledRejection', (reason) => {
  console.error('unhandledRejection', reason);
  process.exit(1);
});

server.listen(port, () => {
  console.log(`yeki-hast api listening on :${port}`);
});
