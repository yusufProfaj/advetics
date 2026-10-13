/**
 * ADVCAMPAIGN — MEDYA GİRİŞ KONTROLÜ (TASARIM-PLAN § 1.5 medya_reddedildi,
 * SENTEZ D-M11).
 *
 * "Doğrulama kullanım anında değil, giriş anında": kullanıcı görselin
 * kullanılamayacağını onay kartında değil, dosyayı bıraktığında öğrenmeli.
 * Tarayıcı da sunucu da AYNI fonksiyonu çağırıyor; iki ayrı kontrol doğduğu
 * anda ayrışır ve tarayıcıda kabul edilen dosya sunucuda reddedilir.
 *
 * RET ile UYARI ayrı: ret = Meta kabul etmez (biçim, boyut, çok küçük);
 * uyarı = Meta kabul eder ama sonuç kötü olabilir (oran kırpılır, video
 * genişliği ölçülmemiş öneri altında). Uyarıyı ret yapmak çalışan bir
 * dosyayı kullanıcıdan saklamak olurdu.
 */

export const MEDYA_SINIRLARI = {
  gorselEnCokBayt: 30 * 1024 * 1024,
  videoEnCokBayt: 200 * 1024 * 1024,
  enAzKisaKenar: 600,
  /** Meta'nın video için önerdiği genişlik; canlıda ölçülmediği için UYARI (D-M11). */
  videoOnerilenGenislik: 1200,
  /**
   * VİDEO SÜRESİ (VIDEO denetimi B8). Yalnız iki sınır ve ikisi de belgeli:
   * Meta video reklamı en az 1 saniye istiyor (altı RET); ThruPlay 15.
   * saniyede (ya da daha kısa videoda sonunda) sayılıyor, yani uzun videoda
   * ilk 15 saniye sonucu belirliyor (BİLGİ). Üst sınır YAZILMADI: yerleşime
   * göre değişiyor ve belgeye bakmadan bir sayı uydurmak çalışan bir videoyu
   * reddederdi.
   */
  videoEnAzSaniye: 1,
  thruPlaySaniye: 15,
} as const;

export const GORSEL_BICIMLERI = ['image/jpeg', 'image/png'] as const;
export const VIDEO_BICIMLERI = ['video/mp4', 'video/quicktime'] as const;

/** Akışta kırpılmayan oranlar: 1:1, 4:5, 9:16 ve bağlantı reklamının 1,91:1'i. */
const IYI_ORANLAR: ReadonlyArray<{ ad: string; oran: number }> = [
  { ad: '1:1', oran: 1 },
  { ad: '4:5', oran: 4 / 5 },
  { ad: '9:16', oran: 9 / 16 },
  { ad: '1,91:1', oran: 1.91 },
];
const ORAN_TOLERANSI = 0.03;

export interface MedyaOlcusu {
  mime: string;
  bayt: number;
  /** Okunabildiyse; okunamadıysa ret (boyutu bilinmeyen dosya kontrol edilemez). */
  en: number | null;
  boy: number | null;
  /**
   * Video süresi, saniye (tarayıcıda `duration`). `undefined` = ölçülmedi
   * (eski çağıran, görsel); `null` = ölçülemedi: süre kontrolü koşmaz ama
   * sessiz de değil, uyarı yazar.
   */
  sure?: number | null;
}

/**
 * Kontrolün bağlamı. `videoIzlenme`: "Videom izlensin" amacı. 15 saniye
 * bilgisi ve dikey olmayan videonun Reels/Hikâye uyarısı yalnız orada
 * anlamlı: diğer amaçlarda video otomatik yerleşimde ve Meta kendi uygun
 * yerini seçiyor; izlenme amacında ise yerleşim elle ve Hikâye/Reels açık
 * (`niyetYerlesimKisiti`), yatay video oraya bantla gider (S2: tek video
 * kalır, banner seti yok, kullanıcıya söylenir).
 */
export interface MedyaKontrolBaglami {
  videoIzlenme?: boolean;
}

export type MedyaKarari = { sonuc: 'kabul'; oran: string } | { sonuc: 'uyari'; sebep: string; oran: string } | { sonuc: 'ret'; sebep: string };

export function medyaKontrol(m: MedyaOlcusu, baglam: MedyaKontrolBaglami = {}): MedyaKarari {
  const video = (VIDEO_BICIMLERI as readonly string[]).includes(m.mime);
  const gorsel = (GORSEL_BICIMLERI as readonly string[]).includes(m.mime);
  if (!video && !gorsel) return { sonuc: 'ret', sebep: 'Yalnız JPEG, PNG, MP4 ve MOV kullanılabilir.' };
  const sinir = video ? MEDYA_SINIRLARI.videoEnCokBayt : MEDYA_SINIRLARI.gorselEnCokBayt;
  if (m.bayt > sinir) return { sonuc: 'ret', sebep: `${video ? 'Video' : 'Görsel'} ${Math.round(sinir / 1024 / 1024)} MB’tan büyük.` };
  if (!m.en || !m.boy) return { sonuc: 'ret', sebep: 'Dosyanın boyutları okunamadı.' };
  if (Math.min(m.en, m.boy) < MEDYA_SINIRLARI.enAzKisaKenar) {
    return { sonuc: 'ret', sebep: `Çok küçük (${m.en}×${m.boy}); kısa kenar en az ${MEDYA_SINIRLARI.enAzKisaKenar} piksel olmalı.` };
  }
  if (video && typeof m.sure === 'number' && m.sure < MEDYA_SINIRLARI.videoEnAzSaniye) {
    return { sonuc: 'ret', sebep: `Video ${m.sure.toFixed(1).replace('.', ',')} saniye; Meta en az ${MEDYA_SINIRLARI.videoEnAzSaniye} saniye istiyor.` };
  }
  const oran = m.en / m.boy;
  const iyi = IYI_ORANLAR.find((o) => Math.abs(oran - o.oran) / o.oran <= ORAN_TOLERANSI);
  const oranAdi = iyi?.ad ?? `${(oran >= 1 ? oran : 1 / oran).toFixed(2).replace('.', ',')}:1`;
  /*
   * UYARILAR BİRİKİYOR: önceki sürüm ilk uyarıda dönüyordu ve tek bir
   * dosyanın iki ayrı sorunu (ör. yatay ve uzun video) ekranda yalnız
   * birini gösteriyordu; kullanıcı birini düzeltip ikincisini Kontrol'de
   * öğreniyordu.
   */
  const uyarilar: string[] = [];
  if (!iyi) uyarilar.push(`Oran ${oranAdi}. Meta bu oranı akışta kırpar; 1:1, 4:5 ya da 9:16 öneririz.`);
  else if (video && m.en < MEDYA_SINIRLARI.videoOnerilenGenislik && oran >= 1) {
    uyarilar.push(`Video genişliği ${m.en} piksel; Meta ${MEDYA_SINIRLARI.videoOnerilenGenislik} öneriyor.`);
  }
  if (video && baglam.videoIzlenme) {
    if (m.sure === null) uyarilar.push('Video süresi okunamadı; 1 saniyeden kısa video Meta’da reddedilir.');
    else if (typeof m.sure === 'number' && m.sure > MEDYA_SINIRLARI.thruPlaySaniye) {
      uyarilar.push(`Video ${Math.round(m.sure)} saniye: ilk ${MEDYA_SINIRLARI.thruPlaySaniye} saniye kritik, ThruPlay ${MEDYA_SINIRLARI.thruPlaySaniye}. saniyede sayılır.`);
    }
    // Dikey = 9:16 (%3 payla). 4:5 de Reels/Hikâye'de bantlanıyor, yani
    // uyarı 9:16 dışındaki her oranı kapsıyor.
    if (iyi?.ad !== '9:16') uyarilar.push('Video dikey (9:16) değil; Reels ve Hikâye’de kenarları bantla gösterilir.');
  }
  return uyarilar.length ? { sonuc: 'uyari', oran: oranAdi, sebep: uyarilar.join(' ') } : { sonuc: 'kabul', oran: oranAdi };
}
