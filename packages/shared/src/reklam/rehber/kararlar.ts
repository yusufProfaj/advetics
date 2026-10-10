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
import { YERLESIM_GRUPLARI, type SetPlani } from '../banner-seti';
import { REHBER_AMACLARI, type RehberAmacKodu, type RehberPlatformu } from './amaclar';
import type { GoogleTeklif } from './turet';

export interface KararHucresi {
  deger: string;
  not?: string;
}

export interface KararSatiri {
  /** Testin derleyiciyle eşleştirdiği sabit kod. */
  kod: 'TUR' | 'TEKLIF' | 'NEREDE' | 'KONUM' | 'OTOMATIK_METIN' | 'SAYFA' | 'OLCUM';
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
export function kararTablosu(
  amac: RehberAmacKodu,
  acik: Record<RehberPlatformu, boolean>,
  googleTeklif: GoogleTeklif,
  instagramVar: boolean,
  yerlesim: SetPlani | null = null,
): KararSatiri[] {
  const otomatik = !yerlesim || yerlesim.otomatik;
  const yerlesimMetni = otomatik ? 'otomatik yerleşim' : 'görsel boyutlarına göre seçilen yerleşimler';
  const kapaliNotu =
    !otomatik && yerlesim!.kapanan.length
      ? `Görseli olmadığı için kapalı: ${yerlesim!.kapanan.map((x) => YERLESIM_GRUPLARI[x].etiket).join(', ')} · `
      : '';
  const t = REHBER_AMACLARI[amac];
  const g = acik.google && t.google.kurgu !== null ? t.google : null;
  const ty = g?.kurgu === 'TALEP_YARATMA_VIDEO' || g?.kurgu === 'TALEP_YARATMA_GORSEL';
  const m = acik.meta;
  const hucre = (deger: string, not?: string): KararHucresi => (not ? { deger, not } : { deger });
  return [
    { kod: 'TUR', konu: 'Kampanya türü', meta: m ? hucre(t.meta.kurulacak) : null, google: g ? hucre(g.kurulacak) : null },
    {
      kod: 'TEKLIF',
      konu: 'Teklif',
      meta: m ? hucre('En çok sonuç', 'Sonuç başına ücret hedefi yok') : null,
      google: g
        ? googleTeklif === 'MAKS_DONUSUM'
          ? hucre('En çok dönüşüm', 'Dönüşüm ölçümü etkin')
          : hucre('En çok tıklama', 'Dönüşüm ölçümü kurulunca değiştirmeyi öneririz')
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
      google: g ? (ty ? hucre(g.nerede) : hucre('Yalnız Google Arama', 'Arama ortakları ve Görüntülü Reklam Ağı kapalı')) : null,
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
        ? ty
          ? hucre('Google başlık ve açıklamaları farklı sıralarda dener', 'Talep Yaratma bunu kapatmaya izin vermiyor olabilir')
          : hucre('AI Max ve otomatik metin kapalı', 'Yazdığın metin değişmeden çıkar')
        : null,
    },
    { kod: 'SAYFA', konu: 'Sayfa', meta: m ? hucre('Seçtiğin Facebook sayfası, açıkça') : null, google: null },
    {
      kod: 'OLCUM',
      konu: 'Ölçüm',
      meta: m ? hucre("Meta'nın saydığı") : null,
      google: g ? hucre("Google'ın saydığı") : null,
    },
  ];
}
