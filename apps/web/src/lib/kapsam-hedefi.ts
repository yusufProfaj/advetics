/**
 * ═══ KAPSAM DEĞİŞTİKTEN SONRA NEREYE DÜŞÜLECEK ═══
 *
 * Uzun süre cevap TEK bir adresti: `/dashboard`. Yani kurallar ekranında
 * çalışan biri şirket değiştirdiğinde kurallara değil GENEL BAKIŞ'a
 * düşüyordu ve geri gitmek için kenar çubuğundan yeniden tıklaması
 * gerekiyordu. Kullanıcının tarifi: *"herhangi bir şirkete geçiş
 * yaptığımda genel bakışa atmaması lazım hangi sayfadaysa onun yetkisiyle
 * gözükmesi gerekiyor."*
 *
 * Olduğu yerde kalmak niye kendiliğinden doğru değil: adres ESKİ KAPSAMIN
 * KİMLİKLERİNİ taşıyabiliyor. `/ayarlar/musteriler/<uuid>/kanallar`
 * adresindeki uuid yeni şirkette YOK; oraya düşmek ya 404 ya da "yetkiniz
 * yok" demek — ve ikisi de kullanıcıya kapsam değişiminin BAŞARISIZ olduğunu
 * düşündürür. O yüzden yol İLK KİMLİK PARÇASINDA kesiliyor ve bölümün
 * köküne düşülüyor.
 *
 * Yetki kontrolü BURADA YAPILMIYOR ve yapılamaz: hangi sayfanın hangi izni
 * istediğini sunucu bileşenleri biliyor ve zaten yetkisizi kendileri
 * yönlendiriyor. Burada yapılan tahmin, o kuralın İKİNCİ bir kopyası olurdu
 * (CLAUDE.md: "AYNI SÜZGECİ İKİ YERDE YAZMA") ve ayrıştığı gün kullanıcı
 * erişebildiği bir sayfadan atılırdı.
 */

/** UUID — panelde bütün dinamik yol parçaları bu biçimde. */
const KIMLIK_PARCASI = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * KAPSAMDAN BAĞIMSIZ SÜZGEÇLER — BEYAZ LİSTE.
 *
 * Tarih aralığı, platform ve sıralama yeni şirkette de anlamlı; onları
 * düşürmek kullanıcının seçtiği dönemi sessizce bugüne çevirirdi.
 * `musteri`, `hesap`, `kampanya`, `kural`, `sablon`… ise ESKİ kapsamın
 * kimlikleri ve taşınırsa sayfa boş liste gösterir.
 *
 * KARA LİSTE DEĞİL BEYAZ LİSTE: yeni bir kimlik parametresi eklendiğinde
 * kara listeyi güncellemeyi unutmak, o kimliği yeni kapsama taşımak demek —
 * ve belirtisi yalnızca "sonuç yok" olurdu (CLAUDE.md, `imzaTemizle` ile
 * aynı gerekçe). Beyaz listede unutmanın bedeli bir süzgecin sıfırlanması.
 */
const TASINAN_SUZGECLER = [
  'aralik',
  'baslangic',
  'bitis',
  'karsilastir',
  'ay',
  'platform',
  'seviye',
  'sekme',
  'sirala',
  'yon',
  'durum',
  'tur',
] as const;

/**
 * Kapsam değişiminden sonra gidilecek tam adres.
 *
 * @param pathname `usePathname()` çıktısı — sorgu dizesi taşımıyor.
 * @param params  mevcut sorgu parametreleri; yalnızca beyaz listedekiler taşınıyor.
 */
export function gecisHedefi(
  pathname: string | null | undefined,
  params: Record<string, string> = {},
): string {
  const yol = gecisYolu(pathname);
  const qs = new URLSearchParams();
  for (const anahtar of TASINAN_SUZGECLER) {
    const deger = params[anahtar];
    if (deger !== undefined && deger !== '') qs.set(anahtar, deger);
  }
  const s = qs.toString();
  return s ? `${yol}?${s}` : yol;
}

/** Yalnızca yol kısmı — kimlik taşıyan parçadan itibaren kesilmiş hâli. */
export function gecisYolu(pathname: string | null | undefined): string {
  if (!pathname || !pathname.startsWith('/')) return '/dashboard';
  const tutulan: string[] = [];
  for (const parca of pathname.split('/')) {
    if (parca === '') continue;
    if (KIMLIK_PARCASI.test(parca)) break;
    tutulan.push(parca);
  }
  // KÖK ADRES GENEL BAKIŞA GİDİYOR: `/` panelde bir ekran değil, yalnızca
  // bir yönlendirme. Oraya düşmek fazladan bir tur demek.
  if (tutulan.length === 0) return '/dashboard';
  return `/${tutulan.join('/')}`;
}
