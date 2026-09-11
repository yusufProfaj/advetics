/**
 * ═══ PLATFORM SAHİBİ YETKİSİ — ELLE VERİLİYOR ═══
 *
 * Advetics'i işleten taraf (Profaj) üst hesabı bir ÜRÜN olarak satıyor:
 * her müşteri için bir üst hesap açıyor, paketini seçiyor ve içine girip
 * ayarlıyor. Bu yetki bir organizasyonun da bir üst hesabın da DIŞINDA,
 * o yüzden `role` ya da `permissions` içinde değil — `users.platform_admin`.
 *
 * ┌─ NEDEN PANELDE BİR DÜĞME YOK ─────────────────────────────────────────┐
 * │ O düğmeyi görebilen herkes kendini yükseltebilirdi. Yetkiyi veren     │
 * │ şeyin kendisi, o yetkiyle korunamaz: bu bir açılış (bootstrap)        │
 * │ sorunu ve tek dürüst çözümü sunucuya erişimi olan birinin elle        │
 * │ vermesi.                                                               │
 * └───────────────────────────────────────────────────────────────────────┘
 *
 * Kullanım (advetics kullanıcısı, depo kökünde):
 *   pnpm --filter @advetics/api db:platform-admin -- --eposta=kisi@ornek.com
 *   pnpm --filter @advetics/api db:platform-admin -- --eposta=... --kaldir
 *   pnpm --filter @advetics/api db:platform-admin -- --liste
 */
import { resolve } from 'node:path';
import { config as loadEnv } from 'dotenv';
import { PrismaClient } from '@prisma/client';

loadEnv({ path: resolve(__dirname, '../../../.env') });

/*
 * `DIRECT_DATABASE_URL` — RLS DIŞI ve bu şart: `users` tablosunda
 * `platform_admin` yazmak, bütün RLS'in üstündeki bir yetkiyi vermek demek
 * ve RLS'in kendi bekçisini yazması mümkün değil.
 */
const prisma = new PrismaClient({ datasourceUrl: process.env.DIRECT_DATABASE_URL });

// pnpm 9 `--`'yı gerçek argüman olarak geçiriyor (bkz. sync-cli.ts).
const ARGV = process.argv.slice(2).filter((a) => a !== '--');
const EPOSTA = ARGV.find((a) => a.startsWith('--eposta='))?.slice('--eposta='.length);
const KALDIR = ARGV.includes('--kaldir');
const LISTE = ARGV.includes('--liste');

async function main() {
  if (LISTE) {
    const sahipler = await prisma.user.findMany({
      where: { platformAdmin: true },
      orderBy: { email: 'asc' },
      select: { email: true, fullName: true, status: true },
    });
    if (sahipler.length === 0) {
      console.log('Platform sahibi YOK.');
      return;
    }
    console.log(`${sahipler.length} platform sahibi:`);
    for (const s of sahipler) console.log(`  ${s.email}  ${s.fullName}  (${s.status})`);
    return;
  }

  if (!EPOSTA) {
    throw new Error('E-posta verilmedi. --eposta=kisi@ornek.com ya da --liste kullan.');
  }

  const kullanici = await prisma.user.findFirst({
    where: { email: { equals: EPOSTA, mode: 'insensitive' } },
    select: { id: true, email: true, fullName: true, platformAdmin: true },
  });
  if (!kullanici) throw new Error(`Kullanıcı bulunamadı: ${EPOSTA}`);

  const yeni = !KALDIR;
  if (kullanici.platformAdmin === yeni) {
    // DEĞİŞİKLİK YOKSA SÖYLENİYOR: "tamam" yazıp hiçbir şey yapmamak,
    // yanlış hesaba yetki verdiğini sanan birini uyarmazdı.
    console.log(`Değişiklik yok — ${kullanici.email} zaten ${yeni ? 'platform sahibi' : 'normal kullanıcı'}.`);
    return;
  }

  await prisma.user.update({ where: { id: kullanici.id }, data: { platformAdmin: yeni } });
  console.log(
    yeni
      ? `✓ ${kullanici.email} artık PLATFORM SAHİBİ — üst hesap kurabilir ve hepsine geçebilir.`
      : `✓ ${kullanici.email} platform sahipliği KALDIRILDI.`,
  );
  console.log('  Değişiklik bir sonraki oturum çözümünde geçerli olur (sayfayı yenilemek yeterli).');
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());
