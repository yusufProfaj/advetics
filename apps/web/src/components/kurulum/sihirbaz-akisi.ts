import {
  KURULUM_BEYAN_OGELERI,
  SITE_YOK_KAPSAM_DISI_ADIMLAR,
  SITE_YOK_KAPSAM_DISI_PARCALAR,
  type KurulumBeyani,
  type KurulumPlatformu,
  type WorkspaceBeyanOgesi,
} from '@advetics/shared';
import {
  KURULUM_LISTESI,
  SIRKET_KURULUM_LISTESI,
  hicEksikYok,
  type EksikleriTamamlaKapsami,
  type KurulumListesiDurumu,
  type KurulumListesiKodu,
  type KurulumSayaci,
} from '@/lib/panel-adresleri';
import { YOKLAMA_SINIRI } from '@/components/marka-merkezi/hazirlama-mantik';

/**
 * ═══ KURULUM SİHİRBAZI — EKRANIN SAF KARARLARI (docs/kurulum-sihirbazi/MIMARI.md § 3) ═══
 *
 * Sihirbaz YENİ BİR TANIM DEĞİL: adımlar `KURULUM_LISTESI` (workspace) ve
 * `SIRKET_KURULUM_LISTESI`ten (şirket), durumları `kurulumListesi` ve
 * `sirketKurulumListesi`nden. Burada yalnız ekranın kararları duruyor:
 * adresin hangi hâli açtığı, "Devam"ın nereye gittiği, bir isteğin
 * düşüşünün HATA mı BEKLEME mi olduğu, Genel Bakış şeridinin ne zaman
 * görüneceği. Panelde bileşen render eden test altyapısı yok (CLAUDE.md
 * "REACT EFFECT'İNİN İÇİNDEKİ KARAR TEST EDİLEMİYOR — DIŞARI ÇIKAR");
 * kararlar burada ve ÇALIŞTIRILARAK sınanıyor (`sihirbaz-akisi.spec.ts`).
 *
 * İLERLEME SAKLANMAZ (MIMARI § 3d): hangi adımda olunduğu adreste, adımların
 * hâli uçlarda. Saklanan bir "adım 6'dayız" kaydı, kullanıcı aynı işi Marka
 * Merkezi'nden bitirdiğinde bayatlar.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Adres → hâl
// ─────────────────────────────────────────────────────────────────────────────

export type SirketAdimKodu = (typeof SIRKET_KURULUM_LISTESI)[number]['kod'];
/** Sihirbazın gezilebilen her durağı: şirket adımları, workspace adımları, son kontrol. */
export type SihirbazAdimi = SirketAdimKodu | KurulumListesiKodu | 'son';

/**
 * RAYIN SIRASI LİSTELERDEN TÜRÜYOR: önce şirket (bağlantı olmadan hesap
 * atanamaz), sonra workspace, en sonda son kontrol. Elle yazılmış bir sıra,
 * listeye adım eklendiği gün o adımı raydan sessizce düşürürdü.
 */
export const SIHIRBAZ_SIRASI: readonly SihirbazAdimi[] = [
  ...SIRKET_KURULUM_LISTESI.map((a) => a.kod),
  ...KURULUM_LISTESI.map((a) => a.kod),
  'son',
];

export function sihirbazAdimiOku(ham: string | null | undefined): SihirbazAdimi | null {
  return (SIHIRBAZ_SIRASI as readonly string[]).includes(ham ?? '') ? (ham as SihirbazAdimi) : null;
}

export const SIRKET_ADIMLARI: ReadonlySet<string> = new Set(SIRKET_KURULUM_LISTESI.map((a) => a.kod));

/**
 * `/kurulum` ÜÇ HÂLDE açılıyor (MIMARI § 3a):
 *   · `?musteri=` → tamamlama (var olan workspace, adım adım),
 *   · `?tur=`     → açılış (üst hesap / şirket / workspace AÇAR),
 *   · hiçbiri     → başlangıç ("ne yapmak istiyorsun?").
 *
 * `musteri` `tur`dan ÖNCE: OAuth dönüşü tamamlama adresine `&connection=…`
 * ekliyor; iki parametre birden gelirse kullanıcı kaldığı adıma dönmeli,
 * açılışın ilk adımına değil.
 */
export type SihirbazModu =
  | { tur: 'baslangic' }
  | { tur: 'acilis'; acilisTuru: string; adim: string | null }
  | { tur: 'tamamlama'; musteri: string; adim: SihirbazAdimi | null };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function sihirbazModu(p: { musteri?: string; tur?: string; adim?: string }): SihirbazModu {
  /*
   * GEÇERSİZ KİMLİK BAŞLANGICA DÜŞER. Kopyalanırken kesilmiş bir adres
   * (`?musteri=1f3a`) dört uca 400 attırıp "okunamadı" dolu bir ekran
   * çizerdi; başlangıç ekranı workspace'i listeden seçtiriyor.
   */
  if (p.musteri && UUID.test(p.musteri)) return { tur: 'tamamlama', musteri: p.musteri, adim: sihirbazAdimiOku(p.adim) };
  if (p.tur) return { tur: 'acilis', acilisTuru: p.tur, adim: p.adim ?? null };
  return { tur: 'baslangic' };
}

// ─────────────────────────────────────────────────────────────────────────────
// Gezinme
// ─────────────────────────────────────────────────────────────────────────────

type DurumHaritasi = Partial<Record<SihirbazAdimi, KurulumListesiDurumu>>;

/** "Bitmiş" sayılan hâller: tamam, kullanılmıyor, kapsam dışı. `bilinmiyor` BİTMİŞ DEĞİL. */
export function bittiMi(d: KurulumListesiDurumu | undefined): boolean {
  return d === 'tamam' || d === 'kullanilmiyor' || d === 'kapsam_disi';
}

/**
 * Adresinde adım yoksa açılış adımı: sırayla ilk bitmemiş, hepsi bittiyse son
 * kontrol. Şirket adımları da sayılır — bağlantı yoksa workspace'in hesap
 * adımı zaten yapılamaz. `bilinmiyor` ATLANMAZ (`ilkEksikAdim` ile aynı kural:
 * okunamayan adım bitmiş sayılamaz).
 */
export function acilisAdimi(durumlar: DurumHaritasi): SihirbazAdimi {
  return SIHIRBAZ_SIRASI.find((k) => k !== 'son' && !bittiMi(durumlar[k])) ?? 'son';
}

/**
 * "DEVAM" bir sonraki BİTMEMİŞ adıma gider (MIMARI § 3b): tamamlanan adımlar
 * atlanır ama raydan açılabilir. Geride bitmemiş adım kalmışsa bile ileriye
 * bakılır; kalmadıysa son kontrol. "Sonra yapacağım" da aynı yere: sihirbaz
 * kilitlemez, adım raydaki rozetiyle eksik kalır.
 */
export function sonrakiAdim(aktif: SihirbazAdimi, durumlar: DurumHaritasi): SihirbazAdimi {
  const i = SIHIRBAZ_SIRASI.indexOf(aktif);
  return SIHIRBAZ_SIRASI.slice(i + 1).find((k) => k === 'son' || !bittiMi(durumlar[k])) ?? 'son';
}

/** "GERİ" sıradaki bir önceki durak — bitmiş olsa da (kullanıcı ne yaptığını görmek istiyor). */
export function oncekiAdim(aktif: SihirbazAdimi): SihirbazAdimi | null {
  const i = SIHIRBAZ_SIRASI.indexOf(aktif);
  return i > 0 ? SIHIRBAZ_SIRASI[i - 1]! : null;
}

/** "Adım 8 / 12" — son kontrol sayılmaz. */
export function adimSirasi(aktif: SihirbazAdimi): { sira: number; toplam: number } {
  const toplam = SIHIRBAZ_SIRASI.length - 1;
  return { sira: Math.min(SIHIRBAZ_SIRASI.indexOf(aktif) + 1, toplam), toplam };
}

// ─────────────────────────────────────────────────────────────────────────────
// İstek düşüşü: HATA mı BEKLEME mi (MIMARI § 3d)
// ─────────────────────────────────────────────────────────────────────────────

export type IstekSonucu =
  /** İşlem sunucuda sürüyor olabilir — "düştü" DENMEZ, yoklanır. */
  | { tur: 'yoklama'; neden: 'kilit' | 'ag' | 'zaman_asimi' }
  /** Platformun ya da sunucunun KENDİ cümlesi ekrana. */
  | { tur: 'mesaj'; mesaj: string };

/**
 * DÖRT HÂL AYRI:
 *   · 409 + "sürüyor" → başka bir kurulum işlemi bu workspace'te koşuyor
 *     (`kurulum.service.ts#kilitli`). Hata değil: bitmesini bekle.
 *   · durum kodu YOK (ağ koptu, sekme uyudu) → istek sunucuya ulaşmış ve
 *     orada sürüyor olabilir. "Düştü" demek kullanıcıyı ikinci kez bastırır
 *     ve GTM'e ikinci yayın gider.
 *   · 502/503/504 → ters vekil (nginx) beklemeyi bıraktı, uygulama değil.
 *     GTM yazma + yayın 30 sn'yi aşabiliyor (MIMARI § 11/3 ölçülecek).
 *   · diğer her şey → platformun mesajı, adımın altında.
 *
 * 409'UN İKİ ANLAMI VAR ve yalnız MESAJ ayırıyor: aynı uç "önce üstten bu
 * workspace'i seç" için de 409 dönüyor. Onu beklemeye çevirmek kullanıcıyı
 * iki dakika boşuna bekletip "hâlâ sürüyor olabilir" dedirtirdi — oysa
 * yapacağı iş belli. Sunucu ikisine ayrı `code` verene kadar ayıran mesaj
 * (CLAUDE.md Meta "reduce the amount of data" dersiyle aynı durum).
 */
export function istekSonucu(e: unknown): IstekSonucu {
  const status = typeof e === 'object' && e !== null && 'status' in e && typeof (e as { status: unknown }).status === 'number' ? (e as { status: number }).status : null;
  const mesaj = e instanceof Error && e.message ? e.message : 'Sunucuya ulaşılamadı.';
  if (status === null) return { tur: 'yoklama', neden: 'ag' };
  if (status === 409 && /sürüyor/i.test(mesaj)) return { tur: 'yoklama', neden: 'kilit' };
  if (status === 502 || status === 503 || status === 504) return { tur: 'yoklama', neden: 'zaman_asimi' };
  return { tur: 'mesaj', mesaj };
}

export const YOKLAMA_METNI: Record<Extract<IstekSonucu, { tur: 'yoklama' }>['neden'], string> = {
  kilit: 'Bu workspace’te başka bir kurulum işlemi sürüyor. Bitince bu ekran kendiliğinden güncellenir.',
  ag: 'Bağlantı yanıt vermedi; işlem sunucuda sürüyor olabilir. Durumu kontrol ediyoruz.',
  zaman_asimi: 'İşlem uzun sürüyor (genelde 30 saniye). Bitince bu ekran kendiliğinden güncellenir.',
};

export const YOKLAMA_SINIR_METNI = 'Hâlâ sürüyor olabilir. Birazdan sayfayı yenile; tekrar basmadan önce durumu kontrol et.';

/**
 * YOKLAMANIN SONU. Kurulum ucu "kilit kalktı" diye bir alan döndürmüyor;
 * bekleme adımın görünen hâli DEĞİŞİNCE bitiyor. Değişmezse
 * `YOKLAMA_SINIRI` (2 dk) sonra durur ve bunu HATA DEĞİL bilgi olarak söyler:
 * takılan bir işi sonsuza kadar yoklamak da, "düştü" demek de yanlış.
 */
export function yoklamaKarari(onceki: string, simdiki: string, deneme: number): 'bitti' | 'devam' | 'sinir' {
  if (simdiki !== onceki) return 'bitti';
  return deneme >= YOKLAMA_SINIRI ? 'sinir' : 'devam';
}

/** Adımın karşılaştırılabilir izi — durum + parçaların durum ve nedeni. */
export function adimIzi(a: { durum: string; parcalar: ReadonlyArray<{ kod: string; durum: string; neden: string }> } | undefined): string {
  if (!a) return '';
  return `${a.durum}|${a.parcalar.map((p) => `${p.kod}:${p.durum}:${p.neden}`).join(',')}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Alt çubuk: "Otomatik yap" ve "Bunu kullanmıyorum"
// ─────────────────────────────────────────────────────────────────────────────

/**
 * "OTOMATİK YAP" PASİFKEN SEBEBİ YAZILI (MIMARI § 3c): kaybolan düğme
 * "nereye gitti" sorusu doğurur, sebepsiz gri düğme "bozuk" diye okunur.
 * Kapsam sözleşmeden (`eksikleriTamamlaKapsami(g, adim)`); burada yalnız
 * ekrandaki cümle.
 */
export function otomatikDurumu(
  k: EksikleriTamamlaKapsami,
  o: { yazabilir: boolean; aktifDegil: boolean },
): { acik: boolean; neden: string | null } {
  if (!o.yazabilir) return { acik: false, neden: 'Kurulumu değiştirme yetkin yok.' };
  if (o.aktifDegil) return { acik: false, neden: 'Önce bu workspace’e geç; kurulum yalnız seçili workspace’te değişir.' };
  if (k.yapacakVar) return { acik: true, neden: null };
  if (k.kullaniciyaKalan.length > 0) return { acik: false, neden: `Sistemin yapabileceği parça kalmadı. Kalan iş senin: ${k.kullaniciyaKalan[0]!.neden}` };
  return { acik: false, neden: 'Sistemin yapabileceği parça kalmadı.' };
}

/** Bir adımda verilebilecek beyanlar: öğe beyanı ya da platform beyanı. */
export type BeyanSecenegi = { tur: 'oge'; oge: WorkspaceBeyanOgesi } | { tur: 'platform'; platform: KurulumPlatformu };

/**
 * "BUNU KULLANMIYORUM" NELERİ KAPATABİLİR — listeden TÜRÜYOR, elle yazılmıyor:
 *
 *   · parçanın `beyan`ı (adres, bildirim, erişim),
 *   · "web sitemiz yok": site isteyen adımlarda (ölçüm, piksel) ve site
 *     adresi parçasının adımında (bilgiler),
 *   · platform beyanı: adım bir platforma bağlıysa (Meta hesabı, sayfa,
 *     piksel → Meta; Google hesabı → Google).
 *
 * Ödeme, hesap, marka, varsayılanlar, veri BEYANLA KAPANMAZ (beyan.ts): onlar
 * bu listeye hiçbir yoldan girmiyor, çünkü sözleşmede beyanları yok.
 */
export function adimBeyanlari(kod: KurulumListesiKodu): BeyanSecenegi[] {
  const tanim = KURULUM_LISTESI.find((a) => a.kod === kod);
  if (!tanim) return [];
  const sonuc: BeyanSecenegi[] = [];
  if (tanim.platform) sonuc.push({ tur: 'platform', platform: tanim.platform });
  const siteAdimi = (SITE_YOK_KAPSAM_DISI_ADIMLAR as readonly string[]).includes(kod);
  const siteParcasi = (tanim.parcalar as ReadonlyArray<{ kaynak: string; kod: string }>).some((p) =>
    SITE_YOK_KAPSAM_DISI_PARCALAR.some((s) => s.kaynak === p.kaynak && s.kod === p.kod),
  );
  if (siteAdimi || siteParcasi) sonuc.push({ tur: 'oge', oge: 'site_yok' });
  for (const p of tanim.parcalar as ReadonlyArray<{ beyan?: WorkspaceBeyanOgesi }>) {
    if (p.beyan && !sonuc.some((s) => s.tur === 'oge' && s.oge === p.beyan)) sonuc.push({ tur: 'oge', oge: p.beyan });
  }
  return sonuc;
}

/**
 * BEYANLAR NEREDEN OKUNUYOR — iki biçimden biri (MIMARI § 7, Ajan 2 seçer):
 * `GET /clients/:id/kurulum` yanıtında `beyanlar` alanı ya da ayrı uç. Bu
 * fonksiyon yanıtta alan VARSA onu döndürür; yoksa `undefined` (çağıran
 * ayrı uca gider). "Alan yok" ile "boş dizi" ayrı: boş dizi "beyan yok"
 * demek ve ayrı uca gitmek gereksiz.
 */
export function yanittakiBeyanlar(kurulum: unknown): KurulumBeyani[] | undefined {
  if (typeof kurulum !== 'object' || kurulum === null || !('beyanlar' in kurulum)) return undefined;
  const b = (kurulum as { beyanlar: unknown }).beyanlar;
  if (!Array.isArray(b)) return undefined;
  /*
   * TANINMAYAN ÖĞE ATILIR, çağıran yine beyanları "okundu" sayar: sunucuya
   * yeni bir öğe eklenip panel eskiyse o öğe hiçbir parçayı kapatmaz —
   * listenin TAMAMINI "okunamadı" yapmak bütün beyanlı parçaları
   * "bilinmiyor"a çekerdi.
   */
  return b.filter((x): x is KurulumBeyani => typeof x === 'object' && x !== null && (KURULUM_BEYAN_OGELERI as readonly string[]).includes((x as { oge?: string }).oge ?? ''));
}

// ─────────────────────────────────────────────────────────────────────────────
// Son kontrol
// ─────────────────────────────────────────────────────────────────────────────

/**
 * ÜSTTEKİ TEK HÜKÜM (MIMARI § 3e): "Hiç eksik yok" ya da "N iş kaldı".
 * Okunamayan adım varken ASLA "hiç eksik yok" denmez (`kurulumSayaci`
 * kuralı) ve okunamayanlar AYRI söylenir — "eksik" ile "bilinmiyor"un
 * yapılacak işi farklı.
 */
export function hukum(sirket: KurulumSayaci, workspace: KurulumSayaci): { tamam: boolean; baslik: string; alt: string } {
  if (hicEksikYok(sirket, workspace)) {
    const disarida = sirket.kapsamDisi + workspace.kapsamDisi;
    return {
      tamam: true,
      baslik: 'Hiç eksik yok',
      alt: `Sayılan ${sirket.toplam + workspace.toplam} adımın hepsi tamam${disarida > 0 ? `; ${disarida} adım bilerek kapsam dışı` : ''}.`,
    };
  }
  const kalan = sirket.toplam - sirket.tamam - sirket.bilinmiyor + (workspace.toplam - workspace.tamam - workspace.bilinmiyor);
  const okunamadi = sirket.bilinmiyor + workspace.bilinmiyor;
  const parcalar = [kalan > 0 ? `${kalan} iş kaldı` : null, okunamadi > 0 ? `${okunamadi} adım okunamadı` : null].filter(Boolean);
  return {
    tamam: false,
    baslik: parcalar.length > 0 ? parcalar.join(' · ') : 'Henüz sayılacak adım yok',
    alt: okunamadi > 0 ? 'Okunamayan adım bitmiş sayılmaz; sayfayı yenileyip tekrar bak.' : 'Kalan her işin nedeni aşağıda yazıyor.',
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Başlangıç ekranı: workspace sırası
// ─────────────────────────────────────────────────────────────────────────────

export interface BaslangicSatiri {
  id: string;
  ad: string;
  /** `undefined` okunuyor, `null` okunamadı. */
  sayac: KurulumSayaci | null | undefined;
}

/**
 * EN ÇOK EKSİĞİ OLAN ÜSTTE (taslak ekran 1). Okunamayan ve henüz okunmayan
 * satır EN ALTTA: sayısı bilinmeyen bir satırı "0 eksik" diye sıralamak onu
 * bitmiş gibi gösterirdi. Eşitlikte ad sırası — liste her açılışta aynı.
 */
export function baslangicSirasi(satirlar: readonly BaslangicSatiri[]): BaslangicSatiri[] {
  const eksik = (s: BaslangicSatiri) => (s.sayac ? s.sayac.toplam - s.sayac.tamam : -1);
  return [...satirlar].sort((a, b) => eksik(b) - eksik(a) || a.ad.localeCompare(b.ad, 'tr'));
}

/**
 * KAÇ WORKSPACE'İN SAYACI OKUNUR. Her sayaç dört uç ve hazırlama okuması
 * imzası değişmiş workspace'te AI hazırlığını BAŞLATIYOR (`hazirlama.service.ts#oku`).
 * Yüz workspace'li bir şirkette başlangıç ekranını açmak yüz hazırlık
 * başlatmamalı. İlk N okunur, kalanı "sayılmadı" yazar (sessiz kesme yok).
 */
export const BASLANGIC_SAYAC_SINIRI = 12;

// ─────────────────────────────────────────────────────────────────────────────
// Genel Bakış şeridi
// ─────────────────────────────────────────────────────────────────────────────

/** "Kapat" o workspace için 7 gün gizler (MIMARI § 3a). */
export const SERIT_GIZLEME_MS = 7 * 24 * 60 * 60 * 1000;

export function seritAnahtari(clientId: string): string {
  return `advetics.kurulumSeridi.${clientId}`;
}

/**
 * ŞERİT YALNIZ İŞ YAPABİLENE (`kurulum.yaz`) ve kurulum BİTMEMİŞKEN.
 * Müşteri hesabı kurulum yapamıyor; ona "kurulum eksik" demek yapamayacağı
 * bir işi her gün göstermek. Sayaç OKUNAMADIYSA şerit çıkmaz: bilinmeyen bir
 * şeyi "eksik" diye ilan etmek yanlış alarm. Gizleme süresi dolmamışsa çıkmaz.
 *
 * `gizlendi` yerel tercihten (localStorage); okunamazsa `null` ve şerit
 * görünür — tercihi okuyamamak uyarıyı susturmamalı.
 */
export function seritGorunur(o: { yazabilir: boolean; sayac: KurulumSayaci | null; gizlendi: number | null; simdi: number }): boolean {
  if (!o.yazabilir || o.sayac === null) return false;
  if (o.sayac.bitti || o.sayac.toplam === 0) return false;
  if (o.sayac.tamam + o.sayac.bilinmiyor === o.sayac.toplam) return false;
  if (o.gizlendi !== null && o.simdi - o.gizlendi < SERIT_GIZLEME_MS) return false;
  return true;
}

/** Şerit cümlesi: "Kurulum eksik: 3 adım". Okunamayan adım sayıya girmez. */
export function seritMetni(s: KurulumSayaci): string {
  const kalan = s.toplam - s.tamam - s.bilinmiyor;
  return `Kurulum eksik: ${kalan} adım`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Durum görünüşü
// ─────────────────────────────────────────────────────────────────────────────

/**
 * RAYDAKİ İKON — ŞEKİL + AD, renk tek başına anlam taşımıyor (taslak).
 * Sözlük, dallanma değil: sözleşmeye yeni bir durum eklenince derleme kırılsın.
 * Yeşil YOK: "tamam" siyah dolu daire + beyaz tik (kılavuz renkleri).
 */
export type IkonTuru = 'tamam' | 'eksik' | 'kul' | 'hata' | 'bek' | 'dis' | 'bilinmiyor';

export const DURUM_IKONU: Record<KurulumListesiDurumu, IkonTuru> = {
  tamam: 'tamam',
  hata: 'hata',
  // Soru kullanıcının cevabını bekliyor: "senin işin".
  soru: 'kul',
  eksik: 'eksik',
  kullanicida: 'kul',
  bilinmiyor: 'bilinmiyor',
  bekliyor: 'bek',
  kullanilmiyor: 'dis',
  kapsam_disi: 'dis',
};

/** Parçanın sağındaki kısa durum metni (taslak: "Hazır", "Sorun var", "Senin işin", "Sırada"). */
export const DURUM_METNI: Record<KurulumListesiDurumu, string> = {
  tamam: 'Hazır',
  hata: 'Sorun var',
  soru: 'Cevap bekliyor',
  eksik: 'Eksik',
  kullanicida: 'Senin işin',
  bilinmiyor: 'Okunamadı',
  bekliyor: 'Sırada',
  kullanilmiyor: 'Kullanılmıyor',
  kapsam_disi: 'Kapsam dışı',
};
