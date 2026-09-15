/**
 * ═══ ARAMA SONUCUNDAKİ ADRES SATIRI ═══
 *
 * Google arama reklamında adres İKİ SATIR: üstte alan adı (fenbay.com.tr),
 * altında kırıntı yolu (https://www.fenbay.com.tr › fenbay › projeler).
 * Elimizde iki alan var ve ikisi de aynı şeyi anlatmıyor:
 *
 *   · `destinationUrl` — reklamın gerçek hedefi, tam adres. Yol burada.
 *   · `displayUrl`     — reklamverenin gösterdiği adres. Google'da çoğu
 *                        zaman yalnızca alan adı, bazen hiç yok.
 *
 * SAF FONKSİYON ve ayrı dosyada: panelde bileşen render eden bir test
 * altyapısı yok (`vitest.config.ts` bunu bilinçli reddediyor), yani JSX'in
 * içinde kalan bir adres ayrıştırması yalnızca kaynak taramasıyla
 * sınanabilirdi. Buradaki hâli ÇALIŞTIRILARAK sınanıyor.
 */
export interface AramaAdresi {
  /** Üst satır: fenbay.com.tr */
  alanAdi: string | null;
  /** Alt satır: https://www.fenbay.com.tr › fenbay › projeler */
  kirintiYolu: string | null;
}

export function aramaAdresi(
  destinationUrl: string | null | undefined,
  displayUrl: string | null | undefined,
): AramaAdresi {
  const gosterilen = temizle(displayUrl);

  /*
   * ADRES ÇÖZÜLEMEZSE UYDURULMUYOR. `new URL()` geçersiz değerde fırlatıyor
   * ve reklamverenin girdiği adres her zaman geçerli değil (şablon
   * parametresi, eksik şema). O hâlde elde ne varsa o gösteriliyor; yarım
   * bir kırıntı yolu uydurmak, olmayan bir sayfayı varmış gibi göstermek
   * olurdu.
   */
  let url: URL | null = null;
  if (destinationUrl) {
    try {
      url = new URL(destinationUrl);
    } catch {
      url = null;
    }
  }

  if (!url) {
    // Yalnızca gösterilen adres var: alan adı odur, yol yok.
    return { alanAdi: gosterilen, kirintiYolu: null };
  }

  /*
   * ALAN ADINDA `www.` YOK — Google da göstermiyor. Ama KIRINTI YOLUNDA
   * TAM ADRES duruyor: ikisi aynı olsaydı iki satır yazmanın anlamı kalmazdı.
   */
  const host = url.hostname.replace(/^www\./i, '');
  const parcalar = url.pathname
    .split('/')
    .map((p) => decodeURIComponent(p).trim())
    .filter((p) => p.length > 0);

  /*
   * YOL UZUNSA KESİLİYOR. Google da üç kırıntıdan sonrasını gizliyor ve
   * kutu dar; sekiz parçalı bir yol satırı taşırıp önizlemeyi bozuyordu.
   */
  const gorunen = parcalar.slice(0, 3);
  const kesildi = parcalar.length > gorunen.length;

  const taban = `${url.protocol}//${url.hostname}`;
  const kirintiYolu =
    gorunen.length === 0
      ? taban
      : `${taban} › ${gorunen.join(' › ')}${kesildi ? ' › …' : ''}`;

  return {
    // Reklamverenin gösterdiği adres varsa O kazanıyor: Google'da görünen
    // adres reklamverenin seçimi ve gerçek hedeften farklı olabiliyor.
    alanAdi: gosterilen ?? host,
    kirintiYolu,
  };
}

function temizle(deger: string | null | undefined): string | null {
  const s = deger?.trim();
  return s && s.length > 0 ? s : null;
}
