import { createHash } from 'node:crypto';
import { z } from 'zod';
import {
  BOOST_HEDEFI_ADI,
  BOOST_HEDEFI_YUZEYLERI,
  BOOST_HEDEFLERI,
  formatMoney,
  type BoostHedefTuru,
} from '@advetics/shared';
import { AracArgumanHatasi } from './okuma-araclari';

/**
 * ═══ MCP BOOST'U — SAF PARÇALAR (`docs/okuma-api/MCP-BOOST-MIMARI.md`) ═══
 *
 * Argüman biçimi, önizleme kodu, taahhüt, üst sınır ve onay özeti burada:
 * servis veritabanı ve Meta okumasını yapıp bu fonksiyonlara veriyor.
 * Saf olmaları teste bağlanabilmeleri için: önizleme kodunun bir alanı
 * atlaması, kullanıcının görmediği bir değeri onaylaması demek.
 */

const uuid = z.string().uuid('UUID biçiminde olmalı');
const micros = z.string().regex(/^\d{1,18}$/, 'micros dizge, yalnız rakam');

/** Kullanıcıdan gelen kitle: TAM BİR YOL seçilir (kayıtlı kitle, Meta kayıtlı kitlesi ya da elle). */
export const boostKitleSemasi = z
  .object({
    kitle_id: uuid.optional(),
    meta_kayitli_kitle_id: z.string().regex(/^\d{1,25}$/, 'Meta kayıtlı kitle kimliği sayısal').optional(),
    konumlar: z
      .array(
        z.object({
          key: z.string().min(1).max(64),
          type: z.enum(['country', 'region', 'city']),
          ad: z.string().trim().min(1).max(200).optional(),
        }),
      )
      .min(1, 'En az bir konum; ülke geneli için {"key": "TR", "type": "country"}')
      .max(25)
      .optional(),
    yas_min: z.number().int().min(18).max(65).optional(),
    yas_max: z.number().int().min(18).max(65).optional(),
    cinsiyet: z.enum(['all', 'male', 'female']).optional(),
    ilgiler: z
      .array(z.object({ id: z.string().regex(/^\d{1,25}$/), name: z.string().trim().min(1).max(200) }))
      .max(25)
      .optional(),
  })
  .strict();
export type BoostKitleGirdisi = z.infer<typeof boostKitleSemasi>;

/** `boost_onizle` ve `boost_olustur`un ORTAK argümanı. */
export const boostArgumanSemasi = {
  workspace_id: uuid,
  gonderi_id: uuid,
  hedef: z.enum(BOOST_HEDEFLERI).optional(),
  hedef_adres: z.string().trim().url('Geçerli bir adres').max(2000).optional(),
  kitle: boostKitleSemasi.optional(),
  butce: z.object({ tip: z.enum(['gunluk', 'toplam']), tutar_micros: micros }).strict().optional(),
  sure_gun: z.number().int().min(1).max(30).optional(),
  on_ayar_kullan: z.boolean().optional(),
};

/** Ön ayarın MCP'ye gelen hâli (servis veritabanından okur). */
export interface BoostOnAyari {
  goal: 'engagement' | 'reach' | 'profile_visits';
  butce: { kip: 'daily' | 'lifetime'; micros: bigint } | null;
  sureGun: number;
  savedAudienceId: string | null;
  locations: Array<{ key: string; type: 'country' | 'region' | 'city'; label?: string }>;
  ageMin: number;
  ageMax: number;
  genders: 'all' | 'male' | 'female';
  interests: Array<{ id: string; name: string }>;
  kitleSablonuId: string | null;
}

/** Ön ayarın amacı → boost hedefi. */
export const ON_AYAR_HEDEFI: Record<BoostOnAyari['goal'], BoostHedefTuru> = {
  engagement: 'etkilesim',
  reach: 'erisim',
  profile_visits: 'profil_ziyareti',
};

/**
 * Argüman + (isteğe bağlı) ön ayar → çözülmüş seçim. Eksik alan TAHMİN
 * EDİLMİYOR: ön ayar yoksa ya da kullanılmıyorsa hedef, kitle, bütçe ve
 * süre kullanıcıdan gelmek zorunda ve hata hangisinin eksik olduğunu SÖYLÜYOR.
 * `kaynak` hangi alanın ön ayardan geldiğini yazar (özette görünür).
 */
export interface BoostSecimi {
  hedef: BoostHedefTuru;
  hedefAdres: string | null;
  kitle: { tur: 'kayitli'; id: string } | { tur: 'meta_kayitli'; id: string } | { tur: 'elle'; girdi: ElleKitle };
  butce: { kip: 'daily' | 'lifetime'; micros: bigint };
  sureGun: number;
  onAyardan: string[];
}

export interface ElleKitle {
  locations: Array<{ key: string; type: 'country' | 'region' | 'city'; label?: string }>;
  ageMin: number;
  ageMax: number;
  genders: 'all' | 'male' | 'female';
  interests: Array<{ id: string; name: string }>;
}

export function boostSecimiCoz(
  a: {
    hedef?: BoostHedefTuru;
    hedef_adres?: string;
    kitle?: BoostKitleGirdisi;
    butce?: { tip: 'gunluk' | 'toplam'; tutar_micros: string };
    sure_gun?: number;
    on_ayar_kullan?: boolean;
  },
  onAyar: BoostOnAyari | null,
): BoostSecimi {
  if (a.on_ayar_kullan && !onAyar) {
    throw new AracArgumanHatasi('Bu gönderinin sayfasında açık bir boost ön ayarı yok. Hedef, kitle, bütçe ve süreyi kullanıcıya sor ve elle ver.');
  }
  const oa = a.on_ayar_kullan ? onAyar : null;
  const onAyardan: string[] = [];
  const eksik: string[] = [];

  let hedef = a.hedef;
  if (!hedef && oa) {
    hedef = ON_AYAR_HEDEFI[oa.goal];
    onAyardan.push('hedef');
  }
  if (!hedef) eksik.push('hedef (etkilesim, erisim, profil_ziyareti, mesaj, trafik)');

  if (hedef === 'trafik' && !a.hedef_adres) eksik.push('hedef_adres (trafik hedefi için https:// adres)');
  if (hedef !== 'trafik' && a.hedef_adres) {
    throw new AracArgumanHatasi('hedef_adres yalnız trafik hedefinde kullanılır; bu hedefte reklam gönderinin kendisine gider.');
  }
  if (a.hedef_adres && !/^https:\/\//i.test(a.hedef_adres)) {
    throw new AracArgumanHatasi('hedef_adres https:// ile başlamalı.');
  }

  let kitle: BoostSecimi['kitle'] | null = null;
  if (a.kitle) {
    kitle = kitleCoz(a.kitle);
  } else if (oa) {
    onAyardan.push('kitle');
    if (oa.savedAudienceId) kitle = { tur: 'meta_kayitli', id: oa.savedAudienceId };
    else if (oa.kitleSablonuId) kitle = { tur: 'kayitli', id: oa.kitleSablonuId };
    else
      kitle = {
        tur: 'elle',
        girdi: { locations: oa.locations, ageMin: Math.max(18, oa.ageMin), ageMax: oa.ageMax, genders: oa.genders, interests: oa.interests },
      };
  }
  if (!kitle) eksik.push('kitle (kitle_id, meta_kayitli_kitle_id ya da konumlar + yaş + cinsiyet)');

  let butce: BoostSecimi['butce'] | null = null;
  if (a.butce) {
    butce = { kip: a.butce.tip === 'gunluk' ? 'daily' : 'lifetime', micros: BigInt(a.butce.tutar_micros) };
    if (butce.micros <= 0n) throw new AracArgumanHatasi('Bütçe sıfırdan büyük olmalı.');
  } else if (oa?.butce) {
    butce = oa.butce;
    onAyardan.push('bütçe');
  }
  if (!butce) eksik.push('butce ({"tip": "gunluk" | "toplam", "tutar_micros": "..."})');

  let sureGun = a.sure_gun;
  if (!sureGun && oa) {
    sureGun = Math.min(30, Math.max(1, oa.sureGun));
    onAyardan.push('süre');
  }
  if (!sureGun) eksik.push('sure_gun (1-30)');

  if (eksik.length) {
    throw new AracArgumanHatasi(`Eksik: ${eksik.join('; ')}. Bunları kullanıcıya sor, tahmin etme.${onAyar && !a.on_ayar_kullan ? ' Sayfanın boost ön ayarı var: kullanıcı isterse on_ayar_kullan: true.' : ''}`);
  }
  return { hedef: hedef!, hedefAdres: a.hedef_adres ?? null, kitle: kitle!, butce: butce!, sureGun: sureGun!, onAyardan };
}

function kitleCoz(k: BoostKitleGirdisi): BoostSecimi['kitle'] {
  const elleVar = k.konumlar !== undefined || k.yas_min !== undefined || k.yas_max !== undefined || k.cinsiyet !== undefined || k.ilgiler !== undefined;
  const yollar = [k.kitle_id ? 1 : 0, k.meta_kayitli_kitle_id ? 1 : 0, elleVar ? 1 : 0].reduce((x, y) => x + y, 0);
  /*
   * TEK YOL. Kayıtlı kitle kendi konumunu ve yaşını taşıyor; elle alanlarla
   * birleştirmek "kesişim mi birleşim mi" sorusunu bizim cevaplamamız demek
   * (panelin elle boost kuralı, `manualBoostTargetingSchema`).
   */
  if (yollar !== 1) {
    throw new AracArgumanHatasi('kitle için TEK yol ver: kitle_id (Advetics kayıtlı kitle), meta_kayitli_kitle_id ya da konumlar + yaş + cinsiyet (+ ilgiler).');
  }
  if (k.kitle_id) return { tur: 'kayitli', id: k.kitle_id };
  if (k.meta_kayitli_kitle_id) return { tur: 'meta_kayitli', id: k.meta_kayitli_kitle_id };
  if (!k.konumlar) throw new AracArgumanHatasi('Elle kitlede konumlar zorunlu (konum_ara ile Meta anahtarını bul); ülke geneli için {"key": "TR", "type": "country"}.');
  const ageMin = k.yas_min ?? 18;
  const ageMax = k.yas_max ?? 65;
  if (ageMin > ageMax) throw new AracArgumanHatasi('yas_min yas_max\'tan büyük olamaz.');
  return {
    tur: 'elle',
    girdi: {
      locations: k.konumlar.map((l) => ({ key: l.key, type: l.type, ...(l.ad ? { label: l.ad } : {}) })),
      ageMin,
      ageMax,
      genders: k.cinsiyet ?? 'all',
      interests: k.ilgiler ?? [],
    },
  };
}

/** Yüzey uymuyorsa ERKEN ret (sağlayıcı da reddeder; burada kullanıcıya hiçbir şey açılmadan). */
export function hedefYuzeyeUyarMi(hedef: BoostHedefTuru, yuzey: 'facebook_page' | 'instagram'): string | null {
  if (BOOST_HEDEFI_YUZEYLERI[hedef].includes(yuzey)) return null;
  return `${BOOST_HEDEFI_ADI[hedef]} hedefi yalnız Instagram gönderisinde kurulabiliyor (Facebook gönderisine düğme eklenemiyor). Bu gönderide etkileşim ya da erişim seç.`;
}

/** İşlemin taahhüdü: toplamda tutar, günlükte günlük × gün. */
export function taahhut(butce: { kip: 'daily' | 'lifetime'; micros: bigint }, gun: number): bigint {
  return butce.kip === 'lifetime' ? butce.micros : butce.micros * BigInt(gun);
}

/**
 * Tek işlem üst sınırı (`MCP-BOOST-MIMARI.md` § 4). Aşılırsa onay satırı
 * AÇILMADAN ret ve sınır cümlede: kullanıcı neyi değiştireceğini bilsin.
 */
export function ustSinirDenetle(taahhutMicros: bigint, sinirMicros: bigint | null, paraBirimi: string): void {
  if (sinirMicros === null || taahhutMicros <= sinirMicros) return;
  throw new AracArgumanHatasi(
    `Bu işlemin taahhüdü ${formatMoney(taahhutMicros.toString(), paraBirimi)}; bu bağlantının tek işlem üst sınırı ${formatMoney(sinirMicros.toString(), paraBirimi)}. Tutarı düşür ya da sınırı panelde (Hesabım › Yapay zekâ bağlantısı) daha yüksek bir yazma anahtarıyla değiştir.`,
  );
}

/**
 * ÖNİZLEME KODU: çözülmüş seçimin ve hedeflemenin özeti. `boost_olustur`
 * aynı argümanlardan kodu YENİDEN hesaplıyor; tutmazsa önizleme başka bir
 * seçim için yapılmış (ya da ön ayar arada değişmiş) demek ve onay açılmıyor.
 * Kayıtlı kitlenin İÇERİĞİ de koda giriyor: kitle önizlemeden sonra
 * değişirse kullanıcı görmediği bir kitleyi onaylamasın.
 */
export function onizlemeKodu(p: {
  workspaceId: string;
  gonderiId: string;
  secim: BoostSecimi;
  targeting: Record<string, unknown> | null;
}): string {
  const s = p.secim;
  const govde = JSON.stringify([
    p.workspaceId,
    p.gonderiId,
    s.hedef,
    s.hedefAdres,
    s.kitle.tur === 'elle' ? 'elle' : `${s.kitle.tur}:${s.kitle.id}`,
    s.butce.kip,
    s.butce.micros.toString(),
    s.sureGun,
    kanonik(p.targeting),
  ]);
  return createHash('sha256').update(govde).digest('hex').slice(0, 16);
}

function kanonik(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(kanonik);
  if (v && typeof v === 'object') {
    return Object.fromEntries(
      Object.keys(v as Record<string, unknown>)
        .sort()
        .map((k) => [k, kanonik((v as Record<string, unknown>)[k])]),
    );
  }
  return v;
}

function kisalt(metin: string | null, en = 80): string {
  if (!metin) return '(metinsiz)';
  const tek = metin.replace(/\s+/g, ' ').trim();
  return tek.length > en ? `${tek.slice(0, en - 1)}…` : tek;
}

export interface BoostOzetGirdisi {
  workspaceAdi: string;
  gonderi: { yuzey: 'facebook_page' | 'instagram'; sayfa: string; tarih: string; metin: string | null; baglanti: string | null; medyaTuru: string };
  hesap: { ad: string; disKimlik: string; paraBirimi: string };
  secim: BoostSecimi;
  kitleMetni: string;
  ozelKategoriler: string[];
  kitleBuyuklugu: { alt: number; ust: number } | { okunamadi: string };
  buAyTaahhut: { micros: string; aylikButce: string | null };
}

/**
 * ONAY ÖZETİ. Para ve hedef taşıyan HER alan burada yazıyor (rehber
 * özetindeki kural): bir satır düşerse kullanıcı görmediği bir değeri
 * onaylamış olur. Boş değer "yok" diye yazılıyor, satır atlanmıyor.
 */
export function boostOnayOzeti(g: BoostOzetGirdisi): string[] {
  const s = g.secim;
  const para = (m: bigint | string) => formatMoney(m.toString(), g.hesap.paraBirimi);
  const toplam = taahhut(s.butce, s.sureGun);
  const satir: string[] = [
    `Workspace: ${g.workspaceAdi}`,
    `Gönderi: ${g.gonderi.yuzey === 'instagram' ? 'Instagram' : 'Facebook'} · ${g.gonderi.sayfa} · ${g.gonderi.tarih.slice(0, 10)} · "${kisalt(g.gonderi.metin)}"${g.gonderi.baglanti ? ` · ${g.gonderi.baglanti}` : ''}`,
    `Reklam hesabı: ${g.hesap.ad} (${g.hesap.disKimlik}) · ${g.hesap.paraBirimi}`,
    `Hedef: ${BOOST_HEDEFI_ADI[s.hedef]}${s.hedefAdres ? ` → ${s.hedefAdres}` : ''}${s.hedef === 'etkilesim' ? '' : ' (bu hedef canlıda henüz ölçülmedi; kurulumdan sonra Meta\'dan geri okunur)'}`,
    `Kitle: ${g.kitleMetni}`,
    `Yerleşim: ${g.gonderi.yuzey === 'instagram' ? `yalnız Instagram (${/reel/i.test(g.gonderi.medyaTuru) ? 'Reels' : 'akış'})` : 'Meta otomatik yerleşim'}`,
    s.butce.kip === 'lifetime'
      ? `Bütçe: ${para(s.butce.micros)} toplam (günlük ortalama ≈ ${para(s.butce.micros / BigInt(s.sureGun))})`
      : `Bütçe: ${para(s.butce.micros)} / gün × ${s.sureGun} gün = en çok ${para(toplam)}`,
    `Süre: ${s.sureGun} gün, BAŞLATILDIĞI günden sayılır`,
    `Özel kategori: ${g.ozelKategoriler.length ? g.ozelKategoriler.join(', ') : 'yok'}`,
    'kitleBuyuklugu' in g && 'alt' in g.kitleBuyuklugu
      ? `Kitle büyüklüğü (Meta tahmini, erişim değil): ${g.kitleBuyuklugu.alt.toLocaleString('tr-TR')}–${g.kitleBuyuklugu.ust.toLocaleString('tr-TR')} kişi`
      : `Kitle büyüklüğü: okunamadı (${(g.kitleBuyuklugu as { okunamadi: string }).okunamadi})`,
    `Bu ay boost taahhüdü (bu boost hariç): ${para(g.buAyTaahhut.micros)}${g.buAyTaahhut.aylikButce ? ` · aylık bütçe ${para(g.buAyTaahhut.aylikButce)}` : ' · aylık bütçe tanımlı değil'}`,
  ];
  if (s.onAyardan.length) satir.push(`Ön ayardan gelen: ${s.onAyardan.join(', ')}`);
  satir.push('Durum: DURAKLATILMIŞ kurulur, para harcamaz. Harcamayı başlatmak ayrı bir onay ister (boost_baslat).');
  return satir;
}

/** Yönetim işlemlerinin (başlat/duraklat/bütçe) özeti. */
export function boostYonetimOzeti(g: {
  islem: 'baslat' | 'duraklat' | 'butce';
  workspaceAdi: string;
  boostAdi: string;
  hesap: string;
  seviye: 'kampanya' | 'reklam seti';
  simdikiDurum: string;
  butce?: { kip: 'daily' | 'lifetime'; eski: string | null; yeni: bigint; paraBirimi: string; sureGun: number };
  yenidenZamanlama?: { baslangic: string; bitis: string } | null;
}): string[] {
  const satir = [`Workspace: ${g.workspaceAdi}`, `Boost: ${g.boostAdi}`, `Reklam hesabı: ${g.hesap}`, `Platformdaki durum (şu an): ${g.simdikiDurum}`];
  if (g.islem === 'baslat') {
    satir.push(`İşlem: BAŞLAT (${g.seviye} yayına alınır, HARCAMA BAŞLAR)`);
    if (g.yenidenZamanlama) satir.push(`Takvim: ${g.yenidenZamanlama.baslangic} → ${g.yenidenZamanlama.bitis} (süre bugünden yeniden kurulur)`);
  } else if (g.islem === 'duraklat') {
    satir.push(`İşlem: DURAKLAT (${g.seviye} durur, harcama kesilir)`);
  } else if (g.butce) {
    const b = g.butce;
    const para = (m: bigint | string) => formatMoney(m.toString(), b.paraBirimi);
    const eski = b.eski === null ? 'okunamadı' : para(b.eski);
    satir.push(`İşlem: BÜTÇE ${eski} → ${para(b.yeni)} ${b.kip === 'daily' ? '/ gün' : 'toplam'}`);
    if (b.eski !== null && BigInt(b.eski) > 0n) {
      const yuzde = Number(((b.yeni - BigInt(b.eski)) * 1000n) / BigInt(b.eski)) / 10;
      satir.push(`Değişim: ${yuzde > 0 ? '+' : ''}${yuzde.toLocaleString('tr-TR')}%`);
    }
    satir.push('Müşterinin reklam hesabıysa bütçe değişikliği MÜŞTERİNİN onayıyla yapılmalı.');
  }
  return satir;
}
