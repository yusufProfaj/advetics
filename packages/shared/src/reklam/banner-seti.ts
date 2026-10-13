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

import type { NiyetKodu } from './meta/niyetler';

/**
 * BANNER SETİ (birden çok boyutlu fikir) HANGİ META AMACINDA KURULABİLİR —
 * TEK KAYNAK: derleyici (`KRT-SET` reddi) ve `setlereAyir` bunu okuyor.
 * Set desteklenmeyen amaçta rehber görselleri hiç gruplamıyor (her görsel
 * kendi reklamı); önce bir `M-SET-AMAC` engeli vardı ama sırayla doldurma
 * kullanıcının kurmadığı setleri üretiyordu ve engel onu kendi bırakmadığı
 * bir sorunu çözmeye gönderiyordu (DALGA-2 Ç-4).
 *
 * Yerleşime göre görsel site reklamında 2026-10-10'da ÖLÇÜLDÜ
 * (`meta-yerlesim-prova`). Diğer görselli amaçlar 2026-10-12'de
 * `adcreatives` validate_only ile soruldu (Ege Birlik, v25.0): form, WhatsApp,
 * arama, satış ve erişim setleri KABUL EDİLDİ. AMA form amacında düğme
 * değeri olmayan biçim de geçti — Meta form kimliği eksik kreatifi
 * doğrulamada reddetmiyor. Bu yüzden değer taşıyan amaçlarda düğme
 * `call_to_actions` ({type, value}) ile gidiyor ve geri okuma değeri de
 * karşılaştırıyor (`varlikAkisiAyni`): değer yazılmadıysa yayın AÇILMAZ.
 * Video izlenme dışarıda: video seti ölçülmedi (iki boyut video ister).
 *
 * TELEFON ÇIKARILDI (yönetici kararı, 2026-10-12). Validate_only kabulü
 * `tel:` değerli düğmenin set kurallarında GERÇEKTEN çalıştığını
 * göstermiyor (form dersi: Meta değersiz düğmeyi de kabul etti) ve arama
 * reklamı artık zorunlu dar yerleşimde (`niyetYerlesimKisiti`): setin
 * yerleşim kuralları ile reklam setinin dar listesi ilk kez birlikte
 * kurulacaktı, hiç ölçülmeden. Gerçek bir kurulumla ölçülene kadar her
 * görsel kendi reklamı.
 */
export const BANNER_SETI_NIYETLERI: readonly NiyetKodu[] = ['SITE', 'FORM', 'WHATSAPP', 'SATIS', 'ERISIM'];

export function bannerSetiDestekleniyor(niyet: NiyetKodu): boolean {
  return BANNER_SETI_NIYETLERI.includes(niyet);
}

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

/**
 * NİYETE GÖRE YERLEŞİM KISITI — TEK YER (derleyici, rehberin eksik listesi,
 * karar tablosu ve set kartları bunu okur).
 *
 * FORM: elle yerleşimde (eksik boyut) YALNIZ anlık formun kesin çalıştığı
 * yerler: Facebook/Instagram akışı, hikâye ve Reels. Sağ sütun, Facebook
 * araması, Marketplace ve Instagram Keşfet DIŞARIDA (Audience Network elle
 * yerleşimde zaten yok). Gerekçe: anlık formun bu yerleşimlerde açılıp
 * açılmadığı ÖLÇÜLMEDİ (canlı ölçüm listesi: "diğer yerleşimlerde anlık form
 * kabulü"); Meta kabul edip formu açamazsa harcama olur, form gelmez, hata
 * yok. Dört boyut tamsa (Advantage+ yerleşim) kısıt UYGULANMIYOR: yerleşimi
 * Meta seçiyor ve form amacında kendi uygun yerlerini biliyor; elle
 * yerleşimde ise seçimi biz yapıyoruz.
 */
export interface NiyetYerlesimKisiti {
  /** Açık kalabilecek gruplar. */
  gruplar: readonly YerlesimGrubu[];
  /** Açık grupların içinden çıkarılan Meta konumları (`instagram_positions`: Keşfet). */
  cikarilanKonumlar: Readonly<Record<string, readonly string[]>>;
  /**
   * Açık grupların konumlarına EKLENEN konumlar (grup başına). Yalnız video
   * izlenme kullanıyor: grup haritası banner oranlarına göre kurulu ve
   * videonun belgelenen konumlarının bir kısmı hiçbir grupta yok.
   */
  ekKonumlar?: Partial<Record<YerlesimGrubu, Readonly<Record<string, readonly string[]>>>>;
  /** Ekranda ve derleyicinin "kapattıklarımız" satırında. */
  aciklama: string;
  /**
   * Dört boyut tamken de (ya da oran bilinmiyorken, video) elle yerleşim.
   * FORM/WhatsApp'ta Advantage+ yerleşime güveniliyor; ARAMADA güvenilmiyor:
   * masaüstünde "Ara" düğmesi bir telefonu çaldırmaz ve gösterim boşa gider.
   */
  otomatikteDe?: boolean;
  /** Boş grup reddinin cümlesi (derleyici `KRT-ORAN`). */
  bosMesaji: string;
  /**
   * `otomatikteDe` niyetinde karar tablosunun "Nerede" cümlesindeki
   * yerleşim parçası ("yalnız telefonda, seçilen yerleşimlerde"). Tek
   * niyete yazılmış sabit cümle, ikinci `otomatikteDe` niyetinde (video)
   * sebebi yanlış söylüyordu.
   */
  ekranMetni?: string;
}

/**
 * WHATSAPP AYNI KÜMEYİ KULLANIYOR (yönetici kararı, 2026-10-12, SENTEZ
 * D-M6). Sohbet düğmesinin sağ sütun, Facebook araması, Marketplace ve
 * Keşfet'te WhatsApp'ı açıp açmadığı ÖLÇÜLMEDİ; formdaki gerekçenin aynısı
 * (kabul edip sohbet açamazsa harcama olur, mesaj gelmez, hata yok). Küme
 * TEK: iki niyet ayrı listeler taşısaydı biri güncellenip öteki unutulurdu.
 * Yalnız ekran cümlesi niyete göre.
 */
const DAR_YERLESIM_GRUPLARI: readonly YerlesimGrubu[] = ['akis', 'hikaye'];
const DAR_YERLESIM_CIKARILAN: Readonly<Record<string, readonly string[]>> = { instagram_positions: ['explore'] };
const DAR_YERLESIM_KAPALI = 'sağ sütun, arama, Marketplace ve Keşfet kapalı.';

/*
 * TELEFON (yönetici kararı, 2026-10-12): Facebook akışı, Marketplace,
 * Facebook Reels, Facebook ve Instagram hikâyesi, Instagram akışı. Sağ
 * sütun ve arama masaüstü yüzeyleri; Instagram Keşfet ve Reels'te arama
 * düğmesinin davranışı ÖLÇÜLMEDİ; Audience Network ve Messenger elle
 * yerleşimde zaten yazılmıyor. Kural DAR: arama reklamı kabul edilip
 * çaldıramayacağı bir yerde gösterilirse para gider, arama gelmez, hata yok.
 * Cihaz ayrıca `device_platforms: ['mobile']` ile kapatılıyor (derle.ts).
 */
const TELEFON_YERLESIM_GRUPLARI: readonly YerlesimGrubu[] = ['akis', 'pazar', 'hikaye'];
const TELEFON_YERLESIM_CIKARILAN: Readonly<Record<string, readonly string[]>> = { instagram_positions: ['explore', 'reels'] };
const DAR_YERLESIM_BOS = '4:5, 1:1 ya da 9:16 görsel ekle.';

/*
 * VİDEO İZLENME (yönetici kararı S1, VIDEO denetimi B9; Ajan 4 bulgusu K1):
 * "Advantage+ ama YALNIZ Audience Network hariç". Advantage+ yerleşim yalnız
 * yerleşim alanlarının YOKLUĞUYLA tanımlı (`YASAK_YERLESIM`), yani tek bir
 * ağı çıkarmak ELLE yerleşim demek. Biçim canlıda kurulmuş elle yerleşimin
 * AYNISI (`publisher_platforms` + açık konum listesi).
 *
 * LİSTE META'NIN PLACEMENT-TARGETING BELGESİNDEN (ölçülmedi, validate_only
 * provası ile ölçülecek). İlk sürüm yalnız banner gruplarının konumlarını
 * açıyordu ve Facebook video arasını (`instream_video`, ThruPlay için en
 * değerli envanter), video akışını ve profil akışlarını sessizce
 * kapatıyordu: "yalnız Audience Network hariç" sözü tutmuyordu. Gruplara
 * EK KONUM olarak giriyorlar (`ekKonumlar`): yeni grup açmak oran
 * mimarisini (banner seti kuralları) video için anlamsızca büyütürdü; video
 * tek dosya, oran kararı yok (16:9 video Reels'e Advantage+'ta da gidiyordu,
 * kırpma uyarısı giriş anında, `medyaKontrol`).
 *
 * KAPALI ve gerekçesi: sağ sütun ve arama (belge video/etkileşim için
 * desteklemeyebileceğini söylüyor), Messenger (belge VIDEO_VIEWS için
 * listelemiyor), Threads (ölçülmedi), Audience Network (karar).
 */
const VIDEO_YERLESIM_GRUPLARI: readonly YerlesimGrubu[] = ['akis', 'pazar', 'hikaye'];
const VIDEO_EK_KONUMLAR: Partial<Record<YerlesimGrubu, Readonly<Record<string, readonly string[]>>>> = {
  akis: { facebook_positions: ['video_feeds', 'instream_video', 'profile_feed'], instagram_positions: ['explore_home', 'profile_feed'] },
};

const DAR_YERLESIM_KISITLARI: Partial<Record<NiyetKodu, NiyetYerlesimKisiti>> = {
  FORM: {
    gruplar: DAR_YERLESIM_GRUPLARI,
    cikarilanKonumlar: DAR_YERLESIM_CIKARILAN,
    aciklama: `Form reklamı yalnız akış, hikâye ve Reels’te gösterilir; ${DAR_YERLESIM_KAPALI}`,
    bosMesaji: `Form reklamı yalnız akış, hikâye ve Reels’te gösterilir; ${DAR_YERLESIM_BOS}`,
  },
  WHATSAPP: {
    gruplar: DAR_YERLESIM_GRUPLARI,
    cikarilanKonumlar: DAR_YERLESIM_CIKARILAN,
    aciklama: `WhatsApp reklamı yalnız akış, hikâye ve Reels’te gösterilir; ${DAR_YERLESIM_KAPALI}`,
    bosMesaji: `WhatsApp reklamı yalnız akış, hikâye ve Reels’te gösterilir; ${DAR_YERLESIM_BOS}`,
  },
  TELEFON: {
    gruplar: TELEFON_YERLESIM_GRUPLARI,
    cikarilanKonumlar: TELEFON_YERLESIM_CIKARILAN,
    otomatikteDe: true,
    aciklama:
      'Arama reklamı yalnız telefonda ve Facebook akışı, Marketplace, Facebook Reels, hikâyeler ile Instagram akışında gösterilir; sağ sütun, arama, Instagram Keşfet ve Instagram Reels kapalı.',
    bosMesaji: `Arama reklamı yalnız akış, Marketplace, hikâye ve Facebook Reels’te gösterilir; ${DAR_YERLESIM_BOS}`,
    ekranMetni: 'yalnız telefonda, seçilen yerleşimlerde',
  },
  VIDEO_IZLENME: {
    gruplar: VIDEO_YERLESIM_GRUPLARI,
    cikarilanKonumlar: {},
    ekKonumlar: VIDEO_EK_KONUMLAR,
    otomatikteDe: true,
    aciklama: 'Video reklamında Audience Network, Messenger, Threads, sağ sütun ve arama kapalı.',
    bosMesaji: 'Video reklamı için yerleşim kalmadı.',
    ekranMetni: 'Audience Network hariç yerleşimlerde',
  },
};

export function niyetYerlesimKisiti(niyet: NiyetKodu | null | undefined): NiyetYerlesimKisiti | null {
  return (niyet && DAR_YERLESIM_KISITLARI[niyet]) || null;
}

/**
 * Grubun Meta konumları, niyet kısıtıyla. Instagram süzgeci derleyicide
 * (hesap yoksa); burada yalnız niyetin çıkardıkları.
 */
export function grupMetaKonumlari(g: YerlesimGrubu, niyet?: NiyetKodu | null): Record<string, string[]> {
  const kisit = niyetYerlesimKisiti(niyet);
  const out: Record<string, string[]> = {};
  for (const [alan, degerler] of Object.entries(YERLESIM_GRUPLARI[g].meta as Record<string, readonly string[]>)) {
    const cikan = kisit?.cikarilanKonumlar[alan] ?? [];
    out[alan] = degerler.filter((x) => !cikan.includes(x));
  }
  for (const [alan, ek] of Object.entries(kisit?.ekKonumlar?.[g] ?? {})) {
    out[alan] = [...new Set([...(out[alan] ?? []), ...ek])];
  }
  return out;
}

/**
 * META KONUMLARININ EKRAN ADLARI — Kontrol'ün "Nerede" hücresi gövdenin
 * konumlarından bu tabloyla TÜRETİLİYOR (K1). Elle yazılmış cümle ilk
 * sürümde gövdeden ayrışmıştı. Tabloda olmayan konum ham adıyla görünür:
 * sessizce atılmaz.
 */
export const META_KONUM_ETIKETI: Record<string, Record<string, string>> = {
  facebook_positions: {
    feed: 'akış',
    video_feeds: 'video akışı',
    instream_video: 'video arası',
    profile_feed: 'profil akışı',
    marketplace: 'Marketplace',
    story: 'hikâye',
    facebook_reels: 'Reels',
    right_hand_column: 'sağ sütun',
    search: 'arama',
  },
  instagram_positions: {
    stream: 'akış',
    story: 'hikâye',
    explore: 'Keşfet',
    explore_home: 'Keşfet ana sayfa',
    reels: 'Reels',
    profile_feed: 'profil akışı',
  },
};

/** Elle yerleşim gövdesinden "Facebook: …; Instagram: …" cümlesi. */
export function metaKonumCumlesi(t: Readonly<Record<string, readonly string[] | undefined>>): string {
  const parca = (alan: string, ad: string) => {
    const k = t[alan];
    return k?.length ? `${ad}: ${k.map((x) => META_KONUM_ETIKETI[alan]?.[x] ?? x).join(', ')}` : null;
  };
  return [parca('facebook_positions', 'Facebook'), parca('instagram_positions', 'Instagram')].filter(Boolean).join('; ');
}

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
  /**
   * NİYET yüzünden kapanan gruplar (`niyetYerlesimKisiti`). `kapanan`dan
   * AYRI: "1.91:1 görsel yok" demek, kullanıcıyı formun zaten
   * gösterilmeyeceği bir yerleşim için görsel yüklemeye gönderirdi.
   */
  niyetKapanan: YerlesimGrubu[];
}

/** Elle yerleşimde niyetin kapattığı grupları ayırır; otomatik planda dokunmaz. */
function niyetKisitiUygula(p: Omit<SetPlani, 'niyetKapanan'>, niyet?: NiyetKodu | null): SetPlani {
  const kisit = niyetYerlesimKisiti(niyet);
  if (!kisit || (p.otomatik && !kisit.otomatikteDe)) return { ...p, niyetKapanan: [] };
  const niyetKapanan = YERLESIM_SIRASI.filter((g) => !kisit.gruplar.includes(g));
  const gruplar: Partial<Record<YerlesimGrubu, GorselOrani>> = {};
  for (const g of YERLESIM_SIRASI) if (p.gruplar[g] && kisit.gruplar.includes(g)) gruplar[g] = p.gruplar[g];
  return { otomatik: false, gruplar, kapanan: p.kapanan.filter((g) => kisit.gruplar.includes(g)), niyetKapanan };
}

/** Tek setin planı. Oran listesi tekrarsız sayılır. */
export function setPlani(oranlar: readonly GorselOrani[], niyet?: NiyetKodu | null): SetPlani {
  const var_ = new Set(oranlar);
  const otomatik = GORSEL_ORANLARI.every((o) => var_.has(o));
  const gruplar: Partial<Record<YerlesimGrubu, GorselOrani>> = {};
  const kapanan: YerlesimGrubu[] = [];
  for (const g of YERLESIM_SIRASI) {
    const o = YERLESIM_GRUPLARI[g].oranlar.find((x) => var_.has(x));
    if (o) gruplar[g] = o;
    else kapanan.push(g);
  }
  return niyetKisitiUygula({ otomatik, gruplar, kapanan }, niyet);
}

/**
 * Reklam SETİ düzeyinde ortak plan. Yerleşim reklam setinin alanı ve bütün
 * reklamlarca paylaşılıyor: bir grup ancak HER set onu dolduruyorsa açık.
 * Aksi, o seti o yerleşimde kırpılmış ya da hiç görselsiz bırakırdı.
 * Otomatik yerleşim de ancak her set dört boyutu taşıyorsa.
 */
export function ortakPlan(setler: ReadonlyArray<readonly GorselOrani[]>, niyet?: NiyetKodu | null): SetPlani {
  if (setler.length === 0) return niyetKisitiUygula({ otomatik: false, gruplar: {}, kapanan: [...YERLESIM_SIRASI] }, niyet);
  // Set planları KISITSIZ: bir set otomatikken öteki değilse ortak plan
  // elle yerleşime düşer ve kısıt ancak ORTAK planda doğru uygulanır.
  const planlar = setler.map((s) => setPlani(s));
  const otomatik = planlar.every((p) => p.otomatik);
  const kapanan = YERLESIM_SIRASI.filter((g) => planlar.some((p) => p.kapanan.includes(g)));
  // Ortak planın `gruplar`ı yalnız açıklık bilgisi: hangi oranın kullanılacağı
  // SETE göre değişir (birinde 4:5, ötekinde kare) ve set planından okunur.
  const gruplar: Partial<Record<YerlesimGrubu, GorselOrani>> = {};
  for (const g of YERLESIM_SIRASI) if (!kapanan.includes(g)) gruplar[g] = planlar[0]!.gruplar[g]!;
  return niyetKisitiUygula({ otomatik, gruplar, kapanan }, niyet);
}

/**
 * AYRI REKLAMLARIN PLANI (banner seti yok): grup, onu dolduran EN AZ BİR
 * görsel varsa açık. Erişim canlı turunda (2026-10-11) 1:1 + 1.91:1 + 4:5
 * üç ayrı reklam olarak verildi ve kesişim (`ortakPlan`) akışı, sağ sütunu
 * ve Marketplace'i KAPATTI: 1.91:1'lik reklam akışa "uymuyor" sayıldı.
 * Kesişim banner setinde zorunlu (yerleşim kuralları her setin her açık
 * grubu doldurmasını istiyor); ayrı reklamlarda ise yerleşim reklam setinin
 * alanı ve gruba uyan reklam zaten var. Uymayan reklam o yerleşime de
 * gidebilir (Meta kırpar); bunun bedeli, bütün bir yerleşimi kapatmaktan
 * küçük. Dört oranın hepsi varsa Advantage+ yerleşim.
 */
export function birlesikPlan(setler: ReadonlyArray<readonly GorselOrani[]>, niyet?: NiyetKodu | null): SetPlani {
  return setPlani(setler.flat(), niyet);
}

/**
 * Reklam seti planı: banner seti (iki+ boyutlu set) varsa kesişim, yoksa
 * birleşim. `niyet` verilirse elle yerleşimde niyet kısıtı uygulanır
 * (`niyetYerlesimKisiti`); derleyici, rehber ve ekran AYNI niyeti geçirmeli.
 */
export function reklamSetiPlani(setler: ReadonlyArray<readonly GorselOrani[]>, niyet?: NiyetKodu | null): SetPlani {
  return setler.some((s) => s.length > 1) ? ortakPlan(setler, niyet) : birlesikPlan(setler, niyet);
}

/**
 * ORAN BİLİNMEYEN PLAN (video, ölçüsüz görsel) için niyetin zorunlu elle
 * yerleşimi. `null` = Advantage+ yerleşim; `otomatikteDe` taşıyan niyette
 * (arama) bu, masaüstü ve sağ sütun demek. Plan bütün grupları açık sayıyor
 * (oran değerleri yalnız açıklık bilgisi; set yok). Derleyici ve rehber AYNI
 * fonksiyonu çağırıyor: tablo "otomatik" deyip gövde elle yazmasın.
 */
export function niyetZorunluPlan(plan: SetPlani | null, niyet?: NiyetKodu | null): SetPlani | null {
  if (plan) return plan;
  return niyetYerlesimKisiti(niyet)?.otomatikteDe ? setPlani(GORSEL_ORANLARI, niyet) : null;
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
  niyet: NiyetKodu,
): { setler: Array<Array<T & { oran: GorselOrani }>>; taninmayan: T[]; cakisan: T[] } {
  const setler: Array<Array<T & { oran: GorselOrani }>> = [];
  const taninmayan: T[] = [];
  /*
   * SETİ OLMAYAN AMAÇTA HER GÖRSEL KENDİ REKLAMI. Sırayla doldurma burada da
   * çalışsaydı Form amacında yüklenen 4:5 ve 1:1 (iki AYRI tasarım) tek sete
   * düşer ve kullanıcı hiç kurmadığı bir seti dağıtmak zorunda kalırdı. Kayıtlı `setNo` da yok sayılıyor: "Siteme gelsinler"de
   * gruplanıp amacı değiştirilen rehber, ekranında set göremeyeceği bir
   * engelde kalırdı.
   */
  if (!bannerSetiDestekleniyor(niyet)) {
    for (const m of medya) {
      const oran = oranlar.get(m.varlikId) ?? null;
      if (oran) setler.push([{ ...m, oran }]);
      else taninmayan.push(m);
    }
    return { setler, taninmayan, cakisan: [] };
  }
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
