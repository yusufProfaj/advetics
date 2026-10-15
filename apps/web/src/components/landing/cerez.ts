/**
 * ═══ ÇEREZ BİLDİRİMİ: KARAR SAF FONKSİYONDA ═══
 *
 * Tanıtım sitesi ve yasal sayfalar yalnız ZORUNLU çerez kullanıyor (oturum
 * çerezleri, `/cerez-politikasi`). KVKK ve 5809 sayılı Kanun zorunlu çerez
 * için onay istemiyor; o yüzden bildirimde "Kabul et / Reddet" yok, yalnız
 * "Anladım" var. Onay düğmesi koymak, reddedilebilecek bir şey varmış gibi
 * yanlış bir söz olurdu.
 *
 * SÜRÜM NUMARASI SAKLANIYOR, "kapattı" bayrağı değil. Bir gün isteğe bağlı
 * bir çerez (analitik) eklenirse bu sürüm artırılacak ve bildirim herkese
 * YENİDEN görünecek; düz bir bayrak, onay gerektiren yeni çerezi daha önce
 * "Anladım" demiş ziyaretçiden sessizce saklardı.
 */
export const CEREZ_ANAHTARI = 'advetics.cerezBildirimi';
export const CEREZ_SURUMU = '1';

/** Saklanan değer bu sürüm değilse (hiç yoksa ya da eskiyse) bildirim görünür. */
export function bildirimGorunsunMu(kayit: string | null): boolean {
  return kayit !== CEREZ_SURUMU;
}

/**
 * ═══ ÇEREZ POLİTİKASI ═══ (onaylı taslağın metni, 2026-10-14)
 *
 * SÜRELER TASLAKTAN DEĞİL KODDAN. Taslak üç çerez sayıyordu ve üçüne de
 * "HttpOnly ve Secure" diyordu; koddaki gerçek (`apps/api/src/modules/auth/
 * cookies.ts`):
 *  · `adv_at` / `adv_rt`: süre `JWT_ACCESS_TTL` / `JWT_REFRESH_TTL` (yapılandırma
 *    varsayılanı 15 dakika / 30 gün) ama YALNIZ "Beni hatırla" seçiliyse;
 *    seçili değilse `maxAge` yazılmıyor ve çerez tarayıcı kapanınca siliniyor.
 *  · `adv_client` ve `adv_org` 30 gün, `adv_mgr` süresiz yazılıyor (tarayıcı
 *    kapanınca siliniyor). Üçü `httpOnly: false`: panel seçili workspace'i
 *    okuyor. Değerleri SIR değil SEÇİM; yetki her istekte sunucuda
 *    yeniden hesaplanıyor.
 *  · `adv_mfa` iki adımlı girişte 5 dakika (`IKI_ADIM_BEKLEME_DK`).
 *  · `adv_dil` 1 yıl (`DIL_CEREZI_SURESI_SN`), HttpOnly DEĞİL: dil seçimi
 *    tarayıcıda yazılıyor (seçim ekranı, TR·EN anahtarı) ve sır değil.
 *  · Üretimde hepsi `Secure` (`AUTH_COOKIE_SECURE=true` olmadan API açılmıyor,
 *    `configuration.ts`) ve `SameSite=Lax`.
 * Bir çerez eklenir ya da süresi değişirse bu tablo da değişmeli; beyan ile
 * gerçek ayrışırsa politika yalan söyler.
 *
 * Tarayıcı depolaması listesi de koddan (`localStorage`/`sessionStorage`
 * anahtarları, `apps/web/src`).
 */
export const CEREZLER: { ad: string; amac: string; sure: string; tur: string }[] = [
  {
    ad: 'adv_at',
    amac: 'Oturum erişim anahtarı; kim olduğunuzu her istekte doğrular.',
    sure: '"Beni hatırla" seçiliyse 15 dakika (sonra kendiliğinden yenilenir), seçili değilse tarayıcı kapanınca silinir.',
    tur: 'Zorunlu · birinci taraf · HttpOnly',
  },
  {
    ad: 'adv_rt',
    amac: 'Oturum yenileme anahtarı; erişim süresi dolunca tekrar giriş istemeden yeniler. Yalnız giriş adreslerine gönderilir.',
    sure: '"Beni hatırla" seçiliyse 30 gün, seçili değilse tarayıcı kapanınca silinir.',
    tur: 'Zorunlu · birinci taraf · HttpOnly',
  },
  {
    ad: 'adv_mfa',
    amac: 'İki adımlı girişte parola doğrulandıktan sonra kod beklenirken tutulur.',
    sure: '5 dakika',
    tur: 'Zorunlu · birinci taraf · HttpOnly',
  },
  {
    ad: 'adv_dil',
    amac: 'Seçtiğiniz arayüz dili (Türkçe ya da English). Dil seçim ekranının her ziyarette yeniden çıkmaması için.',
    sure: '1 yıl',
    tur: 'Zorunlu · birinci taraf',
  },
  {
    ad: 'adv_client',
    amac: 'Panelde seçtiğiniz workspace.',
    sure: '30 gün',
    tur: 'Zorunlu · birinci taraf',
  },
  {
    ad: 'adv_org',
    amac: 'Panelde seçtiğiniz şirket.',
    sure: '30 gün',
    tur: 'Zorunlu · birinci taraf',
  },
  {
    ad: 'adv_mgr',
    amac: 'Panelde seçtiğiniz üst hesap (ajans hesapları).',
    sure: 'Tarayıcı kapanınca silinir.',
    tur: 'Zorunlu · birinci taraf',
  },
];

export const DEPOLAMA: { ad: string; ne: string; sure: string }[] = [
  { ad: CEREZ_ANAHTARI, ne: 'Bu sitedeki çerez bildirimini kapattığınız.', sure: 'Siz silene kadar' },
  { ad: 'advetics.tema', ne: 'Panelde seçtiğiniz açık ya da koyu tema.', sure: 'Siz silene kadar' },
  { ad: 'advetics.nav.*', ne: 'Kenar menüsündeki bölümlerin açık ya da kapalı olması.', sure: 'Siz silene kadar' },
  {
    ad: 'advetics.kurulumSeridi.*',
    ne: 'Genel Bakış’taki kurulum şeridini ne zaman kapattığınız.',
    sure: 'Siz silene kadar',
  },
  {
    ad: 'advetics.oturum.sonYenileme',
    ne: 'Oturumun en son ne zaman yenilendiği; açık sekmeler aynı anda yenilemesin diye.',
    sure: 'Siz silene kadar',
  },
  {
    ad: 'advetics.topluTazeleme',
    ne: 'Başlattığınız toplu veri tazeleme işinin kimliği; sayfaya dönünce ilerlemeyi göstermek için.',
    sure: 'İş bitince silinir',
  },
  {
    ad: 'advetics.gizliUyarilar',
    ne: 'Panelde kapattığınız uyarılar (oturum deposu).',
    sure: 'Sekme kapanınca silinir',
  },
];


/*
 * ═══ İNGİLİZCE TABLOLAR (`/en/cookies`) ═══
 *
 * Aynı çerezler, AYNI SIRADA, aynı adlarla. Ayrı bir liste olmasının bedeli
 * ayrışma riski: Türkçe süre değişip İngilizcesi unutulursa iki dildeki
 * politika farklı söz verir. `cerez.spec.ts` adları, sırayı ve süreleri
 * (sayı + birim) iki liste arasında karşılaştırıyor. Bu yüzden İngilizce
 * süre metni Türkçenin YAPISINI izliyor: "1 yıl" ↔ "1 year".
 */
type CerezSatiri = (typeof CEREZLER)[number];
type DepolamaSatiri = (typeof DEPOLAMA)[number];

export const CEREZLER_EN: CerezSatiri[] = [
  {
    ad: 'adv_at',
    amac: 'Session access key; verifies who you are on every request.',
    sure: 'If "Remember me" is selected, 15 minutes (then renewed automatically); otherwise deleted when the browser closes.',
    tur: 'Strictly necessary · first-party · HttpOnly',
  },
  {
    ad: 'adv_rt',
    amac: 'Session refresh key; renews your session when access expires without asking you to sign in again. Sent only to the sign-in endpoints.',
    sure: 'If "Remember me" is selected, 30 days; otherwise deleted when the browser closes.',
    tur: 'Strictly necessary · first-party · HttpOnly',
  },
  {
    ad: 'adv_mfa',
    amac: 'Kept during two-step sign-in while the code is awaited after your password has been verified.',
    sure: '5 minutes',
    tur: 'Strictly necessary · first-party · HttpOnly',
  },
  {
    ad: 'adv_dil',
    amac: 'The interface language you chose (Turkish or English), so that the language selection screen does not appear again on every visit.',
    sure: '1 year',
    tur: 'Strictly necessary · first-party',
  },
  {
    ad: 'adv_client',
    amac: 'The workspace you selected in the panel.',
    sure: '30 days',
    tur: 'Strictly necessary · first-party',
  },
  {
    ad: 'adv_org',
    amac: 'The company you selected in the panel.',
    sure: '30 days',
    tur: 'Strictly necessary · first-party',
  },
  {
    ad: 'adv_mgr',
    amac: 'The parent account you selected in the panel (agency accounts).',
    sure: 'Deleted when the browser closes.',
    tur: 'Strictly necessary · first-party',
  },
];

export const DEPOLAMA_EN: DepolamaSatiri[] = [
  { ad: CEREZ_ANAHTARI, ne: 'That you dismissed the cookie notice on this site.', sure: 'Until you delete it' },
  { ad: 'advetics.tema', ne: 'The light or dark theme you chose in the panel.', sure: 'Until you delete it' },
  { ad: 'advetics.nav.*', ne: 'Whether the sections of the side menu are expanded or collapsed.', sure: 'Until you delete it' },
  {
    ad: 'advetics.kurulumSeridi.*',
    ne: 'When you dismissed the setup strip on the Overview page.',
    sure: 'Until you delete it',
  },
  {
    ad: 'advetics.oturum.sonYenileme',
    ne: 'When the session was last renewed, so that open tabs do not renew it at the same time.',
    sure: 'Until you delete it',
  },
  {
    ad: 'advetics.topluTazeleme',
    ne: 'The ID of a bulk data refresh you started, to show its progress when you return to the page.',
    sure: 'Deleted when the job finishes',
  },
  {
    ad: 'advetics.gizliUyarilar',
    ne: 'Warnings you dismissed in the panel (session storage).',
    sure: 'Deleted when the tab closes',
  },
];

/** Çerez tablosu, sayfanın dilinde. Ekran kodu öneksiz `CEREZLER`i değil bunu okur. */
export function cerezler(dil: 'tr' | 'en'): CerezSatiri[] {
  return dil === 'en' ? CEREZLER_EN : CEREZLER;
}

/** Tarayıcı depolaması tablosu, sayfanın dilinde. */
export function depolama(dil: 'tr' | 'en'): DepolamaSatiri[] {
  return dil === 'en' ? DEPOLAMA_EN : DEPOLAMA;
}
