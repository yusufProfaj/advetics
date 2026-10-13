/**
 * ═══ YİNELENEN GOOGLE BAĞLANTILARINI VE HAVUZ KOPYALARINI TEMİZLE ═══
 *
 * 2026-10-13: "Ölçüm izinlerini ver" ajansın Google bağlantısı yerine
 * müşteri şirketlerinde üç yeni bağlantı açtı ve her biri ajans havuzunun
 * kopyasını o şirkete yazdı. Kod düzeltildi (hedefli dönüş); bu betik çöpü
 * kaldırıyor. Kararlar ve gerekçeleri `yinelenen-baglanti-karari.ts`te.
 *
 * ═══ VARSAYILAN KURU ÇALIŞMA ═══
 *
 * `--uygula` olmadan TEK SATIR yazılmıyor; önce ne yapılacağı sayılarla
 * yazılıyor. Uygulamada plan TEK TRANSACTION içinde yeniden kuruluyor ve
 * o plan uygulanıyor: kuru çalışmadan bu yana biri bir satırı atadıysa o
 * satır artık "atanmış" sayılır ve dokunulmaz.
 *
 * Google'da token İPTAL EDİLMİYOR (bkz. karar dosyası): panelden
 * "Bağlantıyı kaldır" bu kopyalar için KULLANILMAMALI — Google iptali,
 * aynı kişinin ajans bağlantısına verdiği izni de götürür.
 *
 * Kullanım (sunucuda, `advetics` kullanıcısıyla, depo kökünde):
 *   pnpm --filter @advetics/api db:yinelenen-baglanti -- \
 *     --baglanti=<uuid>,<uuid>,<uuid>                 (kuru)
 *   … aynı komut + --uygula                            (uygula)
 * Kimlikler TAM UUID olmalı; önek kabul edilmiyor (yanlış satırı eşlemesin).
 */
import { resolve } from 'node:path';
import { config as loadEnv } from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { planMetni, temizlikPlani, temizlikUygula, type Sorgucu } from './yinelenen-baglanti-karari';

loadEnv({ path: resolve(__dirname, '../../../.env') });

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const UYGULA = process.argv.includes('--uygula');
const arg = process.argv.find((a) => a.startsWith('--baglanti='));
const idler = (arg?.slice('--baglanti='.length) ?? '').split(',').map((s) => s.trim()).filter(Boolean);

async function main(): Promise<void> {
  if (idler.length === 0 || idler.some((i) => !UUID.test(i))) {
    console.error('Kullanım: --baglanti=<tam-uuid>[,<tam-uuid>…] [--uygula]  (önek kabul edilmiyor)');
    process.exit(2);
  }
  // Havuzlanmış bağlantı değil: tek transaction, kısa ama birden çok deyim.
  const prisma = new PrismaClient({ datasourceUrl: process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL });
  try {
    console.log(UYGULA ? '⚠  UYGULAMA MODU — veri yazılacak\n' : 'KURU ÇALIŞMA — hiçbir şey yazılmayacak (--uygula ile uygula)\n');
    if (!UYGULA) {
      console.log(planMetni(await temizlikPlani(prisma as unknown as Sorgucu, idler)));
      return;
    }
    const sonuc = await prisma.$transaction(
      async (tx) => {
        const plan = await temizlikPlani(tx as unknown as Sorgucu, idler);
        console.log(planMetni(plan));
        return temizlikUygula(tx as unknown as Sorgucu, plan);
      },
      { timeout: 120_000 },
    );
    console.log(
      `\nUYGULANDI: silinen reklam hesabı ${sonuc.silinenHesap}, silinen sosyal profil ${sonuc.silinenProfil}, iptal edilen bağlantı ${sonuc.iptalEdilen}`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
