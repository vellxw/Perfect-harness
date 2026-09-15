import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import pg from 'pg';

export async function migrate(connectionString: string, directory = new URL('../migrations/', import.meta.url)) {
  const pool = new pg.Pool({connectionString,max:1});
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock($1)',[190624]);
    await client.query('CREATE TABLE IF NOT EXISTS schema_migrations(name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())');
    const files = (await readdir(directory)).filter(n=>/^\d{3}_[a-z0-9_-]+\.sql$/.test(n)).sort();
    for (const name of files) {
      const sql = await readFile(new URL(name,directory),'utf8');
      const checksum=createHash('sha256').update(sql).digest('hex');
      const previous=await client.query('SELECT checksum FROM schema_migrations WHERE name=$1',[name]);
      if(previous.rows.length){if(previous.rows[0].checksum!==checksum)throw new Error('Migración aplicada fue modificada: '+name);continue;}
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations(name,checksum) VALUES($1,$2)',[name,checksum]);
    }
    await client.query('COMMIT');
  }catch(error){await client.query('ROLLBACK');throw error;}
  finally{client.release();await pool.end();}
}
