/**
 * BANNER SETİ — bir tasarımın boyutları TEK reklamdır (kullanıcı kararı,
 * 2026-10-10: *"biz bir banner setinin 4 farklı boyut varyasyonunu
 * kuruyoruz aslında 4 farklı görsel 4 farklı kreatif değil"*).
 *
 * Rehber önce her görseli ayrı bir fikir sayıyordu: aynı tasarımın dört
 * boyutu Meta'da dört reklam oluyor, her reklam tek boyutla BÜTÜN
 * yerleşimlere gidiyor (1.91:1 Reels'te kırpılıyor, 9:16 akışta), bütçe aynı
 * içeriğin kopyaları arasında bölünüyor ve "hangi fikir kazandı" anlamsız
 * hâle geliyordu.
 *
 * Kurallar TEK yerde (panel, eksik listesi, derleyici ve geri okuma bunu
 * okuyor); ikinci bir eşleme doğduğu anda ayrışır ve ekran bir yerleşimi
 * "açık" derken derleyici kapatır.
 *
 * EKSİK BOYUTTA O YERLEŞİM KAPANIR (kullanıcı kararı). Yedek yalnız oranın
 * KIRPILMADAN oturduğu yerde var: kare akışta ve sağ sütunda yerel boyut.
 * Hikâye/Reels'in yedeği YOK — kare oraya ancak kırpılarak ya da bantla
 * gider ve banner metni kesilir.
 */

export const GORSEL_ORANLARI = ['dikey', 'dik45', 'kare', 'yatay'] as const;
export type GorselOrani = (typeof GORSEL_ORANLARI)[number];

/** Ekranda ve hata metninde. */
export const ORAN_ETIKETI: Record<GorselOrani, string> = {
  dikey: '9:16',
  dik45: '4:5',
  kare: '1:1',
  yatay: '1.91:1',
};

/** genişlik / yükseklik. */
const ORAN_DEGERI: Record<GorselOrani, number> = { dikey: 9 / 16, dik45: 4 / 5, kare: 1, yatay: 1.91 };

/**
 * %3 pay: 1080×1350 tam 0,8 ama tasarımcının 1080×1346'sı da 4:5'tir.
 * Daha geniş pay komşu oranları karıştırır (4:5 = 0,80, 1:1 = 1,00 arası
 * güvenli; 9:16 = 0,5625).
 */
const ORAN_PAYI = 0.03;

/**
 * Görselin oranı; tanınmıyorsa `null`. `null` bir SONUÇ, hata değil: ekran
 * görseli bırakıldığı anda "bu oran kullanılamaz" der (doğrulama giriş
 * anında). Ölçü yoksa (video, eski kayıt) de `null`.
 */
export function oranBul(genislik: number | null | undefined, yukseklik: number | null | undefined): GorselOrani | null {
  if (!genislik || !yukseklik || genislik <= 0 || yukseklik <= 0) return null;
  const o = genislik / yukseklik;
  for (const ad of GORSEL_ORANLARI) {
    if (Math.abs(o - ORAN_DEGERI[ad]) / ORAN_DEGERI[ad] <= ORAN_PAYI) return ad;
  }
  return null;
}

/**
 * Yerleşim grupları. `oranlar` TERCİH sırası: ilki yoksa ikincisi (yedek).
 * Konumlar Meta'nın `*_positions` değerleri.
 */
export const YERLESIM_GRUPLARI = {
  hikaye: {
    etiket: 'Hikâye ve Reels',
    oranlar: ['dikey'],
    meta: { publisher_platforms: ['facebook', 'instagram'], facebook_positions: ['story', 'facebook_reels'], instagram_positions: ['story', 'reels'] },
  },
  akis: {
    etiket: 'Akış',
    oranlar: ['dik45', 'kare'],
    meta: { publisher_platforms: ['facebook', 'instagram'], facebook_positions: ['feed'], instagram_positions: ['stream', 'explore'] },
  },
  /*
   * MARKETPLACE KARE KUTU — gözle görüldü (2026-10-10, yayın 3efebf54,
   * Meta önizlemesi): akış grubunda olduğu için oraya 4:5 gitti ve Meta onu
   * kareye kırptı; banner'ın üstündeki marka ve alttaki telefon şeridi
   * kesildi. Yedeği yok: 4:5 orada her zaman kırpılıyor.
   */
  pazar: {
    etiket: 'Marketplace',
    oranlar: ['kare'],
    meta: { publisher_platforms: ['facebook'], facebook_positions: ['marketplace'] },
  },
  yan: {
    etiket: 'Sağ sütun ve arama',
    oranlar: ['yatay', 'kare'],
    meta: { publisher_platforms: ['facebook'], facebook_positions: ['right_hand_column', 'search'] },
  },
} as const satisfies Record<string, { etiket: string; oranlar: readonly GorselOrani[]; meta: Record<string, readonly string[]> }>;
export type YerlesimGrubu = keyof typeof YERLESIM_GRUPLARI;
export const YERLESIM_SIRASI: readonly YerlesimGrubu[] = ['akis', 'yan', 'pazar', 'hikaye'];

export interface SetPlani {
  /**
   * Dört boyut da var: yerleşim alanı GÖNDERİLMEZ (Advantage+ yerleşim,
   * bugünkü ve gelecekteki her yerleşim) ve kare kalan her yerin görseli.
   */
  otomatik: boolean;
  /** Açık grup → o grupta kullanılacak oran. */
  gruplar: Partial<Record<YerlesimGrubu, GorselOrani>>;
  /** Hiçbir oranı olmadığı için kapanan gruplar (ekranda söylenir). */
  kapanan: YerlesimGrubu[];
}

/** Tek setin planı. Oran listesi tekrarsız sayılır. */
export function setPlani(oranlar: readonly GorselOrani[]): SetPlani {
  const var_ = new Set(oranlar);
  const otomatik = GORSEL_ORANLARI.every((o) => var_.has(o));
  const gruplar: Partial<Record<YerlesimGrubu, GorselOrani>> = {};
  const kapanan: YerlesimGrubu[] = [];
  for (const g of YERLESIM_SIRASI) {
    const o = YERLESIM_GRUPLARI[g].oranlar.find((x) => var_.has(x));
    if (o) gruplar[g] = o;
    else kapanan.push(g);
  }
  return { otomatik, gruplar, kapanan };
}

/**
 * Reklam SETİ düzeyinde ortak plan. Yerleşim reklam setinin alanı ve bütün
 * reklamlarca paylaşılıyor: bir grup ancak HER set onu dolduruyorsa açık.
 * Aksi, o seti o yerleşimde kırpılmış ya da hiç görselsiz bırakırdı.
 * Otomatik yerleşim de ancak her set dört boyutu taşıyorsa.
 */
export function ortakPlan(setler: ReadonlyArray<readonly GorselOrani[]>): SetPlani {
  if (setler.length === 0) return { otomatik: false, gruplar: {}, kapanan: [...YERLESIM_SIRASI] };
  const planlar = setler.map(setPlani);
  const otomatik = planlar.every((p) => p.otomatik);
  const kapanan = YERLESIM_SIRASI.filter((g) => planlar.some((p) => p.kapanan.includes(g)));
  // Ortak planın `gruplar`ı yalnız açıklık bilgisi: hangi oranın kullanılacağı
  // SETE göre değişir (birinde 4:5, ötekinde kare) ve set planından okunur.
  const gruplar: Partial<Record<YerlesimGrubu, GorselOrani>> = {};
  for (const g of YERLESIM_SIRASI) if (!kapanan.includes(g)) gruplar[g] = planlar[0]!.gruplar[g]!;
  return { otomatik, gruplar, kapanan };
}

/**
 * Görselleri sete ayırır. `setNo` verilmişse ona uyulur; verilmemişse sırayla
 * doldurulur: aynı oranın İKİNCİ görseli yeni bir sete düşer (aynı oranda iki
 * görsel = iki farklı tasarım). Oranı tanınmayan görsel hiçbir sete girmez ve
 * ayrı döner — ekranda "kullanılamaz" yazılır, sessizce atılmaz.
 */
export function setlereAyir<T extends { varlikId: string; setNo?: number }>(
  medya: readonly T[],
  oranlar: ReadonlyMap<string, GorselOrani | null>,
): { setler: Array<Array<T & { oran: GorselOrani }>>; taninmayan: T[]; cakisan: T[] } {
  const setler: Array<Array<T & { oran: GorselOrani }>> = [];
  const taninmayan: T[] = [];
  // Elle aynı sete konmuş AYNI oranlı ikinci görsel: hangisinin kullanılacağını
  // tahmin etmek yerine ekranda sorulur (engel), sessizce biri atılmaz.
  const cakisan: T[] = [];
  const acik = medya.filter((m) => m.setNo === undefined);
  const elle = medya.filter((m) => m.setNo !== undefined);
  // ELLE NUMARALANANLAR ÖNCE: kullanıcının kararı otomatik dağıtımı yönlendirir.
  const numaralar = [...new Set(elle.map((m) => m.setNo!))].sort((a, b) => a - b);
  for (const n of numaralar) {
    const s: Array<T & { oran: GorselOrani }> = [];
    for (const m of elle.filter((x) => x.setNo === n)) {
      const oran = oranlar.get(m.varlikId) ?? null;
      if (!oran) taninmayan.push(m);
      else if (s.some((x) => x.oran === oran)) cakisan.push(m);
      else s.push({ ...m, oran });
    }
    if (s.length) setler.push(s);
  }
  for (const m of acik) {
    const oran = oranlar.get(m.varlikId) ?? null;
    if (!oran) {
      taninmayan.push(m);
      continue;
    }
    const hedef = setler.find((s) => !s.some((x) => x.oran === oran) && !s.some((x) => x.setNo !== undefined));
    if (hedef) hedef.push({ ...m, oran });
    else setler.push([{ ...m, oran }]);
  }
  return { setler, taninmayan, cakisan };
}
