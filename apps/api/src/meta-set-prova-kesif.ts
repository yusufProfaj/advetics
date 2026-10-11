/**
 * ═══ REKLAM SETİ PROVASININ 5xx SEBEBİNİ CANLIDA BUL ═══
 *
 * Rehber provası reklam setini satır içi `campaign_spec` ile `/adsets`
 * ucuna `validate_only` gönderiyor ve Meta her seferinde 5xx ("An unexpected
 * error has occurred") dönüyor. Prova bunu "aynı kitle reklamın içinde
 * geçti" diye kapatıyordu (`kapsamaUygula`) ama reklamın satır içi
 * `adset_spec`i set alanlarının hepsini DENETLEMİYOR: 2026-10-11 canlı
 * turunda atıf penceresi (1, 0) ve konutlu şehir yarıçapı (#2909052) provada
 * "geçti", kurulumda RET aldı. `meta-kategori-prova` aynı uca SADE bir
 * gövdeyle doğrulama alabiliyordu; yani 5xx'i gövdedeki bir alan üretiyor.
 *
 * Betik gerçek bir yayının derlenmiş gövdesini (`yayin.derlenmis_govde`)
 * alıp provanın kurduğu biçimde soruyor, sonra set ve kampanya alanlarını
 * TEK TEK çıkararak hangisinin 5xx'i ürettiğini basıyor. YALNIZ
 * `validate_only`: Meta nesne açmıyor; dönen gövdede `id` olursa betik bunu
 * yüksek sesle söylüyor.
 *
 * Kullanım (advetics kullanıcısı, depo kökünde, deploy'dan SONRA):
 *   pnpm --filter @advetics/api meta-set-prova-kesif -- --kampanya <meta kampanya kimliği>
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

type Govde = { ad: string; nesne: string; alanlar: Record<string, unknown> };

async function main(): Promise<void> {
  const kampanyaId = arg('kampanya');
  if (!kampanyaId) {
    console.log('\n  ✗ --kampanya <meta kampanya kimliği> zorunlu.\n');
    process.exitCode = 1;
    return;
  }
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  try {
    const db = app.get(PrismaAdminService);
    const provider = app.get(ProviderRegistry).get('meta');
    const vault = app.get(TokenVaultService);
    const surum = app.get<AppConfig>(CONFIG).platforms.meta.apiVersion;

    const [y] = await db.$queryRaw<Array<{ govde: Govde[]; ad_account_id: string }>>`
      SELECT y.derlenmis_govde AS govde, y.ad_account_id::text AS ad_account_id
        FROM yayin y JOIN yayin_nesnesi n ON n.yayin_id = y.id
       WHERE n.meta_id = ${kampanyaId} LIMIT 1`;
    if (!y) {
      console.log('\n  ✗ Bu kampanyanın yayın kaydı yok.\n');
      process.exitCode = 1;
      return;
    }
    const hesap = await db.adAccount.findUnique({ where: { id: y.ad_account_id }, select: { name: true, externalId: true, connectionId: true } });
    if (!hesap) throw new Error('hesap yok');
    const token = await vault.getAccessToken(hesap.connectionId, provider);
    const bul = (ad: string) => y.govde.find((g) => g.ad === ad)!.alanlar;
    const kampanya = { ...bul('kampanya') };
    const set = { ...bul('reklam_seti') };
    delete set.campaign_id;
    delete set.adlabels;
    const { adlabels: _a, status: _s, special_ad_categories: _k, special_ad_category_country: _u, ...spec } = kampanya;
    const kampanyaSpec: Record<string, unknown> = { ...spec, special_ad_categories: [] };
    console.log(`\n  hesap : ${hesap.name} (${hesap.externalId}) · ${surum}`);
    console.log(`  set alanları     : ${Object.keys(set).join(', ')}`);
    console.log(`  kampanya_spec    : ${Object.keys(kampanyaSpec).join(', ')}`);

    const adres = `https://graph.facebook.com/${surum}/${actPath(hesap.externalId)}/adsets`;
    const sor = async (s: Record<string, unknown>, c: Record<string, unknown>): Promise<string> => {
      const res = await fetch(adres, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: formGovdesi({ ...s, campaign_spec: c, execution_options: ['validate_only'] }),
      });
      const g = (await res.json().catch(() => ({}))) as { id?: string; success?: boolean; error?: { message?: string; code?: number; error_subcode?: number; error_user_msg?: string } };
      if (g.id) return `!!! NESNE AÇILDI (${g.id}) — arşivle`;
      if (g.error) return `HTTP ${res.status} · ${g.error.code}/${g.error.error_subcode ?? '-'} · ${g.error.error_user_msg ?? g.error.message ?? ''}`.slice(0, 300);
      return `GEÇTİ (HTTP ${res.status})`;
    };

    console.log(`\n  TAM GÖVDE          : ${await sor(set, kampanyaSpec)}`);
    console.log('\n═══ SETTEN TEK ALAN ÇIKAR ═══');
    for (const k of Object.keys(set)) {
      if (['name', 'targeting', 'optimization_goal', 'billing_event'].includes(k)) continue;
      const s = { ...set };
      delete s[k];
      console.log(`  - ${k.padEnd(28)} ${await sor(s, kampanyaSpec)}`);
    }
    console.log('\n═══ KAMPANYA_SPEC TEN TEK ALAN ÇIKAR ═══');
    for (const k of Object.keys(kampanyaSpec)) {
      if (['objective'].includes(k)) continue;
      const c = { ...kampanyaSpec };
      delete c[k];
      console.log(`  - ${k.padEnd(28)} ${await sor(set, c)}`);
    }
    const tg = (set.targeting ?? {}) as Record<string, unknown>;
    console.log('\n═══ HEDEFLEMEDEN TEK ALAN ÇIKAR ═══');
    for (const k of Object.keys(tg)) {
      const t = { ...tg };
      delete t[k];
      console.log(`  - targeting.${k.padEnd(18)} ${await sor({ ...set, targeting: t }, kampanyaSpec)}`);
    }
    console.log('\n  Okuma: tam gövde 5xx, bir satır GEÇTİ ya da gerçek bir RET dönüyorsa 5xx o alandan.\n');

    /*
     * --gercek: GEÇİCİ BOŞ KAMPANYAYA KARŞI DOĞRULAMA. Duraklatılmış, setsiz,
     * `adv-prova` etiketli bir kampanya AÇILIR (para harcamaz), set ona karşı
     * `validate_only` ile sorulur ve kampanya hemen SİLİNİR. Ölçülen soru:
     * bu yol, satır içi provanın kaçırdığı iki reddi (atıf 7 gün, konutlu
     * şehirde yarıçapsız) yakalıyor mu? Kontrol olarak gerçek gövde GEÇMELİ.
     */
    if (ARGV.includes('--gercek')) {
      const yaz = async (yol: string, alanlar: Record<string, unknown>) => {
        const res = await fetch(`https://graph.facebook.com/${surum}/${yol}`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/x-www-form-urlencoded' },
          body: formGovdesi(alanlar),
        });
        return (await res.json().catch(() => ({}))) as { id?: string; success?: boolean; error?: { message?: string; code?: number; error_subcode?: number; error_user_msg?: string } };
      };
      const k = await yaz(`${actPath(hesap.externalId)}/campaigns`, {
        ...kampanya,
        name: 'adv-prova (silinecek)',
        status: 'PAUSED',
        adlabels: [{ name: 'adv-prova' }],
      });
      if (!k.id) {
        console.log(`  ✗ geçici kampanya açılamadı: ${JSON.stringify(k.error)}`);
        return;
      }
      console.log(`\n═══ GEÇİCİ KAMPANYA ${k.id} ═══`);
      try {
        const dogrula = async (s: Record<string, unknown>) => {
          const g = await yaz(`${actPath(hesap.externalId)}/adsets`, { ...s, campaign_id: k.id, execution_options: ['validate_only'] });
          if (g.id) return `!!! NESNE AÇILDI (${g.id})`;
          if (g.error) return `RET ${g.error.code}/${g.error.error_subcode ?? '-'} · ${g.error.error_user_msg ?? g.error.message ?? ''}`.slice(0, 300);
          return 'GEÇTİ';
        };
        console.log(`  gerçek gövde (kontrol, GEÇMELİ)      : ${await dogrula(set)}`);
        console.log(`  atıf 7 gün tıklama (RET beklenir)    : ${await dogrula({ ...set, attribution_spec: [{ event_type: 'CLICK_THROUGH', window_days: 7 }] })}`);
        const t = JSON.parse(JSON.stringify(set.targeting)) as { geo_locations?: { cities?: Array<Record<string, unknown>> } };
        for (const c of t.geo_locations?.cities ?? []) {
          delete c.radius;
          delete c.distance_unit;
        }
        console.log(`  şehir yarıçapsız (konutta RET beklenir): ${await dogrula({ ...set, targeting: t })}`);
      } finally {
        const sil = await yaz(k.id, { status: 'DELETED' });
        console.log(`  geçici kampanya silindi: ${sil.success === true ? 'evet' : JSON.stringify(sil)}`);
      }
    }
  } finally {
    await app.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
