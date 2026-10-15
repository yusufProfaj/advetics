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

