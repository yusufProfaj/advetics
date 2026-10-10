/**
 * ═══ KONUT KATEGORİLİ META PROVASINI CANLIDA SINA (AdvCampaign Ö-7) ═══
 *
 * Canlı tur 2'de (2026-10-10) konut kategorili rehberin provası düştü:
 * kampanya ve kreatif GEÇTİ, satır içi `campaign_spec` taşıyan reklam seti
 * ve dört reklam `(#100) Param special_ad_categories[0] must be one of
 * {NONE, EMPLOYMENT, HOUSING, ...} - got "2"` ile REDDEDİLDİ. "2", HOUSING'in
 * o listedeki sıra numarası: Meta iç içe gövdede değeri kendi sayısına
 * çevirip sonra yine dize listesine karşı doğruluyor gibi.
 *
 * Kategoriyi provadan atmak bir çözüm DEĞİL: konut kısıtlarını (yaş, yarıçap)
 * Meta'nın da denetlediğini kanıtlayan tek yer o prova ve kategorisiz bir
 * reklam seti provası, kısıtı ihlal eden bir kurulumu da "geçti" diye
 * gösterirdi (yalancı prova). Bu betik hangi biçimin kabul edildiğini VE
 * kabul edilen biçimde kısıtın gerçekten uygulandığını ölçüyor.
 *
 * YALNIZ `execution_options=["validate_only"]` — Meta nesne AÇMIYOR, para
 * harcanmıyor. Dönen gövdede `id` varsa betik bunu yüksek sesle söylüyor.
 *
 * Kullanım (advetics kullanıcısı, depo kökünde, deploy'dan SONRA):
 *   pnpm --filter @advetics/api meta-kategori-prova -- --hesap <ad_account uuid>
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
import { actPath } from './modules/connections/providers/meta.provider';
import { formGovdesi } from './modules/reklam/meta-graf';
import { CONFIG, type AppConfig } from './config/configuration';

const ARGV = process.argv.slice(2).filter((a) => a !== '--');
function arg(name: string): string | undefined {
  const i = ARGV.indexOf(`--${name}`);
  return i !== -1 ? ARGV[i + 1] : undefined;
}

/** Ölçülen biçimler. Kontrol (kategorisiz) olmadan bir "geçti" hiçbir şey söylemez. */
const BICIMLER: Array<{ ad: string; spec: Record<string, unknown> }> = [
  { ad: 'K0 kontrol · kategori yok', spec: { special_ad_categories: [] } },
  { ad: 'K1 bugünkü · ["HOUSING"]', spec: { special_ad_categories: ['HOUSING'] } },
  { ad: 'K2 ["HOUSING"] + ülke', spec: { special_ad_categories: ['HOUSING'], special_ad_category_country: ['TR'] } },
  { ad: 'K3 düz dize "HOUSING"', spec: { special_ad_categories: 'HOUSING' } },
  { ad: 'K4 tekil alan special_ad_category', spec: { special_ad_categories: [], special_ad_category: 'HOUSING' } },
  { ad: 'K5 yalnız ülke', spec: { special_ad_categories: [], special_ad_category_country: ['TR'] } },
];

async function main(): Promise<void> {
  const hesapId = arg('hesap');
  if (!hesapId) {
    console.log('\n  ✗ --hesap <ad_account uuid> zorunlu (yanlış hesaba prova atılmasın).\n');
    process.exitCode = 1;
    return;
  }
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  try {
    const db = app.get(PrismaAdminService);
    const provider = app.get(ProviderRegistry).get('meta');
    const vault = app.get(TokenVaultService);
    const hesap = await db.adAccount.findFirst({
      where: { id: hesapId, platform: 'meta' },
      select: { name: true, externalId: true, connectionId: true },
    });
    if (!hesap) {
      console.log('\n  ✗ Meta reklam hesabı bulunamadı.\n');
      process.exitCode = 1;
      return;
    }
    const token = await vault.getAccessToken(hesap.connectionId, provider);
    // SAĞLAYICININ SÜRÜMÜ: sabit yazılsaydı betik başka bir API sürümünü sınardı.
    const surum = app.get<AppConfig>(CONFIG).platforms.meta.apiVersion;
    console.log(`\n  hesap : ${hesap.name} (${hesap.externalId}) · ${surum}`);

    const adres = `https://graph.facebook.com/${surum}/${actPath(hesap.externalId)}/adsets`;
    const sor = async (spec: Record<string, unknown>, yasMin: number): Promise<string> => {
      // Gövde rehberin SITE derlemesinin şekli: trafik, açılış sayfası
      // görüntüleme, Advantage+ kitle açık. Kısıt sınaması yaşı daraltıyor:
      // kategori gerçekten uygulanıyorsa Meta 25'i reddetmeli.
      const alanlar = {
        name: 'adv-olcum-kategori',
        status: 'PAUSED',
        billing_event: 'IMPRESSIONS',
        optimization_goal: 'LANDING_PAGE_VIEWS',
        destination_type: 'WEBSITE',
        targeting: {
          geo_locations: { countries: ['TR'], location_types: ['home', 'recent'] },
          age_min: yasMin,
          age_max: 65,
          targeting_automation: { advantage_audience: 1 },
        },
        campaign_spec: {
          name: 'adv-olcum-kategori',
          objective: 'OUTCOME_TRAFFIC',
          daily_budget: '25000',
          bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
          ...spec,
        },
        execution_options: ['validate_only'],
      };
      const res = await fetch(adres, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: formGovdesi(alanlar),
      });
      const g = (await res.json()) as { id?: string; success?: boolean; error?: { message?: string; code?: number; error_subcode?: number; error_user_msg?: string } };
      if (g.id) return `!!! NESNE AÇILDI (${g.id}) — Reklam Yöneticisi'nden arşivle`;
      if (g.error) return `RET ${g.error.code}/${g.error.error_subcode ?? '-'} · ${g.error.error_user_msg ?? g.error.message ?? ''}`.slice(0, 400);
      return `GEÇTİ (HTTP ${res.status}, success=${String(g.success)})`;
    };

    console.log('\n═══ BİÇİM × KISIT (yaş 18 = kurala uygun · yaş 25 = konutta yasak) ═══');
    for (const b of BICIMLER) {
      console.log(`\n  ${b.ad}`);
      console.log(`    yaş 18 : ${await sor(b.spec, 18)}`);
      console.log(`    yaş 25 : ${await sor(b.spec, 25)}`);
    }
    console.log('\n  Okuma: bir biçim ancak "yaş 18 GEÇTİ" VE "yaş 25 RET" ise konutu gerçekten taşıyor.');
    console.log('  K0 kontrolünde yaş 25 GEÇMELİ; geçmiyorsa ret başka bir sebepten.\n');
  } finally {
    await app.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
