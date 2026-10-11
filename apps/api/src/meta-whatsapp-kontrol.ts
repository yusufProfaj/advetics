/**
 * ═══ SAYFAYA BAĞLI WHATSAPP NUMARALARINI CANLIDA ÖLÇ ═══
 *
 * WhatsApp'a tıklama reklamında reklam setinin `promoted_object`i isteğe
 * bağlı bir `whatsapp_phone_number` alıyor ve TEKİL. Sayfaya birden çok
 * numara bağlıysa ve alan gönderilmezse Meta'nın ne yaptığı belgede yok:
 * ya kurulum düşer ya da Meta numarayı kendisi seçer ve reklam yanlış
 * hatta gider (sessiz). Kullanıcıya numarayı SEÇTİRMEK için numaraların
 * listesi gerekiyor ve o listenin hangi uçtan geldiği de belgede net değil.
 * Bu betik adayları TEK TEK soruyor; hangisinin kabul edildiğini, dönen
 * değeri ve reddin cümlesini basıyor. HİÇBİR ŞEY YAZMIYOR: yalnızca GET.
 *
 * İlk canlı tur (2026-10-11) `whatsapp_number` alanından sonuç alamadı
 * ("Kontrol edilemedi") ama ağaç kuruldu: alanın boş dönmesi hattın
 * olmadığını kanıtlamıyor.
 *
 * NEST BAĞLAMIYLA ÇALIŞIYOR (`meta-sayfa-metrik-kontrol` ile aynı gerekçe).
 *
 * Kullanım (advetics kullanıcısı, depo kökünde, deploy'dan SONRA):
 *   pnpm --filter @advetics/api meta-whatsapp-kontrol -- --profil <facebook_page social_profile uuid>
 */
import 'reflect-metadata';
import { resolve } from 'node:path';
import { config as loadEnv } from 'dotenv';
import { NestFactory } from '@nestjs/core';

// TEK .env DEPO KÖKÜNDE (CLAUDE.md §2). `dist/` → `apps/api` → `apps` → kök.
loadEnv({ path: resolve(__dirname, '../../../.env') });

import { AppModule } from './app.module';
import { PrismaAdminService } from './prisma/prisma-admin.service';
import { CryptoService } from './crypto/crypto.service';
import { CONFIG, type AppConfig } from './config/configuration';

const ARGV = process.argv.slice(2).filter((a) => a !== '--');
function arg(name: string): string | undefined {
  const i = ARGV.indexOf(`--${name}`);
  return i !== -1 ? ARGV[i + 1] : undefined;
}

async function getJson(url: string, token: string): Promise<{ ok: boolean; govde: Record<string, unknown> }> {
  const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const govde = (await r.json().catch(() => ({}))) as Record<string, unknown>;
  return { ok: r.ok, govde };
}

function hataCumlesi(govde: Record<string, unknown>): string {
  const e = govde.error as { message?: string; code?: number } | undefined;
  return e ? `(${e.code ?? '?'}) ${e.message ?? 'bilinmeyen hata'}` : 'bilinmeyen hata';
}

/** Numaralar kişisel veri değil, işletme hattı; yine de yalnız son dört hane basılır. */
function maskele(metin: string): string {
  return metin.replace(/\+?\d[\d\s()-]{6,}\d/g, (m) => `…${m.replace(/\D/g, '').slice(-4)}`);
}

/**
 * ADAYLAR — bir SORU listesi, tahmin değil. İlk satır kodun bugün okuduğu;
 * diğerleri sayfa düğümünün metadata'sında "whats" geçen alan ve bağlantılar
 * (betik onları ayrıca kendisi keşfediyor).
 */
const SAYFA_ALANLARI = ['whatsapp_number', 'whatsapp_business_account', 'whatsapp_connected_phone_numbers', 'connected_whatsapp_business_account'];

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  try {
    const db = app.get(PrismaAdminService);
    const crypto = app.get(CryptoService);
    const surum = app.get<AppConfig>(CONFIG).platforms.meta.apiVersion;
    const graph = `https://graph.facebook.com/${surum}`;

    const profilId = arg('profil');
    if (!profilId) {
      console.log('\n  ✗ --profil <facebook_page social_profile uuid> gerekli.\n');
      process.exitCode = 1;
      return;
    }
    const p = await db.socialProfile.findUnique({
      where: { id: profilId },
      select: {
        name: true,
        externalId: true,
        profileType: true,
        pageAccessTokenEnc: true,
        connection: { select: { accessTokenEnc: true } },
      },
    });
    if (!p || p.profileType !== 'facebook_page' || !p.pageAccessTokenEnc) {
      console.log('\n  ✗ Sayfa token\'ı olan bir Facebook sayfası bulunamadı.\n');
      process.exitCode = 1;
      return;
    }
    const sayfaToken = crypto.decrypt(Buffer.from(p.pageAccessTokenEnc));
    const kullaniciToken = p.connection ? crypto.decrypt(Buffer.from(p.connection.accessTokenEnc)) : null;
    console.log(`\n  Graph sürümü: ${surum}\n═══ ${p.name} (${p.externalId}) ═══`);

    // 1) Sayfa düğümünün metadata'sı: "whats" geçen alan ve bağlantılar.
    const meta = await getJson(`${graph}/${p.externalId}?metadata=1&fields=id`, sayfaToken);
    const md = (meta.govde.metadata ?? {}) as { fields?: Array<{ name: string }>; connections?: Record<string, string> };
    const kesifAlan = (md.fields ?? []).map((f) => f.name).filter((n) => /whats/i.test(n));
    const kesifBag = Object.keys(md.connections ?? {}).filter((n) => /whats/i.test(n));
    console.log(meta.ok ? `  metadata alanları (whats): ${kesifAlan.join(', ') || '(yok)'}` : `  ✗ metadata: ${hataCumlesi(meta.govde)}`);
    console.log(meta.ok ? `  metadata bağlantıları (whats): ${kesifBag.join(', ') || '(yok)'}` : '');

    // 2) Alanlar tek tek (biri reddedilince isteğin tamamı düşüyor).
    for (const alan of [...new Set([...SAYFA_ALANLARI, ...kesifAlan])]) {
      const r = await getJson(`${graph}/${p.externalId}?fields=${alan}`, sayfaToken);
      console.log(r.ok ? `  ✓ alan ${alan.padEnd(38)} ${maskele(JSON.stringify(r.govde[alan] ?? '(dönmedi)'))}` : `  ✗ alan ${alan.padEnd(38)} ${hataCumlesi(r.govde)}`);
    }
    // 3) Keşfedilen bağlantılar.
    for (const bag of kesifBag) {
      const r = await getJson(`${graph}/${p.externalId}/${bag}`, sayfaToken);
      console.log(r.ok ? `  ✓ bağlantı ${bag.padEnd(34)} ${maskele(JSON.stringify(r.govde.data ?? r.govde).slice(0, 400))}` : `  ✗ bağlantı ${bag.padEnd(34)} ${hataCumlesi(r.govde)}`);
    }
    // 4) İşletme → WhatsApp Business hesabı → numaralar (kullanıcı token'ı).
    if (kullaniciToken) {
      const isl = await getJson(`${graph}/me/businesses?fields=id,name&limit=50`, kullaniciToken);
      if (!isl.ok) console.log(`  ✗ /me/businesses: ${hataCumlesi(isl.govde)}`);
      const isletmeler = (isl.govde.data as Array<{ id: string; name: string }> | undefined) ?? [];
      console.log(`  işletme sayısı: ${isletmeler.length}`);
      for (const b of isletmeler.slice(0, 20)) {
        for (const kenar of ['owned_whatsapp_business_accounts', 'client_whatsapp_business_accounts']) {
          const w = await getJson(`${graph}/${b.id}/${kenar}?fields=id,name&limit=50`, kullaniciToken);
          if (!w.ok) {
            console.log(`  ✗ ${b.name} · ${kenar}: ${hataCumlesi(w.govde)}`);
            continue;
          }
          for (const waba of (w.govde.data as Array<{ id: string; name: string }> | undefined) ?? []) {
            const n = await getJson(`${graph}/${waba.id}/phone_numbers?fields=id,display_phone_number,verified_name,status&limit=50`, kullaniciToken);
            console.log(
              n.ok
                ? `  ✓ ${b.name} · ${kenar} · ${waba.name}: ${maskele(JSON.stringify(n.govde.data))}`
                : `  ✗ ${b.name} · ${kenar} · ${waba.name} numaraları: ${hataCumlesi(n.govde)}`,
            );
          }
        }
      }
    }
    console.log('\n  Kabul edilen (✓) yol, sayfaya bağlı numaraları okuyan uç olarak kullanılacak.\n');
  } finally {
    await app.close();
  }
}

void main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
