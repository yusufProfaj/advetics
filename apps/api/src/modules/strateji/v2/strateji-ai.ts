import {
  AI_METIN_BOLUMLERI,
  REHBER_AMACLARI,
  STRATEJI_ASAMA_ETIKETI,
  AMAC_ASAMASI,
  stratejiMetniDenetle,
  type RehberAmacKodu,
} from '@advetics/shared';
import { metinIsteOlcumlu, YapayZekaHatasi, type MetinUretici } from '../../../yapay-zeka/gemini';

/**
 * ═══ STRATEJİ METNİ — YAPAY ZEKÂ YALNIZ METİN YAZAR ═══
 * (YENIDEN-TASARIM.md § 2.3 B)
 *
 * GİRDİ SAYI TAŞIMAZ (kreatif zekâ brief'i deseni): marka alanları, site
 * taramasının sonucu, kalemlerin amaç KODLARI ve aşamaları. Bütçe, tahmin,
 * geçmiş maliyet modele GİTMEZ; gitseydi model onları cümleye yazar ve
 * sayı yasağı cümleyi reddederdi — ya da daha kötüsü, sayıyı kendi
 * yuvarlamasıyla yeniden yazardı.
 *
 * ÇIKTI SAYI TAŞIYAMAZ (`stratejiMetniDenetle`, `sayi-yasagi.ts`). Reddedilen
 * alan BİR KEZ yeniden istenir; yine düşerse alan BOŞ kalır ve neden döner
 * (`OneriBolumMetni.neden`): bir rakamı silip cümleyi bırakmak anlamını
 * sessizce değiştirir.
 *
 * REKLAM METNİ BURADA DEĞİL. Başlık ve ana metin rehberin metin motorundan
 * (`RehberService.metinOnerAlanlardan`): reklam metninde "2+1" gibi meşru
 * sayılar olabilir ve iki ayrı metin motoru ayrışırdı.
 */

/** Yapay zekâ metni ya da üretilemediyse NEDENİ (boş alanın sebebi yazılır). */
export type OneriBolumMetni =
  | { metin: string; kaynak: 'ai' }
  | { metin: null; neden: 'yapay_zeka_yok' | 'sayi_var' | 'bos' | 'hata'; aciklama: string };

export interface StratejiMetinleri {
  bolumler: Record<(typeof AI_METIN_BOLUMLERI)[number], OneriBolumMetni>;
  kalemMetinleri: Array<{ kreatifYonergesi: OneriBolumMetni; kitleTarifi: OneriBolumMetni }>;
}

export interface StratejiAiGirdisi {
  marka: { ad: string | null; sektor: string | null; urunler: string[]; vaatler: string[]; hedefKitle: string | null; bilgi: string | null; uslup: string | null };
  site: { adres: string | null; tarama: string | null };
  kalemler: Array<{ amac: RehberAmacKodu }>;
  /** Geçmişte veri olan amaçlar (yalnız KOD; maliyet değil). */
  gecmisAmaclari: RehberAmacKodu[];
}

export const STRATEJI_AI_SISTEMI = [
  'Bir dijital reklam ajansı için müşteriye giden strateji belgesinin metin bölümlerini yazıyorsun.',
  'Türkçe, sade, reklam bilmeyen bir işletme sahibinin anlayacağı dilde yaz. Teknik terim kullanma.',
  'HİÇBİR RAKAM, YÜZDE, ORAN, ÇARPAN YAZMA ("yüzde", "iki kat", "yarısından fazla" dahil). Sayılar belgeye başka yerden giriyor.',
  'Bilmediğin şeyi uydurma: marka bilgisinde olmayan ürün, ödül, fiyat, kampanya yazma. Bilgi azsa genel ve dürüst yaz.',
  'Kreatif yönergesi görselin/videonun ne GÖSTERMESİ ve ne SÖYLEMESİ gerektiğini anlatır; reklam metni yazma.',
  'Kitle tarifi kime anlattığımızı düz dille söyler; bir hedefleme ayarı DEĞİLDİR.',
].join('\n');

export const STRATEJI_AI_SEMASI = {
  type: 'object',
  properties: {
    ozet: { type: 'string', description: 'Üç cümle: ne yapacağız, neden, ne bekliyoruz (rakamsız).' },
    isletme: { type: 'string', description: 'İşletmenin ne sattığı, kime, öne çıkan vaatleri; iki-dört cümle.' },
    kitle: { type: 'string', description: 'Kime anlatıyoruz; iki-üç cümle.' },
    kreatif: { type: 'string', description: 'Genel kreatif yön ve mesaj; iki-dört cümle.' },
    kalemler: {
      type: 'array',
      description: 'Kampanya sırasıyla, her kampanya için bir öğe.',
      items: {
        type: 'object',
        properties: {
          kreatifYonergesi: { type: 'string', description: 'Bu kampanyanın görsel/video yönergesi; iki-üç cümle.' },
          kitleTarifi: { type: 'string', description: 'Bu kampanyanın anlattığı kişi; bir-iki cümle.' },
        },
        required: ['kreatifYonergesi', 'kitleTarifi'],
      },
    },
  },
  required: ['ozet', 'isletme', 'kitle', 'kreatif', 'kalemler'],
} as const;

/** İstem metni — SAYI TAŞIMAZ (testte `sayiTasiyor` ile kilitli). */
export function stratejiAiIstemi(g: StratejiAiGirdisi): string {
  const m = g.marka;
  const satir = (etiket: string, deger: string | null | undefined) => (deger && deger.trim() ? `${etiket}: ${deger.trim()}` : `${etiket}: (Marka Merkezi'nde boş)`);
  const kalemler = g.kalemler.map((k, i) => {
    const a = REHBER_AMACLARI[k.amac];
    return `Kampanya ${harfSira(i)}: ${a.ekranAdi} (${STRATEJI_ASAMA_ETIKETI[AMAC_ASAMASI[k.amac]]} aşaması). Kişi şunu alacak: ${a.neAlacaksin}`;
  });
  return [
    satir('İşletme', m.ad),
    satir('Sektör', m.sektor),
    satir('Ürünler', m.urunler.join(', ')),
    satir('Vaatler', m.vaatler.join('; ')),
    satir('Hedef kitle (işletmenin tarifi)', m.hedefKitle),
    satir('Marka bilgisi', m.bilgi),
    satir('Üslup', m.uslup),
    g.site.adres ? `Web sitesi var (${alanAdi(g.site.adres)}).` : 'Web sitesi yok ya da girilmedi.',
    g.site.tarama ? `Site taramasının sonucu: ${g.site.tarama}` : null,
    g.gecmisAmaclari.length
      ? `Geçmişte reklam verilen amaçlar: ${g.gecmisAmaclari.map((a) => REHBER_AMACLARI[a].ekranAdi).join(', ')}.`
      : 'Bu hesapta geçmiş reklam verisi yok.',
    '',
    'Kampanyalar (sırayla):',
    ...kalemler,
  ]
    .filter((x): x is string => x !== null)
    .join('\n')
    // Girdi alanlarında (ürün adı, adres) rakam olabilir; modele GİTMESİN:
    // örnek rakam modelin çıktıya rakam taşımasının en kısa yolu.
    .replace(/[\p{Nd}%％]+/gu, '');
}

/** Kampanya sırası HARFLE (A, B, C): "Kampanya 1" bile isteme rakam sokardı. */
function harfSira(i: number): string {
  return String.fromCharCode(65 + (i % 26));
}

function alanAdi(adres: string): string {
  try {
    return new URL(adres.startsWith('http') ? adres : `https://${adres}`).hostname;
  } catch {
    return adres;
  }
}

type HamCevap = {
  ozet?: unknown;
  isletme?: unknown;
  kitle?: unknown;
  kreatif?: unknown;
  kalemler?: Array<{ kreatifYonergesi?: unknown; kitleTarifi?: unknown }>;
};

function denetle(ham: unknown): OneriBolumMetni {
  if (typeof ham !== 'string' || ham.trim().length === 0) return { metin: null, neden: 'bos', aciklama: 'Yapay zekâ bu bölümü boş bıraktı.' };
  const metin = ham.trim().slice(0, 2000);
  const d = stratejiMetniDenetle(metin);
  if (!d.tamam) {
    return d.neden === 'sayi_var'
      ? { metin: null, neden: 'sayi_var', aciklama: 'Öneri sayı içerdiği için kullanılmadı; sayılar yalnız hesabın verisinden yazılır.' }
      : { metin: null, neden: 'bos', aciklama: 'Yapay zekâ bu bölümü boş bıraktı.' };
  }
  return { metin, kaynak: 'ai' };
}

function hepsiBos(neden: 'yapay_zeka_yok' | 'hata', aciklama: string, kalemSayisi: number): StratejiMetinleri {
  const bos: OneriBolumMetni = { metin: null, neden, aciklama };
  return {
    bolumler: Object.fromEntries(AI_METIN_BOLUMLERI.map((b) => [b, bos])) as StratejiMetinleri['bolumler'],
    kalemMetinleri: Array.from({ length: kalemSayisi }, () => ({ kreatifYonergesi: bos, kitleTarifi: bos })),
  };
}

async function iste(yz: MetinUretici, metin: string): Promise<HamCevap> {
  const r = await metinIsteOlcumlu(yz, { sistem: STRATEJI_AI_SISTEMI, metin, enCokCikti: 3_000, jsonSemasi: STRATEJI_AI_SEMASI as unknown as Record<string, unknown> });
  if (r.sonuc.tur !== 'tamam') throw new YapayZekaHatasi(null, r.sonuc.mesaj);
  try {
    return JSON.parse(r.sonuc.metin) as HamCevap;
  } catch {
    throw new YapayZekaHatasi(null, 'Yapay zekânın cevabı okunamadı.');
  }
}

/**
 * Bölüm ve kalem metinleri. `yz` yoksa (anahtar tanımlı değil) hepsi boş ve
 * NEDEN "yapay zekâ bağlı değil"; çağrı düşerse NEDEN "hata" + mesaj.
 * Motorun kalemleri yine döner: metin yokluğu öneriyi düşürmez.
 */
export async function stratejiMetinleri(yz: MetinUretici | null, g: StratejiAiGirdisi): Promise<StratejiMetinleri> {
  if (!yz) return hepsiBos('yapay_zeka_yok', 'Yapay zekâ bağlı değil; metni ajans yazar.', g.kalemler.length);
  const istem = stratejiAiIstemi(g);
  let ilk: HamCevap;
  try {
    ilk = await iste(yz, istem);
  } catch (e) {
    return hepsiBos('hata', `Yapay zekâ cevap vermedi: ${e instanceof Error ? e.message : String(e)}`, g.kalemler.length);
  }
  const bolumler = Object.fromEntries(AI_METIN_BOLUMLERI.map((b) => [b, denetle(ilk[b])])) as StratejiMetinleri['bolumler'];
  const kalemMetinleri = g.kalemler.map((_, i) => ({
    kreatifYonergesi: denetle(ilk.kalemler?.[i]?.kreatifYonergesi),
    kitleTarifi: denetle(ilk.kalemler?.[i]?.kitleTarifi),
  }));

  // BİR KEZ YENİDEN: yalnız sayı yasağına takılan alanlar için, açık uyarıyla.
  const reddedilen = (m: OneriBolumMetni | undefined) => m !== undefined && m.metin === null && m.neden === 'sayi_var';
  const yeniden = AI_METIN_BOLUMLERI.some((b) => reddedilen(bolumler[b])) || kalemMetinleri.some((k) => reddedilen(k.kreatifYonergesi) || reddedilen(k.kitleTarifi));
  if (yeniden) {
    let ikinci: HamCevap | null = null;
    try {
      ikinci = await iste(yz, `${istem}\n\nÖNCEKİ CEVAPTA RAKAM YA DA ORAN VARDI. Bu sefer hiçbir sayı, yüzde ya da oran yazma.`);
    } catch {
      ikinci = null;
    }
    if (ikinci) {
      for (const b of AI_METIN_BOLUMLERI) if (reddedilen(bolumler[b])) bolumler[b] = denetle(ikinci[b]);
      kalemMetinleri.forEach((k, i) => {
        if (reddedilen(k.kreatifYonergesi)) k.kreatifYonergesi = denetle(ikinci!.kalemler?.[i]?.kreatifYonergesi);
        if (reddedilen(k.kitleTarifi)) k.kitleTarifi = denetle(ikinci!.kalemler?.[i]?.kitleTarifi);
      });
    }
  }
  return { bolumler, kalemMetinleri };
}

// ─── "Kime anlatıyoruz" (adım adım akış, 4. adım) ────────────────────────

const KITLE_SEMASI = {
  type: 'object',
  properties: { kitle: { type: 'string', description: 'Kime anlatıyoruz; iki-üç cümle, rakamsız.' } },
  required: ['kitle'],
} as const;

/**
 * Kitle tarifi — belgenin aynı sistemi, aynı istemi ve aynı sayı yasağı;
 * yalnız tek alan isteniyor. "Yeniden yaz"da önceki tarif modele "bundan
 * FARKLI yaz" diye gidiyor (rakamları istemin geri kalanı gibi süzülerek):
 * aynı girdiyle ikinci çağrı çoğu zaman aynı cümleyi döndürür ve düğme
 * hiçbir şey yapmıyor gibi görünür.
 *
 * Sayı yasağına takılırsa BİR KEZ yeniden istenir; yine düşerse metin yok
 * ve NEDENİ döner: kullanıcı kutuya kendisi yazar.
 */
export async function kitleTarifiUret(yz: MetinUretici | null, g: StratejiAiGirdisi, onceki: string | null): Promise<{ tur: 'metin'; metin: string } | { tur: 'yok'; neden: string }> {
  if (!yz) return { tur: 'yok', neden: 'Yapay zekâ bağlı değil; tarifi sen yaz.' };
  const ek = onceki ? `\n\nÖnceki tarif şuydu, bundan FARKLI bir açıdan yaz: ${onceki.replace(/[\p{Nd}%％]+/gu, '')}` : '';
  const istem = `${stratejiAiIstemi(g)}\n\nYalnız "kitle" alanını yaz: bu işletmenin reklamları kime anlatmalı.${ek}`;
  const tekIstek = async (metin: string): Promise<OneriBolumMetni> => {
    const r = await metinIsteOlcumlu(yz, { sistem: STRATEJI_AI_SISTEMI, metin, enCokCikti: 600, jsonSemasi: KITLE_SEMASI as unknown as Record<string, unknown> });
    if (r.sonuc.tur !== 'tamam') throw new YapayZekaHatasi(null, r.sonuc.mesaj);
    let ham: { kitle?: unknown };
    try {
      ham = JSON.parse(r.sonuc.metin) as { kitle?: unknown };
    } catch {
      throw new YapayZekaHatasi(null, 'Yapay zekânın cevabı okunamadı.');
    }
    return denetle(ham.kitle);
  };
  try {
    let m = await tekIstek(istem);
    if (m.metin === null && m.neden === 'sayi_var') m = await tekIstek(`${istem}\n\nÖNCEKİ CEVAPTA RAKAM YA DA ORAN VARDI. Bu sefer hiçbir sayı, yüzde ya da oran yazma.`);
    return m.metin === null ? { tur: 'yok', neden: m.aciklama } : { tur: 'metin', metin: m.metin };
  } catch (e) {
    return { tur: 'yok', neden: `Yapay zekâ cevap vermedi: ${e instanceof Error ? e.message : String(e)}` };
  }
}
