/**
 * ═══ BANNER SETİ → YERLEŞİME GÖRE GÖRSEL: META PROVASI (AdvCampaign) ═══
 *
 * Kullanıcı kararı (2026-10-10): bir banner setinin boyutları (9:16, 4:5,
 * 1.91:1, 1:1) AYRI REKLAM DEĞİL, tek reklamın yerleşime göre görselleri.
 * Eksik boyutta o boyutun yerleşimi KAPANIR. Rehber bugün her görseli ayrı
 * bir fikir sayıp dört reklam kuruyor (turet.ts).
 *
 * Gövde biçimi belgeden ve eski reklam kurucusundan (goal-mapping.ts
 * `customizationRules`) biliniyor ama canlıda sınandığını gösteren bir kayıt
 * yok. Bu betik derleyicinin GERÇEK gövdesini kurup yalnız kreatifi ve
 * yerleşimi değiştiriyor, `/ads` ucuna satır içi set + kreatifle
 * `validate_only` soruyor. Meta NESNE AÇMIYOR, para harcanmıyor; dönen
 * gövdede `id` görürse yüksek sesle söylüyor.
 *
 * Kullanım (advetics kullanıcısı, depo kökünde, deploy'dan SONRA):
 *   pnpm --filter @advetics/api meta-yerlesim-prova -- --hesap <uuid> --sayfa <uuid> [--ig <uuid>] \
 *     --dikey <hash> --dik45 <hash> --yatay <hash> --kare <hash> --adres https://...
 */
import 'reflect-metadata';
import { resolve } from 'node:path';
import { config as loadEnv } from 'dotenv';
import { NestFactory } from '@nestjs/core';

// TEK .env DEPO KÖKÜNDE (CLAUDE.md §2). `dist/` → `apps/api` → `apps` → kök.
loadEnv({ path: resolve(__dirname, '../../../.env') });

import { derleMeta, provaGovdeleri, type MetaApiSurumu } from '@advetics/shared';
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

type Oran = 'dikey' | 'dik45' | 'yatay' | 'kare';
const ETIKET = (o: Oran) => `adv_${o}`;

/** Oran → yerleşim. Kare VARSAYILAN: diğer kuralların kapsamadığı her yer. */
const KURAL_YERLESIMI: Record<Exclude<Oran, 'kare'>, Record<string, string[]>> = {
  dikey: { publisher_platforms: ['facebook', 'instagram'], facebook_positions: ['story', 'facebook_reels'], instagram_positions: ['story', 'reels'] },
  dik45: { publisher_platforms: ['facebook', 'instagram'], facebook_positions: ['feed'], instagram_positions: ['stream', 'explore'] },
  yatay: { publisher_platforms: ['facebook'], facebook_positions: ['right_hand_column', 'search'] },
};

async function main(): Promise<void> {
  const hesapId = arg('hesap');
  const sayfaId = arg('sayfa');
  const hashler: Record<Oran, string | undefined> = { dikey: arg('dikey'), dik45: arg('dik45'), yatay: arg('yatay'), kare: arg('kare') };
  const adres = arg('adres');
  if (!hesapId || !sayfaId || !adres || Object.values(hashler).some((h) => !h)) {
    console.log('\n  ✗ --hesap, --sayfa, --adres ve dört hash (--dikey --dik45 --yatay --kare) zorunlu.\n');
    process.exitCode = 1;
    return;
  }
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  try {
    const db = app.get(PrismaAdminService);
    const provider = app.get(ProviderRegistry).get('meta');
    const vault = app.get(TokenVaultService);
    const hesap = await db.adAccount.findFirst({ where: { id: hesapId, platform: 'meta' }, select: { name: true, externalId: true, connectionId: true } });
    const sayfa = await db.socialProfile.findFirst({ where: { id: sayfaId }, select: { externalId: true } });
    const igId = arg('ig');
    const ig = igId ? await db.socialProfile.findFirst({ where: { id: igId }, select: { externalId: true } }) : null;
    if (!hesap || !sayfa) {
      console.log('\n  ✗ Hesap ya da sayfa bulunamadı.\n');
      process.exitCode = 1;
      return;
    }
    const token = await vault.getAccessToken(hesap.connectionId, provider);
    // SAĞLAYICININ SÜRÜMÜ: sabit yazılsaydı betik başka bir API sürümünü sınardı.
    const surum = app.get<AppConfig>(CONFIG).platforms.meta.apiVersion as MetaApiSurumu;
    console.log(`\n  hesap : ${hesap.name} (${hesap.externalId}) · ${surum}`);

    const yarin = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
    const d = derleMeta({
      apiSurumu: surum, yayinKimligi: 'olcum-yerlesim', tarih: yarin, workspaceKisaAdi: 'Ölçüm', niyet: 'SITE',
      hesap: { platformId: hesap.externalId, paraBirimi: 'TRY' }, sayfaPlatformId: sayfa.externalId, instagramPlatformId: ig?.externalId ?? null,
      hedefleme: { konumlar: [{ tur: 'country', key: 'TR', etiket: 'Türkiye', ulkeKodu: 'TR' }], enDusukYas: 18, ipucuYas: null, ipucuCinsiyet: null },
      kategoriler: { taban: [], ek: [] }, butce: { tip: 'gunluk', micros: 250_000_000n, seviye: 'kampanya' },
      takvim: { baslangic: `${yarin}T09:00:00+0300`, bitis: null }, atif: 'tik7',
      kavramlar: [{ gorselHash: hashler.kare!, baslik: 'Ölçüm başlığı', metin: 'Ölçüm metni' }],
      hedefAdres: adres, formId: null, urlEtiketleri: null,
    });
    if (d.tur !== 'govde') throw new Error(`Derlenemedi: ${JSON.stringify(d)}`);
    const reklam = provaGovdeleri(d.govdeler, new Map()).find((g) => g.nesne === 'reklam')!;

    const uc = `https://graph.facebook.com/${surum}/${actPath(hesap.externalId)}/ads`;
    const sor = async (alanlar: Record<string, unknown>): Promise<string> => {
      const res = await fetch(uc, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: formGovdesi(alanlar),
      });
      const g = (await res.json()) as { id?: string; success?: boolean; error?: Record<string, unknown> };
      if (g.id) return `!!! NESNE AÇILDI (${g.id}) — Reklam Yöneticisi'nden arşivle`;
      if (g.error) {
        const e = g.error;
        return `RET ${String(e.code)}/${String(e.error_subcode ?? '-')} · ${String(e.error_user_title ?? '')} · ${String(e.error_user_msg ?? e.message ?? '')}`.slice(0, 500);
      }
      return `GEÇTİ (HTTP ${res.status})`;
    };

    /** Derleyicinin kreatifini set biçimine çevirir: görseller etiketli, metin ortak. */
    const setKreatifi = (oranlar: Oran[], kurallar: Array<Record<string, unknown>>, metinEtiketli: boolean) => {
      const k = reklam.alanlar.creative as Record<string, unknown>;
      const oss = k.object_story_spec as Record<string, unknown>;
      const ld = oss.link_data as Record<string, unknown>;
      const etiket = (ad: string) => (metinEtiketli ? { adlabels: [{ name: ad }] } : {});
      const { link_data: _l, ...kok } = oss;
      return {
        ...k,
        object_story_spec: kok,
        asset_feed_spec: {
          images: oranlar.map((o) => ({ hash: hashler[o], adlabels: [{ name: ETIKET(o) }] })),
          bodies: [{ text: ld.message, ...etiket('adv_metin') }],
          titles: [{ text: ld.name, ...etiket('adv_baslik') }],
          link_urls: [{ website_url: ld.link, ...etiket('adv_baglanti') }],
          call_to_action_types: [(ld.call_to_action as { type: string }).type],
          ad_formats: ['SINGLE_IMAGE'],
          asset_customization_rules: kurallar.map((r, i) => ({
            ...r,
            ...(metinEtiketli ? { body_label: { name: 'adv_metin' }, title_label: { name: 'adv_baslik' }, link_url_label: { name: 'adv_baglanti' } } : {}),
            priority: i + 1,
          })),
        },
      };
    };
    const kural = (o: Oran, spec: Record<string, unknown>) => ({ customization_spec: spec, image_label: { name: ETIKET(o) } });
    const tamKurallar = (varsayilan: Record<string, unknown>) => [
      kural('dikey', KURAL_YERLESIMI.dikey),
      kural('dik45', KURAL_YERLESIMI.dik45),
      kural('yatay', KURAL_YERLESIMI.yatay),
      kural('kare', varsayilan),
    ];
    const reklamIle = (kreatif: Record<string, unknown>, yerlesim?: Record<string, string[]>) => {
      const set = reklam.alanlar.adset_spec as Record<string, unknown>;
      const t = set.targeting as Record<string, unknown>;
      return { ...reklam.alanlar, creative: kreatif, adset_spec: yerlesim ? { ...set, targeting: { ...t, ...yerlesim } } : set };
    };
    const HER_YER = { publisher_platforms: ['facebook', 'instagram', 'audience_network', 'messenger'] };

    const DENEMELER: Array<{ ad: string; govde: Record<string, unknown> }> = [
      { ad: 'Y0 kontrol · bugünkü tek görsel (kare), Advantage+ yerleşim', govde: reklam.alanlar },
      { ad: 'Y1 4 boyut · Advantage+ · varsayılan kural customization_spec {}', govde: reklamIle(setKreatifi(['dikey', 'dik45', 'yatay', 'kare'], tamKurallar({}), false)) },
      { ad: 'Y2 4 boyut · Advantage+ · varsayılan kural dört platform', govde: reklamIle(setKreatifi(['dikey', 'dik45', 'yatay', 'kare'], tamKurallar(HER_YER), false)) },
      { ad: 'Y3 4 boyut · Advantage+ · varsayılan dört platform · metin etiketli', govde: reklamIle(setKreatifi(['dikey', 'dik45', 'yatay', 'kare'], tamKurallar(HER_YER), true)) },
      {
        ad: 'Y4 9:16 EKSİK · elle yerleşim (Hikâye/Reels kapalı) · 3 kural',
        govde: reklamIle(
          setKreatifi(['dik45', 'yatay', 'kare'], [kural('dik45', KURAL_YERLESIMI.dik45), kural('yatay', KURAL_YERLESIMI.yatay), kural('kare', { publisher_platforms: ['facebook', 'instagram'] })], false),
          { publisher_platforms: ['facebook', 'instagram'], facebook_positions: ['feed', 'right_hand_column', 'search', 'marketplace'], instagram_positions: ['stream', 'explore'] },
        ),
      },
      {
        ad: 'Y5 negatif kontrol · Advantage+ · yalnız 4:5 kuralı, varsayılan YOK',
        govde: reklamIle(setKreatifi(['dik45'], [kural('dik45', KURAL_YERLESIMI.dik45)], false)),
      },
    ];

    console.log('\n═══ YERLEŞİME GÖRE GÖRSEL · /ads validate_only (satır içi set + kreatif) ═══');
    for (const d2 of DENEMELER) {
      console.log(`\n  ${d2.ad}\n    ${await sor({ ...d2.govde, execution_options: ['validate_only'] })}`);
    }
    console.log('\n  Okuma: Y0 GEÇMELİ (düzenek çalışıyor). Y5 geçerse Meta kapsamayan kuralı denetlemiyor demektir.\n');
  } finally {
    await app.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
