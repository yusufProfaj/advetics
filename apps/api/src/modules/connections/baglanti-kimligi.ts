/**
 * ═══ BU YETKİLENDİRME KAYITLI BAĞLANTININ KİMLİĞİ Mİ ═══
 *
 * İki yerde soruluyor ve ikisinde de yanlış cevap SESSİZ bir arıza:
 *
 *   1. Yeniden yetkilendirme / "Ölçüm izinlerini ver" (hedef bağlantı):
 *      başka bir kişinin token'ı ajansın satırına yazılırsa 55 atanmış
 *      hesabın senkronizasyonu o kişinin erişimine bağlanır; bir gün o kişi
 *      ajanstan ayrılınca hepsi birden düşer ve hiçbir ekran sebebini
 *      söylemez.
 *   2. Müşteri şirketinde YENİ bağlantı: ajansın kimliği ikinci kez
 *      bağlanınca keşif ajans havuzunun kopyasını o şirkete yazıyor
 *      (2026-10-13 üretim: üç denemede üç şirkete 133–134'er satır).
 *
 * ═══ GOOGLE'DA İKİ KİMLİK UZAYI VAR — ve kayıtlar karışık ═══
 *
 * `GoogleProvider.describeToken` kimliği `tokeninfo.sub`tan alıyor, o
 * gelmezse ERİŞİLEBİLİR İLK GOOGLE ADS MÜŞTERİSİNDEN (`customers[0]`). İki
 * değer aynı kişiyi anlatsa bile birbirine EŞİT OLAMAZ:
 *
 *   · sub     → 21 haneli kişi kimliği    (`103389823382444834376`)
 *   · müşteri → 10 haneli Ads hesap kimliği (`9608136521`)
 *
 * Ajansın üretimdeki satırı müşteri uzayında, ölçüm izniyle gelen yeni
 * token'lar sub uzayında çıktı. Düz eşitlik "farklı kişi" der ve tekil
 * anahtar (`org, platform, external_user_id`) aynı kişiyi ikinci satır
 * olarak açar — kök nedenin ta kendisi.
 *
 * KIYAS SIRASI, güçlüden zayıfa:
 *   (a) Kayıtlı değer yeni kimliğe ya da yeni sub'a EŞİT → aynı kişi.
 *   (b) Kayıtlı değer MÜŞTERİ uzayında ve yeni token o müşteriye KÖK
 *       erişime sahip (`listAccessibleCustomers`) → aynı hesap erişimi.
 *       Bu kişi kanıtı DEĞİL: aynı MCC'ye doğrudan erişimi olan bir
 *       meslektaş da geçer. Ama kayıtlı değer zaten "bu kişinin eriştiği
 *       ilk müşteri" diye yazılmıştı; elimizdeki en güçlü kanıt bu ve
 *       işlevsel olarak doğru soru da bu: token aynı hesap ağacını görüyor.
 *   (c) Gerisi FARKLI. Sub uzayındaki bir kayıt ancak sub ile eşleşir;
 *       yeni token sub vermediyse kıyas yapılamıyor ve "farklı" sayılıyor —
 *       belirsizde ezmek, belirsizde reddetmekten pahalı.
 *
 * Meta ve LinkedIn tek uzaylı (kullanıcı/üye kimliği): yalnız (a).
 */
export type KimlikKarari =
  | { ayni: true; kanit: 'kimlik' | 'hesap_erisimi' }
  | { ayni: false };

export interface YeniKimlik {
  externalUserId: string;
  /** Google `tokeninfo.sub` — yalnız Google ve yalnız döndüyse. */
  kisiKimligi?: string;
  /** Google `listAccessibleCustomers` kök müşterileri. */
  erisilebilirHesaplar?: readonly string[];
}

/** Google Ads müşteri kimliği biçimi: 10 hane (tiresiz saklanıyor). */
export function googleMusteriKimligiMi(deger: string): boolean {
  return /^\d{10}$/.test(deger);
}

export function kimlikKarari(kayitli: string, yeni: YeniKimlik): KimlikKarari {
  if (kayitli === yeni.externalUserId) return { ayni: true, kanit: 'kimlik' };
  if (yeni.kisiKimligi !== undefined && kayitli === yeni.kisiKimligi) return { ayni: true, kanit: 'kimlik' };
  if (googleMusteriKimligiMi(kayitli) && (yeni.erisilebilirHesaplar ?? []).includes(kayitli)) {
    return { ayni: true, kanit: 'hesap_erisimi' };
  }
  return { ayni: false };
}

/** "9608136521" → "960-813-6521"; Google arayüzünün yazdığı biçim. */
export function googleMusteriEtiketi(deger: string): string {
  return googleMusteriKimligiMi(deger) ? `${deger.slice(0, 3)}-${deger.slice(3, 6)}-${deger.slice(6)}` : deger;
}

/**
 * ═══ (b) "KÖK ERİŞİM" TEK BAŞINA TOKEN DEĞİŞTİRMEYE YETMEZ ═══
 *
 * (b) kişi kanıtı değil: kayıtlı Ads hesabına doğrudan erişen HER kişi
 * geçiyor. Kimlik ayrımı için doğru, token'ı EZMEK için yetersiz (Ajan 4,
 * 2026-10-13): ajans yöneticisi izin ekranındaki hesap seçicide kendi
 * Google hesabını seçerse — tarayıcıda birden çok hesap açıkken en olağan
 * hata — ve o hesap ajansın MCC'sini görüyorsa, ajansın bağlantısı onun
 * token'ına geçer. Onun GÖRMEDİĞİ hesap ağaçlarındaki atanmış hesapların
 * senkronizasyonu o andan itibaren `permission_denied` ile düşer; ekran
 * "Ölçüm izinleri verildi" der.
 *
 * Kural: token yalnız, bağlantının BESLEDİĞİ (atanmış) hesapların bütün
 * kökleri (`manager_external_id ?? external_id`) yeni token'ın erişim
 * listesindeyse ezilebilir. Asıl kişinin token'ı bu kökleri zaten görüyor
 * — keşif onları ONUN token'ından çıkardı. Eksik kalanlar döner; boş dizi =
 * kapsıyor. Kıyas tiresiz (Ads arayüzü `123-456-7890` yazıyor).
 *
 * Yalnız TAZELEME yolunda. "Aynı kimlik başka satırda mı" engelinde (b)
 * GEVŞEK kalıyor: orada yanlış "aynı" bir RET (görünür), yanlış "farklı"
 * ise ajans havuzunun müşteri şirketine kopyalanması (sızıntı).
 */
export function eksikKokler(gerekli: readonly string[], erisilebilir: readonly string[] | undefined): string[] {
  const tiresiz = (s: string) => s.replace(/-/g, '');
  const gorulen = new Set((erisilebilir ?? []).map(tiresiz));
  return [...new Set(gerekli.map(tiresiz))].filter((k) => !gorulen.has(k)).sort();
}
