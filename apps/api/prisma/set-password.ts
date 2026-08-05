/**
 * Bir kullanıcının şifresini sunucudan sıfırlar.
 *
 * NEDEN GEREKLİ: e-posta tabanlı şifre sıfırlama Modül 1.5'te gelecek. O zamana
 * kadar üretimde şifresini kaybeden bir yönetici kilitli kalıyor — token
 * üretimde bilinçli olarak ekrana basılmıyor (basılsa, endpoint'i çağıran
 * herkes başkasının hesabını ele geçirebilirdi).
 *
 * Bu script sunucuya SSH erişimi gerektirir; yani zaten veritabanına erişebilen
 * biri tarafından çalıştırılabilir. Yeni bir yetki yüzeyi açmıyor.
 *
 * Kullanım:
 *   pnpm --filter @advetics/api db:set-password -- --email yusuf@profaj.com
 *   pnpm --filter @advetics/api db:set-password -- --email x@y.com --password 'kendi-sifren'
 *
 * Şifre verilmezse güçlü bir tane üretilir ve BİR KEZ ekrana basılır.
 */
import { resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { config as loadEnv } from 'dotenv';
import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';

loadEnv({ path: resolve(__dirname, '../../../.env') });

const prisma = new PrismaClient({ datasourceUrl: process.env.DIRECT_DATABASE_URL });

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 ? process.argv[i + 1] : undefined;
}

/** Karışması kolay karakterler (O/0, l/1, I) çıkarıldı — elle yazılacak. */
function generatePassword(length = 20): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#%*-_';
  const bytes = randomBytes(length);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
}

async function main(): Promise<void> {
  const email = arg('email')?.toLowerCase();
  if (!email) {
    console.error(
      '\n✗ --email zorunlu\n\n  Örnek:\n    pnpm --filter @advetics/api db:set-password -- --email yusuf@profaj.com\n',
    );
    process.exit(1);
  }

  const password = arg('password') ?? generatePassword();
  if (password.length < 12) {
    console.error('\n✗ Şifre en az 12 karakter olmalı (Zod şeması bunu dayatıyor)\n');
    process.exit(1);
  }

  const users = await prisma.user.findMany({
    where: { email },
    select: { id: true, email: true, fullName: true, orgId: true, status: true },
  });

  if (users.length === 0) {
    const all = await prisma.user.findMany({ select: { email: true }, take: 20 });
    console.error(`\n✗ '${email}' bulunamadı.\n`);
    console.error(`  Kayıtlı kullanıcılar: ${all.map((u) => u.email).join(', ') || '(yok)'}\n`);
    process.exit(1);
  }
  if (users.length > 1) {
    console.error(
      `\n✗ '${email}' birden fazla organizasyonda kayıtlı (${users.length}). Elle müdahale gerekiyor.\n`,
    );
    process.exit(1);
  }

  const user = users[0]!;

  const passwordHash = await argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  });

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: user.id },
      data: { passwordHash, status: 'active' },
    });

    // Şifre değiştiğinde tüm oturumlar düşmeli. Aksi halde şifreyi ele geçiren
    // birinin açık oturumu sıfırlamaya rağmen yaşamaya devam eder.
    await tx.refreshToken.updateMany({
      where: { userId: user.id, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: 'admin_password_reset' },
    });

    // Denetim izi: bu işlem bir yöneticinin şifresini değiştiriyor, iz bırakmalı.
    await tx.auditLog.create({
      data: {
        orgId: user.orgId,
        actorType: 'system',
        actorLabel: 'set-password.ts (sunucu erişimi)',
        action: 'password.reset_by_admin',
        targetType: 'user',
        targetId: user.id,
        after: { email: user.email },
      },
    });
  });

  const line = '─'.repeat(46);
  console.log(`\n\x1b[1;33m╭${line}\x1b[0m`);
  console.log(`\x1b[1;33m│\x1b[0m  ŞİFRE SIFIRLANDI — bir daha gösterilmeyecek`);
  console.log(`\x1b[1;33m│\x1b[0m`);
  console.log(`\x1b[1;33m│\x1b[0m  Kullanıcı : ${user.fullName} <${user.email}>`);
  console.log(`\x1b[1;33m│\x1b[0m  Şifre     : ${password}`);
  console.log(`\x1b[1;33m│\x1b[0m`);
  console.log(`\x1b[1;33m│\x1b[0m  Tüm açık oturumlar sonlandırıldı.`);
  console.log(`\x1b[1;33m╰${line}\x1b[0m\n`);
  console.log('  Giriş: https://advetics.com/login\n');
}

main()
  .catch((err: unknown) => {
    console.error('\n✗ Başarısız:\n', err);
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());
