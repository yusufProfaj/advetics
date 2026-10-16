import {
  AMAC_ASAMASI,
  OLCUM_TURU_AMACLARI,
  REHBER_AMACLARI,
  REHBER_KAPALI_SEBEBI,
  REHBER_PLATFORMLARI,
  amacGunlukAsgari,
  oncelikAgirliklari,
  oncelikPaylari,
  VARSAYILAN_META_PAYI,
  butceBol,
  donemGunSayisi,
  gunlukEsdeger,
  kalemTahmini,
  platformGorunurMu,
  siteYokRehberKapisi,
  yarin,
  type KalemTahmini,
  type OlcumTuru,
  type StratejiKalemiGirdisi,
  type RehberAmacKodu,
  type RehberKonumu,
  type RehberPlatformu,
  type RiskBaglami,
  type StratejiKalemi,
  type TahminYokNedeni,
} from '@advetics/shared';

/**
 * ═══ ADVSTRATEGY v2 — STRATEJİ MOTORU (SAF) ═══
 * (docs/advstrategy/YENIDEN-TASARIM.md § 2.3 A)
 *
 * SAYILAR BURADAN, METİNLER YAPAY ZEKÂDAN. Bu dosya ağa, veritabanına ve
 * saate dokunmuyor: bütün girdi `MotorGirdisi`nde ve test onu ÇALIŞTIRARAK
 * sınıyor (`motor.spec.ts`). Yapay zekâ sayı üretemez (`stratejiMetniDenetle`);
 * bir sayının kaynağı ya hesabın kendi verisi (`veri`) ya da burada yazılı
 * bir kural (`kural`).
 *
 * AJAN 2 SAPMASI (§ 9.7): belge motoru `packages/shared/src/strateji/motor.ts`
 * olarak düşünmüştü. Panel motoru KOŞMUYOR (öneriyi sunucudan alıyor), yani
 * shared'a koymak iki tarafa da derlenen ama tek tarafın çağırdığı bir kod
 * olurdu. Kapılar (açılış, site yok, bütçe bölme, günlük eşdeğer, tahmin)
 * shared'daki TEK fonksiyonlardan çağrılıyor; ikinci bir kural yazılmadı.
 *
 * PLATFORMLAR TOPLANMAZ. Meta ve Google dönüşümü farklı tanım ve atıf
 * penceresiyle sayılıyor; v1'in "iki platformun dönüşüm toplamına göre
 * böl" kuralı elmayla armudu topluyordu (§ 1.3). Pay yalnız AYNI amacın iki
 * platformdaki KENDİ sonuç başı maliyetinden, ters orantıyla.
 */

/** Meta'nın öğrenme rehberi: haftada ~50 optimizasyon olayı (`OGRENME_HAFTALIK_SONUC` ile aynı sayı). */
export const OGRENME_HAFTALIK = 50n;
/** Veriden gelen pay bu aralığa kırpılır: rehber 10-90 kabul ediyor ama tek ayın şansı payı uca itmesin. */
export const PAY_ALT = 30;
export const PAY_UST = 70;

/** Otomatik seçimde dönüşüm amaçlarının sırası (§ 2.3 kural 1). */
export const DONUSUM_SIRASI: readonly RehberAmacKodu[] = ['FORM', 'WHATSAPP', 'TELEFON', 'SATIS'];

/** Bir amaç × platformun geçmişi: ya aylar ya da tahmin edilmemesinin NEDENİ. */
export type GecmisSonucu =
  | { tur: 'aylar'; aylar: ReadonlyArray<{ harcamaMicros: bigint; sonuc: number }> }
  | { tur: 'yok'; neden: TahminYokNedeni };

export interface MotorGirdisi {
  toplamMicros: bigint;
  paraBirimi: string;
  donem: { baslangic: string; bitis: string };
  /** İstanbul takvimiyle bugün; kalem en erken YARIN başlar (N-09). */
  bugun: string;
  /** Marka Merkezi'nin ana amacı (rehber koduna çevrilmiş); yoksa `null`. */
  anaAmac: RehberAmacKodu | null;
  /** Üç hâlli: `null` = beyan okunamadı (kapatmaz). */
  siteYok: boolean | null;
  kullanilmayan: ReadonlySet<RehberPlatformu>;
  hesap: Record<RehberPlatformu, boolean>;
  ajansYoneticisi: boolean;
  olcum: RiskBaglami['olcum'];
  /** Günlük asgari; `null` = bilinmiyor (Meta okunamadı / Google Arama'nın asgarisi yok). */
  asgari: { meta: bigint | null; googleTalepYaratma: bigint | null };
  gecmis: (amac: RehberAmacKodu, p: RehberPlatformu) => GecmisSonucu;
  videoVarligiVar: boolean;
  adresKonumuVar: boolean;
  /** Bölge adımının seçimi ya da Marka Merkezi'nin varsayılan kitle konumları; boşsa Türkiye. */
  konumlar: readonly RehberKonumu[];
  /** Konumların kaynağı (rozet): sihirbazda seçildiyse `ajans`, Marka Merkezi'nden geldiyse `marka`. Verilmezse `marka`. */
  konumKaynagi?: 'marka' | 'ajans';
  /** En çok seçili kelimesi olan grup (Google Arama kurgusu için). */
  kelimeGrubu: string | null;
}

/** Motorun bir kalemi (henüz kayıtlı değil). Servis bunu `StratejiKalemi`ne çevirir. */
export interface OnerilenKalem extends Omit<StratejiKalemiGirdisi, 'id' | 'butce'> {
  butceMicros: string;
  tahmin: Record<RehberPlatformu, KalemTahmini>;
  kaynaklar: StratejiKalemi['kaynaklar'];
  /** Motorun bu kalem için verdiği kararların cümleleri. */
  gerekceler: string[];
}

export interface MotorSonucu {
  kalemler: OnerilenKalem[];
  notlar: string[];
}

const PLATFORM_ADI: Record<RehberPlatformu, string> = { meta: 'Meta', google: 'Google' };
const TURKIYE: RehberKonumu = { tur: 'country', key: 'TR', etiket: 'Türkiye', ulkeKodu: 'TR' };

export function amacOlcumTuru(amac: RehberAmacKodu): OlcumTuru | null {
  for (const [t, amaclar] of Object.entries(OLCUM_TURU_AMACLARI) as Array<[OlcumTuru, readonly RehberAmacKodu[]]>) {
    if (amaclar.includes(amac)) return t;
  }
  return null;
}

/**
 * Bu amaç bu platformda bu workspace için kurulabilir mi — rehberin KENDİ
 * kapılarıyla (açılış, site yok) + workspace'in durumu (hesap, "kullanmıyorum").
 */
export function platformKapisi(
  amac: RehberAmacKodu,
  p: RehberPlatformu,
  g: Pick<MotorGirdisi, 'ajansYoneticisi' | 'kullanilmayan' | 'hesap' | 'siteYok'>,
): { acik: true } | { acik: false; sebep: string } {
  const google = REHBER_AMACLARI[amac].google;
  if (p === 'google' && google.kurgu === null) return { acik: false, sebep: google.sebep };
  if (!platformGorunurMu(amac, p, g.ajansYoneticisi)) {
    return { acik: false, sebep: REHBER_KAPALI_SEBEBI[amac]?.[p] ?? 'Bu platform bu amaç için AdvCampaign’de henüz açık değil.' };
  }
  if (g.kullanilmayan.has(p)) return { acik: false, sebep: `Kurulumda "${PLATFORM_ADI[p]}'u kullanmıyoruz" dendi.` };
  if (!g.hesap[p]) return { acik: false, sebep: `${PLATFORM_ADI[p]} reklam hesabı bu workspace’e atanmadı.` };
  const site = siteYokRehberKapisi(amac, p, g.siteYok);
  if (!site.acik) return { acik: false, sebep: site.sebep };
  return { acik: true };
}

/**
 * ═══ HİÇ HESABI OLMAYAN WORKSPACE'TE STRATEJİ ═══
 *
 * Strateji bir PLAN: müşteri yeni geldiğinde, hesaplar atanmadan önce
 * hazırlanıyor. "Hesap atanmadı" kapısı her hedefi kapatıyordu; yeni
 * workspace'te (2026-10-16, Eren Altay) hedef adımında hiçbir kart
 * seçilemiyor ve strateji hiç açılamıyordu.
 *
 * KURAL DAR: yalnız Meta'da da Google'da da hesap YOKSA ikisi açık sayılır
 * ve neden NOT olarak yazılır. Bir platformun hesabı varsa öbürü kapalı
 * kalır: o durumda eksik hesap bir eksiklik değil, büyük ihtimalle tercih.
 * Kurulum (AdvCampaign) hesabı yine kendi kapısıyla ister.
 */
export const HESAPSIZ_STRATEJI_NOTU =
  'Bu workspace’e henüz Meta ya da Google reklam hesabı atanmadı. Strateji hazırlanabilir; kampanyalar hesap atanınca kurulur ve platformun asgari bütçe kontrolü o zaman yapılır.';

export function stratejiHesapKapisi(h: { meta: boolean; google: boolean }): { hesap: { meta: boolean; google: boolean }; not: string | null } {
  if (!h.meta && !h.google) return { hesap: { meta: true, google: true }, not: HESAPSIZ_STRATEJI_NOTU };
  return { hesap: h, not: null };
}

/** Ölçüm hücresi: `true` hazır, `false` kurulmalı, `null` bilinmiyor; ölçüm gerektirmeyen amaç `true`. */
export function olcumHazir(amac: RehberAmacKodu, p: RehberPlatformu, olcum: RiskBaglami['olcum']): boolean | null {
  const tur = amacOlcumTuru(amac);
  if (tur === null) return true;
  const h = olcum[tur]?.[p];
  return h === undefined ? null : h;
}

/** Aylık geçmişten ORTALAMA sonuç başı maliyet (micros); geçerli ay yoksa `null`. Platformlar AYRI. */
export function sonucBasiMaliyet(s: GecmisSonucu): bigint | null {
  if (s.tur !== 'aylar') return null;
  let h = 0n;
  let n = 0n;
  for (const a of s.aylar) {
    const sonuc = BigInt(Math.round(a.sonuc * 10_000));
    // Sıfır sonuçlu ay "sonsuz maliyet": ortalamaya girmez (kalemTahmini ile aynı kural).
    if (a.harcamaMicros <= 0n || sonuc <= 0n) continue;
    h += a.harcamaMicros;
    n += sonuc;
  }
  return n === 0n ? null : (h * 10_000n) / n;
}

/** Pay kuralı (§ 2.3 kural 4): iki maliyet de varsa ters orantılı, 30-70; yoksa varsayılan. */
export function metaPayiHesapla(cpaMeta: bigint | null, cpaGoogle: bigint | null): { pay: number; kaynak: 'veri' | 'kural'; cumle: string } {
  if (cpaMeta === null || cpaGoogle === null || cpaMeta + cpaGoogle === 0n) {
    return { pay: VARSAYILAN_META_PAYI, kaynak: 'kural', cumle: 'İki platformun bu amaçta karşılaştırılabilir geçmişi yok; bütçe eşit bölündü.' };
  }
  // Ucuz platform daha çok pay alır: Meta payı = Google maliyeti / toplam.
  const ham = Number((cpaGoogle * 1000n) / (cpaMeta + cpaGoogle)) / 10;
  const kirpik = Math.min(PAY_UST, Math.max(PAY_ALT, Math.round(ham)));
  const ucuz = cpaMeta <= cpaGoogle ? 'Meta' : 'Google';
  const kirpildi = kirpik !== Math.round(ham);
  return {
    pay: kirpik,
    kaynak: 'veri',
    cumle: `${ucuz}'da sonuç başı maliyet daha düşük olduğu için payı daha büyük${kirpildi ? '; tek platforma yığılmasın diye pay sınırda tutuldu' : ''}.`,
  };
}

/** `gün × günlük` en az tutar: asgari ve öğrenme tabanının BÜYÜĞÜ; ikisi de bilinmiyorsa `null`. */
export function platformTabani(
  amac: RehberAmacKodu,
  p: RehberPlatformu,
  gun: number,
  g: Pick<MotorGirdisi, 'asgari' | 'gecmis'>,
): { taban: bigint | null; asgari: bigint | null; ogrenme: bigint | null } {
  const asgariGunluk = gunlukAsgari(amac, p, g.asgari);
  const asgari = asgariGunluk === null ? null : asgariGunluk * BigInt(gun);
  const cpa = sonucBasiMaliyet(g.gecmis(amac, p));
  // Haftada ~50 sonuç × dönemin hafta sayısı × sonuç başı maliyet. Yalnız
  // geçmiş varsa: geçmişsiz bir "50 × tahmini maliyet" uydurma olurdu.
  const ogrenme = cpa === null ? null : (cpa * OGRENME_HAFTALIK * BigInt(gun)) / 7n;
  // SIFIR TABAN BİLGİ DEĞİL: Google Arama'nın asgarisi yok (`0n`) ve onu
  // "taban bilindi, sıfır" saymak bütçenin tamamını tanıtıma verip ana
  // kalemi SIFIR tutarla bırakıyordu (testte yakalandı).
  const bilinen = [asgari, ogrenme].filter((x): x is bigint => x !== null && x > 0n);
  return { taban: bilinen.length ? bilinen.reduce((a, b) => (b > a ? b : a)) : null, asgari, ogrenme };
}

/**
 * Platformun GÜNLÜK asgarisi bu amaçta. Google Arama'nın resmî asgarisi yok
 * (rehber de kontrol etmiyor): `0n` = sınır yok. Talep Yaratma'nınki 5 USD
 * karşılığı (bilinmiyorsa `null`). Maks. Performans'ınki ölçülmedi: `null`.
 */
export function gunlukAsgari(amac: RehberAmacKodu, p: RehberPlatformu, asgari: MotorGirdisi['asgari']): bigint | null {
  // TEK KURAL shared'da: sihirbazın bütçe adımı aynı fonksiyonla "yeter /
  // yetmez" diyor. İki kopya ayrışırsa adım ilerletir, plan asgarinin
  // altında bir kampanya önerir.
  return amacGunlukAsgari(amac, p, asgari);
}

function tahminYok(neden: TahminYokNedeni): KalemTahmini {
  return { tur: 'yok', neden };
}

interface KalemTaslagi {
  amac: RehberAmacKodu;
  platformlar: RehberPlatformu[];
  amacKaynagi: 'marka' | 'kural' | 'ajans';
  gerekceler: string[];
}

/**
 * Bir amaç için açık platformlar ve düşenlerin cümlesi. Ölçümü KESİN yok
 * (`false`) olan platform düşer: o sonuç sayılmazsa reklam tıklamaya
 * optimize olur ve "form" diye para harcanır. `null` (okunamadı) düşürmez.
 */
type KapiGirdisi = Pick<MotorGirdisi, 'ajansYoneticisi' | 'kullanilmayan' | 'hesap' | 'siteYok' | 'olcum'>;

function acikPlatformlar(amac: RehberAmacKodu, g: KapiGirdisi, olcumSart: boolean): { acik: RehberPlatformu[]; dusen: string[] } {
  const acik: RehberPlatformu[] = [];
  const dusen: string[] = [];
  for (const p of REHBER_PLATFORMLARI) {
    const k = platformKapisi(amac, p, g);
    if (!k.acik) {
      dusen.push(`${PLATFORM_ADI[p]}: ${k.sebep}`);
      continue;
    }
    if (olcumSart && olcumHazir(amac, p, g.olcum) === false) {
      dusen.push(`${PLATFORM_ADI[p]}: “${REHBER_AMACLARI[amac].ekranAdi}” bu platformda ölçülmüyor; Kurulum › Ölçüm.`);
      continue;
    }
    acik.push(p);
  }
  return { acik, dusen };
}

/** § 2.3 kural 1: dönüşüm amacı önce; yoksa ilgi (site). */
export function anaKalemSec(g: MotorGirdisi, notlar: string[]): KalemTaslagi | null {
  if (g.anaAmac) {
    const { acik, dusen } = acikPlatformlar(g.anaAmac, g, true);
    if (acik.length > 0) return { amac: g.anaAmac, platformlar: acik, amacKaynagi: 'marka', gerekceler: dusen };
    notlar.push(`Marka Merkezi'ndeki ana amaç (“${REHBER_AMACLARI[g.anaAmac].ekranAdi}”) bu workspace'te kurulamıyor: ${dusen.join(' ')}`);
  }
  // Otomatik: ölçümü HAZIR olan ilk dönüşüm amacı. "Bilinmiyor" seçtirmez:
  // ölçülüp ölçülmediği bilinmeyen bir sonuca bütçeyi bağlamak tahmin olurdu.
  for (const amac of DONUSUM_SIRASI) {
    if (amac === g.anaAmac) continue;
    const { acik, dusen } = acikPlatformlar(amac, g, true);
    const hazir = acik.filter((p) => olcumHazir(amac, p, g.olcum) === true);
    if (hazir.length > 0) {
      return { amac, platformlar: hazir, amacKaynagi: 'kural', gerekceler: [`“${REHBER_AMACLARI[amac].ekranAdi}” ölçümü hazır olan ilk dönüşüm amacı.`, ...dusen] };
    }
  }
  notlar.push('Ölçümü hazır bir dönüşüm amacı yok; dönüşüm kampanyası önerilmedi. Kurulum › Ölçüm tamamlanınca yeniden öner.');
  if (g.anaAmac !== 'SITE') {
    // İlgi aşaması: site ziyareti tıklamayla sayılıyor, piksel şartı yok.
    const { acik, dusen } = acikPlatformlar('SITE', g, false);
    if (acik.length > 0) return { amac: 'SITE', platformlar: acik, amacKaynagi: 'kural', gerekceler: ['Dönüşüm ölçülemediği için siteye trafik önerildi.', ...dusen] };
    notlar.push(`Siteye trafik de kurulamıyor: ${dusen.join(' ')}`);
  }
  return null;
}

/** § 2.3 kural 3: tanıtım kalemi için amaç (video varlığı varsa VIDEO). */
export function tanitimKalemiSec(g: MotorGirdisi): KalemTaslagi | null {
  const adaylar: RehberAmacKodu[] = g.videoVarligiVar ? ['VIDEO', 'ERISIM'] : ['ERISIM'];
  for (const amac of adaylar) {
    const { acik, dusen } = acikPlatformlar(amac, g, false);
    if (acik.length > 0) {
      const neden = amac === 'VIDEO' ? 'Görsel arşivde video var; tanıtım video izlenmesiyle.' : 'Tanıtım bölgede erişimle.';
      const adres = amac === 'ERISIM' && g.adresKonumuVar ? ['İşletme adresinin çevresi AdvCampaign’de ayrıca seçilebilir.'] : [];
      return { amac, platformlar: acik, amacKaynagi: 'kural', gerekceler: [neden, ...adres, ...dusen] };
    }
  }
  return null;
}

function maks(a: bigint, b: bigint): bigint {
  return a > b ? a : b;
}

/** Pay verildiğinde her platformun tabanını karşılayan en küçük toplam. */
export function tabaniKarsilayanToplam(tabanlar: Partial<Record<RehberPlatformu, bigint>>, metaPayi: number | null): bigint {
  const m = tabanlar.meta ?? 0n;
  const go = tabanlar.google ?? 0n;
  if (metaPayi === null) return m + go;
  // B × pay/100 ≥ taban → B ≥ taban × 100 / pay (yukarı yuvarla).
  const yukari = (t: bigint, pay: number) => (t * 100n + BigInt(pay) - 1n) / BigInt(pay);
  return maks(m === 0n ? 0n : yukari(m, metaPayi), go === 0n ? 0n : yukari(go, 100 - metaPayi));
}

/**
 * Bir kalemi tutar, pay ve tahminle KUR. Asgari kontrolü rehberle AYNI
 * fonksiyonlarla (`butceBol`, `gunlukEsdeger`); altında kalan platform
 * kapanır ve cümlesi yazılır. Son platform kapanmaz: kalem gösterilir,
 * risk listesi (R-ASGARI) bunu söyler — sessizce kalem silmek "neden yok?"
 * sorusunu cevapsız bırakırdı.
 */
function kalemKur(t: KalemTaslagi, butce: bigint, takvim: { baslangic: string; bitis: string }, g: MotorGirdisi): OnerilenKalem {
  const gerekceler = [...t.gerekceler];
  let platformlar = [...t.platformlar];
  const cpa = (p: RehberPlatformu) => sonucBasiMaliyet(g.gecmis(t.amac, p));
  let pay = platformlar.length === 2 ? metaPayiHesapla(cpa('meta'), cpa('google')) : null;
  if (pay) gerekceler.push(pay.cumle);

  if (platformlar.length === 2 && pay) {
    const bol = butceBol(butce, { meta: true, google: true }, pay.pay, g.paraBirimi);
    const altta = platformlar.filter((p) => {
      const a = gunlukAsgari(t.amac, p, g.asgari);
      const gunluk = gunlukEsdeger(bol[p], 'toplam', takvim);
      return a !== null && gunluk !== null && gunluk < a;
    });
    if (altta.length === 1) {
      platformlar = platformlar.filter((p) => p !== altta[0]);
      gerekceler.push(`${PLATFORM_ADI[altta[0]!]} payı platformun günlük asgarisinin altında kaldı; bütçenin tamamı ${PLATFORM_ADI[platformlar[0]!]}'a verildi.`);
      pay = null;
    } else if (altta.length === 2) {
      // İKİ PAY DA ALTTA: iki platformu birlikte bırakmak asgarinin altında
      // iki yarım kampanya demekti. Bütçenin TAMAMI tek platforma verilince
      // asgarisi karşılananlardan asgarisi küçük olan kalır. Sihirbazın bütçe
      // adımı "yeter" derken bu yola güveniyor (`sihirbazButceKontrolu`).
      const tamGunluk = gunlukEsdeger(butce, 'toplam', takvim);
      const tam = platformlar
        .map((p) => ({ p, a: gunlukAsgari(t.amac, p, g.asgari) }))
        .filter((x): x is { p: RehberPlatformu; a: bigint } => x.a !== null && tamGunluk !== null && tamGunluk >= x.a);
      if (tam.length > 0) {
        const kalan = tam.reduce((m, x) => (x.a < m.a ? x : m)).p;
        platformlar = [kalan];
        gerekceler.push(`İki platformun payı da günlük asgarinin altında kaldı; bütçenin tamamı ${PLATFORM_ADI[kalan]}'a verildi (iki yarım kampanya yerine bir tam kampanya).`);
        pay = null;
      }
    }
  }

  const ikisi = platformlar.length === 2 && pay !== null;
  const bol = butceBol(butce, { meta: platformlar.includes('meta'), google: platformlar.includes('google') }, ikisi ? pay!.pay : VARSAYILAN_META_PAYI, g.paraBirimi);
  const tahmin = {} as Record<RehberPlatformu, KalemTahmini>;
  for (const p of REHBER_PLATFORMLARI) {
    if (!platformlar.includes(p)) {
      tahmin[p] = tahminYok('platform_kapali');
      continue;
    }
    const s = g.gecmis(t.amac, p);
    tahmin[p] = s.tur === 'yok' ? tahminYok(s.neden) : kalemTahmini(t.amac, bol[p], s.aylar);
  }
  const google = REHBER_AMACLARI[t.amac].google;
  const kelimeGrubu = platformlar.includes('google') && google.kurgu === 'ARAMA' ? g.kelimeGrubu : null;
  const kaynaklar: StratejiKalemi['kaynaklar'] = {
    amac: t.amacKaynagi,
    platformlar: 'kural',
    butce: 'kural',
    takvim: 'kural',
    konumlar: g.konumlar.length > 0 ? (g.konumKaynagi ?? 'marka') : 'kural',
    ...(ikisi ? { metaPayi: pay!.kaynak } : {}),
  };
  return {
    amac: t.amac,
    meta: platformlar.includes('meta'),
    google: platformlar.includes('google'),
    metaPayi: ikisi ? pay!.pay : null,
    butceMicros: butce.toString(),
    baslangic: takvim.baslangic,
    bitis: takvim.bitis,
    konumlar: g.konumlar.length > 0 ? [...g.konumlar] : [TURKIYE],
    yasMin: null,
    yasMax: null,
    kelimeGrubu,
    varlikIdleri: [],
    metin: null,
    kreatifYonergesi: null,
    kitleTarifi: null,
    not: null,
    tahmin,
    kaynaklar,
    gerekceler,
  };
}

/**
 * Motor. Sıra § 2.3: dönüşüm (ya da ilgi) kalemi → öğrenme tabanı / asgari →
 * bütçe yetmiyorsa platform azalır → kalan tanıtıma → pay → asgari →
 * tahmin. Hiçbir kalem kurulamazsa boş liste ve NEDENİ (`notlar`).
 */
export function stratejiMotoru(g: MotorGirdisi): MotorSonucu {
  const notlar: string[] = [];
  if (g.toplamMicros <= 0n) return { kalemler: [], notlar: ['Toplam bütçe sıfır.'] };
  const ilkGun = yarin(g.bugun);
  const takvim = { baslangic: g.donem.baslangic < ilkGun ? ilkGun : g.donem.baslangic, bitis: g.donem.bitis };
  if (takvim.baslangic > takvim.bitis) return { kalemler: [], notlar: ['Strateji döneminde kurulacak gün kalmadı.'] };
  if (takvim.baslangic !== g.donem.baslangic) notlar.push(`Dönemin başı geçmişte kaldığı için kampanyalar ${takvim.baslangic} tarihinden başlıyor.`);
  const gun = donemGunSayisi(takvim)!;

  const ana = anaKalemSec(g, notlar);
  const tanitim = tanitimKalemiSec(g);
  if (!ana && !tanitim) {
    notlar.push('Bu workspace’te kurulabilen bir amaç × platform yok; Kurulum’daki hesap ve beyanlara bakın.');
    return { kalemler: [], notlar };
  }
  if (!ana) {
    return { kalemler: [kalemKur(tanitim!, g.toplamMicros, takvim, g)], notlar };
  }

  // ── Öğrenme tabanı ve platform azaltma (kural 2) ──
  const tabanlar: Partial<Record<RehberPlatformu, bigint>> = {};
  let tabanBilinmiyor = false;
  for (const p of ana.platformlar) {
    const t = platformTabani(ana.amac, p, gun, g).taban;
    if (t === null) tabanBilinmiyor = true;
    else tabanlar[p] = t;
  }
  if (ana.platformlar.length === 2 && !tabanBilinmiyor && g.toplamMicros < tabanlar.meta! + tabanlar.google!) {
    // İki yarım kampanya yerine bir tam kampanya. Önce Google Talep Yaratma
    // (asgarisi en yüksek kurgu), değilse tabanı büyük olan.
    const kurgu = REHBER_AMACLARI[ana.amac].google.kurgu;
    const dusen: RehberPlatformu =
      kurgu === 'TALEP_YARATMA_VIDEO' || kurgu === 'TALEP_YARATMA_GORSEL' ? 'google' : tabanlar.meta! >= tabanlar.google! ? 'meta' : 'google';
    ana.platformlar = ana.platformlar.filter((p) => p !== dusen);
    delete tabanlar[dusen];
    ana.gerekceler.push(`Bütçe iki platformun öğrenme tabanına yetmiyor; ${PLATFORM_ADI[dusen]} bu kampanyada kapatıldı (iki yarım kampanya yerine bir tam kampanya).`);
  }

  // ── Kalan tanıtıma (kural 3) ──
  let anaButce = g.toplamMicros;
  let tanitimKalemi: OnerilenKalem | null = null;
  const cpa = (p: RehberPlatformu) => sonucBasiMaliyet(g.gecmis(ana.amac, p));
  const payTahmini = ana.platformlar.length === 2 ? metaPayiHesapla(cpa('meta'), cpa('google')).pay : null;
  if (tanitim && !tabanBilinmiyor) {
    const gereken = tabaniKarsilayanToplam(tabanlar, payTahmini);
    const kalan = g.toplamMicros - gereken;
    // Tanıtımın da asgarisi BİLİNMELİ: bilinmeyen asgariyle kalanı oraya
    // vermek, platformun reddedeceği bir kampanya önermek olabilirdi.
    const tanitimTabanlari = tanitim.platformlar.map((p) => {
      const a = gunlukAsgari(tanitim.amac, p, g.asgari);
      return a === null ? null : a * BigInt(gun);
    });
    const tanitimGereken = tanitimTabanlari.every((x) => x !== null) ? (tanitimTabanlari as bigint[]).reduce((a, b) => (b > a ? b : a), 0n) : null;
    if (kalan > 0n && tanitimGereken !== null && kalan >= tanitimGereken) {
      anaButce = gereken;
      ana.gerekceler.push('Dönüşüm kampanyası öğrenme tabanını karşılayacak tutarı aldı; kalan tanıtıma ayrıldı.');
      tanitimKalemi = kalemKur(tanitim, kalan, takvim, g);
    } else if (kalan > 0n) {
      notlar.push('Tanıtım kampanyası önerilmedi: dönüşüm tabanından sonra kalan tutar tanıtımın asgarisine yetmiyor ya da asgari okunamadı.');
    } else {
      notlar.push('Bütçenin tamamı dönüşüm kampanyasına ayrıldı: öğrenme tabanı bütçeyi karşılıyor ya da aşıyor.');
    }
  } else if (tanitim && tabanBilinmiyor) {
    notlar.push('Tanıtım kampanyası önerilmedi: dönüşüm kampanyasının öğrenme tabanı bilinmediği için bütçenin tamamı ona ayrıldı.');
  }

  const kalemler = [kalemKur(ana, anaButce, takvim, g)];
  if (tanitimKalemi) kalemler.push(tanitimKalemi);
  return { kalemler, notlar };
}

/**
 * Bir amacın bu workspace'te açık platformları ve düşenlerin cümlesi —
 * motorun KENDİ kuralıyla: dönüşüm aşamasındaki amaçta ölçümü KESİN yok
 * (`false`) olan platform düşer. Sihirbazın hedef adımı kartı bununla
 * kapatıyor; ikinci bir kural yazılsaydı ekran açık gösterip motor
 * plana almazdı.
 */
export function amacPlatformlari(amac: RehberAmacKodu, g: KapiGirdisi): { acik: RehberPlatformu[]; dusen: string[] } {
  return acikPlatformlar(amac, g, AMAC_ASAMASI[amac] === 'donusum');
}

/**
 * ═══ SEÇİLEN HEDEFLERLE MOTOR (adım adım akış) ═══
 *
 * Kullanıcı hedefleri SIRAYLA seçti; motor amacı kendisi seçmez, seçileni
 * kurar. Bütçe öncelik sırasıyla bölünür (`oncelikPaylari`, bütçe adımının
 * kullandığı fonksiyon), sonra her kalem `kalemKur`dan geçer: pay, asgari,
 * tahmin aynı kurallarla.
 *
 * KURULAMAYAN HEDEF PLANA ALINMAZ ve NEDENİ NOT olur ("plana alınmadı"):
 * hedef adımı kapalı kartı seçtirmiyor ama seçimden sonra ölçüm ya da hesap
 * değişmiş olabilir. Payı kalan hedeflere dağılır (açılan sayısıyla yeniden
 * bölünür); kapalı bir hedefe para ayırıp onu kurulmayan bir kalemde
 * bırakmak, dağıtılmamış bütçeyi sessizce saklamak olurdu.
 */
export function secimliMotor(g: MotorGirdisi, amaclar: readonly RehberAmacKodu[]): MotorSonucu {
  const notlar: string[] = [];
  if (g.toplamMicros <= 0n) return { kalemler: [], notlar: ['Toplam bütçe sıfır.'] };
  if (amaclar.length === 0) return { kalemler: [], notlar: ['Hedef seçilmedi.'] };
  const ilkGun = yarin(g.bugun);
  const takvim = { baslangic: g.donem.baslangic < ilkGun ? ilkGun : g.donem.baslangic, bitis: g.donem.bitis };
  if (takvim.baslangic > takvim.bitis) return { kalemler: [], notlar: ['Strateji döneminde kurulacak gün kalmadı.'] };
  if (takvim.baslangic !== g.donem.baslangic) notlar.push(`Dönemin başı geçmişte kaldığı için kampanyalar ${takvim.baslangic} tarihinden başlıyor.`);

  const acilan: KalemTaslagi[] = [];
  for (const amac of amaclar) {
    const { acik, dusen } = amacPlatformlari(amac, g);
    if (acik.length === 0) {
      notlar.push(`“${REHBER_AMACLARI[amac].ekranAdi}” plana alınmadı: ${dusen.join(' ')}`);
      continue;
    }
    acilan.push({ amac, platformlar: acik, amacKaynagi: 'ajans', gerekceler: dusen });
  }
  if (acilan.length === 0) return { kalemler: [], notlar };

  const paylar = oncelikPaylari(g.toplamMicros, acilan.length, g.paraBirimi);
  const agirlik = oncelikAgirliklari(acilan.length);
  const payda = agirlik.reduce((a, b) => a + b, 0);
  const kalemler = acilan.map((t, i) => {
    if (acilan.length > 1) t.gerekceler.unshift(`Öncelik sırası ${i + 1}: bütçenin ${payda} payından ${agirlik[i]} pay (Advetics kuralı: ilk seçilen hedef en büyük payı alır).`);
    const k = kalemKur(t, paylar[i]!, takvim, g);
    return k;
  });
  return { kalemler, notlar };
}

/** Kalemin aşaması (belge ve PDF bölüm 5). Burada yalnız dışa açılıyor. */
export function kalemAsamasi(amac: RehberAmacKodu): (typeof AMAC_ASAMASI)[RehberAmacKodu] {
  return AMAC_ASAMASI[amac];
}
