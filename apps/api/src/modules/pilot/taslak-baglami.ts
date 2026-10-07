import { Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  kitleKonumuSchema,
  metinUyariIceriyor,
  yzMetniDenetle,
  type HedefKonum,
  type Kaynak,
  type Kaynakli,
  type PilotTaslak,
  type SatirdanTaslakBaglami,
} from '@advetics/shared';
import { metinIste, type MetinUretici } from '../../yapay-zeka/gemini';
import type { OkumaTx } from './plan-girdisi';
import { ozelKategoriBeyani } from './uyum-profili';

const logger = new Logger('PilotTaslak');

/**
 * ═══ `satirdanTaslak` BAĞLAMINI KURAN OKUYUCU (MIMARI § 6 madde 5) ═══
 *
 * Onaylı plan satırı veri olarak taslağa kopyalanır; bu dosya satırın
 * TAŞIMADIĞI bağlamı okur: reklam hesabı, sayfa, IG, kitlenin konumları,
 * özel kategori, hedef adres. Her değer kaynağıyla; bulunamayan `null`
 * gider ve `satirdanTaslak` onu nedeniyle boş hücreye çevirir.
 *
 * TAHMİN YOK. Workspace'te birden çok Meta hesabı ya da sayfası varsa ve
 * aralarındaki bağ (sayfanın boost hesabı) yoksa seçilmez: "ilkini al",
 * reklamı başka bir müşterinin hesabından ya da sayfasından yayınlamak
 * olabilir. Boş alan eksikler listesinde adıyla görünür.
 *
 * KONUM KOPYA, REFERANS DEĞİL: şablon sonra değişirse onaylı taslak
 * sessizce değişmesin. Konumun TEK kaynağı kitle şablonu (B-16): "değiştir"
 * kutusu ve model konum yazamaz.
 */
export interface TaslakBaglamiOkumasi {
  baglam: SatirdanTaslakBaglami;
  yasalUyari: string | null;
  marka: { ad: string; uslup: string | null; vaatler: string[]; bilgi: string | null; hedefKitle: string | null; sablonlar: string[] };
}

export async function taslakBaglamiOku(
  tx: OkumaTx,
  g: { planId: string; planSurum: number; onayZamani: string; clientId: string; platform: 'meta' | 'google'; takvim: { baslangic: string; bitis: string }; simdi: Date },
): Promise<TaslakBaglamiOkumasi> {
  const zaman = g.simdi.toISOString();
  const wp = (kimlik: string, aciklama?: string): Kaynak => ({ tur: 'workspace_profili', kimlik, zaman, ...(aciklama ? { aciklama } : {}) });
  const [c] = await tx.$queryRaw<Array<{ ad: string; site: string | null; kategoriler: string[] | null; beyan: Date | null }>>(Prisma.sql`
    SELECT name AS ad, website AS site, special_ad_categories AS kategoriler, ozel_kategori_beyan_zamani AS beyan
      FROM clients WHERE id = ${g.clientId}::uuid`);
  if (!c) throw new Error(`Workspace bulunamadı: ${g.clientId}`);
  const [m] = await tx.$queryRaw<Array<{ id: string; guncellendi: Date; yasal: string | null; marka: string | null; uslup: string | null; vaatler: string[] | null; bilgi: string | null; hedef: string | null; sablonlar: string[] | null }>>(Prisma.sql`
    SELECT id::text, updated_at AS guncellendi, yasal_uyari AS yasal, marka_adi AS marka, uslup, vaatler,
           marka_bilgileri AS bilgi, hedef_kitle AS hedef, metin_sablonlari AS sablonlar
      FROM client_profiles WHERE client_id = ${g.clientId}::uuid`);

  const hesaplar = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT id::text FROM ad_accounts
     WHERE client_id = ${g.clientId}::uuid AND platform = ${g.platform}::"Platform"
     ORDER BY id`);
  const sayfalar =
    g.platform === 'meta'
      ? await tx.$queryRaw<Array<{ id: string; dis: string; hesap: string | null }>>(Prisma.sql`
          SELECT id::text, external_id AS dis, linked_ad_account_id::text AS hesap FROM social_profiles
           WHERE client_id = ${g.clientId}::uuid AND profile_type = 'facebook_page' ORDER BY id`)
      : [];
  const sec = secim(hesaplar.map((h) => h.id), sayfalar);
  const hesap: Kaynakli<string> | null = sec.hesap ? { deger: sec.hesap, kaynak: wp(sec.hesap, sec.hesapNedeni) } : null;
  const sayfa: Kaynakli<string> | null = sec.sayfa ? { deger: sec.sayfa.id, kaynak: wp(sec.sayfa.id, sec.sayfaNedeni) } : null;

  let instagram: Kaynakli<string | null> | null = null;
  if (sec.sayfa) {
    const ig = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT id::text FROM social_profiles
       WHERE client_id = ${g.clientId}::uuid AND profile_type = 'instagram_business' AND parent_page_external_id = ${sec.sayfa.dis}
       ORDER BY id`);
    // Bağlı IG tek değilse IG yerleşimi açılmaz; yanlış hesap seçmek reklamı başka profilde gösterirdi.
    instagram = ig.length === 1 ? { deger: ig[0]!.id, kaynak: wp(ig[0]!.id, 'Sayfaya bağlı Instagram hesabı') } : { deger: null, kaynak: wp('instagram_yok', ig.length > 1 ? 'Sayfaya bağlı birden çok Instagram hesabı' : 'Sayfaya bağlı Instagram hesabı yok') };
  }

  const kitleKonumlari = new Map<string, Kaynakli<HedefKonum[]>>();
  const kitleler = await tx.$queryRaw<Array<{ id: string; konum: unknown; guncellendi: Date }>>(Prisma.sql`
    SELECT id::text, locations AS konum, updated_at AS guncellendi FROM audience_templates WHERE client_id = ${g.clientId}::uuid`);
  for (const k of kitleler) {
    const konumlar: HedefKonum[] = [];
    for (const o of Array.isArray(k.konum) ? k.konum : []) {
      const r = kitleKonumuSchema.safeParse(o);
      if (r.success) konumlar.push({ tur: r.data.type, key: r.data.key, etiket: r.data.label, ulkeKodu: r.data.countryCode });
      // Geçersiz öğe atlanıyor ama log'da; sessiz düşüş yok.
      else logger.warn(`audience_templates(${k.id}).locations: geçersiz öğe atlandı`);
    }
    kitleKonumlari.set(k.id, { deger: konumlar, kaynak: { tur: 'kitle_sablonu', kimlik: k.id, zaman: new Date(k.guncellendi).toISOString() } });
  }

  const kat = ozelKategoriBeyani(c.kategoriler ?? [], c.beyan !== null);
  const mmKaynak = (aciklama: string): Kaynak => ({ tur: 'marka_merkezi', kimlik: m?.id ?? g.clientId, zaman: m ? new Date(m.guncellendi).toISOString() : zaman, aciklama });
  return {
    baglam: {
      planId: g.planId,
      planSurum: g.planSurum,
      onayKaynagi: { tur: 'onayli_plan', kimlik: `${g.planId}@${g.planSurum}`, zaman: g.onayZamani },
      takvim: g.takvim,
      hesap,
      sayfa,
      instagram,
      kitleKonumlari,
      ozelKategoriler: kat === null ? null : { deger: kat, kaynak: mmKaynak('Özel reklam kategorisi beyanı') },
      hedefAdres: c.site?.trim() ? { deger: c.site.trim(), kaynak: mmKaynak('Web sitesi') } : null,
      // Form şablonu tablosu henüz yok (TASARIM HZ-10); FORM satırı FORM-YOK ile durur.
      formSablonuId: null,
      // Google taban negatifleri Tur 3 (K-06); Google kurulumu da Tur 3.
      tabanNegatifler: null,
      zaman,
    },
    yasalUyari: m?.yasal?.trim() || null,
    marka: {
      ad: m?.marka?.trim() || c.ad,
      uslup: m?.uslup ?? null,
      vaatler: m?.vaatler ?? [],
      bilgi: m?.bilgi ?? null,
      hedefKitle: m?.hedef ?? null,
      sablonlar: m?.sablonlar ?? [],
    },
  };
}

/**
 * Hesap ve sayfa seçimi — yalnız TEK cevap varsa. Saf; testte doğrudan.
 *   · tek hesap → o; birden çoksa sayfanın boost hesabı TEK bir hesabı
 *     gösteriyorsa o; aksi hâlde yok.
 *   · tek sayfa → o; birden çoksa boost hesabı seçilen hesap olan TEK sayfa.
 */
export function secim(
  hesaplar: string[],
  sayfalar: Array<{ id: string; dis: string; hesap: string | null }>,
): { hesap: string | null; hesapNedeni: string; sayfa: { id: string; dis: string } | null; sayfaNedeni: string } {
  let hesap: string | null = null;
  let hesapNedeni = '';
  if (hesaplar.length === 1) {
    hesap = hesaplar[0]!;
    hesapNedeni = 'Workspace’in tek hesabı';
  } else if (hesaplar.length > 1) {
    const bagli = [...new Set(sayfalar.map((s) => s.hesap).filter((h): h is string => !!h && hesaplar.includes(h)))];
    if (bagli.length === 1) {
      hesap = bagli[0]!;
      hesapNedeni = 'Sayfanın boost hesabı';
    }
  }
  let sayfa: { id: string; dis: string } | null = null;
  let sayfaNedeni = '';
  if (sayfalar.length === 1) {
    sayfa = sayfalar[0]!;
    sayfaNedeni = 'Workspace’in tek sayfası';
  } else if (sayfalar.length > 1 && hesap) {
    const eslesen = sayfalar.filter((s) => s.hesap === hesap);
    if (eslesen.length === 1) {
      sayfa = eslesen[0]!;
      sayfaNedeni = 'Boost hesabı bu reklam hesabı olan sayfa';
    }
  }
  return { hesap, hesapNedeni, sayfa, sayfaNedeni };
}

// ─── Reklam metni (M-8 c) ──────────────────────────────────────────────────

export const BASLIK_EN_COK = 40;

const METIN_SEMASI = {
  type: 'object',
  properties: {
    metinler: {
      type: 'array',
      items: {
        type: 'object',
        properties: { baslik: { type: 'string' }, metin: { type: 'string' } },
        required: ['baslik', 'metin'],
      },
    },
  },
  required: ['metinler'],
} as const;

const METIN_SISTEMI = [
  'Türkçe Meta reklam metni yazıyorsun: her görsel için bir başlık (en çok 40 karakter) ve bir ana metin (ilk 125 karakter en önemli bilgi).',
  'Kurallar: marka bilgisinde OLMAYAN hiçbir sayı, fiyat, yüzde, indirim ya da süre yazma.',
  '"En iyi", "garanti", "%100", "ücretsiz" gibi iddia kullanma. Okuyanı kişisel bir özelliğiyle muhatap alma ("Borcun mu var?" gibi).',
  'Uzun tire kullanma. Yasal uyarıyı SEN ekleme; sistem ekliyor.',
].join(' ');

export type MetinSonucu = { tur: 'tamam'; metinler: Array<{ varlikId: string | null; baslik: string; metin: string }>; notlar: string[] } | { tur: 'ret'; mesaj: string };

/**
 * MODEL YAZAR, SUNUCU SÜZER:
 *   · marka metinlerinde geçmeyen sayı → metin YAZILMAZ (uydurulan rakam
 *     müşterinin onaylamadığı bir vaat olur),
 *   · başlık 40 karakteri aşarsa kelime sınırından kısaltılır ve SÖYLENİR,
 *   · zorunlu yasal uyarı model yazmadıysa ana metnin BAŞINA eklenir ve
 *     söylenir (H-12; ibare ilk 125 karakterde olmalı, GNL-14).
 * Model düşerse `ret`: taslak "metin yazılmadı" eksikiyle durur, prova
 * kotası harcanmaz.
 */
export async function reklamMetniYaz(
  u: MetinUretici | null,
  t: PilotTaslak,
  o: Pick<TaslakBaglamiOkumasi, 'marka' | 'yasalUyari'>,
  varliklar: Array<{ id: string; ad: string }>,
): Promise<MetinSonucu> {
  if (!u) return { tur: 'ret', mesaj: 'Yapay zekâ bağlı değil; reklam metni yazılamadı.' };
  const adet = Math.max(1, varliklar.length);
  const marka = [
    `Marka: ${o.marka.ad}`,
    o.marka.bilgi ? `Marka bilgisi: ${o.marka.bilgi}` : '',
    o.marka.hedefKitle ? `Hedef kitle: ${o.marka.hedefKitle}` : '',
    o.marka.uslup ? `Üslup: ${o.marka.uslup}` : '',
    o.marka.vaatler.length ? `Vaatler: ${o.marka.vaatler.join('; ')}` : '',
    o.marka.sablonlar.length ? `Sık kullanılan cümleler: ${o.marka.sablonlar.join('; ')}` : '',
  ].filter(Boolean);
  let r: Awaited<ReturnType<typeof metinIste>>;
  try {
    r = await metinIste(u, {
      sistem: METIN_SISTEMI,
      metin: `${marka.join('\n')}\nKampanya: ${t.ad}\nGörseller: ${varliklar.map((v, i) => `${i + 1}. ${v.ad}`).join(', ') || 'yok'}\n${adet} metin yaz.`,
      enCokCikti: 1200,
      jsonSemasi: METIN_SEMASI as unknown as Record<string, unknown>,
    });
  } catch (e) {
    return { tur: 'ret', mesaj: `Yapay zekâya ulaşılamadı: ${(e as Error).message}` };
  }
  if (r.tur !== 'tamam') return { tur: 'ret', mesaj: r.mesaj };
  let ham: { metinler?: Array<{ baslik?: unknown; metin?: unknown }> };
  try {
    ham = JSON.parse(r.metin);
  } catch {
    return { tur: 'ret', mesaj: 'Yapay zekânın cevabı okunamadı.' };
  }
  const liste = (ham.metinler ?? []).filter((x) => typeof x.baslik === 'string' && typeof x.metin === 'string').slice(0, adet);
  if (liste.length === 0) return { tur: 'ret', mesaj: 'Yapay zekâ metin döndürmedi.' };
  const izinli = [...marka, o.yasalUyari ?? '', t.ad];
  const notlar: string[] = [];
  const metinler: Array<{ varlikId: string | null; baslik: string; metin: string }> = [];
  for (const [i, x] of liste.entries()) {
    let baslik = String(x.baslik).trim();
    let metin = String(x.metin).trim();
    const uydurulan = yzMetniDenetle(`${baslik} ${metin}`, izinli);
    if (uydurulan.length > 0) return { tur: 'ret', mesaj: `Yapay zekâ marka bilgisinde olmayan sayı yazdı (${uydurulan.join(', ')}); metin kullanılmadı.` };
    if (baslik.length > BASLIK_EN_COK) {
      const kes = baslik.slice(0, BASLIK_EN_COK + 1);
      baslik = (kes.lastIndexOf(' ') > 10 ? kes.slice(0, kes.lastIndexOf(' ')) : kes.slice(0, BASLIK_EN_COK)).trim();
      notlar.push(`Metin ${i + 1}: başlık ${BASLIK_EN_COK} karaktere kısaltıldı.`);
    }
    if (o.yasalUyari && !metinUyariIceriyor(metin, o.yasalUyari)) {
      metin = `${o.yasalUyari} ${metin}`;
      notlar.push(`Metin ${i + 1}: zorunlu yasal uyarı metnin başına eklendi.`);
    }
    metinler.push({ varlikId: varliklar[i]?.id ?? null, baslik, metin });
  }
  if (liste.length < varliklar.length) notlar.push(`${varliklar.length} görsel için ${liste.length} metin yazıldı; kalan görseller kullanılmadı.`);
  return { tur: 'tamam', metinler, notlar };
}
