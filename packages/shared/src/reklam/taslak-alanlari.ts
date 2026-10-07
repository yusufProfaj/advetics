/**
 * Taslağın taşıdığı alanlar ve `taslakEksikleri()` (TASARIM.md § 02.2,
 * 02.5, 02.6).
 *
 * "Yayına ne kaldı" sorusunun TEK cevabı burası: panelin sağdaki kartı, adım
 * düğmeleri, Gözden geçir ve sunucunun yayın kapısı aynı listeyi okuyor.
 * İkinci bir liste yazılırsa biri "hazır" derken öbürü düğmeyi kilitli tutar.
 *
 * Her alan `{deger, kaynak, kim, zaman}`. YAPISAL alan (yanlışsa para, hukuk
 * ya da yanlış kişiye gösterim) yalnız izinli kaynakla derlenir: modelin
 * önerisi (`ai_onerisi`) kullanıcı kabul edene kadar bir karar değil.
 */
import { z } from 'zod';
import { ALAN_KAYNAKLARI, type AlanKaynagi } from './taslak';
import { niyetKoduSchema } from './meta/niyetler';
import { OZEL_KATEGORILER } from './meta/hedefleme';

const alan = <T extends z.ZodTypeAny>(deger: T) =>
  z.object({
    deger,
    kaynak: z.enum(ALAN_KAYNAKLARI),
    kim: z.string().uuid().nullable(),
    zaman: z.string().datetime({ offset: true }),
  });

const tarih = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Tarih YYYY-MM-DD olmalı');

export const hedefKonumSchema = z.object({
  tur: z.enum(['country', 'region', 'city', 'custom']),
  key: z.string().max(64),
  etiket: z.string().trim().min(1).max(200),
  ulkeKodu: z.string().length(2).nullable(),
  yaricapKm: z.number().positive().max(80).optional(),
  enlem: z.number().min(-90).max(90).optional(),
  boylam: z.number().min(-180).max(180).optional(),
});

export const kavramGirdisiSchema = z.object({
  /** Görsel arşivindeki varlık; Meta `image_hash` yayın anında hesaba yüklenir. */
  varlikId: z.string().uuid(),
  baslik: z.string().max(255),
  metin: z.string().max(5000),
  aciklama: z.string().max(255).optional(),
  /**
   * VİDEO FİKRİ: `varlikId` videoyu, bu alan KAPAK görselini gösterir.
   * İsteğe bağlı ve varsayılansız: varsayılan değerli bir alan, kayıtlı
   * taslakların içerik özetini değiştirir ve yayında "sürüm bozuk" üretirdi.
   */
  kapakVarlikId: z.string().uuid().optional(),
});

/**
 * Her alan İSTEĞE BAĞLI: taslak boş başlıyor ve adım adım doluyor. Boşluğu
 * ŞEMA değil `taslakEksikleri()` söylüyor — şema reddederse kullanıcı yarım
 * işini kaydedemez.
 */
export const taslakAlanlariSchema = z
  .object({
    niyet: alan(niyetKoduSchema),
    reklamHesabiId: alan(z.string().uuid()),
    sayfaId: alan(z.string().uuid()),
    instagramId: alan(z.string().uuid().nullable()),
    konumlar: alan(z.array(hedefKonumSchema).max(25)),
    enDusukYas: alan(z.number().int()),
    ipucuYas: alan(z.object({ min: z.number().int(), max: z.number().int() }).nullable()),
    ipucuCinsiyet: alan(z.enum(['erkek', 'kadin']).nullable()),
    /** Taslağın EK kategorisi; taban müşteri kartında (taslakta düşürülemez). */
    ekKategoriler: alan(z.array(z.enum(OZEL_KATEGORILER))),
    /** micros DİZGE: JSON sayısı 2^53 üstünde sessizce yuvarlanıyor. */
    butce: alan(z.object({ tip: z.enum(['gunluk', 'toplam']), micros: z.string().regex(/^\d{1,18}$/) })),
    takvim: alan(z.object({ baslangic: tarih, bitis: tarih.nullable() })),
    kavramlar: alan(z.array(kavramGirdisiSchema).max(5)),
    hedefAdres: alan(z.string().max(2000).nullable()),
    formSablonuId: alan(z.string().uuid().nullable()),
  })
  .partial()
  .strict();
export type TaslakAlanlari = z.infer<typeof taslakAlanlariSchema>;

/** Yapısal alanların İZİNLİ kaynakları (§ 02.5.2). */
const IZINLI: Partial<Record<keyof TaslakAlanlari, readonly AlanKaynagi[]>> = {
  niyet: ['kullanici'],
  reklamHesabiId: ['kullanici', 'workspace_profili'],
  sayfaId: ['kullanici', 'workspace_profili'],
  instagramId: ['kullanici', 'workspace_profili'],
  konumlar: ['kullanici', 'marka_merkezi'],
  ekKategoriler: ['kullanici'],
  butce: ['kullanici'],
  takvim: ['kullanici'],
};

export interface TaslakEksigi {
  /** Akış adımı: 0 amaç · 1 görsel · 2 metin · 3 bütçe · 4 süre. */
  adim: 0 | 1 | 2 | 3 | 4;
  alan: keyof TaslakAlanlari;
  kod: string;
  metin: string;
}

const ALAN_ADIMI: Record<keyof TaslakAlanlari, TaslakEksigi['adim']> = {
  niyet: 0, reklamHesabiId: 0, sayfaId: 0, instagramId: 0, konumlar: 0,
  enDusukYas: 0, ipucuYas: 0, ipucuCinsiyet: 0, ekKategoriler: 0,
  kavramlar: 1, hedefAdres: 0, formSablonuId: 0,
  butce: 3, takvim: 4,
};

/**
 * Taslağın DIŞINDAN gelen ama yayına engel olan bilgiler. Sunucu yayın
 * kapısında taze okur; panel hazırlık okumasından verir — ikisi AYNI
 * fonksiyondan geçer.
 */
export interface EksikBaglami {
  /** Marka Merkezi'ndeki zorunlu yasal uyarı; her fikrin metninde geçmeli. */
  yasalUyari?: string | null;
}

/** Boşluk ve harf farkı uyarıyı "yok" saydırmasın: kopyala-yapıştır satır sonu taşıyor. */
export function metinUyariIceriyor(metin: string, uyari: string): boolean {
  const n = (s: string) => s.normalize('NFC').replace(/\s+/g, ' ').trim().toLocaleLowerCase('tr-TR');
  return n(metin).includes(n(uyari));
}

export function taslakEksikleri(a: TaslakAlanlari, baglam: EksikBaglami = {}): TaslakEksigi[] {
  const e: TaslakEksigi[] = [];
  const ekle = (alanAdi: keyof TaslakAlanlari, kod: string, metin: string) =>
    e.push({ adim: ALAN_ADIMI[alanAdi], alan: alanAdi, kod, metin });

  // KAYNAK KİLİDİ önce: AI'ın önerdiği bütçe "dolu" görünür ama karar değil.
  for (const [ad, izinli] of Object.entries(IZINLI) as Array<[keyof TaslakAlanlari, readonly AlanKaynagi[]]>) {
    const d = a[ad];
    if (d && !izinli.includes(d.kaynak)) {
      ekle(ad, 'KAYNAK', d.kaynak === 'ai_onerisi' ? 'Asistanın önerisini onayla' : 'Bu alanı kendin seç');
    }
  }

  if (!a.niyet) ekle('niyet', 'NIYET', 'Amaç seçilmedi');
  if (!a.reklamHesabiId) ekle('reklamHesabiId', 'OK-01', 'Reklam hesabı seçilmedi');
  if (!a.sayfaId) ekle('sayfaId', 'SAYFA', 'Facebook sayfası seçilmedi');
  if (!a.konumlar || a.konumlar.deger.length === 0) ekle('konumlar', 'KNM-01', 'Konum seçilmedi');
  const yas = a.enDusukYas?.deger ?? 18;
  if (yas < 18 || yas > 25) ekle('enDusukYas', 'KTL-01', 'En düşük yaş 18 ile 25 arasında olmalı');
  const ipucu = a.ipucuYas?.deger;
  if (ipucu && (ipucu.min < 18 || ipucu.max > 65 || ipucu.min > ipucu.max)) {
    ekle('ipucuYas', 'KTL-02', 'Yaş aralığı 18 ile 65 arasında olmalı');
  }
  // Soru HER taslakta ve hiçbir şık seçili gelmeden (T-16): Meta Türkiye'de
  // beyanı zorunlu tutmuyor, sorulmayan soru beyansız ve hatasız yayınlanan
  // bir konut reklamı üretir. "Hayır" = boş dizi, sorulmadı = alan yok.
  if (!a.ekKategoriler) ekle('ekKategoriler', 'OZK-SORU', 'Özel reklam kategorisi sorusu cevaplanmadı');
  if (a.ekKategoriler?.deger.includes('ISSUES_ELECTIONS_POLITICS')) {
    ekle('ekKategoriler', 'OZK-SIYASI', "Siyasi ve toplumsal konulu reklamlar Advetics'ten yayınlanamıyor");
  }

  const kavramlar = a.kavramlar?.deger ?? [];
  if (kavramlar.length === 0) ekle('kavramlar', 'KRT-SAYI', 'En az bir görsel seç');
  kavramlar.forEach((k, i) => {
    if (!k.baslik.trim()) e.push({ adim: 2, alan: 'kavramlar', kod: 'KRT-METIN', metin: `Fikir ${i + 1}: başlık boş` });
    if (!k.metin.trim()) e.push({ adim: 2, alan: 'kavramlar', kod: 'KRT-METIN', metin: `Fikir ${i + 1}: ana metin boş` });
    else if (baglam.yasalUyari && !metinUyariIceriyor(k.metin, baglam.yasalUyari)) {
      e.push({ adim: 2, alan: 'kavramlar', kod: 'YASAL-UYARI', metin: `Fikir ${i + 1}: zorunlu yasal uyarı metinde yok` });
    }
  });

  const niyet = a.niyet?.deger;
  if (niyet === 'SITE' && !(a.hedefAdres?.deger && /^https:\/\/[^\s/]+\.[^\s]+/.test(a.hedefAdres.deger))) {
    ekle('hedefAdres', 'SITE-ADRES', 'Site adresi https:// ile başlamalı');
  }
  if (niyet === 'FORM' && !a.formSablonuId?.deger) ekle('formSablonuId', 'FORM-YOK', 'Form seçilmedi');

  const b = a.butce?.deger;
  if (!b || BigInt(b.micros) === 0n) ekle('butce', 'BTC-01', 'Bütçe seçilmedi');
  const t = a.takvim?.deger;
  if (!t) ekle('takvim', 'TKV', 'Başlangıç tarihi seçilmedi');
  else if (t.bitis !== null && t.bitis < t.baslangic) ekle('takvim', 'TKV', 'Bitiş başlangıçtan önce');
  if (b?.tip === 'toplam' && t && t.bitis === null) ekle('takvim', 'BTC-02', 'Toplam bütçede bitiş tarihi gerekli');

  return e;
}

/**
 * Kanonik JSON: anahtarlar sıralı, boşluksuz. İçerik özeti (SHA-256) bunun
 * üzerinden alınıyor; anahtar sırası tarayıcıdan tarayıcıya değişse bile
 * aynı içerik aynı özeti vermeli, yoksa her kayıt onayları sebepsiz düşürür.
 * `kim` ve `zaman` ÖZETE GİRMİYOR: kimin tıkladığı içeriği değiştirmez.
 */
export function taslakKanonikIcerik(a: TaslakAlanlari): string {
  const yalin: Record<string, unknown> = {};
  for (const k of Object.keys(a).sort()) {
    const d = a[k as keyof TaslakAlanlari];
    if (d) yalin[k] = { deger: d.deger, kaynak: d.kaynak };
  }
  return kanonikJson(yalin);
}

export function kanonikJson(v: unknown): string {
  if (v === undefined) return 'null';
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(kanonikJson).join(',')}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o)
    .filter((k) => o[k] !== undefined)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${kanonikJson(o[k])}`)
    .join(',')}}`;
}
