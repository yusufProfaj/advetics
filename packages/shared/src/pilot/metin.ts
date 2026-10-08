import { z } from 'zod';
import { kanonikJson, metinUyariIceriyor } from '../reklam/taslak-alanlari';
import { bos, dolu, type BosNedeni, type Hucre, type Kaynak, type KaynakTuru } from './kaynak';
import type { PlanOnerisi, PlanSatiri } from './plan';

/**
 * ═══ REKLAM METNİ PLANIN PARÇASI (kullanıcı kararı (a), 2026-10-08) ═══
 *
 * ESKİ AKIŞ: metni worker, müşteri onayından SONRA yazıyordu. Gerçek kipte
 * metin kimse görmeden yayına çıkıyordu ve onay özeti (hash) metni
 * kapsamıyordu: müşteri "120.000 TL, üç kampanya"yı onaylıyor, reklamın NE
 * DEDİĞİNİ onaylamıyordu. Model girdisi müşterinin sitesinden/marka
 * metinlerinden geldiği için bu, site metni üzerinden bir prompt injection
 * yoluydu ve onay kapısı onu göremiyordu.
 *
 * YENİ AKIŞ: metin plan HAZIRLANIRKEN yazılır (Ajan 2, transaction DIŞINDA),
 * plan belgesinde her Meta satırının altında görünür (Ajan 3) ve
 * `planKanonikIcerik` metni de kapsadığı için müşterinin onayladığı özet
 * metni de bağlar. Worker metni ONAYLI SÜRÜMDEN OKUR, modeli HİÇ çağırmaz.
 * Tıklama sayısı değişmez: metin "Planı hazırla"nın içinde yazılıyor.
 *
 * TEK DENETLEYİCİ: `reklamMetniEksikleri`. Kurulum taslağı
 * (`pilotTaslakEksikleri`) ve onay kapısı (`onayKapisi` →
 * `planMetinEksikleri`) AYNI fonksiyonu çağırır. İki denetleyici olsaydı
 * kapı "onayla" der, işçi "metin eksik" diye düşerdi; para harcamayan ama
 * müşteriye "onaylandı" deyip hiçbir şey kurmayan bir plan.
 */

/** Başlık üst sınırı. API'deki `BASLIK_EN_COK` (taslak-baglami.ts) bunu okumalı; iki sayı ayrışırsa şema kırpılmış başlığı reddeder. */
export const REKLAM_BASLIGI_EN_COK = 40;
/**
 * Ana metin üst sınırı. Meta'nın sınırı DEĞİL (o canlıda ölçülmedi):
 * saklanan JSON'un makul tavanı. Model 125 karakteri hedefliyor (ilk 125
 * karakter akışta görünen kısım); tavan yasal uyarının başa eklenmesine yer
 * bırakıyor.
 */
export const REKLAM_METNI_EN_COK = 1500;

export const reklamMetniSchema = z
  .object({
    varlikId: z.string().uuid().nullable(),
    baslik: z.string().trim().min(1).max(REKLAM_BASLIGI_EN_COK),
    metin: z.string().trim().min(1).max(REKLAM_METNI_EN_COK),
  })
  .strict();
export type PlanReklamMetni = z.infer<typeof reklamMetniSchema>;

/** Satır engeli olarak yazılan metin nedenleri. Satır engelleri yeniden hesaplanırken YALNIZ bunlar silinir. */
export const METIN_BOS_NEDENLERI = ['metin_bekliyor', 'metin_yazilamadi', 'yz_kapali', 'metin_denetimden_gecmedi', 'plan_eski_bicim'] as const satisfies readonly BosNedeni[];
export type MetinBosNedeni = (typeof METIN_BOS_NEDENLERI)[number];

/**
 * Metnin İZİNLİ kaynakları: model (`yz_metin`) ya da bir kişi (`kullanici`,
 * ileride panelde elle düzeltme). `onayli_plan` DEĞİL: taslak metni plandan
 * kaynağıyla birlikte kopyalar; kaynak `onayli_plan`a çevrilseydi uyum
 * denetçisi metnin modelden geldiğini göremez ve modele özgü kuralı (kişisel
 * nitelik kalıbı, R6-O-52) atlardı.
 */
export const METIN_KAYNAKLARI: readonly KaynakTuru[] = ['yz_metin', 'kullanici'];

/** Satır notunda metin notlarının öneki: yeniden yazımda eski notlar bununla bulunup silinir. */
export const METIN_NOTU_ONEKI = 'Reklam metni: ';

export type ReklamMetniEksikKodu = 'KRT-METIN' | 'METIN-KAYNAK' | 'YASAL-UYARI' | 'KRT-VARLIK';

/**
 * TEK DENETLEYİCİ. `varlikIdleri` verilirse metinler satırın görselleriyle
 * eşleştirilir: görselden çıkarılmış bir varlığa bağlı metin kalırsa ya da
 * hiçbir metin bir görsele bağlı değilse kurulum yok (işçinin derleyicisi
 * görsel başına bir reklam kuruyor; görselsiz metin reklam olmaz ve bunu
 * prova anında değil onay anında öğrenmek gerekir).
 *
 * `yasalUyari` boş/verilmemişse yasal uyarı aranmaz (`degisiklikUygula`
 * profili bilmiyor; kapı ve taslak TAZE uyarıyla çağırır).
 */
export function reklamMetniEksikleri(
  metinler: Hucre<PlanReklamMetni[]> | null,
  b: { yasalUyari?: string | null; varlikIdleri?: readonly string[] | null } = {},
): Array<{ kod: ReklamMetniEksikKodu; metin: string }> {
  const e: Array<{ kod: ReklamMetniEksikKodu; metin: string }> = [];
  if (!metinler || !metinler.dolu || metinler.deger.length === 0) {
    e.push({ kod: 'KRT-METIN', metin: 'Reklam metni yazılmadı' });
    return e;
  }
  if (!METIN_KAYNAKLARI.includes(metinler.kaynak.tur)) {
    e.push({ kod: 'METIN-KAYNAK', metin: `Reklam metninin kaynağı (${metinler.kaynak.tur}) geçerli değil` });
  }
  metinler.deger.forEach((m, i) => {
    if (!m.baslik.trim()) e.push({ kod: 'KRT-METIN', metin: `Metin ${i + 1}: başlık boş` });
    if (!m.metin.trim()) e.push({ kod: 'KRT-METIN', metin: `Metin ${i + 1}: ana metin boş` });
    else if (b.yasalUyari && !metinUyariIceriyor(m.metin, b.yasalUyari)) {
      e.push({ kod: 'YASAL-UYARI', metin: `Metin ${i + 1}: zorunlu yasal uyarı metinde yok` });
    }
  });
  if (b.varlikIdleri) {
    const izinli = new Set(b.varlikIdleri);
    metinler.deger.forEach((m, i) => {
      if (m.varlikId !== null && !izinli.has(m.varlikId)) e.push({ kod: 'KRT-VARLIK', metin: `Metin ${i + 1}: bağlı olduğu görsel bu kampanyada yok` });
    });
    if (!metinler.deger.some((m) => m.varlikId !== null && izinli.has(m.varlikId))) {
      e.push({ kod: 'KRT-VARLIK', metin: 'Hiçbir metin bir görsele bağlı değil' });
    }
  }
  return e;
}

/** Satırın görsel kimlikleri (metin eşleşmesi için); Google satırında boş. */
export function satirVarlikIdleri(s: Pick<PlanSatiri, 'varliklar'>): string[] {
  return s.varliklar?.dolu ? s.varliklar.deger.map((v) => v.deger.id) : [];
}

/**
 * Planın metin eksikleri — onay kapısının girdisi. Yalnız Meta satırları:
 * Tur 1'de Google kurulmuyor ve Google satırı metin hücresi taşımıyor
 * (`null`, şema bunu dayatıyor).
 */
export function planMetinEksikleri(
  p: Pick<PlanOnerisi, 'satirlar'>,
  b: { yasalUyari: string | null },
): Array<{ anahtar: string; kod: ReklamMetniEksikKodu; metin: string }> {
  const e: Array<{ anahtar: string; kod: ReklamMetniEksikKodu; metin: string }> = [];
  for (const s of p.satirlar) {
    if (s.platform !== 'meta') continue;
    for (const x of reklamMetniEksikleri(s.metinler, { yasalUyari: b.yasalUyari, varlikIdleri: satirVarlikIdleri(s) })) e.push({ anahtar: s.anahtar, ...x });
  }
  return e;
}

/** Metin hücresi ve satır engeli BİRLİKTE yazılır: biri güncellenip diğeri unutulursa ekran "kurulabilir" der, kapı reddeder. */
function metinHucresiniYaz(s: PlanSatiri, hucre: Hucre<PlanReklamMetni[]>, notlar: readonly string[]): PlanSatiri {
  const engeller = s.engeller.filter((x) => !(METIN_BOS_NEDENLERI as readonly string[]).includes(x));
  if (!hucre.dolu) engeller.push(hucre.emptyReason);
  return {
    ...s,
    metinler: hucre,
    engeller,
    notlar: [...s.notlar.filter((n) => !n.startsWith(METIN_NOTU_ONEKI)), ...notlar.map((n) => `${METIN_NOTU_ONEKI}${n}`.slice(0, 300))],
  };
}

/** Plan üreticisinin ilk hâli: Meta satırında "henüz yazılmadı", Google'da metin hücresi yok. */
export function ilkMetinHucresi(platform: PlanSatiri['platform']): Hucre<PlanReklamMetni[]> | null {
  return platform === 'meta' ? bos('metin_bekliyor') : null;
}

/**
 * ═══ HANGİ DEĞİŞİKLİK METNİ GEÇERSİZ KILAR ═══
 *
 * Metin kitleye, görsele ve amaca göre yazılır (model girdisi: kampanya adı
 * = kitle · katman, görseller, marka). Bunlardan biri değişirse eski metin
 * BAŞKA bir reklamı anlatıyor olabilir ve müşteri onu onaylar: satır
 * yeniden yazılır. TUTAR metne girmez (model sayı yazamaz; `yzMetniDenetle`)
 * ve yalnız tutar değiştiğinde metni yeniden yazmak hem gereksiz model
 * çağrısı hem de müşterinin ikinci kez okuyacağı yeni bir metin olurdu.
 *
 * Görsel çıkarmada da yeniden yazılır (kullanıcı kararı listesi: "kitle /
 * varlık değişti → yeniden yazılır"): metinler görsel başına ve çıkarılan
 * görselin metnini süzüp kalanı tutmak, model çağrısından tasarruf ama
 * modelin üç görseli BİRLİKTE düşünerek yazdığı metinleri bölmek demek.
 */
export function metinAnahtari(s: Pick<PlanSatiri, 'platform' | 'katman' | 'niyet' | 'kitle' | 'varliklar'>): string {
  return kanonikJson({
    platform: s.platform,
    katman: s.katman,
    niyet: s.niyet.dolu ? s.niyet.deger : null,
    kitle: s.kitle?.dolu ? s.kitle.deger.id : null,
    varliklar: (s.varliklar?.dolu ? s.varliklar.deger.map((v) => v.deger.id) : []).sort(),
  });
}

export function metinKorunurMu(eski: PlanSatiri, yeni: PlanSatiri): boolean {
  return eski.anahtar === yeni.anahtar && metinAnahtari(eski) === metinAnahtari(yeni);
}

/**
 * Yeni plan sürümüne eski sürümün metinlerini TAŞIR ya da geçersiz kılar.
 * Ajan 2 bunu `yenidenHazirla`da (eski = güncel sürüm, yeni = `planUret`
 * çıktısı) çağırır; `degisiklikUygula` kendi içinde çağırıyor. Sonra
 * `metinYazilacakSatirlar` ile yazılacakları bulur.
 *
 * Korunan metin, `yasalUyari` verildiyse onunla yeniden denetlenir: Marka
 * Merkezi'nde yasal uyarı sonradan değiştiyse eski metin onu taşımaz ve
 * yeniden yazılması gerekir (yoksa kapı onay anında reddeder ve ajans
 * nedenini planda göremezdi).
 */
export function metinleriTasi(eski: Pick<PlanOnerisi, 'satirlar'> | null, yeni: PlanOnerisi, b: { yasalUyari?: string | null } = {}): PlanOnerisi {
  const eskiler = new Map((eski?.satirlar ?? []).map((s) => [s.anahtar, s]));
  return {
    ...yeni,
    satirlar: yeni.satirlar.map((s) => {
      if (s.platform !== 'meta') return { ...s, metinler: null };
      const e = eskiler.get(s.anahtar);
      const korunur =
        !!e &&
        e.metinler?.dolu === true &&
        metinKorunurMu(e, s) &&
        reklamMetniEksikleri(e.metinler, { yasalUyari: b.yasalUyari, varlikIdleri: satirVarlikIdleri(s) }).length === 0;
      if (korunur) {
        const notlar = e!.notlar.filter((n) => n.startsWith(METIN_NOTU_ONEKI)).map((n) => n.slice(METIN_NOTU_ONEKI.length));
        return metinHucresiniYaz(s, e!.metinler!, notlar);
      }
      return metinHucresiniYaz(s, bos('metin_bekliyor'), []);
    }),
  };
}

/** Metni yazılması gereken satırlar: dolu metni olmayan her Meta satırı (eski biçim dahil). */
export function metinYazilacakSatirlar(p: Pick<PlanOnerisi, 'satirlar'>): PlanSatiri[] {
  return p.satirlar.filter((s) => s.platform === 'meta' && !s.metinler?.dolu);
}

/**
 * Ajan 2'nin model çağrısının sonucu (`reklamMetniYaz`, transaction
 * DIŞINDA). `yazilamadi.neden` dört metin nedeninden biri; `mesaj`
 * platformun/modelin kendi cümlesi ve satırın notuna yazılır.
 */
export type ReklamMetniYazimi =
  | { tur: 'tamam'; metinler: PlanReklamMetni[]; kaynak: Kaynak; notlar: string[] }
  | { tur: 'yazilamadi'; neden: Exclude<MetinBosNedeni, 'metin_bekliyor' | 'plan_eski_bicim'>; mesaj: string };

/**
 * Model sonuçlarını plana yerleştirir. `tamam` gelen metin TEK
 * DENETLEYİCİDEN geçer (TAZE yasal uyarı ve satırın görselleriyle); geçmezse
 * satır `metin_denetimden_gecmedi` ile boş kalır ve eksikler notta yazılır.
 * Geçmeyen metni dolu bırakmak, müşterinin onaylayamayacağı bir metni ona
 * göstermek olurdu.
 *
 * Plan dışı ya da Google satırı için sonuç gelirse HATA fırlatır: çağıranın
 * yanlış satıra yazdığı bir metni sessizce atmak, o satırı "bekliyor"da
 * bırakıp nedenini kaybetmek demek.
 */
export function reklamMetinleriniYerlestir(
  p: PlanOnerisi,
  yazimlar: ReadonlyMap<string, ReklamMetniYazimi>,
  b: { yasalUyari: string | null },
): PlanOnerisi {
  for (const a of yazimlar.keys()) {
    const s = p.satirlar.find((x) => x.anahtar === a);
    if (!s) throw new Error(`Reklam metni plan dışı bir satıra yazılmak istendi: ${a}`);
    if (s.platform !== 'meta') throw new Error(`Reklam metni Meta dışı satıra yazılmak istendi: ${a}`);
  }
  return {
    ...p,
    satirlar: p.satirlar.map((s) => {
      const y = yazimlar.get(s.anahtar);
      if (!y) return s;
      if (y.tur === 'yazilamadi') return metinHucresiniYaz(s, bos(y.neden), [y.mesaj]);
      const hucre: Hucre<PlanReklamMetni[]> = dolu(
        y.metinler.map((m) => ({ varlikId: m.varlikId, baslik: m.baslik.trim(), metin: m.metin.trim() })),
        y.kaynak,
      );
      const eksik = reklamMetniEksikleri(hucre, { yasalUyari: b.yasalUyari, varlikIdleri: satirVarlikIdleri(s) });
      const semaHatasi = hucre.dolu && hucre.deger.some((m) => !reklamMetniSchema.safeParse(m).success);
      if (eksik.length > 0 || semaHatasi) {
        return metinHucresiniYaz(s, bos('metin_denetimden_gecmedi'), [
          ...eksik.map((x) => x.metin),
          ...(semaHatasi ? [`Başlık en çok ${REKLAM_BASLIGI_EN_COK}, metin en çok ${REKLAM_METNI_EN_COK} karakter olabilir`] : []),
        ]);
      }
      return metinHucresiniYaz(s, hucre, y.notlar);
    }),
  };
}

/** Müşteri özetinde ve plan belgesinde: kaç Meta satırının metni hazır. */
export function metinliSatirSayisi(p: Pick<PlanOnerisi, 'satirlar'>): number {
  return p.satirlar.filter((s) => s.platform === 'meta' && s.metinler?.dolu).length;
}
