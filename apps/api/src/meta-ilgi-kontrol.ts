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
import { mapInterest } from './modules/connections/providers/meta.provider';
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
    console.log(`  arama : "${q}"`);

    const token = await vault.getAccessToken(hesap.connectionId, provider);

    // 1) HAM YANIT — belgede yazan alanlar gerçekten geliyor mu?
    // SAĞLAYICININ SÜRÜMÜ: sabit yazılsaydı betik başka bir API sürümünü sınardı.
    const surum = app.get<AppConfig>(CONFIG).platforms.meta.apiVersion;
    const url = new URL(`https://graph.facebook.com/${surum}/search`);
    url.searchParams.set('type', 'adinterest');
    url.searchParams.set('q', q);
    url.searchParams.set('limit', '5');
    url.searchParams.set('locale', 'tr_TR');
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    const govde = (await res.json()) as { data?: Array<Record<string, unknown>>; error?: unknown };
    console.log(`\n═══ HAM (HTTP ${res.status}) ═══`);
    if (govde.error) {
      console.log(JSON.stringify(govde.error, null, 2));
      process.exitCode = 1;
      return;
    }
    const ilk = govde.data?.[0];
    console.log(`  satır sayısı : ${govde.data?.length ?? 0}`);
    console.log(`  ilk satırın alanları : ${ilk ? Object.keys(ilk).join(', ') : '(yok)'}`);
    if (ilk) console.log(`  ilk satır : ${JSON.stringify(ilk).slice(0, 600)}`);
    const eslenemeyen = (govde.data ?? []).filter((r) => mapInterest(r) === null).length;
    console.log(`  eşlenemeyen satır : ${eslenemeyen}${eslenemeyen > 0 ? '  ← mapInterest biçimi tutmuyor' : ''}`);

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
