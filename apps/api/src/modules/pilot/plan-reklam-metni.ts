import { Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  metinYazilacakSatirlar,
  satirVarlikIdleri,
  type PlanOnerisi,
  type PlanSatiri,
  type ReklamMetniYazimi,
} from '@advetics/shared';
import type { MetinUretici } from '../../yapay-zeka/gemini';
import type { OkumaTx } from './plan-girdisi';
import { markaOku, reklamMetniYaz, type TaslakBaglamiOkumasi } from './taslak-baglami';

const logger = new Logger('PilotPlanReklamMetni');

/**
 * ═══ REKLAM METNİ PLAN ANINDA (karar (a), MIMARI §12.4) ═══
 *
 * Metin artık "Planı hazırla"nın içinde yazılıyor: müşteri onayladığı
 * belgede reklamın NE DEDİĞİNİ görüyor ve onay özeti metni de bağlıyor.
 * İşçi modeli HİÇ çağırmıyor; onaylı sürümdeki metni kuruyor.
 *
 * TRANSACTION DIŞINDA. Bağlam (marka, yasal uyarı, hangi varlık görsel)
 * çağıranın KISA okuma transaction'ında okunur (`metinBaglamiOku`), model
 * çağrıları burada, yazım ikinci kısa transaction'da. Model çağrısı
 * `withTenant`in 5 saniyesine sığmaz ve transaction ölünce hata bile
 * kaydedilemez (CLAUDE.md).
 *
 * PARALELLİK VE SÜRE KARARI:
 *   · Satır başına BİR çağrı (model görselleri birlikte düşünerek o
 *     kampanyanın metinlerini yazıyor), en çok `METIN_ESZAMANLI` = 3 aynı
 *     anda. Sıralı yazmak üç katmanlı tipik bir planda "Planı hazırla"yı
 *     ~3× uzatırdı (Gemini satır başına 5-15 sn); sınırsız paralel ise
 *     30 satırlık bir planda (şemanın tavanı) 30 eşzamanlı çağrı demek:
 *     kota bir anda tükenir ve hepsi aynı anda 429 alıp BİRLİKTE
 *     "yazılamadı" olur. 3, Meta'nın üç katmanını tek dalgada bitiriyor.
 *   · Çağrı başına `METIN_ZAMAN_ASIMI_MS` = 40 sn. İstemcinin kendi sınırı
 *     120 sn; o beklenseydi tek takılan çağrı HTTP isteğini (ve kullanıcıyı)
 *     iki dakika bekletirdi. Süresi dolan satır `metin_yazilamadi` ile BOŞ
 *     kalır ve nedeni notunda yazılır; plan yine üretilir (gerekçe
 *     paragrafıyla aynı karar: model düşerse plan düşmez).
 *   · Tek istekte en çok `METIN_EN_COK_SATIR` = 12 satır yazılır. Kalanı
 *     "bekliyor"da kalır ve notunda SÖYLENİR (sessiz kesme yok); "Yeniden
 *     hazırla" yazılmış olanları korur, kalanları yazar. En kötü durum
 *     12/3 × 40 sn = 160 sn; tipik plan (≤ 6 Meta satırı) iki dalga.
 *
 * SONUÇ HER ZAMAN TEK DENETLEYİCİDEN GEÇER: çağıran (plan servisi) sonucu
 * `reklamMetinleriniYerlestir` ile TAZE yasal uyarı ve satırın görselleriyle
 * denetleyip yerleştirir; geçmeyen metin dolu bırakılmaz (müşteri
 * onaylayamayacağı bir metni görmez).
 */
export const METIN_ESZAMANLI = 3;
export const METIN_ZAMAN_ASIMI_MS = 40_000;
export const METIN_EN_COK_SATIR = 12;

export interface MetinBaglami extends Pick<TaslakBaglamiOkumasi, 'marka' | 'yasalUyari'> {
  /**
   * Workspace'in GÖRSEL varlıkları (kimlik → ad). Tur 1 yalnız görsel
   * kuruyor (video fikri kapak görseli istiyor, C-14): videoya metin
   * bağlamak, işçide görsel diye yüklenmeye çalışılan bir kimlik demekti.
   */
  gorseller: Map<string, string>;
}

/** Kısa okuma transaction'ının içinde çağrılır; model çağrısı YOK. */
export async function metinBaglamiOku(tx: OkumaTx, clientId: string): Promise<MetinBaglami> {
  const [c] = await tx.$queryRaw<Array<{ ad: string }>>(Prisma.sql`SELECT name AS ad FROM clients WHERE id = ${clientId}::uuid`);
  const m = await markaOku(tx, clientId, c?.ad ?? 'Workspace');
  const g = await tx.$queryRaw<Array<{ id: string; ad: string }>>(Prisma.sql`
    SELECT id::text, name AS ad FROM assets WHERE client_id = ${clientId}::uuid AND kind = 'image'`);
  return { marka: m.marka, yasalUyari: m.yasalUyari, gorseller: new Map(g.map((x) => [x.id, x.ad])) };
}

/** Sınırlı eşzamanlılık: en çok `n` iş aynı anda; sıra korunmaz, sonuç anahtarla eşlenir. */
async function sinirli<T>(isler: readonly T[], n: number, fn: (x: T) => Promise<void>): Promise<void> {
  let i = 0;
  const kosucu = async (): Promise<void> => {
    while (i < isler.length) {
      const x = isler[i++]!;
      await fn(x);
    }
  };
  await Promise.all(Array.from({ length: Math.min(n, isler.length) }, kosucu));
}

function zamanAsimiyla<T>(p: Promise<T>, ms: number): Promise<T | 'zaman_asimi'> {
  let t: NodeJS.Timeout | undefined;
  const sure = new Promise<'zaman_asimi'>((r) => {
    t = setTimeout(() => r('zaman_asimi'), ms);
  });
  return Promise.race([p, sure]).finally(() => clearTimeout(t));
}

async function satirMetni(u: MetinUretici | null, s: PlanSatiri, b: MetinBaglami, zaman: string, zamanAsimiMs: number): Promise<ReklamMetniYazimi> {
  if (!u) return { tur: 'yazilamadi', neden: 'yz_kapali', mesaj: 'Yapay zekâ bağlı değil; reklam metni yazılamadı.' };
  const gorseller = satirVarlikIdleri(s)
    .filter((id) => b.gorseller.has(id))
    .map((id) => ({ id, ad: b.gorseller.get(id)! }));
  // Görselsiz satırda model ÇAĞRILMAZ: metin bir görsele bağlanamaz ve tek
  // denetleyici onu zaten reddederdi; çağrı boşa kota olurdu.
  if (gorseller.length === 0) {
    return { tur: 'yazilamadi', neden: 'metin_yazilamadi', mesaj: 'Kampanyada kurulabilecek görsel yok (video bu sürümde kurulmuyor); metin bir görsele bağlanamadı.' };
  }
  const r = await zamanAsimiyla(
    reklamMetniYaz(u, { ad: s.ad }, b, gorseller).catch((e: unknown) => ({ tur: 'ret' as const, neden: 'metin_yazilamadi' as const, mesaj: `Yapay zekâ çağrısı düştü: ${(e as Error).message}` })),
    zamanAsimiMs,
  );
  if (r === 'zaman_asimi') return { tur: 'yazilamadi', neden: 'metin_yazilamadi', mesaj: `Yapay zekâ ${Math.round(zamanAsimiMs / 1000)} saniyede cevap vermedi; planı yeniden hazırla.` };
  if (r.tur === 'ret') return { tur: 'yazilamadi', neden: r.neden, mesaj: r.mesaj };
  return { tur: 'tamam', metinler: r.metinler, kaynak: { tur: 'yz_metin', kimlik: u.model, zaman }, notlar: r.notlar };
}

/**
 * Metni olmayan her Meta satırı için modelin sonucunu döndürür (yerleştirme
 * çağıranda, `reklamMetinleriniYerlestir`). `plan` önceden `metinleriTasi` /
 * `degisiklikUygula`dan geçmiş olmalı: korunan metin yeniden yazılmaz
 * (gereksiz çağrı ve müşterinin ikinci kez okuyacağı yeni bir metin).
 */
export async function reklamMetinleriniYaz(
  u: MetinUretici | null,
  plan: Pick<PlanOnerisi, 'satirlar'>,
  b: MetinBaglami,
  zaman: string,
  secenek: { zamanAsimiMs?: number } = {},
): Promise<Map<string, ReklamMetniYazimi>> {
  const yazilacak = metinYazilacakSatirlar(plan);
  if (yazilacak.length === 0) return new Map();
  const simdi = yazilacak.slice(0, METIN_EN_COK_SATIR);
  const sonra = yazilacak.slice(METIN_EN_COK_SATIR);
  const yazimlar = new Map<string, ReklamMetniYazimi>();
  await sinirli(simdi, METIN_ESZAMANLI, async (s) => {
    yazimlar.set(s.anahtar, await satirMetni(u, s, b, zaman, secenek.zamanAsimiMs ?? METIN_ZAMAN_ASIMI_MS));
  });
  for (const s of sonra) {
    yazimlar.set(s.anahtar, {
      tur: 'yazilamadi',
      neden: 'metin_yazilamadi',
      mesaj: `Tek seferde en çok ${METIN_EN_COK_SATIR} kampanyanın metni yazılıyor; bu kampanya için planı yeniden hazırla (yazılanlar korunur).`,
    });
  }
  const yazilamayan = [...yazimlar.values()].filter((y) => y.tur === 'yazilamadi').length;
  if (yazilamayan > 0) logger.warn(`${yazimlar.size} satırdan ${yazilamayan} satırın reklam metni yazılamadı`);
  return yazimlar;
}
