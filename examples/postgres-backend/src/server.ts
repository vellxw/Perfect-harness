import Fastify from 'fastify';
import pg from 'pg';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

export function createApp(connectionString: string) {
  const pool = new pg.Pool({ connectionString, max: 5, idleTimeoutMillis: 5000, connectionTimeoutMillis: 5000 });
  const app = Fastify({ logger: false, bodyLimit: 16000 });
  app.get('/health', async () => ({ ok: true }));
  app.get('/reservations', async () => (await pool.query('SELECT id, slot, customer FROM reservations ORDER BY id')).rows);
  app.post<{ Body: { slot: string; customer: string } }>('/reservations', {
    schema: { body: { type: 'object', additionalProperties: false, required: ['slot','customer'], properties: { slot: {type:'string', minLength:1, maxLength:40}, customer:{type:'string',minLength:1,maxLength:120} } } },
  }, async (request, reply) => {
    try {
      const result = await pool.query('INSERT INTO reservations(slot,customer) VALUES($1,$2) RETURNING id,slot,customer', [request.body.slot, request.body.customer]);
      return reply.code(201).send(result.rows[0]);
    } catch(error) {
      if ((error as {code?:string}).code === '23505') return reply.code(409).send({ error:'El horario ya está reservado' });
      throw error;
    }
  });
  app.addHook('onClose', async () => pool.end());
  return app;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL debe provenir de configuración local, nunca del repositorio');
  const app = createApp(process.env.DATABASE_URL);
  await app.listen({host:'0.0.0.0',port:Number(process.env.PORT ?? 3000)});
  for(const event of ['SIGTERM','SIGINT']) process.once(event,()=>void app.close());
}
