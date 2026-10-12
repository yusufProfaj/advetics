/**
 * Rehberden platform girdilerine TÜRETME — saf.
 *
 * META: mevcut taslak şemasına (`TaslakAlanlari`) çevrilir ve mevcut zincir
 * (taslak sürümü → `derleMeta` → prova → yayın motoru) DEĞİŞMEDEN koşar.
 * Meta'nın kendi eksik listesi (`taslakEksikleri`) türetilmiş taslağa ayrıca
 * uygulanır: rehber kendi kontrolünde bir şeyi atlarsa motor yine durdurur.
 *
 * GOOGLE: `GoogleDerlemeGirdisi` üretilir; gövdeyi API'deki derleyici
 * (`google-write.ts` / `google-demandgen.ts` kurucuları) kurar. Shared'da
 * gövde kurulmaz: aynı gövdeyi üreten ikinci fonksiyon doğduğu anda ayrışır.
 *
 * Her iki türetme de alanların bir eksikle durduğunu VARSAYMAZ: girdi eksikse
 * `ret` döner. Yayın kapısı `rehberEksikleri`ne zaten baktı, ama bu fonksiyon
 * prova ucundan da çağrılıyor ve sessizce boş bir alanla gövde kurmak, platformun
 * varsayılanına karar bırakmak demek.
 */
import { TASLAK_IZINLI_KAYNAKLAR, type TaslakAlanlari } from '../taslak-alanlari';
import type { AlanDegeri } from '../taslak';
import type { OzelKategori } from '../meta/hedefleme';
import { REHBER_AMACLARI, type GoogleKurgu, type GoogleUlasma } from './amaclar';
import type { CalismaSaatleri } from '../calisma-saatleri';
import { REHBER_IZINLI_KAYNAKLAR, VARSAYILAN_META_PAYI, type MedyaMetni, type RehberAlanAdi, type RehberAlanlari } from './alanlar';
import { butceBol } from './butce';
import { METIN_SINIRLARI, karakterSayisi } from './metin';
import { niyetZorunluPlan, reklamSetiPlani, setlereAyir, type GorselOrani, type SetPlani } from '../banner-seti';
import { googleGorselKurgusuMu, pmaxUzunBaslik } from './google-gorsel';
import type { GoogleUzantiKaynagi, SiteBaglantisi } from './google-uzanti';
import { googleAramaOgeleri, type GoogleAramaOgeleri, type GoogleOgeDurumu, type GoogleOgeKaynagi } from './google-ogeler';
import type { SitePikselHali } from '../meta/niyetler';

/**
 * Meta taslak şeması en çok 5 kavram taşıyor. Kavram artık bir BANNER SETİ
 * (aynı tasarımın boyutları, `banner-seti.ts`) ya da bir video; yani sınır
 * görsel değil FİKİR sayısı.
 */
export const META_EN_COK_GORSEL = 5;

/** Setin varsayılan görseli (kalan yerleşimler): kare en geniş oturan oran. */
const VARSAYILAN_SIRASI: readonly GorselOrani[] = ['kare', 'dik45', 'yatay', 'dikey'];

/**
 * BİR FİKRİN KENDİ METNİ (Dalga 2). Set birden çok görsel taşıyor; metin
 * setin VARSAYILAN görselinde aranır (panel oraya yazar), yoksa setteki ilk
 * metinli görselde. Panel ile derleyici AYNI fonksiyonu okuyor: ekran "bu
 * setin metni" dediği metni derleyici başka bir görselden almasın.
 */
export function fikirMetni<T extends { oran?: GorselOrani; metin?: MedyaMetni }>(set: readonly T[]): MedyaMetni | null {
  return setSirasi(set).find((x) => x.metin)?.metin ?? null;
}

function setSirasi<T extends { oran?: GorselOrani }>(set: readonly T[]): T[] {
  return [...set].sort((a, b) => VARSAYILAN_SIRASI.indexOf(a.oran ?? 'kare') - VARSAYILAN_SIRASI.indexOf(b.oran ?? 'kare'));
}

/**
 * Setin metni HANGİ görselde durur ve görsele özel öneri HANGİ görselle
 * istenir: setin varsayılan sırasında kullanıcının kendi yüklediği ilk
 * görsel (üretilen boyut, aynı tasarımın kırpılmışı; kenarındaki yazıyı
 * kaybetmiş olabilir). Hepsi üretilmişse varsayılan görsel.
 */
export function setMetinSahibi<T extends { oran?: GorselOrani; uretildi?: true }>(set: readonly T[]): T | null {
  const s = setSirasi(set);
  return s.find((x) => !x.uretildi) ?? s[0] ?? null;
}

/** Boşları at, kırp, büyük/küçük harften bağımsız tekilleştir; sırayı koru. */
function tekilDolu(xs: readonly string[]): string[] {
  const gorulen = new Set<string>();
  const out: string[] = [];
  for (const x of xs) {
    const t = x.trim();
    const k = t.toLocaleLowerCase('tr-TR');
    if (!t || gorulen.has(k)) continue;
    gorulen.add(k);
    out.push(t);
  }
  return out;
}

/**
 * GOOGLE GÖRSEL KURGULARINDA BAŞLIKLAR FİKİRLERDEN TOPLANIR (Dalga 2).
 * Google tek bir reklama (Talep Yaratma) ya da tek öğe grubuna (Maks.
 * Performans) bütün görselleri ve bütün metinleri veriyor; görsele özel
 * metin orada bir HAVUZA girer. Ortak metin ÖNCE: yasal uyarılı açıklama
 * ortakta duruyor ve havuz kesilirken o düşmemeli. Sınırı aşan satır
 * ATILIR (kırpılmaz; yarıda kesilmiş başlık anlamı değiştirir), sayı
 * sınırı `METIN_SINIRLARI`ndan. Eksik listesi uzun satırı zaten engel
 * sayıyor; burada atılması yalnız savunma.
 */
export function googleMetinHavuzu(
  ortak: { basliklar: string[]; aciklamalar: string[] },
  fikirler: ReadonlyArray<MedyaMetni | null>,
): { basliklar: string[]; aciklamalar: string[] } {
  const basliklar = tekilDolu([...ortak.basliklar, ...fikirler.flatMap((f) => f?.basliklar ?? [])])
    .filter((x) => karakterSayisi(x) <= METIN_SINIRLARI.baslik)
    .slice(0, METIN_SINIRLARI.basliklarEnCok);
  const aciklamalar = tekilDolu([...ortak.aciklamalar, ...fikirler.flatMap((f) => f?.aciklamalar ?? [])])
    .filter((x) => karakterSayisi(x) <= METIN_SINIRLARI.aciklama)
    .slice(0, METIN_SINIRLARI.aciklamalarEnCok);
  return { basliklar, aciklamalar };
}

export type TuretmeSonucu<T> = { tur: 'tamam'; deger: T } | { tur: 'ret'; kodlar: string[] };

const turetilmis = <T>(deger: T, zaman: string): AlanDegeri<T> => ({ deger, kaynak: 'derleyici', kim: null, zaman });

/** Meta taslağının alanı ← rehberin hangi alanından KOPYALANIYOR (türetilenler hariç). */
const REHBERDEKI_KARSILIGI: Partial<Record<keyof TaslakAlanlari, RehberAlanAdi>> = {
  niyet: 'amac',
  reklamHesabiId: 'metaHesabiId',
  sayfaId: 'sayfaId',
  instagramId: 'instagramId',
  konumlar: 'konumlar',
  enDusukYas: 'enDusukYas',
  ipucuYas: 'yasAraligi',
  ekKategoriler: 'ekKategoriler',
  butce: 'butce',
  takvim: 'takvim',
  hedefAdres: 'hedefAdres',
  formSablonuId: 'formSablonuId',
  telefon: 'telefon',
  whatsappNumarasi: 'whatsappNumarasi',
  whatsappKarsilama: 'whatsappKarsilama',
  pikselId: 'pikselId',
};

/**
 * ═══ REHBERİN KAYNAĞI → META TASLAĞININ KAYNAĞI ═══
 *
 * Canlı hata (2026-10-12, "Siteme gelsinler" Meta + Google): Google kuruldu,
 * Meta HİÇ BAŞLAMADI ve kalıcı sebep yalnız "Bu alanı kendin seç"ti. Hazır
 * workspace aynı gün rehberin izinli kaynaklarını genişletti: bütçe ve
 * kategori `workspace_profili`, başlangıç `derleyici` ("yarın") ile dolu
 * geliyor. Rehber bunları KARAR sayıyor (onay penceresi tutarı ve tarihi
 * açıkça yazıyor, "Onayla" basılmadan hiçbir şey açılmıyor). Türetme ise
 * alanı kaynağıyla AYNEN kopyalıyordu ve Meta taslağının listesi bu üç alanda
 * yalnız `kullanici` kabul ediyor: çocuk taslak YAYIN KAPISINDA KAYNAK ile
 * durdu. Prova bu kilidi bilerek atladığı için (`provaIste`) ekran "prova
 * geçti" dedi ve hata ancak yayında görüldü.
 *
 * KURAL: rehberin KENDİ kapısından geçmiş bir kaynak (rehberin izinli
 * listesinde), Meta taslağının listesinde yoksa `kullanici` olarak taşınır;
 * `kim` ve `zaman` korunur. Kural gevşetilmiyor: rehberde izinli OLMAYAN bir
 * kaynak (`ai_onerisi` gibi, "Kullan"a basılmamış öneri) AYNEN kalır ve Meta
 * kilidi onu yine durdurur (çift kapı). Kaynağı zaten kabul edilen alana
 * dokunulmaz: o rehberlerin içerik özeti değişmez, kayıtlı provaları
 * bayatlamaz.
 */
export function rehberKaynaklariniTasi(t: TaslakAlanlari): TaslakAlanlari {
  const out: Record<string, unknown> = { ...t };
  for (const [hedef, kaynakAlan] of Object.entries(REHBERDEKI_KARSILIGI) as Array<[keyof TaslakAlanlari, RehberAlanAdi]>) {
    const d = t[hedef];
    const metaIzinli = TASLAK_IZINLI_KAYNAKLAR[hedef];
    if (!d || !metaIzinli || metaIzinli.includes(d.kaynak)) continue;
    if (!(REHBER_IZINLI_KAYNAKLAR[kaynakAlan] ?? []).includes(d.kaynak)) continue;
    out[hedef] = { ...d, kaynak: 'kullanici' };
  }
  return out as TaslakAlanlari;
}

/**
 * Rehber → Meta taslağı. `zaman` dışarıdan: saf kalsın (saat okumak aynı
 * girdiye farklı çıktı demek; içerik özeti `kim`/`zaman` almadığı için
 * özet yine de kararlı, ama testler saatsiz yazılabilsin).
 */
/**
 * `acik` = `acikPlatformlar(a, ajansYoneticisi)`: kullanıcının HAM seçimi
 * değil, görünür olanı. Ajan 4 bulgusu (BULGU-1): ham seçimle bölmek, Meta'sı
 * kapalı bir amaçta (VIDEO) "iki platform" seçili kalmış rehberde ekran
 * "Google 500 ₺" derken Google'a 250 ₺ gönderiyordu. Eksik listesi ve pay
 * çubuğu açık kümeyle bölüyor; türetme de aynısını yapmak zorunda.
 */
/**
 * Rehberin ORTAK yerleşim planı — derleyicinin `yerlesimPlani`yle aynı
 * kararın rehber girdisinden okunuşu (karar tablosu ve ekran bunu gösterir).
 * `null`: video var, görsel yok ya da bir görselin oranı bilinmiyor
 * (derleyici o hâlde yerleşimi otomatik bırakır ya da durur).
 */
export function rehberYerlesimPlani(a: RehberAlanlari, oranlar: ReadonlyMap<string, GorselOrani | null>): SetPlani | null {
  const medya = a.medya?.deger ?? [];
  const amac = a.amac?.deger;
  if (!amac || medya.length === 0) return null;
  const niyet = REHBER_AMACLARI[amac].meta.niyet;
  // ORAN BİLİNMİYORSA da niyetin zorunlu yerleşimi (TELEFON): derleyici
  // `derleyiciYerlesimPlani` ile AYNI kural; tablo "otomatik" deyip gövde
  // elle yazmasın.
  if (medya.some((x) => x.kapakVarlikId)) return niyetZorunluPlan(null, niyet);
  const ayrim = setlereAyir(medya, oranlar, niyet);
  if (ayrim.taninmayan.length || ayrim.cakisan.length) return niyetZorunluPlan(null, niyet);
  // Niyet AYNI: derleyici FORM'da elle yerleşimi daraltıyor; tablo
  // daraltmasız plan gösterirse "sağ sütun açık" der, gövde kapatır.
  return reklamSetiPlani(ayrim.setler.map((s) => s.map((x) => x.oran)), niyet);
}

/**
 * Meta fikirlerinden kaçı BANNER SETİ (iki+ boyut, `asset_feed_spec`)?
 * Karar tablosu WhatsApp karşılamasının o fikirlerde GİTMEDİĞİNİ söylemek
 * için okur; ayrım `rehberdenMeta` ile AYNI fonksiyondan (`setlereAyir`).
 * Ayrım kurulamıyorsa (oran bilinmiyor) `null`: tablo tahmin etmez.
 */
export function rehberFikirSetleri(a: RehberAlanlari, oranlar: ReadonlyMap<string, GorselOrani | null>): { setli: number; toplam: number } | null {
  const medya = a.medya?.deger ?? [];
  const amac = a.amac?.deger;
  if (!amac) return null;
  const videolar = medya.filter((x) => x.kapakVarlikId).length;
  const ayrim = setlereAyir(medya.filter((x) => !x.kapakVarlikId), oranlar, REHBER_AMACLARI[amac].meta.niyet);
  if (ayrim.taninmayan.length || ayrim.cakisan.length) return null;
  return { setli: ayrim.setler.filter((x) => x.length > 1).length, toplam: ayrim.setler.length + videolar };
}

/**
 * `oranlar`: medyadaki görsellerin oranı, SUNUCUDA varlığın ölçüsünden
 * (`oranBul`). Görseller sete ayrılıyor; oran bilinmeyen görsel sete girmez
 * ve türetme RET verir — sessizce atılan görsel, kullanıcının "yükledim"
 * dediği boyutun reklamda olmaması demek.
 */
/**
 * `sitePikseli`: seçili Meta hesabının piksel hâli (`sitePikselHali`), yalnız
 * "Siteme gelsinler"de taslağa yazılır ve hedefi seçer. ZORUNLU parametre:
 * varsayılanı olsaydı onu geçirmeyi unutan çağıran derlemede de testte de
 * sessiz kalır ve her site reklamı tıklamaya düşerdi.
 */
export function rehberdenMeta(
  a: RehberAlanlari,
  acik: { meta: boolean; google: boolean },
  paraBirimi: string,
  zaman: string,
  oranlar: ReadonlyMap<string, GorselOrani | null>,
  sitePikseli: SitePikselHali,
): TuretmeSonucu<TaslakAlanlari> {
  const kodlar: string[] = [];
  const amac = a.amac?.deger;
  const m = a.metin?.deger;
  const butce = a.butce?.deger;
  if (!amac) kodlar.push('AMAC');
  if (!m) kodlar.push('METIN');
  if (!butce) kodlar.push('BTC-01');
  if (!acik.meta) kodlar.push('PLT-META-KAPALI');
  if (kodlar.length || !amac || !m || !butce) return { tur: 'ret', kodlar };

  const pay = butceBol(BigInt(butce.micros), acik, a.metaPayiYuzde?.deger ?? VARSAYILAN_META_PAYI, paraBirimi);
  const basliklar = m.basliklar.map((s) => s.trim()).filter(Boolean).slice(0, METIN_SINIRLARI.metaBaslikSayisi);
  const aciklama = m.aciklamalar.map((s) => s.trim()).find(Boolean);
  const medya = a.medya?.deger ?? [];
  // VİDEO kendi başına bir fikir; görseller SETE ayrılır (bir set = bir reklam).
  const videolar = medya.filter((x) => x.kapakVarlikId);
  const ayrim = setlereAyir(medya.filter((x) => !x.kapakVarlikId), oranlar, REHBER_AMACLARI[amac].meta.niyet);
  if (ayrim.taninmayan.length) return { tur: 'ret', kodlar: ['GORSEL-ORAN'] };
  if (ayrim.cakisan.length) return { tur: 'ret', kodlar: ['GORSEL-SET-CAKISMA'] };
  const fikirler = [
    ...ayrim.setler.map((set) => {
      const varsayilan = VARSAYILAN_SIRASI.map((o) => set.find((x) => x.oran === o)).find(Boolean)!;
      return {
        varlikId: varsayilan.varlikId,
        ...(set.length > 1 ? { setGorselleri: set.map((x) => ({ varlikId: x.varlikId, oran: x.oran })) } : {}),
        kendiMetni: fikirMetni(set),
      };
    }),
    ...videolar.map((x) => ({ varlikId: x.varlikId, kapakVarlikId: x.kapakVarlikId, kendiMetni: x.metin ?? null })),
  ];
  // SESSİZ KESME YOK: altıncı fikri atmak yerine ret; ekran sayıyı söylüyor.
  if (fikirler.length > META_EN_COK_GORSEL) return { tur: 'ret', kodlar: ['GORSEL-SET-SAYI'] };
  // Başlık fikirler arasında sırayla dağıtılır. Aynı başlığı her fikre yazmak
  // Meta'nın kreatif çeşitliliğini boşa harcar, metin ise TEK (marka sesi ve
  // yasal uyarı her fikirde aynı kalmalı).
  //
  // GÖRSELE ÖZEL METİN (Dalga 2): fikrin kendi metni varsa ONUN başlığı,
  // ana metni ve açıklaması; boş bıraktığı parça ortaktan gelir. Kendi
  // metni olmayan fikirlerde davranış ve içerik özeti ESKİSİYLE AYNI
  // (kayıtlı provalar sebepsiz bayatlamasın).
  const kavramlar = fikirler.map(({ kendiMetni: k, ...f }, i) => {
    const kendiBaslik = (k?.basliklar ?? []).map((x) => x.trim()).find(Boolean);
    const kendiAna = k?.anaMetin?.trim() ? k.anaMetin : null;
    const kendiAciklama = (k?.aciklamalar ?? []).map((x) => x.trim()).find(Boolean);
    const ac = kendiAciklama ?? aciklama;
    return {
      ...f,
      baslik: kendiBaslik ?? (basliklar.length ? (basliklar[i % basliklar.length] as string) : ''),
      metin: kendiAna ?? m.anaMetin,
      ...(ac ? { aciklama: ac } : {}),
    };
  });

  const t: TaslakAlanlari = {
    niyet: { ...a.amac!, deger: REHBER_AMACLARI[amac].meta.niyet },
    ...(a.metaHesabiId ? { reklamHesabiId: a.metaHesabiId } : {}),
    ...(a.sayfaId ? { sayfaId: a.sayfaId } : {}),
    ...(a.instagramId ? { instagramId: a.instagramId } : {}),
    ...(a.konumlar ? { konumlar: { ...a.konumlar, deger: a.konumlar.deger.map(({ google: _g, ...k }) => k) } } : {}),
    ...(a.enDusukYas ? { enDusukYas: a.enDusukYas } : {}),
    ...(a.yasAraligi ? { ipucuYas: a.yasAraligi } : {}),
    ...(a.ekKategoriler ? { ekKategoriler: a.ekKategoriler } : {}),
    // Bütçe KULLANICININ kararı; payı derleyici ayırdı ama kaynak rehberdeki
    // gibi kalır ve Meta listesine `rehberKaynaklariniTasi` uyarlar (hazır
    // workspace'te `workspace_profili` geliyor).
    butce: { ...a.butce!, deger: { tip: butce.tip, micros: pay.meta.toString() } },
    ...(a.takvim ? { takvim: a.takvim } : {}),
    kavramlar: turetilmis(kavramlar, zaman),
    ...(a.hedefAdres ? { hedefAdres: a.hedefAdres } : {}),
    // Form YALNIZ form amacında taşınır (Ajan 4, Dalga 2 B5): Form'dan
    // Site'ye dönen bir rehberde kalan eski kimlik, site provasını eksik
    // listesinde hiç görünmeyen bir FORM-KIMLIK reddiyle düşürüyordu.
    ...(a.formSablonuId && REHBER_AMACLARI[amac].meta.niyet === 'FORM' ? { formSablonuId: a.formSablonuId } : {}),
    // Numara YALNIZ arama reklamında taşınır. Marka Merkezi telefonu her
    // rehberde önden doluyor; onu site reklamının taslağına da yazmak, o
    // taslağın içerik özetini değiştirip kayıtlı provaları sebepsiz
    // bayatlatırdı (yayında "Meta taslağı rehberden sonra değişmiş").
    ...(a.telefon && REHBER_AMACLARI[amac].meta.niyet === 'TELEFON' ? { telefon: a.telefon } : {}),
    // Aynı kural (Dalga 3): WhatsApp hattı ve piksel yalnız kendi amacında.
    // Marka Merkezi telefonu WhatsApp alanına da önden doluyor; onu her
    // taslağa yazmak kayıtlı provaları sebepsiz bayatlatırdı.
    ...(a.whatsappNumarasi && REHBER_AMACLARI[amac].meta.niyet === 'WHATSAPP' ? { whatsappNumarasi: a.whatsappNumarasi } : {}),
    // Karşılama da yalnız WhatsApp'ta: başka amaca yazmak içerik özetini
    // değiştirip provayı sebepsiz bayatlatırdı.
    ...(a.whatsappKarsilama && REHBER_AMACLARI[amac].meta.niyet === 'WHATSAPP' ? { whatsappKarsilama: a.whatsappKarsilama } : {}),
    ...(a.pikselId && REHBER_AMACLARI[amac].meta.niyet === 'SATIS' ? { pikselId: a.pikselId } : {}),
    // Piksel hâli YALNIZ site amacında: başka amaca yazmak o taslağın
    // içerik özetini piksel her sustuğunda değiştirip provasını bayatlatırdı.
    ...(REHBER_AMACLARI[amac].meta.niyet === 'SITE' ? { sitePikseli: turetilmis(sitePikseli, zaman) } : {}),
  };
  return { tur: 'tamam', deger: rehberKaynaklariniTasi(t) };
}

/**
 * TABAN NEGATİF LİSTE (SENTEZ S-43, K-06): Türkçe "işi olmayan" aramalar.
 * Sektöre göre ters etki yapanlar (`ikinci el` gibi) burada DEĞİL.
 * Ekranda sayısı ve listesi gösterilir ("9 arama otomatik dışarıda").
 */
export const TABAN_NEGATIFLER = ['ücretsiz', 'bedava', 'nasıl yapılır', 'iş ilanı', 'staj', 'pdf', 'indir', 'şikayet', 'maaş'] as const;

/** Türkçe dil ölçütü (Google `languageConstants/1037`). */
export const GOOGLE_TURKCE = 'languageConstants/1037';

/**
 * Teklif: dönüşüm ÖLÇÜLMÜYORSA "dönüşümü artır" teklifi öğrenemez ve
 * harcamayı rastgele dağıtır; panel turunda Google bunu yine de önerdi
 * (A4 § 3). Ölçüm yoksa ya da bilinmiyorsa Maksimum tıklama.
 */
export type GoogleTeklif = 'MAKS_TIKLAMA' | 'MAKS_DONUSUM';

/**
 * ═══ GOOGLE TEKLİFİ — TEK KURAL (Dalga 3) ═══
 *
 * Türetme, karar tablosu ve servis bunu okuyor. Önceden tablo "ölçüm
 * etkinse En çok dönüşüm" diyordu ve bu VIDEO'da da yazıyordu; Talep
 * Yaratma gövdesi ise her zaman `targetSpend` gönderiyordu (ekran yalan).
 *
 * - ARAMA: dönüşüm ölçümü KESİN etkinse dönüşüm, değilse tıklama.
 * - TALEP YARATMA (video ve görsel): her zaman tıklama. Erişim amacı
 *   ("bölgemde çok kişi görsün") dönüşüm değil; Talep Yaratma'nın erişim
 *   (gösterim başına) teklifi API'de ÖLÇÜLMEDİ, en yakın öngörülebilir
 *   strateji Maksimum tıklama. Dönüşüm teklifi bu amaçta para harcayıp
 *   kullanıcının istemediği şeyi öğrenirdi.
 * - MAKS. PERFORMANS: yalnız dönüşüm (Google başka strateji kabul etmiyor);
 *   ölçüm yoksa kurgu HİÇ kurulmuyor (`rehberdenGoogle` → `G-DONUSUM`).
 */
export function googleTeklifi(kurgu: GoogleKurgu, donusumEtkin: boolean | null, son30GunDonusum: number | null, ulasma: GoogleUlasma | null = null): GoogleTeklif {
  return googleTeklifKarari(kurgu, donusumEtkin, son30GunDonusum, ulasma).teklif;
}


/**
 * DÖNÜŞÜM TEKLİFİNİN VERİ EŞİĞİ — ÖLÇÜLECEK (yönetici kararı, 2026-10-12).
 * Birincil dönüşüm işleminin ETKİN olması, teklifin öğreneceği veri olduğu
 * anlamına gelmiyor: hiç dönüşüm saymamış (etiketi bozuk, sayfası trafik
 * almıyor) bir hesapta "En çok dönüşüm" harcamayı rastgele dağıtır ve
 * öğrenme bitmez. 15 / 30 gün Google'ın kendi önerilerinde geçen alt sınır
 * mertebesi; bu ürünün müşterilerinde doğru eşik ÖLÇÜLMEDİ — ilk kurulumların
 * sonucuyla güncellenecek.
 */
export const GOOGLE_DONUSUM_TEKLIF_ESIGI = 15;

/** TELEFON teklifinin ekrandaki sebebi (karar tablosu ve türetme aynı cümle). */
export const GOOGLE_TELEFON_TEKLIF_CUMLESI = "Google'ı yalnız aramalara optimize edecek ayar henüz doğrulanmadı; reklam tıklamaya göre çalışır";

/**
 * Teklif ve SEBEBİ (ekranda tek cümle). Arama'da dönüşüm teklifi yalnız
 * ölçüm KESİN etkinse VE son 30 günde eşik kadar dönüşüm OKUNDUYSA; sayı
 * okunamadıysa (`null`) güvenli taraf tıklama.
 */
export function googleTeklifKarari(
  kurgu: GoogleKurgu,
  donusumEtkin: boolean | null,
  son30GunDonusum: number | null,
  ulasma: GoogleUlasma | null = null,
): { teklif: GoogleTeklif; sebep: string } {
  if (kurgu === 'MAKS_PERFORMANS') return { teklif: 'MAKS_DONUSUM', sebep: 'Satın alma ölçümü etkin; Google hesaptaki bütün birincil dönüşümlerden öğrenir' };
  if (kurgu !== 'ARAMA') return { teklif: 'MAKS_TIKLAMA', sebep: "Talep Yaratma'da dönüşüm teklifi kurulmuyor" };
  /*
   * TELEFON: HER ZAMAN tıklama (yönetici kararı Ö-1, 2026-10-13). "En çok
   * dönüşüm" kurulunca Google hesabın BÜTÜN birincil işlemlerine optimize
   * ediyor: Advetics'in kendi kurduğu sitedeki tel: tıklaması (WEBPAGE) ve
   * form gönderimi dahil. Yani eşik doğru olsa bile öğrenilen sinyal yanlış
   * (Ajan 4 bulgusu). Kampanyayı yalnız aramaya bağlayan
   * `CampaignConversionGoal` validateOnly ile ÖLÇÜLENE kadar tıklama: yanlış
   * hedefe optimize etmekten öngörülebilir.
   */
  if (ulasma === 'telefon') return { teklif: 'MAKS_TIKLAMA', sebep: GOOGLE_TELEFON_TEKLIF_CUMLESI };
  if (donusumEtkin === null) return { teklif: 'MAKS_TIKLAMA', sebep: "Google Ads'teki dönüşüm ölçümü okunamadı; ölçülemeyen teklife para gönderilmez" };
  if (donusumEtkin === false) return { teklif: 'MAKS_TIKLAMA', sebep: 'Dönüşüm ölçümü kurulunca değiştirmeyi öneririz' };
  if (son30GunDonusum === null) return { teklif: 'MAKS_TIKLAMA', sebep: 'Son 30 günün dönüşüm sayısı okunamadı; tıklamayla başlıyoruz' };
  const sayi = Math.floor(son30GunDonusum);
  if (son30GunDonusum < GOOGLE_DONUSUM_TEKLIF_ESIGI) {
    return { teklif: 'MAKS_TIKLAMA', sebep: `Son 30 günde ${sayi} dönüşüm var; dönüşüm teklifi için en az ${GOOGLE_DONUSUM_TEKLIF_ESIGI} gerekiyor` };
  }
  return { teklif: 'MAKS_DONUSUM', sebep: `Dönüşüm ölçümü etkin ve son 30 günde ${sayi} dönüşüm var` };
}

export interface GoogleDerlemeGirdisi {
  kurgu: GoogleKurgu;
  ulasma: GoogleUlasma | null;
  teklif: GoogleTeklif;
  /** Hesabın müşteri kimliği, tiresiz. */
  musteriId: string;
  paraBirimi: string;
  saatDilimi: string;
  /** `geoTargetConstants/NNN`; PRESENCE ile yazılır ("ilgilenenler" kapalı). */
  konumlar: string[];
  dil: typeof GOOGLE_TURKCE;
  /** Talep Yaratma'da yaş segmenti; Arama'da yaş ölçütü YOK (gözlem, sınır değil). */
  enDusukYas: number;
  butce: { tip: 'gunluk' | 'toplam'; micros: bigint };
  takvim: { baslangic: string; bitis: string | null };
  hedefAdres: string;
  telefon: string | null;
  basliklar: string[];
  aciklamalar: string[];
  /** Öbek eşleme (`PHRASE`). */
  anahtarKelimeler: string[];
  negatifler: string[];
  gorselVarlikIdleri: string[];
  /**
   * GÖRSEL KURGULARI (Talep Yaratma görsel, Maks. Performans): görseller
   * ORANLARIYLA (sunucunun ölçüsünden). Yalnız o iki kurguda yazılır:
   * Arama/video girdisine eklemek o taslakların içerik özetini değiştirip
   * kayıtlı provaları sebepsiz bayatlatırdı. Videolar burada YOK (Google
   * videoyu YouTube'dan istiyor; eksik listesi uyarıyor).
   */
  gorseller?: Array<{ varlikId: string; oran: GorselOrani }>;
  /** Maks. Performans uzun başlığı (`pmaxUzunBaslik`); varsa açıklamalar ondan arındırılmış gelir. */
  uzunBasliklar?: string[];
  youtubeVideoId: string | null;
  isletmeAdi: string | null;
  logoVarlikId: string | null;
  /** Kısıtlı kategori; Google'da kendi kural paketiyle derlenir. */
  kategoriler: OzelKategori[];
  /**
   * UZANTILAR (`google-uzanti.ts`) — YALNIZ Arama + site ulaşmasında yazılır
   * (diğer kurguların içerik özeti değişmesin). Boş dizi = AÇIKÇA yok
   * (kaynak çıkmadı); alanın hiç olmaması = eski girdi.
   */
  siteBaglantilari?: SiteBaglantisi[];
  aciklamaMetinleri?: string[];
  /** Arama reklamının görünen yolu (`path1`, `path2`); yalnız doluysa yazılır. */
  gorunenYol?: string[];
  /**
   * ARAMA ÖĞELERİ (g-1.2.0, `google-ogeler.ts`): yalnız Arama kurgusunda ve
   * kaynak verildiyse yazılır. `ogeDurumlari` her öğenin "eklendi / eklenmedi:
   * sebep" satırı; girdiyle SAKLANIYOR ki prova sonrası ekran (ve yayın)
   * sebebi bellek önbelleği dolduktan sonra da söyleyebilsin.
   */
  ogeler?: GoogleAramaOgeleri;
  ogeDurumlari?: GoogleOgeDurumu[];
  /** Site bağlantısı çıkmadıysa SEBEBİ (site okuması); kalıcı, aynı gerekçe. */
  siteSebebi?: string | null;
  /**
   * TELEFON: Marka Merkezi'ndeki çalışma saatleri (`calisma-saatleri.ts`).
   * YALNIZ Arama + telefon ulaşmasında ve DOLUYSA yazılır: boş anahtar
   * eklemek diğer taslakların içerik özetini değiştirip kayıtlı provaları
   * sebepsiz bayatlatırdı. Arama öğesinin `adScheduleTargets`i olur.
   */
  aramaSaatleri?: CalismaSaatleri;
  /**
   * Google öğeleri REDDETTİ ve bu girdi öğesiz yeniden prova için türetildi.
   * Derleyici "sitende ayrı sayfa bulunamadı" demesin: bulundu, reddedildi.
   */
  ogeReddi?: true;
}

/**
 * Görünen yol parçaları: boşlar atılır, en çok iki. `path2` tek başına
 * olamaz (Google `path1` istiyor): ilk dolu parça `path1` olur.
 */
export function gorunenYolu(xs: readonly string[] | undefined): string[] {
  return (xs ?? []).map((x) => x.trim()).filter(Boolean).slice(0, 2);
}

export interface GoogleTuretmeBaglami {
  musteriId: string;
  paraBirimi: string;
  saatDilimi: string;
  donusumEtkin: boolean | null;
  /** Hesabın son 30 gündeki dönüşüm sayısı (`metrics.conversions`); okunamadıysa `null`. */
  son30GunDonusum: number | null;
  /** Arama + site: site bağlantısı ve açıklama metni kaynağı (servis önbelleği). */
  uzantilar: GoogleUzantiKaynagi | null;
  /** Arama: öğe kaynakları (telefon, marka adı, logo, snippet, promosyon, fiyat). Yoksa öğe yazılmaz. */
  ogeKaynagi?: GoogleOgeKaynagi | null;
  /** Birincil SATIN ALMA dönüşümü etkin mi; Maks. Performans yalnız `true` ile kurulur. */
  satisOlcumu: boolean | null;
  /** Medyadaki görsellerin oranı (sunucuda, varlığın ölçüsünden); görsel kurgularında zorunlu. */
  medyaOranlari?: ReadonlyMap<string, GorselOrani | null>;
  isletmeAdi: string | null;
  logoVarlikId: string | null;
  /** Müşteri kartındaki kategori tabanı (taslakta düşürülemez). */
  kategoriTabani: OzelKategori[];
  /** Marka Merkezi çalışma saatleri; `null` = bilinmiyor (arama öğesine saat gitmez). */
  calismaSaatleri?: CalismaSaatleri | null;
}

/** `acik`: `rehberdenMeta` ile aynı kural (görünür küme, ham seçim değil). */
export function rehberdenGoogle(a: RehberAlanlari, acik: { meta: boolean; google: boolean }, b: GoogleTuretmeBaglami): TuretmeSonucu<GoogleDerlemeGirdisi> {
  const kodlar: string[] = [];
  const amac = a.amac?.deger;
  const m = a.metin?.deger;
  const butce = a.butce?.deger;
  const takvim = a.takvim?.deger;
  const adres = a.hedefAdres?.deger;
  const konumlar = a.konumlar?.deger ?? [];
  if (!amac) kodlar.push('AMAC');
  const tanim = amac ? REHBER_AMACLARI[amac].google : null;
  if (tanim && tanim.kurgu === null) kodlar.push('G-KARSILIK-YOK');
  if (!acik.google) kodlar.push('PLT-GOOGLE-KAPALI');
  if (!m) kodlar.push('METIN');
  if (!butce) kodlar.push('BTC-01');
  if (!takvim) kodlar.push('TKV');
  if (!adres) kodlar.push('SITE-ADRES');
  if (konumlar.length === 0) kodlar.push('KNM-01');
  if (konumlar.some((k) => !k.google)) kodlar.push('G-KONUM');
  if (tanim && tanim.kurgu === 'MAKS_PERFORMANS' && b.satisOlcumu !== true) kodlar.push('G-DONUSUM');
  if (kodlar.length || !tanim || tanim.kurgu === null || !m || !butce || !takvim || !adres) return { tur: 'ret', kodlar };

  // GÖRSEL KURGULARI: görsel oranıyla; oranı bilinmeyen görsel türetmeyi
  // DURDURUR (sessizce atılan görsel = kullanıcının "yükledim" dediğinin
  // reklamda olmaması). Görselin Google'a gidip gidemeyeceği (±%1, en az
  // boyut) derleyicide, ölçüyle.
  let gorsel: Pick<GoogleDerlemeGirdisi, 'gorseller' | 'uzunBasliklar'> = {};
  // GÖRSEL KURGULARINDA METİN HAVUZU (Dalga 2): görsele özel metinler
  // ortak metne eklenir. Hiçbir görselin kendi metni yoksa havuz ortak
  // metnin AYNISI ve içerik özeti değişmez.
  const fikirMetinleri = googleGorselKurgusuMu(tanim.kurgu) ? (a.medya?.deger ?? []).map((x) => x.metin ?? null) : [];
  const havuz = fikirMetinleri.some(Boolean) ? googleMetinHavuzu(m, fikirMetinleri) : { basliklar: m.basliklar, aciklamalar: m.aciklamalar };
  if (googleGorselKurgusuMu(tanim.kurgu)) {
    const gorseller: Array<{ varlikId: string; oran: GorselOrani }> = [];
    for (const x of (a.medya?.deger ?? []).filter((x) => !x.kapakVarlikId)) {
      const oran = b.medyaOranlari?.get(x.varlikId) ?? null;
      if (oran === null) return { tur: 'ret', kodlar: ['G-GORSEL-ORAN'] };
      gorseller.push({ varlikId: x.varlikId, oran });
    }
    gorsel = { gorseller };
    if (tanim.kurgu === 'MAKS_PERFORMANS') {
      const p = pmaxUzunBaslik(m.anaMetin, havuz.aciklamalar);
      if (!p) return { tur: 'ret', kodlar: ['G-UZUN-BASLIK'] };
      gorsel.uzunBasliklar = p.uzunBasliklar;
    }
  }

  const pay = butceBol(BigInt(butce.micros), acik, a.metaPayiYuzde?.deger ?? VARSAYILAN_META_PAYI, b.paraBirimi);
  const ek = a.ekKategoriler?.deger ?? [];
  return {
    tur: 'tamam',
    deger: {
      kurgu: tanim.kurgu,
      ulasma: tanim.ulasma,
      teklif: googleTeklifi(tanim.kurgu, b.donusumEtkin, b.son30GunDonusum, tanim.ulasma),
      musteriId: b.musteriId.replace(/-/g, ''),
      paraBirimi: b.paraBirimi,
      saatDilimi: b.saatDilimi,
      konumlar: konumlar.map((k) => k.google!.kaynak),
      dil: GOOGLE_TURKCE,
      enDusukYas: a.enDusukYas?.deger ?? 18,
      butce: { tip: butce.tip, micros: pay.google },
      takvim,
      hedefAdres: adres,
      telefon: a.telefon?.deger ?? null,
      basliklar: havuz.basliklar.map((s) => s.trim()).filter(Boolean).slice(0, METIN_SINIRLARI.basliklarEnCok),
      // Maks. Performans'ta uzun başlık olan açıklama açıklamalardan çıkar
      // (aynı metin iki alana ayrı Asset olarak bağlanmasın; `pmaxUzunBaslik`).
      aciklamalar: havuz.aciklamalar
        .map((s) => s.trim())
        .filter(Boolean)
        .filter((s) => !gorsel.uzunBasliklar?.includes(s))
        .slice(0, METIN_SINIRLARI.aciklamalarEnCok),
      anahtarKelimeler: (a.anahtarKelimeler?.deger ?? []).map((k) => k.metin.trim()),
      negatifler: [...TABAN_NEGATIFLER],
      gorselVarlikIdleri: (a.medya?.deger ?? []).map((x) => x.varlikId),
      youtubeVideoId: a.youtubeVideo?.deger?.videoId ?? null,
      isletmeAdi: b.isletmeAdi,
      logoVarlikId: b.logoVarlikId,
      kategoriler: [...new Set([...b.kategoriTabani, ...ek])],
      ...gorsel,
      // Site okunmadıysa (`null`) da BOŞ yazılır: türetme prova anında
      // koşuyor ve okunmamış bir site "bağlantı yok" ile aynı gövdeyi kurar;
      // ekran sebebi ayrıca söylüyor (karar tablosu UZANTI satırı).
      ...(tanim.kurgu === 'ARAMA' && tanim.ulasma === 'site'
        ? {
            siteBaglantilari: b.uzantilar?.siteBaglantilari ?? [],
            aciklamaMetinleri: b.uzantilar?.aciklamaMetinleri ?? [],
            siteSebebi: (b.uzantilar?.siteBaglantilari?.length ?? 0) > 0 ? null : (b.uzantilar?.siteSebebi ?? null),
          }
        : {}),
      ...(tanim.kurgu === 'ARAMA' && (b.uzantilar?.googleReddi || b.ogeKaynagi?.googleReddi) ? { ogeReddi: true as const } : {}),
      ...(tanim.kurgu === 'ARAMA' && b.ogeKaynagi ? (() => {
        const o = googleAramaOgeleri(b.ogeKaynagi);
        return { ogeler: o.ogeler, ogeDurumlari: o.durumlar };
      })() : {}),
      // GÖRÜNEN YOL yalnız Arama'da ve DOLUYSA: boş anahtar göndermemek
      // eski rehberlerin içerik özetini korur, Google'a boş yol gitmez.
      ...(tanim.kurgu === 'ARAMA' && gorunenYolu(m.gorunenYol).length ? { gorunenYol: gorunenYolu(m.gorunenYol) } : {}),
      ...(tanim.kurgu === 'ARAMA' && tanim.ulasma === 'telefon' && b.calismaSaatleri?.length ? { aramaSaatleri: b.calismaSaatleri } : {}),
    },
  };
}
