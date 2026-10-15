import type { Permission } from '../auth/roles';

/**
 * ═══ PANEL ADRESLERİ — AYARLAR, MARKA MERKEZİ, VARLIKLAR İÇİN TEK ÜRETİCİ ═══
 *
 * Mimari: `docs/panel-sadelestirme/MIMARI.md` (Ayarlar ve Marka Merkezi
 * sadeleştirme, Ajan 1, 2026-10-13).
 *
 * NEDEN SHARED'DA, PANELDE DEĞİL: aynı adresleri API de üretiyor. Uyarı
 * kuralları (`uyari-kurallari.ts`) bildirim zilinin bağlantısını, OAuth
 * dönüşü (`connections.service.ts`) varsayılan dönüş yolunu YAZIYOR. Panelde
 * bir sayfa taşındığında API'deki elle yazılmış yol ölü bir adrese gönderir
 * ve bunu ilk gören kullanıcı olur. `rapor-sorgusu.ts` aynı sebeple burada.
 *
 * ELLE BİRLEŞTİRME YOK (CLAUDE.md "BAĞLANTIYI ELLE BİRLEŞTİRME"): Marka
 * Merkezi'ne giden on beş kadar bağlantı `'/marka-merkezi?bolum=...'`
 * diye elle kuruluyordu ve `musteri` parametresini taşıyan da taşımayan da
 * vardı. Parametresiz bağlantı, başka sekmede başka workspace seçmiş
 * kullanıcıyı SESSİZCE başka bir workspace'e götürür. Burada `musteri`
 * ZORUNLU bir argüman: `null` geçmek bilinçli bir karar olarak okunuyor.
 *
 * Bu paket DOM ya da Node kitaplığı yüklemiyor (`URLSearchParams` yok); sorgu
 * dizesi `encodeURIComponent` ile ve SABİT SIRAYLA kuruluyor. Sıra sabit
 * olmalı: testler ve yer imleri aynı adresin aynı dizgeyle yazılmasına
 * güveniyor.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Ortak kurucu
// ─────────────────────────────────────────────────────────────────────────────

type Sorgu = ReadonlyArray<readonly [string, string | null | undefined]>;

/**
 * Yol + sorgu + çapa. Boş, `null` ve `undefined` değer anahtarı DÜŞÜRÜYOR
 * (`lib/baglanti.ts` ile aynı sözleşme). Sorgu bir DİZİ, nesne değil:
 * nesnenin anahtar sırası JS'te ekleme sırası ama çağıranın bir anahtarı
 * önce yazması sırayı değiştirir ve aynı yer iki farklı dizgeyle yazılır.
 */
function kur(yol: string, sorgu: Sorgu = [], capa?: string | null): string {
  const parcalar = sorgu
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v as string)}`);
  const qs = parcalar.length > 0 ? `?${parcalar.join('&')}` : '';
  return `${yol}${qs}${capa ? `#${capa}` : ''}`;
}

/** Bütün sayfa yolları — panelde başka yerde yol dizgesi yazılmaz. */
export const PANEL_YOLLARI = {
  /** Ayarlar sekmeleri `AYARLAR_SEKMELERI` içinde, her biri kendi yolunda. */
  markaMerkezi: '/marka-merkezi',
  varliklar: '/varliklar',
  /** "Yeni şirket / workspace aç" sihirbazı. Adres eski adıyla duruyor (yer imleri). */
  acilis: '/kurulum',
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// AYARLAR — ajans / şirket / kişi düzeyi (dört sekme)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * AYARLAR'IN DÖRT SEKMESİ (kullanıcının onayladığı yapı, 2026-10-13).
 *
 * Kapsam adda yazıyor: Ayarlar'da workspace DÜZEYİNDE hiçbir alan
 * düzenlenmiyor; workspace'in her alanı Marka Merkezi'nde. Şirketler
 * sekmesindeki workspace satırı Marka Merkezi'ne AÇILIYOR, pencere yok.
 *
 * `izin` SEKMENİN GÖRÜNME KAPISI ve menü süzgeci bunu okuyor
 * (`nav-sections.ts`). `null` = herkes: Hesabım kişinin kendi sayfası ve
 * müşteri hesabı (client_viewer) da iki adımlı doğrulamasını oradan açıyor.
 * Ama Hesabım menüde Ayarlar satırını AÇMIYOR (müşteri hesabının dört
 * ekranlık menüsü kullanıcı kararı); kapısı kenar çubuğundaki ad kartı.
 *
 * ŞİRKETLER `client.write` İLE (eskiden `org.write`): Reklam Yöneticisi
 * workspace açıyor (rolün tanımı) ama `org.write` taşımadığı için workspace
 * listesine HİÇ giremiyordu. Şirket kartları ve şirket işlemleri sekmenin
 * İÇİNDE `PANEL_KAPILARI['sirket.yonet']` ile kapalı.
 */
export const AYARLAR_SEKMELERI = [
  {
    kod: 'sirketler',
    yol: '/ayarlar/sirketler',
    ad: 'Şirketler ve workspace’ler',
    kisaAd: 'Şirketler',
    izin: 'client.write',
  },
  {
    kod: 'baglantilar',
    yol: '/ayarlar/baglantilar',
    ad: 'Platform bağlantıları',
    kisaAd: 'Bağlantılar',
    izin: 'connection.read',
  },
  {
    kod: 'ekip',
    yol: '/ayarlar/ekip',
    ad: 'Ekip ve güvenlik',
    kisaAd: 'Ekip ve güvenlik',
    izin: 'user.read',
  },
  {
    kod: 'hesabim',
    yol: '/ayarlar/hesabim',
    ad: 'Hesabım',
    kisaAd: 'Hesabım',
    izin: null,
  },
] as const satisfies ReadonlyArray<{
  kod: string;
  yol: string;
  ad: string;
  kisaAd: string;
  izin: Permission | null;
}>;

export type AyarlarSekmeKodu = (typeof AYARLAR_SEKMELERI)[number]['kod'];

/**
 * Sekmelerin içindeki kartlar — çapa hedefi. Sayfa bu kimlikleri `id` olarak
 * taşımak ZORUNDA (`panel-adresleri.spec.ts` sayfa kaynağını tarıyor, sayfa
 * yazılınca). Liste dışı bir çapa üreticiden GEÇMİYOR: tipi reddediyor.
 */
export const AYARLAR_CAPALARI = {
  sirketler: ['sirketler', 'workspaceler', 'arsiv', 'ust-hesaplar'],
  baglantilar: ['kanallar', 'havuz', 'youtube', 'izlenen', 'tazeleme'],
  ekip: ['kisiler', 'workspace-erisimi', 'ust-hesap-ekibi', 'roller', 'iki-adim-zorunlulugu'],
  hesabim: ['guvenlik', 'e-posta', 'okuma-api'],
} as const satisfies Record<AyarlarSekmeKodu, readonly string[]>;

export type AyarlarCapasi<S extends AyarlarSekmeKodu> = (typeof AYARLAR_CAPALARI)[S][number];

export function ayarlarYolu(sekme: AyarlarSekmeKodu): string {
  return AYARLAR_SEKMELERI.find((s) => s.kod === sekme)!.yol;
}

/**
 * Ayarlar sekmesinin adresi.
 *
 * `workspace` YALNIZ Ekip'te anlamlı: "bu workspace'i kim görüyor" süzgeci.
 * Eski `/ayarlar/musteriler/<id>/ekip` sayfası buraya iniyor; ekip TEK
 * yerde ve Marka Merkezi'ndeki erişim listesi salt okunur + buraya bağlantı.
 *
 * `kurtarma` YALNIZ Hesabım'da: kurtarma koduyla giren kişiye yeni kod
 * üretmesi söyleniyor (`iki-adim-giris.tsx`).
 */
export function ayarlarAdresi<S extends AyarlarSekmeKodu>(
  sekme: S,
  ek: {
    capa?: AyarlarCapasi<S>;
    workspace?: S extends 'ekip' ? string | null : never;
    kurtarma?: S extends 'hesabim' ? boolean : never;
  } = {},
): string {
  return kur(
    ayarlarYolu(sekme),
    [
      ['workspace', ek.workspace ?? undefined],
      ['kurtarma', ek.kurtarma ? '1' : undefined],
    ],
    ek.capa,
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MARKA MERKEZİ — YALNIZ seçili workspace (üç bölüm)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * MARKA MERKEZİ'NİN TEK GİRİŞ KAPISI. Menü satırı, sayfa ve bütün bölümler
 * bunu okuyor. `client.write`, `client.read` DEĞİL: müşteri hesabı
 * `client.read` taşıyor ve menüsü dört ekranla sınırlı. Bölüm başına ayrı
 * görünme kapısı YOK — eskiden Kurulum `client.read`, Bağlantılar
 * `client.write`, Bildirimler `rule.read` istiyordu ve aynı kişi menüde
 * Marka Merkezi'ni görüp içeride farklı bölüm kümesine düşüyordu. Kartların
 * ve eylemlerin kendi kapısı `PANEL_KAPILARI`nda.
 */
export const MARKA_MERKEZI_IZNI: Permission = 'client.write';

/**
 * ÜÇ BÖLÜM, SIRAYLA (kullanıcının onayladığı yapı, 2026-10-13).
 *
 * Eski yedi bölümün yeri (`ESKI_MM_BOLUMLERI`):
 *   Bağlantılar + Ölçüm + Kurulum → Kurulum (tek liste, tek sayaç)
 *   Marka → Marka
 *   Workspace ayarları + Bildirimler (+ Ayarlar'daki Senkronizasyon) → Workspace bilgileri
 *   Kitleler + Varlıklar → ayrı menü satırı "Varlıklar"
 */
export const MARKA_MERKEZI_BOLUMLERI = [
  { kod: 'kurulum', ad: 'Kurulum' },
  { kod: 'marka', ad: 'Marka' },
  { kod: 'workspace', ad: 'Workspace bilgileri' },
] as const satisfies ReadonlyArray<{ kod: string; ad: string }>;

export type MarkaMerkeziBolumKodu = (typeof MARKA_MERKEZI_BOLUMLERI)[number]['kod'];

/**
 * Bölüm içi çapalar. Kurulum'un çapaları `KURULUM_LISTESI` adım kodlarıyla
 * AYNI (o dosya bu listeyi `satisfies` ile doğruluyor) + listedeki adımlara
 * sığmayan iki blok: workspace'e bağlı bütün hesap ve kanallar
 * (`kanallar`, eski Bağlantılar'ın `BagliKanallar`ı) ve sayaca girmeyen
 * isteğe bağlı veri kaynakları.
 *
 * MARKA ÇAPALARI: `marka-bilgileri` ve `logo` ESKİSİYLE AYNI. Parça (`#…`)
 * sunucuya hiç gitmiyor, yani eski bir çapa sunucu yönlendirmesiyle
 * çevrilemiyor; değişmeyen kimlik bağlantının kırılmaması demek. Değişen
 * tek çapa `bilgi` (iki metin artık ayrı kart) ve onu `eskiCapaYonu`
 * istemcide çeviriyor.
 */
export const MARKA_MERKEZI_CAPALARI = {
  kurulum: ['bilgiler', 'meta', 'sayfa', 'piksel', 'google', 'youtube', 'olcum', 'marka', 'varsayilanlar', 'bildirimler', 'veri', 'kanallar', 'veri-kaynaklari'],
  marka: ['marka-bilgileri', 'markayi-anlat', 'kime-satiyoruz', 'logo'],
  workspace: ['firma', 'erisim', 'bildirimler', 'veri-durumu'],
} as const satisfies Record<MarkaMerkeziBolumKodu, readonly string[]>;

export type MarkaMerkeziCapasi<B extends MarkaMerkeziBolumKodu> = (typeof MARKA_MERKEZI_CAPALARI)[B][number];

/**
 * Marka Merkezi'nde bir yerin adresi. `musteri` ZORUNLU ARGÜMAN — bkz. dosya
 * başı. `null`: aktif workspace'i sayfa çözsün (oturumdaki seçim); yalnız
 * workspace'in GERÇEKTEN bilinmediği yerlerde (kenar çubuğu, eski adres
 * yönlendirmesi) geçilir.
 *
 * Sıra `musteri` → `bolum`: eski `mmAdresi` bu sırayla üretiyordu ve
 * kayıtlı yer imleri aynı dizgeyi taşıyor.
 */
export function markaMerkeziAdresi<B extends MarkaMerkeziBolumKodu>(
  bolum: B,
  musteri: string | null | undefined,
  capa?: MarkaMerkeziCapasi<B>,
): string {
  return kur(
    PANEL_YOLLARI.markaMerkezi,
    [
      ['musteri', musteri ?? undefined],
      ['bolum', bolum],
    ],
    capa,
  );
}

/**
 * Adresteki bölüm. Tanınmayan değer `null` — çağıran önce
 * `eskiMarkaMerkeziYonu` ile eski değeri yönlendirmeli, sonra bilinmeyeni
 * ilk bölüme (Kurulum) düşürmeli. İkisini bu fonksiyonda birleştirmek, eski
 * bir `?bolum=kitleler` bağlantısını sessizce Kurulum'a düşürürdü.
 */
export function markaMerkeziBolumu(ham: string | null | undefined): MarkaMerkeziBolumKodu | null {
  return MARKA_MERKEZI_BOLUMLERI.find((b) => b.kod === ham)?.kod ?? null;
}

// ─────────────────────────────────────────────────────────────────────────────
// VARLIKLAR — Base'in ikinci satırı (dört sekme)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * VARLIKLAR MENÜDE AYRI SATIR (Karar B, kullanıcı 2026-10-13). Görseller,
 * kreatifler, formlar ve KİTLELER reklam kurarken her gün açılan malzeme;
 * Marka Merkezi'nin içinde dururken "malzeme nerede" sorusu bir kurulum
 * ekranının iç menüsünde cevaplanıyordu.
 *
 * KİTLELER BURADA (Ajan 1 kararı): kayıtlı hedefleme şablonları ve Meta
 * özel kitleleri AdvCampaign'de görsel ve form gibi SEÇİLEN malzeme. Marka
 * Merkezi'nde kalsaydı malzemenin yarısı bir ekranda yarısı diğerinde
 * olurdu. VARSAYILAN kitlenin evi ise Kurulum › Reklam varsayılanları;
 * Kitleler sekmesi onu "Varsayılan" rozetiyle SALT OKUNUR gösterir.
 *
 * `izin` sekmenin görünme kapısı = o sekmenin okuma ucunun API kapısı.
 * Menü satırı `VARLIKLAR_IZNI` ile kapalı.
 */
export const VARLIKLAR_IZNI: Permission = 'bulk.read';

export const VARLIKLAR_SEKMELERI = [
  { kod: 'gorseller', ad: 'Görseller', izin: 'bulk.read' },
  { kod: 'kreatifler', ad: 'Kreatifler', izin: 'bulk.read' },
  { kod: 'formlar', ad: 'Formlar', izin: 'bulk.read' },
  { kod: 'kitleler', ad: 'Kitleler', izin: 'client.read' },
] as const satisfies ReadonlyArray<{ kod: string; ad: string; izin: Permission }>;

export type VarliklarSekmeKodu = (typeof VARLIKLAR_SEKMELERI)[number]['kod'];

/**
 * Varlıklar sekmesinin adresi. `tur` görsel türü süzgeci (logo YOK — logonun
 * evi Marka), `form` seçili form. İkisi de yalnız ilgili sekmede anlamlı
 * ama sorgu ölü parametre taşımasın diye sekmeye bakılmadan düşürülmüyor:
 * eski `/kutuphane/*` adresleri ikisini de taşıyabiliyordu ve yönlendirme
 * onları KAYBETMEMELİ.
 */
export function varliklarAdresi(
  sekme: VarliklarSekmeKodu,
  musteri: string | null | undefined,
  ek: { tur?: string | null; form?: string | null } = {},
): string {
  return kur(PANEL_YOLLARI.varliklar, [
    ['musteri', musteri ?? undefined],
    ['sekme', sekme],
    ['tur', ek.tur ?? undefined],
    ['form', ek.form ?? undefined],
  ]);
}

/** Adresteki sekme; tanınmayan değer ilk sekmeye (Görseller) düşer. */
export function varliklarSekmesi(ham: string | null | undefined): VarliklarSekmeKodu {
  return VARLIKLAR_SEKMELERI.find((s) => s.kod === ham)?.kod ?? 'gorseller';
}

// ─────────────────────────────────────────────────────────────────────────────
// AÇILIŞ SİHİRBAZI — "Yeni şirket / workspace aç"
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Sihirbazın ADI (menüde satırı yok; Ayarlar › Şirketler'deki düğmeler
 * açıyor). "Kurulum" adı Marka Merkezi'nin bölümünde: iki ekran aynı adı
 * taşıyınca "hangi kurulum" sorusu doğuyordu.
 */
export const ACILIS_ADI = 'Yeni şirket / workspace aç';

/** `components/kurulum/kurulum-akisi.ts#KURULUM_TURLERI` ile AYNI (spec karşılaştırıyor). */
export const ACILIS_TURLERI = ['ust-hesap', 'sirket', 'workspace'] as const;
export type AcilisTuru = (typeof ACILIS_TURLERI)[number];

/**
 * Sihirbazın adresi. Adım verilmezse sihirbaz kendi ilk adımını seçer.
 * Sihirbazın KENDİ içindeki adım geçişleri `kurulumAdresi(tur, adim)` ile
 * (adım tipi panelde); dışarıdan açan her yer bunu kullanır.
 */
export function acilisAdresi(tur: AcilisTuru, adim?: string): string {
  return kur(PANEL_YOLLARI.acilis, [
    ['tur', tur],
    ['adim', adim],
  ]);
}

// ─────────────────────────────────────────────────────────────────────────────
// KURULUM SİHİRBAZI — açılış + tamamlama (docs/kurulum-sihirbazi/MIMARI.md)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * `/kurulum` sayfasının ADI (2026-10-13). "Yeni şirket / workspace aç"
 * (`ACILIS_ADI`) adı Marka Merkezi › Kurulum ile karışmasın diye
 * konmuştu; artık iki ekran AYNI listenin iki görünümü (liste ve adım adım)
 * ve karışma sebebi kalktı. `ACILIS_ADI` başlangıç ekranındaki kartın adı
 * olarak duruyor. Adres DEĞİŞMEDİ (yer imleri).
 */
export const SIHIRBAZ_ADI = 'Kurulum sihirbazı';

/**
 * Var olan bir workspace'i tamamlayan sihirbazın adresi — TEK ÜRETİCİ.
 *
 * Üç yerde kuruluyor: Şirketler satırındaki "Kurulumu tamamla", Marka
 * Merkezi'nin "Sihirbazla tamamla"sı ve OAuth/ödeme dönüşü (`redirectTo`).
 * Birinde `musteri` düşerse kullanıcı platformu bağlayıp başlangıç ekranına
 * döner ve kaldığı adımı arar (CLAUDE.md "bağlantıyı elle birleştirme").
 * `adim` verilmezse sihirbaz `ilkEksikAdim` ile kendisi seçer; `son`
 * son kontrol ekranı.
 */
export function sihirbazAdresi(musteri: string, adim?: string | null): string {
  return kur(PANEL_YOLLARI.acilis, [
    ['musteri', musteri],
    ['adim', adim ?? undefined],
  ]);
}

// ─────────────────────────────────────────────────────────────────────────────
// Sık sorulan hedefler — karar BURADA, çağıranda değil
// ─────────────────────────────────────────────────────────────────────────────

/**
 * "HESABI BAĞLA / ATA / İZLEMEYİ AÇ" NEREDE?
 *
 * Genel Bakış ("N hesap izlenmiyor", "Henüz veri yok"), Reklam Yöneticisi ve
 * rehber aynı soruyu soruyor ve her biri `/ayarlar/baglantilar`a
 * gönderiyordu. Hesap ATAMASI ve izleme bir WORKSPACE işi: workspace
 * biliniyorsa onun Kurulum'u (atanmış hesaplar, izleme anahtarı), bilinmiyorsa
 * (şirket geneli görünüm) Ayarlar'daki havuz. Kararı her çağırana bırakmak,
 * birinin workspace'i bilip havuza göndermesi demekti.
 */
export function hesaplarAdresi(musteri: string | null | undefined): string {
  return musteri
    ? markaMerkeziAdresi('kurulum', musteri, 'kanallar')
    : ayarlarAdresi('baglantilar', { capa: 'havuz' });
}

/**
 * "VERİ NEDEN GELMİYOR" — eski Senkronizasyon Durumu ekranı. Workspace
 * bilgileri › Veri durumu kartında; workspace verilmezse Marka Merkezi
 * aktif workspace'i çözer ya da seçtirir.
 */
export function veriDurumuAdresi(musteri: string | null | undefined): string {
  return markaMerkeziAdresi('workspace', musteri, 'veri-durumu');
}

/**
 * OAuth bağla / yeniden yetkilendir — her zaman Ayarlar. Bağlantı ajansın
 * (ya da şirketin) kimliği, workspace'in değil (CLAUDE.md "WORKSPACE BAŞINA
 * PLATFORM BAĞLANTISI MÜMKÜN DEĞİL").
 */
export function platformBaglantilariAdresi(): string {
  return ayarlarAdresi('baglantilar', { capa: 'kanallar' });
}

// ─────────────────────────────────────────────────────────────────────────────
// Kullanıcıya yazılan YER ADLARI — "şuraya git" cümleleri
// ─────────────────────────────────────────────────────────────────────────────

const ayarlarSekmeAdi = (kod: AyarlarSekmeKodu): string => AYARLAR_SEKMELERI.find((s) => s.kod === kod)!.ad;
const mmBolumAdi = (kod: MarkaMerkeziBolumKodu): string => MARKA_MERKEZI_BOLUMLERI.find((b) => b.kod === kod)!.ad;
const varlikSekmeAdi = (kod: VarliklarSekmeKodu): string => VARLIKLAR_SEKMELERI.find((s) => s.kod === kod)!.ad;

/**
 * ═══ EKRAN YERLERİ — ADRESLE AYNI SÖZLEŞMEDEN TÜREYEN AD ═══
 *
 * API hata ve uyarı cümlelerinde kullanıcıyı bir ekrana gönderiyor ("Platform
 * Bağlantıları ekranından ata", "Workspace ayarları'ndan gir", "Kütüphane >
 * Formlar"). Sekmeler yeniden adlandırılınca bu cümleler ELLE yazıldıkları için
 * eski adda kaldı ve kullanıcıyı artık var olmayan bir ekrana gönderdi —
 * hata yok, yalnız yanlış bir cümle. Ad sekmenin `ad` alanından türüyor; bir
 * sekme yeniden adlandırılırsa cümle de değişir.
 *
 * `›` panelin kırıntı ayracı (Marka Merkezi başlığı, MIMARI § 5).
 */
export const PANEL_YERLERI = {
  platformBaglantilari: `Ayarlar › ${ayarlarSekmeAdi('baglantilar')}`,
  hesabimEposta: `Ayarlar › ${ayarlarSekmeAdi('hesabim')} › E-posta`,
  kurulum: `Marka Merkezi › ${mmBolumAdi('kurulum')}`,
  workspaceBilgileri: `Marka Merkezi › ${mmBolumAdi('workspace')}`,
  logo: `Marka Merkezi › ${mmBolumAdi('marka')} › Logo`,
  formlar: `Varlıklar › ${varlikSekmeAdi('formlar')}`,
} as const;
