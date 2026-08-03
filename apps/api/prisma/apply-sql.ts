/**
 * prisma/sql/*.sql dosyalarını sırayla uygular.
 *
 * Neden Prisma değil de ham `pg`:
 * Prisma extended query protocol kullanır ve tek çağrıda birden fazla ifade
 * çalıştıramaz. RLS dosyalarımız `DO $$ ... $$` blokları ve çok sayıda ifade
 * içeriyor. `pg` simple query protocol ile bunları tek seferde çalıştırır.
 *
 * Neden psql değil: geliştiricinin makinesinde psql kurulu olmak zorunda değil.
 *
 * Bağlantı: DIRECT_DATABASE_URL (advetics_migrator — tablo sahibi).
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { config as loadEnv } from 'dotenv';
import { Client } from 'pg';

// Monorepo kökündeki .env — tüm servisler tek dosyadan beslenir.
loadEnv({ path: resolve(__dirname, '../../../.env') });

const SQL_DIR = join(__dirname, 'sql');

async function main(): Promise<void> {
  const connectionString = process.env.DIRECT_DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      'DIRECT_DATABASE_URL tanımlı değil. Bu script tablo sahibi rolü (advetics_migrator) ile çalışmalıdır.',
    );
  }

  const files = readdirSync(SQL_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  if (files.length === 0) {
    console.log('prisma/sql/ altında .sql dosyası yok, atlanıyor.');
    return;
  }

  const client = new Client({ connectionString });
  await client.connect();

  try {
    for (const file of files) {
      const sql = readFileSync(join(SQL_DIR, file), 'utf8');
      process.stdout.write(`  → ${file} ... `);
      await client.query(sql);
      console.log('ok');
    }
    console.log('\nKısıtlar ve RLS politikaları uygulandı.');
  } finally {
    await client.end();
  }
}

main().catch((err: unknown) => {
  console.error('\nSQL uygulanamadı:\n', err);
  process.exit(1);
});
