/**
 * ═══ TANITIM SİTESİ VE YASAL SAYFALARIN İKİ DİLLİ ADRESLERİ ═══
 *
 * Kullanıcı kararı (Ç2, docs/i18n/MIMARI.md): yalnız tanıtım sitesi ve
 * yasal sayfalar `/en` öneki taşır; Türkçe adresler DEĞİŞMEZ (Google OAuth
 * başvurusunda kayıtlı olan `/gizlilik`, `/kosullar` bunlar). Panel ve
 * giriş ekranları öneksiz, dil çerezde.
 *
 * Sayfalar İKİ KEZ YAZILMIYOR: middleware `/en/privacy` isteğini `/gizlilik`
 * sayfasına yeniden yazıyor ve dili istek başlığıyla (`ONEK_BASLIGI`)
 * bildiriyor. İkinci bir sayfa ağacı, iki dilin içeriğinin ayrışması demekti.
 *
 * BU DOSYA EDGE PAKETİNDE (middleware): shared'ı ve site metnini İÇE
 * AKTARMAZ, yalnız yol tablosu taşır. Detay sayfalarının kısa adı (slug)
 * iki dilde aynı (`/en/features/akilli-boost`): kısa ad sayfanın kimliği,
 * çevirmek iki tabloyu eşli tutma borcu getirirdi.
 */
export const ONEK_BASLIGI = 'x-advetics-onek';

/** Türkçe kök → İngilizce kök. Detay sayfaları kökün altında aynı kısa adla. */
const KOKLER: [tr: string, en: string][] = [
  ['/ozellikler', '/en/features'],
  ['/cozumler', '/en/solutions'],
  ['/entegrasyonlar', '/en/integrations'],
  ['/fiyatlandirma', '/en/pricing'],
  ['/guvenlik', '/en/security'],
  ['/demo', '/en/demo'],
  ['/gizlilik', '/en/privacy'],
  ['/kosullar', '/en/terms'],
  ['/cerez-politikasi', '/en/cookies'],
  ['/veri-silme', '/en/data-deletion'],
];

/** Detay sayfası taşıyabilen kökler (`/ozellikler/<kisa-ad>`). Diğerlerinin alt yolu YOK. */
const ALT_YOLLU = new Set(['/ozellikler', '/cozumler']);

function esle(yol: string, kaynak: 0 | 1): string | null {
  const hedef = kaynak === 0 ? 1 : 0;
  if (kaynak === 0 && yol === '/') return '/en';
  if (kaynak === 1 && (yol === '/en' || yol === '/en/')) return '/';
  for (const satir of KOKLER) {
    const kok = satir[kaynak];
    if (yol === kok) return satir[hedef];
    if (ALT_YOLLU.has(satir[0]) && yol.startsWith(`${kok}/`)) {
      const kalan = yol.slice(kok.length + 1);
      // Tek düzey ve düz bir kısa ad: `/en/features/../../x` gibi bir yol eşleşmez.
      if (/^[a-z0-9-]+$/.test(kalan)) return `${satir[hedef]}/${kalan}`;
    }
  }
  return null;
}

/** `/en/...` → Türkçe karşılığı; site sayfası değilse `null` (404). */
export function turkceYolu(enYol: string): string | null {
  return esle(enYol, 1);
}

/** Türkçe site/yasal yolu → `/en/...`; site sayfası değilse `null` (panel, giriş). */
export function ingilizceYolu(trYol: string): string | null {
  return esle(trYol, 0);
}

export function enOnekliMi(yol: string): boolean {
  return yol === '/en' || yol.startsWith('/en/');
}

/**
 * Bir bağlantıyı istenen dile çevirir. Site içi bütün bağlantılar BURADAN
 * geçer: elle `/en` eklemek, eşlemesi olmayan bir yolu (`/login`) öneklemek
 * ve 404 üretmek demek. Site sayfası olmayan yol (panel, giriş, `#çapa`,
 * `mailto:`) olduğu gibi döner; çapa korunur.
 */
export function yerelYol(trYol: string, dil: 'tr' | 'en'): string {
  if (dil === 'tr') return trYol;
  const [yol, capa] = trYol.split('#') as [string, string | undefined];
  const en = yol ? ingilizceYolu(yol) : null;
  if (!en) return trYol;
  return capa !== undefined ? `${en}#${capa}` : en;
}

/**
 * Dil değiştirince gidilecek adres (TR · EN anahtarı, ilk ziyaret ekranı).
 * Site sayfasında karşı dildeki sayfa; değilse aynı yol (dil çerezden).
 */
export function dilDegisinceYol(simdikiYol: string, yeni: 'tr' | 'en'): string {
  if (yeni === 'en') return enOnekliMi(simdikiYol) ? simdikiYol : (ingilizceYolu(simdikiYol) ?? simdikiYol);
  return enOnekliMi(simdikiYol) ? (turkceYolu(simdikiYol) ?? simdikiYol) : simdikiYol;
}
