/**
 * ═══ KREATİF GÖRÜ MALİYET VE TUTARLILIK ÖLÇÜMÜ (Paket D, MIMARI § 9.1) ═══
 *
 * `ETIKET_SINIRI` (günde 40 / ayda 400 / ürün geneli 1.500) ve `GORU_AYARI`
 * (orta çözünürlük) TAHMİN. Bu betik canlıda gerçek kreatiflerle ölçüyor:
 *
 *   · indirme süresi ve bayt,
 *   · Gemini süresi, girdi/çıktı/önbellek token'ı, bitiş sebebi,
 *   · `etiketCoz` sonucu (şema dışı oranı),
 *   · AYNI görsel iki kez → alan alan TUTARLILIK (aynı cevabın oranı);
 *     %85'in altındaki alan v1 şemasından çıkar ya da değer sayısı azalır,
 *   · çözünürlük karşılaştırması (LOW ve MEDIUM aynı görsellerde): metin
 *     yoğunluğu ve fiyat alanlarında fark var mı,
 *   · kreatif başına maliyet = token × FİYAT ARGÜMANI. Fiyat koda GÖMÜLMEZ:
 *     o günün Gemini fiyat sayfasından elle verilir.
 *
 * NE YAZAR: veritabanına ETİKET, SAYAÇ, İÇERİK SATIRI YAZMAZ. Tek yan etki
 * Meta adres tazelemesinin KOTA TELEMETRİSİ (`creative_tag` katmanı,
 * `rate_limit_state` / `api_usage_log`): ortak tazeleme çekirdeği bunu
 * bilerek yazıyor ki bekçi kendi trafiğini görsün; ölçüm trafiği de kota
 * yiyor ve görünmesi doğru. CSV depoya değil `--cikti` yoluna (varsayılan
 * işletim sisteminin geçici dizini).
 *
 * DERLENMİŞ UYGULAMAYI KULLANIR (`dist/`): Nest bağımlılık enjeksiyonu
 * dekoratör meta verisi istiyor ve `tsx` onu üretmiyor (`google-check` da
 * bu yüzden `dist`ten koşuyor). Önce derle:
 *
 *   su - advetics; cd ~/htdocs/advetics.com
 *   pnpm --filter @advetics/api build
 *   pnpm --filter @advetics/api olcum-kreatif-goru -- --client=<uuid> \
 *        --adet=20 --tekrar=2 --cozunurluk=LOW,MEDIUM \
 *        --fiyat-girdi=<USD / 1M token> --fiyat-cikti=<USD / 1M token>
 *
 * Sonuç `packages/shared/src/kreatif-zeka/durum.ts#ETIKET_SINIRI` yorumuna
 * yazılır (MIMARI § 9.1).
 */
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { config as loadEnv } from 'dotenv';
import {
  GORU_ALAN_ADLARI,
  GORU_AYARI,
  GORU_MIME,
  etiketCoz,
  goruBicimi,
  goruJsonSemasi,
  gorselAdresleri,
  karsilastirmaKumesi,
  type GoruEtiketleri,
  type Platform,
} from '@advetics/shared';
import type { MetinUretici } from '../src/yapay-zeka/gemini';

loadEnv({ path: resolve(__dirname, '../../../.env') });

// pnpm 9 `--`'yı gerçek argüman olarak geçiriyor (bkz. prisma/sync-cli.ts).
const ARGV = process.argv.slice(2).filter((a) => a !== '--');
const arg = (ad: string) => ARGV.find((a) => a.startsWith(`--${ad}=`))?.slice(ad.length + 3);

const CLIENT = arg('client');
const ADET = Number(arg('adet') ?? 20);
const TEKRAR = Math.max(1, Number(arg('tekrar') ?? 2));
const COZUNURLUKLER = (arg('cozunurluk') ?? 'MEDIUM').split(',').map((c) => `MEDIA_RESOLUTION_${c.trim().toUpperCase()}`) as Array<
  'MEDIA_RESOLUTION_LOW' | 'MEDIA_RESOLUTION_MEDIUM' | 'MEDIA_RESOLUTION_HIGH'
>;
const FIYAT_GIRDI = arg('fiyat-girdi') !== undefined ? Number(arg('fiyat-girdi')) : null;
const FIYAT_CIKTI = arg('fiyat-cikti') !== undefined ? Number(arg('fiyat-cikti')) : null;
const CIKTI = arg('cikti') ?? join(tmpdir(), `olcum-kreatif-goru-${Date.now()}.csv`);
/** Tutarlılık eşiği (MIMARI § 9.1): altındaki alan şemadan çıkar ya da sadeleşir. */
const TUTARLILIK_ESIGI = 0.85;

/* Derlenmiş modüller: sınıf kimliği uygulamanın kendi kaydıyla AYNI olmalı. */
const dist = (yol: string) => require(resolve(__dirname, '../dist', yol)) as Record<string, unknown>;

interface Olcum {
  creativeId: string;
  platform: Platform;
  kismi: string | null;
  cozunurluk: string;
  tekrar: number;
  indirmeMs: number;
  bayt: number;
  geminiMs: number;
  girdiToken: number;
  ciktiToken: number;
  onbellekToken: number;
  sebep: string;
  etiket: GoruEtiketleri | null;
  hata: string | null;
}

function yuzdelik(d: number[], p: number): number {
  if (d.length === 0) return NaN;
  const s = [...d].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))]!;
}

async function main(): Promise<void> {
  if (!CLIENT) throw new Error('--client=<workspace uuid> zorunlu');
  const { NestFactory } = require('@nestjs/core') as typeof import('@nestjs/core');
  const { AppModule } = dist('app.module') as { AppModule: new () => unknown };
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  try {
    const { PrismaAdminService } = dist('prisma/prisma-admin.service') as { PrismaAdminService: new () => unknown };
    const { KreatifAdresiService } = dist('modules/reports/kreatif-adresi.service') as typeof import('../src/modules/reports/kreatif-adresi.service');
    const { YAPAY_ZEKA } = dist('yapay-zeka/yapay-zeka.module') as { YAPAY_ZEKA: string };
    const { metinIsteOlcumlu } = dist('yapay-zeka/gemini') as typeof import('../src/yapay-zeka/gemini');
    const { goruIcinIndir } = dist('modules/reports/kreatif-gorseli') as typeof import('../src/modules/reports/kreatif-gorseli');
    const { pencereKreatifleri } = dist('modules/kreatif-zeka/pencere') as typeof import('../src/modules/kreatif-zeka/pencere');
    const { kreatifKaynagi } = dist('modules/kreatif-zeka/kaynak') as typeof import('../src/modules/kreatif-zeka/kaynak');
    const { istanbulGunu } = dist('modules/kreatif-zeka/sayac') as typeof import('../src/modules/kreatif-zeka/sayac');
    const { GORU_SISTEM_ISTEMI, goruIstemi } = dist('modules/kreatif-zeka/istemler') as typeof import('../src/modules/kreatif-zeka/istemler');

    const db = app.get(PrismaAdminService) as import('../src/modules/kreatif-zeka/sayac').TxLike;
    const adres = app.get(KreatifAdresiService);
    const gemini = app.get(YAPAY_ZEKA) as MetinUretici | null;
    if (!gemini) throw new Error('Gemini anahtarı tanımlı değil (GEMINI_API_KEY)');

    // ── Seçim: işin AYNI sorgusu (§ 4 adım 2), harcamaya göre ──
    const [c] = await db.$queryRaw<Array<{ para: string }>>(
      (await import('@prisma/client')).Prisma.sql`SELECT reporting_currency AS para FROM clients WHERE id = ${CLIENT}::uuid`,
    );
    if (!c) throw new Error('workspace bulunamadı');
    const pencere = await pencereKreatifleri(db, { clientId: CLIENT, paraBirimi: c.para, bugun: istanbulGunu(new Date()) });
    const ids = pencere.map((p) => p.creativeId);
    const { Prisma } = await import('@prisma/client');
    const kreatifler = new Map(
      (
        await db.$queryRaw<
          Array<{ id: string; external_id: string; creative_type: string | null; raw: unknown; asset_urls: unknown; platform: Platform; hesap: string; connection_id: string; manager_external_id: string | null; hesap_id: string }>
        >(Prisma.sql`
          SELECT k.id::text, k.external_id, k.creative_type, k.raw, k.asset_urls, k.platform::text AS platform,
                 a.external_id AS hesap, a.connection_id::text, a.manager_external_id, a.id::text AS hesap_id
            FROM creatives k JOIN ad_accounts a ON a.id = k.ad_account_id
           WHERE k.id = ANY(${ids}::uuid[])`)
      ).map((r) => [r.id, r]),
    );
    const adaylar = pencere
      .map((p) => ({ p, k: kreatifler.get(p.creativeId)! }))
      .filter(({ p, k }) => k && karsilastirmaKumesi(p.platform, p.objective))
      .map(({ p, k }) => ({ p, k, kaynak: kreatifKaynagi({ creativeId: k.id, platform: k.platform, creativeType: k.creative_type, raw: k.raw, assetUrls: k.asset_urls, kanal: p.objective, hesapExternalId: k.hesap }) }))
      .filter((x) => x.kaynak.tur === 'gorsel');
    // Yarısı Meta yarısı Google (varsa), en az üç video kapağı.
    const videolar = adaylar.filter((x) => x.kaynak.tur === 'gorsel' && x.kaynak.kismi === 'video_kapagi').slice(0, 3);
    const meta = adaylar.filter((x) => x.p.platform === 'meta' && !videolar.includes(x));
    const google = adaylar.filter((x) => x.p.platform === 'google');
    const yarim = Math.ceil((ADET - videolar.length) / 2);
    const secilen = [...videolar, ...google.slice(0, yarim), ...meta].slice(0, ADET);
    console.log(`Seçilen ${secilen.length} kreatif (pencerede ${pencere.length}, uygun ${adaylar.length}, video kapağı ${videolar.length}).`);

    const olcumler: Olcum[] = [];
    for (const { p, k, kaynak } of secilen) {
      // ── Adres: ortak çekirdek (Meta), kalıcı adres (Google) ──
      let url: string | null = null;
      let hata: string | null = null;
      if (k.platform === 'meta') {
        const r = await adres.hesapAdresleri(
          { id: k.hesap_id, clientId: CLIENT, platform: k.platform, externalId: k.hesap, connectionId: k.connection_id, managerExternalId: k.manager_external_id },
          [k.external_id],
          { katman: 'creative_tag', bitis: Date.now() + 30_000, etiket: 'olcum_kreatif_goru' },
        );
        const a = r?.adresler.get(k.external_id);
        if (a && 'url' in a) url = a.url;
        else hata = a && 'hata' in a ? a.hata : 'adres yok';
      } else {
        url = gorselAdresleri(k.asset_urls)[0] ?? null;
        if (!url) hata = 'adres yok';
      }
      const bos = (cz: string): Olcum => ({
        creativeId: k.id, platform: k.platform, kismi: kaynak.tur === 'gorsel' ? kaynak.kismi : null, cozunurluk: cz, tekrar: 0,
        indirmeMs: 0, bayt: 0, geminiMs: 0, girdiToken: 0, ciktiToken: 0, onbellekToken: 0, sebep: 'indirilemedi', etiket: null, hata,
      });
      if (!url) {
        olcumler.push(bos('-'));
        continue;
      }
      const t0 = Date.now();
      const ind = await goruIcinIndir(url, { maxBayt: GORU_AYARI.maxBayt, zamanAsimiMs: GORU_AYARI.indirmeZamanAsimiMs, bicimAnla: goruBicimi, bicimHatasi: 'biçim' });
      const indirmeMs = Date.now() - t0;
      if (!ind.ok) {
        olcumler.push({ ...bos('-'), indirmeMs, hata: ind.sebep });
        continue;
      }
      for (const cz of COZUNURLUKLER) {
        for (let t = 1; t <= TEKRAR; t++) {
          try {
            const r = await metinIsteOlcumlu(gemini, {
              sistem: GORU_SISTEM_ISTEMI,
              metin: goruIstemi(),
              enCokCikti: GORU_AYARI.enCokCikti,
              jsonSemasi: goruJsonSemasi(),
              dusunme: GORU_AYARI.dusunme,
              gorseller: [{ mimeType: GORU_MIME[ind.tur], data: Buffer.from(ind.bytes).toString('base64') }],
              mediaResolution: cz,
            });
            const coz = r.sonuc.tur === 'tamam' ? etiketCoz(r.sonuc.metin) : null;
            olcumler.push({
              creativeId: k.id, platform: k.platform, kismi: kaynak.tur === 'gorsel' ? kaynak.kismi : null, cozunurluk: cz, tekrar: t,
              indirmeMs, bayt: ind.bytes.length, geminiMs: r.sureMs, girdiToken: r.girdiToken, ciktiToken: r.ciktiToken, onbellekToken: r.onbellekToken,
              sebep: r.sonuc.tur, etiket: coz?.ok ? coz.etiketler : null,
              hata: r.sonuc.tur !== 'tamam' ? r.sonuc.mesaj : coz && !coz.ok ? coz.sebep : null,
            });
          } catch (e) {
            olcumler.push({ ...bos(cz), tekrar: t, indirmeMs, bayt: ind.bytes.length, sebep: 'hata', hata: e instanceof Error ? e.message : String(e) });
          }
        }
      }
      void p;
    }

    // ── CSV ──
    const basliklar = ['creative_id', 'platform', 'kismi', 'cozunurluk', 'tekrar', 'indirme_ms', 'bayt', 'gemini_ms', 'girdi_token', 'cikti_token', 'onbellek_token', 'sebep', ...GORU_ALAN_ADLARI, 'hata'];
    const kac = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const satirlar = olcumler.map((o) =>
      [o.creativeId, o.platform, o.kismi, o.cozunurluk, o.tekrar, o.indirmeMs, o.bayt, o.geminiMs, o.girdiToken, o.ciktiToken, o.onbellekToken, o.sebep, ...GORU_ALAN_ADLARI.map((a) => o.etiket?.[a] ?? ''), o.hata]
        .map(kac)
        .join(','),
    );
    writeFileSync(CIKTI, [basliklar.join(','), ...satirlar].join('\n'));

    // ── Özet ──
    for (const cz of COZUNURLUKLER) {
      const c2 = olcumler.filter((o) => o.cozunurluk === cz);
      const tamam = c2.filter((o) => o.sebep === 'tamam');
      const ort = (f: (o: Olcum) => number) => (tamam.length ? tamam.reduce((a, o) => a + f(o), 0) / tamam.length : NaN);
      console.log(`\n── ${cz} ── ${c2.length} çağrı`);
      console.log(`Gemini süresi: ortanca ${yuzdelik(tamam.map((o) => o.geminiMs), 50)} ms, p95 ${yuzdelik(tamam.map((o) => o.geminiMs), 95)} ms`);
      console.log(`Ortalama token: girdi ${ort((o) => o.girdiToken).toFixed(0)}, çıktı ${ort((o) => o.ciktiToken).toFixed(0)}, önbellek ${ort((o) => o.onbellekToken).toFixed(0)}`);
      console.log(`Sebepler: ${JSON.stringify(Object.fromEntries([...new Set(c2.map((o) => o.sebep))].map((s) => [s, c2.filter((o) => o.sebep === s).length])))}`);
      console.log(`Şema dışı: ${tamam.filter((o) => !o.etiket).length} / ${tamam.length}`);
      if (FIYAT_GIRDI !== null && FIYAT_CIKTI !== null) {
        const maliyet = (ort((o) => o.girdiToken) * FIYAT_GIRDI + ort((o) => o.ciktiToken) * FIYAT_CIKTI) / 1e6;
        console.log(`Kreatif başına maliyet (verilen fiyatla): ${maliyet.toFixed(6)} USD; 40/gün ≈ ${(maliyet * 40).toFixed(4)} USD, 1.500/gün ≈ ${(maliyet * 1500).toFixed(2)} USD`);
      } else {
        console.log('Maliyet hesaplanmadı: --fiyat-girdi ve --fiyat-cikti verilmedi (fiyat koda gömülmüyor).');
      }
      // Tutarlılık: aynı kreatifin aynı çözünürlükteki tekrarları.
      if (TEKRAR > 1) {
        for (const alan of GORU_ALAN_ADLARI) {
          let ayni = 0;
          let toplam = 0;
          for (const id of new Set(tamam.map((o) => o.creativeId))) {
            const cevaplar = tamam.filter((o) => o.creativeId === id && o.etiket).map((o) => o.etiket![alan]);
            if (cevaplar.length < 2) continue;
            toplam++;
            if (cevaplar.every((x) => x === cevaplar[0])) ayni++;
          }
          const oran = toplam ? ayni / toplam : NaN;
          console.log(`Tutarlılık ${alan}: ${(oran * 100).toFixed(0)}% (${ayni}/${toplam})${oran < TUTARLILIK_ESIGI ? '  ← EŞİĞİN ALTINDA' : ''}`);
        }
      }
    }
    if (COZUNURLUKLER.length > 1) {
      const [a, b] = COZUNURLUKLER;
      console.log(`\n── Çözünürlük karşılaştırması (${a} ↔ ${b}, ilk tekrar) ──`);
      for (const alan of ['metin_yogunlugu', 'fiyat_veya_indirim'] as const) {
        let fark = 0;
        let toplam = 0;
        for (const id of new Set(olcumler.map((o) => o.creativeId))) {
          const x = olcumler.find((o) => o.creativeId === id && o.cozunurluk === a && o.tekrar === 1)?.etiket?.[alan];
          const y = olcumler.find((o) => o.creativeId === id && o.cozunurluk === b && o.tekrar === 1)?.etiket?.[alan];
          if (!x || !y) continue;
          toplam++;
          if (x !== y) fark++;
        }
        console.log(`${alan}: ${fark} / ${toplam} kreatifte farklı`);
      }
    }
    const indirme = olcumler.filter((o) => o.bayt > 0);
    console.log(`\nİndirme: ortanca ${yuzdelik(indirme.map((o) => o.indirmeMs), 50)} ms, ortanca ${yuzdelik(indirme.map((o) => o.bayt), 50)} bayt; indirilemeyen ${olcumler.filter((o) => o.sebep === 'indirilemedi').length}`);
    console.log(`CSV: ${CIKTI}`);
  } finally {
    await app.close();
  }
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
