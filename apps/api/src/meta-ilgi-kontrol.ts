/**
 * ═══ META İLGİ ALANI ARAMASINI CANLIDA SINA (Marka Merkezi Bölüm 4c) ═══
 *
 * `searchInterests` Graph belgesinden yazıldı, canlıda denenmedi. Bu betik
 * gerçek bir Meta token'ıyla TEK bir `/search?type=adinterest` isteği atıyor,
 * ham satırın alanlarını ve eşlenmiş sonucu basıyor. HİÇBİR ŞEY YAZMIYOR —
 * yalnızca okuma (GET).
 *
 * NEST BAĞLAMIYLA ÇALIŞIYOR ve bu yüzden `dist`ten koşuyor (`google-check`
 * ile aynı gerekçe): tsx dekoratör metadatası üretmiyor, DI çözülmüyor.
 *
 * Kullanım (advetics kullanıcısı, depo kökünde, deploy'dan SONRA):
 *   pnpm --filter @advetics/api meta-ilgi-kontrol -- --q "lüks otomobil"
 *   pnpm --filter @advetics/api meta-ilgi-kontrol -- --q golf --hesap <ad_account uuid>
 *   pnpm --filter @advetics/api meta-ilgi-kontrol -- --terimler "lüks otomobil,otomobil,luxury car"
 *   pnpm --filter @advetics/api meta-ilgi-kontrol -- --terimler golf --ozel   (özel/benzer kitleler)
 */
import 'reflect-metadata';
import { resolve } from 'node:path';
import { config as loadEnv } from 'dotenv';
import { NestFactory } from '@nestjs/core';

// TEK .env DEPO KÖKÜNDE (CLAUDE.md §2). `dist/` → `apps/api` → `apps` → kök.
loadEnv({ path: resolve(__dirname, '../../../.env') });

import { AppModule } from './app.module';
import { PrismaAdminService } from './prisma/prisma-admin.service';
import { ProviderRegistry } from './modules/connections/provider.registry';
import { TokenVaultService } from './modules/connections/token-vault.service';
import { actPath, mapInterest } from './modules/connections/providers/meta.provider';
import { CONFIG, type AppConfig } from './config/configuration';

const ARGV = process.argv.slice(2).filter((a) => a !== '--');
function arg(name: string): string | undefined {
  const i = ARGV.indexOf(`--${name}`);
  return i !== -1 ? ARGV[i + 1] : undefined;
}

async function main(): Promise<void> {
  const q = arg('q') ?? 'lüks otomobil';
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  try {
    const db = app.get(PrismaAdminService);
    const provider = app.get(ProviderRegistry).get('meta');
    const vault = app.get(TokenVaultService);

    const hesapId = arg('hesap');
    const hesap = await db.adAccount.findFirst({
      where: hesapId
        ? { id: hesapId, platform: 'meta' }
        : { platform: 'meta', syncEnabled: true, clientId: { not: null }, connection: { status: 'active' } },
      select: { id: true, name: true, externalId: true, connectionId: true },
      orderBy: { name: 'asc' },
    });
    if (!hesap) {
      console.log('\n  ✗ Uygun Meta reklam hesabı bulunamadı (izlenen, atanmış, bağlantısı aktif).\n');
      process.exitCode = 1;
      return;
    }
    console.log(`\n  hesap : ${hesap.name} (${hesap.externalId})`);
    console.log(`  arama : "${arg('terimler') ?? q}"`);

    const token = await vault.getAccessToken(hesap.connectionId, provider);

    /*
     * 1) TERİM × DİL TABLOSU. İlk canlı koşu (2026-09-29): "lüks otomobil"
     * HTTP 200 ama SIFIR satır. Soru: Meta ilgi araması Türkçe terimle mi
     * eşleşmiyor, `locale` mi süzüyor, yoksa terim mi yanlış? Hepsi aynı
     * turda deneniyor; düzeltme tahminle yazılmıyor.
     *
     * SAĞLAYICININ SÜRÜMÜ: sabit yazılsaydı betik başka bir API sürümünü sınardı.
     */
    const surum = app.get<AppConfig>(CONFIG).platforms.meta.apiVersion;
    const terimler = (arg('terimler') ?? q)
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
    console.log('\n═══ TERİM × DİL (satır sayısı · ilk sonuç · alanlar) ═══');
    for (const terim of terimler) {
      for (const locale of ['tr_TR', null] as const) {
        const url = new URL(`https://graph.facebook.com/${surum}/search`);
        url.searchParams.set('type', 'adinterest');
        url.searchParams.set('q', terim);
        url.searchParams.set('limit', '5');
        if (locale) url.searchParams.set('locale', locale);
        const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
        const govde = (await res.json()) as { data?: Array<Record<string, unknown>>; error?: unknown };
        const etiket = `"${terim}" [${locale ?? 'locale yok'}]`;
        if (govde.error) {
          console.log(`  ${etiket} HTTP ${res.status} HATA: ${JSON.stringify(govde.error).slice(0, 300)}`);
          continue;
        }
        const satirlar = govde.data ?? [];
        const ilk = satirlar[0];
        const eslenemeyen = satirlar.filter((r) => mapInterest(r) === null).length;
        console.log(
          `  ${etiket} ${satirlar.length} satır` +
            (ilk ? ` · ${String(ilk.name)} · ${Object.keys(ilk).join(',')}` : '') +
            (eslenemeyen > 0 ? `  ← ${eslenemeyen} satır mapInterest'e uymuyor` : ''),
        );
      }
    }

    /*
     * ÖZEL/BENZER KİTLELER (Bölüm 4b, `--ozel`). `listCustomAudiences` da
     * belgeden yazıldı: ham satırın alanları, teslim durumu ve eşleme.
     */
    if (ARGV.includes('--ozel')) {
      // `act_` öneki elle eklenmiyor (CLAUDE.md): actPath.
      const url = new URL(`https://graph.facebook.com/${surum}/${actPath(hesap.externalId)}/customaudiences`);
      url.searchParams.set(
        'fields',
        'id,name,subtype,approximate_count_lower_bound,approximate_count_upper_bound,delivery_status',
      );
      url.searchParams.set('limit', '10');
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      const govde = (await res.json()) as { data?: Array<Record<string, unknown>>; error?: unknown };
      console.log(`\n═══ ÖZEL KİTLELER HAM (HTTP ${res.status}) ═══`);
      if (govde.error) {
        console.log(`  HATA: ${JSON.stringify(govde.error).slice(0, 400)}`);
      } else {
        const satirlar = govde.data ?? [];
        console.log(`  ilk sayfada ${satirlar.length} kitle`);
        for (const r of satirlar.slice(0, 5)) console.log(`  · ${JSON.stringify(r).slice(0, 300)}`);
        const eslenen = await provider.listCustomAudiences({
          accessToken: token,
          accountExternalId: hesap.externalId,
        });
        console.log(`  listCustomAudiences: ${eslenen.length} kitle (tüm sayfalar)`);
        for (const o of eslenen.slice(0, 5)) {
          console.log(
            `  · ${o.name} [${o.id}] ${o.tip}/${o.altTur ?? '?'} · ` +
              `${o.sizeMin ?? '?'}–${o.sizeMax ?? '?'} · hazır=${String(o.hazir)} · ${o.durum ?? ''}`,
          );
        }
      }
    }

    // 2) SAĞLAYICININ KENDİ YOLU — panelin gördüğü sonuç.
    const sonuc = await provider.searchInterests(
      { accessToken: token, accountExternalId: hesap.externalId },
      q,
    );
    console.log(`\n═══ searchInterests (${sonuc.length} sonuç) ═══`);
    for (const s of sonuc.slice(0, 10)) {
      const boy =
        s.audienceMin !== null && s.audienceMax !== null
          ? `${s.audienceMin.toLocaleString('tr-TR')}–${s.audienceMax.toLocaleString('tr-TR')}`
          : 'büyüklük yok';
      console.log(`  · ${s.name}  [${s.id}]  ${boy}  ${s.path.join(' > ')}`);
    }
    console.log('\nBitti — yalnızca okuma yapıldı.');
  } finally {
    await app.close();
  }
}

main().catch((e: unknown) => {
  console.error(e);
  process.exitCode = 1;
});
