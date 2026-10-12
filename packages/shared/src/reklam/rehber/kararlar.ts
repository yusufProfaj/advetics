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
import type { GoogleTeklif } from './turet';
import { metaOptimizasyonHedefi, type SitePikselHali } from '../meta/niyetler';
import { SITE_BAGLANTISI_YOK_CUMLESI, googleUzantiReddiCumlesi, type GoogleUzantiKaynagi } from './google-uzanti';
import { GOOGLE_OGE_ADLARI, type GoogleOgeDurumu } from './google-ogeler';

export interface KararHucresi {
  deger: string;
  not?: string;
}

export interface KararSatiri {
  /** Testin derleyiciyle eşleştirdiği sabit kod. */
  kod: 'TUR' | 'TEKLIF' | 'NEREDE' | 'KONUM' | 'OTOMATIK_METIN' | 'SAYFA' | 'OLCUM' | 'SIKLIK' | 'UZANTI' | 'OGE' | 'FORM';
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
  const yerlesimMetni = otomatik ? 'otomatik yerleşim' : 'görsel boyutlarına göre seçilen yerleşimler';
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
          ? hucre('En çok dönüşüm', 'Satın alma ölçümü etkin; Google hesaptaki bütün birincil dönüşümlerden öğrenir')
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
    {
      kod: 'OLCUM',
      konu: 'Ölçüm',
      // SATIŞTA reklam pikselin satın alma olayıyla optimize oluyor
      // (derle.ts SATIS_OLAYI); "Meta'nın saydığı" demek hangi olayın
      // sayıldığını gizlerdi.
      meta: m ? (amac === 'SATIS' ? hucre('Seçtiğin pikselin saydığı satın almalar', 'Reklam satın alma için optimize edilir') : hucre("Meta'nın saydığı")) : null,
      google: g ? hucre("Google'ın saydığı") : null,
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
