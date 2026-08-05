/**
 * Geliştirme verisi.
 *
 * DIRECT_DATABASE_URL (advetics_migrator, BYPASSRLS) ile çalışır — seed
 * işleminin RLS politikalarına takılmaması için. Bu, üretimde çalıştırılacak
 * bir script DEĞİLDİR.
 *
 * Idempotenttir: tekrar çalıştırmak mevcut kayıtları günceller, çoğaltmaz.
 */
import { resolve } from 'node:path';
import { config as loadEnv } from 'dotenv';
import { PrismaClient, Role } from '@prisma/client';
import * as argon2 from 'argon2';

loadEnv({ path: resolve(__dirname, '../../../.env') });

const prisma = new PrismaClient({
  datasourceUrl: process.env.DIRECT_DATABASE_URL,
});

function slugify(input: string): string {
  const map: Record<string, string> = {
    ç: 'c', Ç: 'c', ğ: 'g', Ğ: 'g', ı: 'i', İ: 'i',
    ö: 'o', Ö: 'o', ş: 's', Ş: 's', ü: 'u', Ü: 'u',
  };
  return input
    .split('')
    .map((ch) => map[ch] ?? ch)
    .join('')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

async function main(): Promise<void> {
  const orgName = process.env.SEED_ORG_NAME ?? 'Advetics';
  const adminEmail = (process.env.SEED_ADMIN_EMAIL ?? 'admin@advetics.local').toLowerCase();
  const adminPassword = process.env.SEED_ADMIN_PASSWORD;

  if (!adminPassword || adminPassword.length < 12) {
    throw new Error('SEED_ADMIN_PASSWORD en az 12 karakter olmalı. .env dosyasını kontrol et.');
  }

  const orgSlug = slugify(orgName);

  const org = await prisma.organization.upsert({
    where: { slug: orgSlug },
    update: { name: orgName },
    create: { name: orgName, slug: orgSlug, plan: 'pro', status: 'active' },
  });

  const passwordHash = await argon2.hash(adminPassword, {
    type: argon2.argon2id,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  });

  const owner = await prisma.user.upsert({
    where: { orgId_email: { orgId: org.id, email: adminEmail } },
    update: { passwordHash, status: 'active' },
    create: {
      orgId: org.id,
      email: adminEmail,
      passwordHash,
      fullName: 'Yusuf Algan',
      locale: 'tr',
      status: 'active',
    },
  });

  // Org geneli owner membership (clientId = null)
  const existingOwnerMembership = await prisma.membership.findFirst({
    where: { userId: owner.id, clientId: null },
  });
  if (existingOwnerMembership) {
    await prisma.membership.update({
      where: { id: existingOwnerMembership.id },
      data: { role: Role.owner },
    });
  } else {
    await prisma.membership.create({
      data: { userId: owner.id, orgId: org.id, clientId: null, role: Role.owner },
    });
  }

  // Organizasyonun varsayılan marka profili
  const existingOrgBranding = await prisma.brandingProfile.findFirst({
    where: { orgId: org.id, clientId: null },
  });
  if (!existingOrgBranding) {
    await prisma.brandingProfile.create({
      data: {
        orgId: org.id,
        clientId: null,
        primaryColor: '#E11D2E',
        accentColor: '#F97316',
        emailFromName: orgName,
        hidePoweredBy: false,
      },
    });
  }

  // Demo müşteriler
  const demoClients = [
    { name: 'Demo Müşteri A', timezone: 'Europe/Istanbul', currency: 'TRY' },
    { name: 'Demo Müşteri B', timezone: 'Europe/Berlin', currency: 'EUR' },
  ];

  for (const c of demoClients) {
    const slug = slugify(c.name);
    await prisma.client.upsert({
      where: { orgId_slug: { orgId: org.id, slug } },
      update: {},
      create: {
        orgId: org.id,
        name: c.name,
        slug,
        timezone: c.timezone,
        reportingCurrency: c.currency,
        status: 'active',
      },
    });
  }

  await prisma.auditLog.create({
    data: {
      orgId: org.id,
      actorType: 'system',
      actorLabel: 'seed',
      action: 'org.seeded',
      targetType: 'organization',
      targetId: org.id,
      after: { orgName, adminEmail },
    },
  });

  console.log('\nSeed tamamlandı.');
  console.log(`  Organizasyon : ${org.name} (${org.slug})`);
  console.log(`  Owner        : ${adminEmail}`);
  console.log(`  Müşteriler   : ${demoClients.map((c) => c.name).join(', ')}`);
  console.log('\n  Giriş: http://localhost:3000/login\n');
}

main()
  .catch((err: unknown) => {
    console.error('Seed başarısız:\n', err);
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());
