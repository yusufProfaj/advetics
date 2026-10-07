/**
 * ADVCAMPAIGN SOHBETİ — ARAÇLAR, SONUÇLARI VE AKIŞ OLAYLARI
 * (SENTEZ S-47, TASARIM-PLAN § 4.3-4.4, § 4.7).
 *
 * Araç listesi BİLEREK KAPALI. Yayınlamak, açmak, platform önerisini
 * uygulamak, silmek, bütçeyi doğrudan değiştirmek, atıf ya da özel kategori
 * cevaplamak için araç YOK ve olmamalı: Meta'nın öneri uygulaması Hizmet
 * Şartları'nı kabul etmek sayılıyor ve üretken özellikleri açabiliyor;
 * yayın kararı kullanıcının tıklaması. Yasaklı adlar `YASAKLI_ARACLAR`da ve
 * araç kayıt dosyası kaynak taramasıyla bunlara karşı kilitli.
 */

export const ARACLAR = [
  'hazirlik_oku',
  'niyet_katalogu',
  'varliklari_listele',
  'konum_ara',
  'taslak_olustur',
  'taslak_alan_yaz',
  'prova_baslat',
  'prova_sonucu',
  'onay_karti_goster',
] as const;

export type AracAdi = (typeof ARACLAR)[number];

export const YASAKLI_ARACLAR = [
  'yayinla',
  'ac',
  'oneri_uygula',
  'otomatik_uygulama_ac',
  'politika_muafiyeti_iste',
  'sil',
  'arsivle',
  'butce_degistir',
  'atif_degistir',
  'kategori_cevapla',
  'hesap_ayari_degistir',
] as const;

/**
 * Araç katmanı (O okuma · T taslak · P prova · K kart). Kapılar katmana göre:
 * T ve P `bulk.write` ister, P yazma kapısından geçer, K yalnız sunucunun
 * ürettiği kartı gösterir.
 */
export const ARAC_KATMANI = {
  hazirlik_oku: 'O',
  niyet_katalogu: 'O',
  varliklari_listele: 'O',
  konum_ara: 'O',
  taslak_olustur: 'T',
  taslak_alan_yaz: 'T',
  prova_baslat: 'P',
  prova_sonucu: 'P',
  onay_karti_goster: 'K',
} as const satisfies Record<AracAdi, 'O' | 'T' | 'P' | 'K'>;

/**
 * Araç sonucu DÖRT (+1) hâlli. `sonuc_yok` ile `dustu` hiçbir zaman boş
 * diziye çevrilmez: "eşleşme yok" ile "çağrı düştü" aynı boş alana düşünce
 * lokasyon aramasının neden boş döndüğü teşhis edilemedi (CLAUDE.md).
 */
export type AracSonucu<T = unknown> =
  | { hal: 'tamam'; veri: T }
  | { hal: 'sonuc_yok'; neden: string }
  | { hal: 'dustu'; platformMesaji: string }
  | { hal: 'bekliyor'; neden: string }
  | { hal: 'reddedildi'; neden: string };

/** Ekrandaki araç izi: araç adı ya da JSON görünmez, Türkçe fiil görünür. */
export const ARAC_IZI = {
  hazirlik_oku: { suruyor: 'Workspace hazırlığına bakıyorum', bitti: 'Workspace hazırlığına baktım' },
  niyet_katalogu: { suruyor: 'Kurulabilen reklam türlerine bakıyorum', bitti: 'Kurulabilen reklam türlerine baktım' },
  varliklari_listele: { suruyor: 'Görselleri inceliyorum', bitti: 'Görselleri inceledim' },
  konum_ara: { suruyor: 'Konumu arıyorum', bitti: 'Konumu aradım' },
  taslak_olustur: { suruyor: 'Taslağı kuruyorum', bitti: 'Taslağı kurdum' },
  taslak_alan_yaz: { suruyor: 'Taslağı güncelliyorum', bitti: 'Taslağı güncelledim' },
  prova_baslat: { suruyor: 'Meta’ya kontrole gönderiyorum', bitti: 'Meta’ya kontrole gönderdim' },
  prova_sonucu: { suruyor: 'Meta’nın kontrolüne bakıyorum', bitti: 'Meta’nın kontrolüne baktım' },
  onay_karti_goster: { suruyor: 'Onay kartını hazırlıyorum', bitti: 'Onay kartını hazırladım' },
} as const satisfies Record<AracAdi, { suruyor: string; bitti: string }>;

export function aracIziMetni(arac: AracAdi, hal: 'suruyor' | AracSonucu['hal']): string {
  const m = ARAC_IZI[arac];
  if (hal === 'suruyor') return m.suruyor;
  if (hal === 'dustu') return `${m.suruyor}: çağrı düştü`;
  if (hal === 'reddedildi') return `${m.suruyor}: yapılamadı`;
  if (hal === 'sonuc_yok') return `${m.bitti}: sonuç yok`;
  if (hal === 'bekliyor') return `${m.bitti}: cevabını bekliyorum`;
  return m.bitti;
}

/** Akış (SSE) olayları. Panel yalnız bunları okur. */
export type SohbetOlayi =
  | { tur: 'mesaj_basladi'; mesajId: string; sira: number }
  | { tur: 'arac_basladi'; arac: AracAdi; adim: number }
  | { tur: 'arac_bitti'; arac: AracAdi; adim: number; hal: AracSonucu['hal']; sureMs: number }
  | { tur: 'metin'; parca: string }
  | { tur: 'taslak_degisti'; taslakId: string; surum: number }
  | { tur: 'soru'; soru: import('./soru').Soru }
  | { tur: 'kart'; kart: unknown }
  | { tur: 'durum_duzeltmesi'; metin: string }
  | { tur: 'hata'; hata: 'ret' | 'kesildi' | 'ulasilamadi' | 'kota'; mesaj: string }
  | { tur: 'bitti'; durum: import('./hal').MesajDurumu; girdiToken: number; ciktiToken: number };

/**
 * DURUM KELİMESİ SÜZGECİ (S-49). "Yayında", "yayınlandı", "kuruldu", "hazır"
 * yalnız sunucunun durum cümlesinde geçebilir. Model bunları yazarsa metin
 * SİLİNMEZ (kullanıcı ne dendiğini görmeli) ama altına sunucunun gerçek durum
 * satırı eklenir: çürütmek, sessizce düzeltmekten dürüst.
 */
const DURUM_KELIMELERI = /(?<![\p{L}\p{N}])(yayında|yayınlandı|yayına (?:aldım|girdi)|kuruldu|kurdum ve açtım|aktif(?:leştirdim)?)(?![\p{L}\p{N}])/iu;

export function durumKelimesiVar(metin: string): boolean {
  return DURUM_KELIMELERI.test(metin.toLocaleLowerCase('tr-TR'));
}
