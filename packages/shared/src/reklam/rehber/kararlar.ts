/**
 * "Senin yerine verdiğimiz kararlar" tablosu (Kontrol adımı).
 *
 * Panel turunda (A4 § 4.1) iki platformun kendi seçtiği değerlerin
 * hepsi bizim için tuzaktı: Google konumu "tüm ülkeler", ağları ve AI Max'i
 * açık getiriyor; Meta sayfayı kendiliğinden başka bir müşterinin sayfası
 * seçiyor, "çok reklamverenli" birimi işaretli getiriyor. Bu tablo, her
 * birini AÇIKÇA kapattığımızı kullanıcıya söylüyor.
 *
 * SÖZ VERDİĞİ ŞEYİ DERLEYİCİ TUTMAK ZORUNDA: API tarafında derlenmiş gövde
 * bu tablodaki her satırla karşılaştırılan testle kilitlenir (Ajan 4). Tablo
 * "Görüntülü Reklam Ağı kapalı" deyip gövde `targetContentNetwork: true`
 * gönderirse ekran yalan söyler — bu depoda en pahalı hata türü.
 */
import { YERLESIM_GRUPLARI, niyetYerlesimKisiti, type SetPlani } from '../banner-seti';
import { UZUN_FORM_SORU_SAYISI } from '../../schemas/form.schema';
import type { SeciliFormHali } from './hazirlik';
import { REHBER_AMACLARI, type RehberAmacKodu, type RehberPlatformu } from './amaclar';
import { GOOGLE_PMAX_SATIS_ESIGI, PMAX_HEDEF_CUMLESI, type GoogleTeklif } from './turet';
import { metaOptimizasyonHedefi, type SitePikselHali } from '../meta/niyetler';
import { SITE_BAGLANTISI_YOK_CUMLESI, googleUzantiReddiCumlesi, type GoogleUzantiKaynagi } from './google-uzanti';
import { GOOGLE_OGE_ADLARI, type GoogleOgeDurumu } from './google-ogeler';
import { KARSILAMA_SETTE_YOK_CUMLESI, karsilamaCoz, type WhatsappKarsilama } from '../meta/karsilama';
import { calismaSaatleriOzeti, type CalismaSaatleri } from '../calisma-saatleri';

export interface KararHucresi {
  deger: string;
  not?: string;
}

export interface KararSatiri {
  /** Testin derleyiciyle eşleştirdiği sabit kod. */
  kod:
    | 'TUR'
    | 'TEKLIF'
    | 'NEREDE'
    | 'KONUM'
    | 'OTOMATIK_METIN'
    | 'SAYFA'
    | 'OLCUM'
    | 'SIKLIK'
    | 'UZANTI'
    | 'OGE'
    | 'FORM'
    | 'KARSILAMA'
    | 'GERI_ARAMA'
    | 'SAAT'
    | 'GORSEL';
  konu: string;
  meta: KararHucresi | null;
  google: KararHucresi | null;
}

/**
 * `instagramVar`: kullanıcı "Instagram olmadan" seçtiyse gövdede Instagram
 * kimliği yok ve Meta reklamı Instagram'da HİÇ göstermez (derle.ts). Tablonun
 * "Instagram ve Facebook" demesi o durumda yalan olurdu (Ajan 4, BULGU-3).
 */
/**
 * `yerlesim`: rehberin ortak yerleşim planı (`rehberYerlesimPlani`), yani
 * derleyicinin kuracağı gövdeyle AYNI karar. `null` = otomatik yerleşim
 * (video var ya da oran bilinmiyor). Tablo "otomatik" derken gövde yerleşim
 * yazarsa söz yalan olur; `ajan4-denetim.spec` ikisini karşılaştırıyor.
 */
/**
 * `ek` — gövdeyi seçen girdiler, ekranda SEBEBİYLE söylensin diye:
 * - `sitePikseli`: "Siteme gelsinler"de Meta hedefi (`metaOptimizasyonHedefi`,
 *   derleyiciyle AYNI fonksiyon). Verilmezse `bilinmiyor` = tıklama.
 * - `googleTeklifSebebi`: `googleTeklifKarari`nın cümlesi.
 * - `uzantilar`: Arama + site'de site bağlantısı / açıklama metni kaynağı.
 */
export interface KararEki {
  sitePikseli?: SitePikselHali | null;
  googleTeklifSebebi?: string;
  uzantilar?: GoogleUzantiKaynagi | null;
  /**
   * Arama öğelerinin satırları (`googleAramaOgeleri`, derleyicinin okuduğu
   * AYNI çıktı). Her öğe ayrı satır: "eklendi" ya da "eklenmedi: sebep".
   */
  ogeler?: readonly GoogleOgeDurumu[] | null;
  /**
   * FORM: seçili formun Meta'daki hâli (tür ve soru sayısı). `null` ya da
   * alan yoksa hücre "okunamadı" der; türü tahmin etmez.
   */
  form?: SeciliFormHali | null;
  /**
   * WHATSAPP: kaydedilmiş karşılama (yoksa varsayılan) ve fikirlerin kaçının
   * banner seti olduğu (`rehberFikirSetleri`). Setli fikirde karşılama
   * gitmiyor (derle.ts); tablo bunu söylemezse "ilk mesaj Türkçe" sözü yalan.
   */
  whatsappKarsilama?: { kayit: WhatsappKarsilama | null; setler: { setli: number; toplam: number } | null } | null;
  /** TELEFON: Marka Merkezi çalışma saatleri (Google arama öğesine giden AYNI değer). */
  calismaSaatleri?: CalismaSaatleri | null;
  /**
   * Google hesabının saat dilimi. Saat planı HESABIN saat diliminde
   * uygulanıyor; Türkiye dışındaysa "09:00" başka bir saate denk gelir.
   */
  googleSaatDilimi?: string | null;
  /**
   * SATIŞ (2026-10-13): seçili pikselin son 7 gündeki satın alma sayısı
   * (`null` = okunamadı) ve Google'ın son 30 gündeki satın alma sayısı.
   * Alan yoksa hücre sayı söylemez (eski çağıran); `null` "okunamadı" der.
   */
  metaSatinAlma7Gun?: number | null;
  googleSatis30Gun?: number | null;
}

/**
 * Meta'nın öğrenme aşaması bir reklam setinde haftada ~50 optimizasyon
 * olayı istiyor (Meta Business Help, "learning phase"). Altında reklam
 * yayınlanır ama "öğrenme sınırlı" kalabilir; bu bir ENGEL değil, bilgi.
 */
export const META_OGRENME_HAFTALIK = 50;

/** Meta satış ölçümü hücresinin notu: haftalık sayı ve öğrenme bilgisi (üç hâl ayrı). */
export function metaSatisOlcumNotu(n: number | null | undefined): string {
  const taban = 'Reklam satın alma için optimize edilir';
  if (n === undefined) return taban;
  if (n === null) return `${taban} · Son 7 günün satın alma sayısı okunamadı`;
  const sayi = Math.floor(n);
  if (sayi === 0) return `${taban} · Piksel son 7 günde satın alma saymadı; reklam satış yerine rastgele kişilere optimize olabilir`;
  if (sayi < META_OGRENME_HAFTALIK) return `${taban} · Son 7 günde ${sayi} satın alma; haftada ${META_OGRENME_HAFTALIK}'nin altında öğrenme aşaması bitmeyebilir`;
  return `${taban} · Son 7 günde ${sayi} satın alma`;
}

/** Maks. Performans teklif hücresinin notu: yalnız satın alma + son 30 gün. */
export function pmaxTeklifNotu(n: number | null | undefined): string {
  if (n === undefined) return PMAX_HEDEF_CUMLESI;
  if (n === null) return `${PMAX_HEDEF_CUMLESI} · Son 30 günün satış sayısı okunamadı`;
  const sayi = Math.floor(n);
  return `${PMAX_HEDEF_CUMLESI} · Son 30 günde ${sayi} satış${sayi < GOOGLE_PMAX_SATIS_ESIGI ? '; az satışla yavaş öğrenir' : ''}`;
}

/** Saat planının uygulandığı yer Türkiye saati değilse not (tek yer). */
export function saatDilimiNotu(saatDilimi: string | null | undefined): string | null {
  return saatDilimi && saatDilimi !== 'Europe/Istanbul'
    ? `Saatler Google hesabının saat diliminde (${saatDilimi}) uygulanır, Türkiye saatinde değil`
    : null;
}

/*
 * ═══ TELEFON AMACININ SÖZLERİ (yönetici kararı, 2026-10-12) ═══
 * Tek yerde ve sabit: `derle.spec`/`kararlar` testleri bu cümleleri
 * gövdeyle eşliyor.
 */
/**
 * GERİ ARAMA İSTEĞİ: Meta'nın Call Ads belgesinde (2026-10-12 okundu) geri
 * arama isteğini kapatan bir alan YOK; Ads Manager'da "Ara" düğmesine
 * basana arama ya da geri arama isteği seçeneği gösterilebiliyor. Alan
 * uydurup göndermek Meta'nın kabul edip yok saymasına açık; yazılmıyor ve
 * söyleniyor: panel bu istekleri okumuyor.
 */
export const META_GERI_ARAMA_CUMLESI = "Meta geri arama isteğini varsayılan açabilir; panel bunları göstermez, Meta Business Suite'ten bakın";
/** Meta'da saat planı yalnız ömür boyu bütçeli reklam setinde var; rehber günlük kampanya bütçesi kuruyor. */
export const META_SAAT_CUMLESI = "Meta'da arama saati sınırlaması bu bütçe yapısıyla yapılamıyor; reklam mesai dışında da gösterilebilir";
/** Google'da Türkiye için yönlendirme numarası yok (gözlem); ölçülebilen düğme tıklaması. */
export const GOOGLE_ARAMA_OLCUM_CUMLESI =
  "Türkiye'de Google yönlendirme numarası vermediği için reklamdan gelen arama dönüşümü ölçülemeyebilir; raporda arama düğmesi tıklaması gösterilir";
export const TELEFON_BANNER_CUMLESI = 'Arama reklamında banner seti henüz ölçülmedi; her görsel ayrı reklam olarak kurulur';

/** WhatsApp karşılama satırı: derleyicinin göndereceği metin, kaynağıyla. */
export function karsilamaKararHucresi(k: KararEki['whatsappKarsilama']): KararHucresi {
  const c = karsilamaCoz(k?.kayit);
  const setler = k?.setler ?? null;
  const sorular = c.hizliSorular.length ? `Hızlı sorular: ${c.hizliSorular.join(', ')}` : 'Hızlı soru yok';
  const kaynak = c.kaynak === 'varsayilan' ? 'Varsayılan Türkçe mesaj' : 'Senin yazdığın';
  if (setler && setler.toplam > 0 && setler.setli === setler.toplam) return { deger: "Meta'nın varsayılanı", not: KARSILAMA_SETTE_YOK_CUMLESI };
  const setNotu = setler && setler.setli > 0 ? ` · Banner setli fikirlerde: ${KARSILAMA_SETTE_YOK_CUMLESI}` : '';
  return { deger: `"${c.mesaj}"`, not: `${kaynak} · ${sorular}${setNotu}` };
}

/**
 * Formun onay ekranındaki satırı. Uzun form uyarısı YAZMAYI engellemez:
 * kullanıcının bilerek uzun form kurması meşru (örn. teklif için ölçü).
 */
export function formKararHucresi(f: SeciliFormHali | null | undefined): KararHucresi {
  if (!f || !f.sayfadaYayinda) return { deger: 'Form seçilmedi ya da okunamadı' };
  const ad = f.ad ? `"${f.ad}"` : 'Seçilen form';
  const tur = f.tur === 'higher_intent' ? 'daha yüksek niyet' : f.tur === 'more_volume' ? 'daha fazla hacim' : 'türü okunamadı';
  const soru = typeof f.soruSayisi === 'number' ? `${f.soruSayisi} soru` : 'soru sayısı okunamadı';
  const uzun = typeof f.soruSayisi === 'number' && f.soruSayisi >= UZUN_FORM_SORU_SAYISI;
  return {
    deger: `${ad} · ${tur} · ${soru}`,
    ...(uzun ? { not: 'Uzun form daha az doldurulur' } : f.tur === 'more_volume' ? { not: 'Daha çok kişi doldurur; bir kısmı aranınca ilgisiz çıkabilir' } : {}),
  };
}

/** "Siteme gelsinler" Meta hedefinin ekrandaki cümlesi (tek yer). */
export function siteHedefCumlesi(h: SitePikselHali | null | undefined): string {
  if (metaOptimizasyonHedefi('SITE', h) === 'LANDING_PAGE_VIEWS') return 'Sitendeki Meta pikseli son 7 günde çalıştı; reklam sayfa görüntülemeye göre optimize edilir';
  return h === 'bilinmiyor' || !h
    ? 'Meta pikseli okunamadığı için reklam tıklamaya göre optimize edilecek; piksel görülünce sayfa görüntülemeye geçer'
    : 'Sitende Meta pikseli görülmediği için reklam tıklamaya göre optimize edilecek; piksel kurulunca sayfa görüntülemeye geçer';
}

export function kararTablosu(
  amac: RehberAmacKodu,
  acik: Record<RehberPlatformu, boolean>,
  googleTeklif: GoogleTeklif,
  instagramVar: boolean,
  yerlesim: SetPlani | null = null,
  ek: KararEki = {},
): KararSatiri[] {
  const otomatik = !yerlesim || yerlesim.otomatik;
  const niyetKisiti = niyetYerlesimKisiti(REHBER_AMACLARI[amac].meta.niyet);
  // TELEFON'da elle yerleşim boyuttan değil niyetten (`otomatikteDe`):
  // "görsel boyutlarına göre" demek sebebi yanlış söylerdi.
  const yerlesimMetni = otomatik ? 'otomatik yerleşim' : niyetKisiti?.otomatikteDe ? 'yalnız telefonda, seçilen yerleşimlerde' : 'görsel boyutlarına göre seçilen yerleşimler';
  const kapaliNotu =
    (!otomatik && yerlesim!.kapanan.length
      ? `Görseli olmadığı için kapalı: ${yerlesim!.kapanan.map((x) => YERLESIM_GRUPLARI[x].etiket).join(', ')} · `
      : '') +
    // Niyetin kapattıkları AYRI cümleyle (derleyicinin "kapattıklarımız"ıyla aynı metin).
    (!otomatik && yerlesim!.niyetKapanan.length ? `${niyetYerlesimKisiti(REHBER_AMACLARI[amac].meta.niyet)?.aciklama ?? ''} · ` : '');
  const t = REHBER_AMACLARI[amac];
  const g = acik.google && t.google.kurgu !== null ? t.google : null;
  const ty = g?.kurgu === 'TALEP_YARATMA_VIDEO' || g?.kurgu === 'TALEP_YARATMA_GORSEL';
  // Dalga 3: Maks. Performans ve Talep Yaratma görselinin SÖZLERİ. Her biri
  // derlenmiş gövdeyle `derle-google.spec.ts`te eşleniyor.
  const pmax = g?.kurgu === 'MAKS_PERFORMANS';
  const tyGorsel = g?.kurgu === 'TALEP_YARATMA_GORSEL';
  const m = acik.meta;
  const hucre = (deger: string, not?: string): KararHucresi => (not ? { deger, not } : { deger });
  return [
    {
      kod: 'TUR',
      konu: 'Kampanya türü',
      // SİTE: hedef piksele bağlı ve kullanıcıya NEDENİYLE söyleniyor; tablo
      // "sayfa görüntüleme" deyip gövde tıklama gönderirse ekran yalan olur.
      meta: m
        ? t.meta.niyet === 'SITE'
          ? metaOptimizasyonHedefi('SITE', ek.sitePikseli) === 'LANDING_PAGE_VIEWS'
            ? hucre(t.meta.kurulacak, siteHedefCumlesi(ek.sitePikseli))
            : hucre('Trafik kampanyası · bağlantı tıklaması', siteHedefCumlesi(ek.sitePikseli))
          : hucre(t.meta.kurulacak)
        : null,
      google: g ? hucre(g.kurulacak) : null,
    },
    {
      kod: 'TEKLIF',
      konu: 'Teklif',
      meta: m ? hucre('En çok sonuç', 'Sonuç başına ücret hedefi yok') : null,
      google: g
        ? pmax
          ? hucre('En çok dönüşüm', pmaxTeklifNotu(ek.googleSatis30Gun))
          : googleTeklif === 'MAKS_DONUSUM'
            ? hucre('En çok dönüşüm', ek.googleTeklifSebebi ?? 'Dönüşüm ölçümü etkin')
            : ty
              ? hucre('En çok tıklama', 'Talep Yaratma\'da dönüşüm teklifi kurulmuyor')
              : hucre('En çok tıklama', ek.googleTeklifSebebi ?? 'Dönüşüm ölçümü kurulunca değiştirmeyi öneririz')
        : null,
    },
    {
      kod: 'NEREDE',
      konu: 'Nerede gösterilir',
      meta: m
        ? instagramVar
          ? hucre(`Instagram ve Facebook, ${yerlesimMetni}`, `${kapaliNotu}Çok reklamverenli birim kapalı`)
          : hucre(`Yalnız Facebook, ${yerlesimMetni}`, `Instagram hesabı seçilmedi, Instagram'da gösterilmez · ${kapaliNotu}Çok reklamverenli birim kapalı`)
        : null,
      google: g
        ? pmax
          ? hucre('Bütün Google: Arama, YouTube, Gmail, Keşfet, Haritalar, Görüntülü Reklam Ağı', 'Yeri Google seçer; Maks. Performans bunu kapatmaya izin vermiyor')
          : tyGorsel
            ? hucre('YouTube akışı ve Shorts, Gmail, Keşfet', 'YouTube video arası, Haritalar ve Görüntülü Reklam Ağı kapalı')
            : ty
              ? hucre(g.nerede)
              : hucre('Yalnız Google Arama', 'Arama ortakları ve Görüntülü Reklam Ağı kapalı')
        : null,
    },
    {
      kod: 'KONUM',
      konu: 'Konum',
      // Meta konumu "yaşayan ya da yakın zamanda bulunan" (home, recent,
      // frequently_in) olarak uyguluyor; canlı tur 1'de geri okundu (N-08).
      // Seyahat edenler dahil değil. "Yalnız bulunanlar" demek abartı olurdu.
      meta: m ? hucre('Bu bölgede yaşayan ya da yakın zamanda bulunanlar', 'Seyahat edenler dahil değil') : null,
      google: g ? hucre('Yalnız bu bölgede bulunanlar', '"İlgilenenler" kapalı; Google kendiliğinden tüm ülkeleri açıyordu') : null,
    },
    {
      kod: 'OTOMATIK_METIN',
      konu: 'Otomatik metin',
      meta: m ? hucre("Meta'nın kapatılabilen kreatif özellikleri kapalı", 'Kapatılamayanlar onay penceresinde yazılı') : null,
      // Talep Yaratma'da otomatik metni kapatan alan API'de DOĞRULANMADI
      // (Ajan 2 bulgusu); doğrulanmamış bir "kapalı" sözü vermiyoruz.
      google: g
        ? pmax
          ? hucre('Otomatik metin ve sayfa genişletme kapalı', 'Reklam yalnız verdiğin adrese gider · Sitendeki görseller çekilmez · Video yüklemezsen Google görsellerinden video üretebilir')
          : tyGorsel
            ? hucre('Görsellerinden video ve yeni tasarım üretme kapalı', 'Google başlık ve açıklamaları farklı sıralarda dener')
            : ty
              ? hucre('Google başlık ve açıklamaları farklı sıralarda dener', 'Talep Yaratma bunu kapatmaya izin vermiyor olabilir')
              : hucre('AI Max ve otomatik metin kapalı', 'Yazdığın metin değişmeden çıkar')
        : null,
    },
    { kod: 'SAYFA', konu: 'Sayfa', meta: m ? hucre('Seçtiğin Facebook sayfası, açıkça') : null, google: null },
    // FORM: seçili formun türü ve soru sayısı Meta'dan okunan hâliyle.
    ...(m && amac === 'FORM' ? [{ kod: 'FORM' as const, konu: 'Form', meta: formKararHucresi(ek.form), google: null }] : []),
    // WHATSAPP: ilk mesaj (derleyicinin `page_welcome_message`ı, aynı çözüm).
    ...(m && t.meta.niyet === 'WHATSAPP' ? [{ kod: 'KARSILAMA' as const, konu: 'İlk mesaj', meta: karsilamaKararHucresi(ek.whatsappKarsilama), google: null }] : []),
    {
      kod: 'OLCUM',
      konu: 'Ölçüm',
      // SATIŞTA reklam pikselin satın alma olayıyla optimize oluyor
      // (derle.ts SATIS_OLAYI); "Meta'nın saydığı" demek hangi olayın
      // sayıldığını gizlerdi.
      meta: m
        ? amac === 'SATIS'
          ? hucre('Seçtiğin pikselin saydığı satın almalar', metaSatisOlcumNotu(ek.metaSatinAlma7Gun))
          : t.meta.niyet === 'TELEFON'
            ? hucre('Yapılan aramalar', 'Raporda "Arama" ve "20 sn+ arama" sütunları; Meta bu ülkede aramayı vermiyorsa Ara onayı')
            : hucre("Meta'nın saydığı")
        : null,
      google: g ? (g.kurgu === 'ARAMA' && g.ulasma === 'telefon' ? hucre('Arama düğmesi tıklaması', GOOGLE_ARAMA_OLCUM_CUMLESI) : hucre("Google'ın saydığı")) : null,
    },
    // ERİŞİM sözü gövdede `frequency_control_specs` (ERISIM_SIKLIK_SINIRI);
    // yalnız erişim amacında ve Meta açıkken. Başka amaçta satır yok:
    // "sıklık sınırı yok" yazmak gereksiz bir soru doğururdu.
    // UZANTILAR yalnız Arama + site'de (`rehberdenGoogle` aynı koşulla yazar).
    ...(g?.kurgu === 'ARAMA' && g.ulasma === 'site' ? [{ kod: 'UZANTI' as const, konu: 'Ek bağlantılar', meta: null, google: uzantiHucresi(ek.uzantilar ?? null) }] : []),
    ...(g?.kurgu === 'ARAMA'
      ? (ek.ogeler ?? []).map((d) => ({
          kod: 'OGE' as const,
          konu: GOOGLE_OGE_ADLARI[d.kod],
          meta: null,
          google: { deger: d.eklendi ? 'Eklendi' : 'Eklenmedi', not: d.metin },
        }))
      : []),
    ...(m && amac === 'ERISIM'
      ? [{ kod: 'SIKLIK' as const, konu: 'Sıklık', meta: hucre('Bir kişiye haftada en çok 2 kez', 'Aynı kişiye tekrar tekrar gösterilmez'), google: null }]
      : []),
    // TELEFON SATIRLARI: geri arama (Meta), saat (iki platform), görsel (Meta).
    ...(t.meta.niyet === 'TELEFON' && (m || g)
      ? [
          ...(m ? [{ kod: 'GERI_ARAMA' as const, konu: 'Geri arama isteği', meta: hucre('Kapatılamıyor', META_GERI_ARAMA_CUMLESI), google: null }] : []),
          {
            kod: 'SAAT' as const,
            konu: 'Arama saatleri',
            meta: m ? hucre('Her saatte', META_SAAT_CUMLESI) : null,
            google:
              g?.kurgu === 'ARAMA' && g.ulasma === 'telefon'
                ? calismaSaatleriOzeti(ek.calismaSaatleri)
                  ? hucre(
                      'Arama düğmesi yalnız çalışma saatlerinde',
                      [calismaSaatleriOzeti(ek.calismaSaatleri)!, saatDilimiNotu(ek.googleSaatDilimi)].filter(Boolean).join(' · '),
                    )
                  : hucre('Her saatte', "Marka Merkezi'nde çalışma saatleri girilmedi")
                : null,
          },
          ...(m ? [{ kod: 'GORSEL' as const, konu: 'Görseller', meta: hucre('Her görsel ayrı reklam', TELEFON_BANNER_CUMLESI), google: null }] : []),
        ]
      : []),
  ];
}

/**
 * Uzantı hücresi: site bağlantısı (değer) ve açıklama metni (not). DÖRT
 * HÂL ayrı yazılıyor: okunmadı, okunamadı/yetersiz, var; açıklama metni
 * yok ya da var. Okunmadı hâli "yok" diye yazılsaydı kullanıcı sitesini
 * düzeltmeye giderdi; oysa site henüz hiç okunmadı.
 */
function uzantiHucresi(u: GoogleUzantiKaynagi | null): KararHucresi {
  // Google reddi diğer bütün hâllerin önünde: kurulum uzantısız gidiyor.
  if (u?.googleReddi) return { deger: googleUzantiReddiCumlesi(u.googleReddi), not: 'Yeniden prova edildi; reklamın kendisi etkilenmedi' };
  const site = !u || u.siteBaglantilari === null
    ? 'Site bağlantıları prova sırasında sitenden okunur'
    : u.siteBaglantilari.length === 0
      ? SITE_BAGLANTISI_YOK_CUMLESI
      : `${u.siteBaglantilari.length} site bağlantısı: ${u.siteBaglantilari.map((x) => x.metin).join(', ')}`;
  const aciklama = !u || u.aciklamaMetinleri.length === 0
    ? "Açıklama metni yok: Reklam adımında yaz ya da öner, ya da Marka Merkezi'ne 25 karakteri aşmayan, sayı ve fiyat içermeyen vaatler ekle"
    : `Açıklama metinleri (${u.aciklamaKaynagi === 'rehber' ? 'Reklam adımından' : "Marka Merkezi vaatlerinden"}): ${u.aciklamaMetinleri.join(', ')}`;
  const sebep = u && u.siteBaglantilari !== null && u.siteBaglantilari.length === 0 && u.siteSebebi ? `${u.siteSebebi} · ` : '';
  return { deger: site, not: `${sebep}${aciklama}` };
}
