import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { TABAN_NEGATIFLER, type GoogleDerlemeGirdisi } from '@advetics/shared';
import { derleGoogle } from './derle-google';
import { saatPlaniOku } from './google-yayin';

/**
 * ═══ AJAN 4 KAPISI — 9aecbf2b ("Beni telefonla arasınlar") ═══
 *
 * İki tür test var ve AYRI okunmalı:
 * - BEKÇİ (yeşil): 9aecbf2b'nin mutasyonla BOŞ çıkan iddiasını kapatıyor.
 * - BULGU (kırmızı, `AJAN4-BULGU` önekli): düzeltme bulguyu üreten ajanın
 *   işi; test düzeltme yapılınca yeşile döner.
 */

describe('BEKÇİ: proto3 sıfır saat (gece yarısı açılış)', () => {
  /*
   * `saatPlaniOku` içindeki eksik saat = 0 kuralı silindiğinde mevcut testler
   * YEŞİL kaldı (mutasyon M11). Gece yarısı başlayan plan Google'dan
   * `startHour` alanı OLMADAN döner; kural yoksa NaN okunur ve doğru
   * kurulmuş yayın "fark"ta durur.
   */
  it('startHour gelmeyen satır 0 okunuyor ve geri okuma FARK üretmiyor', () => {
    const okunan = saatPlaniOku([{ dayOfWeek: 'MONDAY', startMinute: 'ZERO', endHour: 9, endMinute: 'THIRTY' }]);
    expect(okunan).toEqual([{ dayOfWeek: 'MONDAY', startHour: 0, startMinute: 'ZERO', endHour: 9, endMinute: 'THIRTY' }]);
  });
});

const GIRDI: GoogleDerlemeGirdisi = {
  kurgu: 'ARAMA',
  ulasma: 'telefon',
  teklif: 'MAKS_DONUSUM',
  musteriId: '1234567890',
  paraBirimi: 'TRY',
  saatDilimi: 'Europe/Istanbul',
  konumlar: ['geoTargetConstants/1012782'],
  dil: 'languageConstants/1037',
  enDusukYas: 18,
  butce: { tip: 'gunluk', micros: 250_000_000n },
  takvim: { baslangic: '2026-10-13', bitis: null },
  hedefAdres: 'https://ornek.com.tr/',
  telefon: '+902325551234',
  basliklar: ['Bir', 'İki', 'Üç'],
  aciklamalar: ['Birinci açıklama.', 'İkinci açıklama.'],
  anahtarKelimeler: ['kuşadası villa'],
  negatifler: [...TABAN_NEGATIFLER],
  gorselVarlikIdleri: [],
  youtubeVideoId: null,
  isletmeAdi: 'Ornek',
  logoVarlikId: null,
  kategoriler: [],
};
const BAGLAM = { kimlik: 'abcdef12-0000-4000-8000-000000000000', workspaceKisaAdi: 'WS', amacEkranAdi: 'Beni arasınlar', simdi: new Date('2026-10-12T09:00:00+03:00'), validateOnly: true, logo: null, youtubeVideoBasligi: null };

describe('AJAN4-BULGU Ö-1: telefon amacında dönüşüm teklifi YALNIZ arama dönüşümünü öğrenmeli', () => {
  /*
   * `googleTelefonDonusumuMu` teklifin AÇILIP AÇILMAYACAĞINA karar veriyor
   * (AD_CALL ≥ 15), ama MAKS_DONUSUM kurulunca Google HESABIN varsayılan
   * hedeflerindeki BÜTÜN birincil işlemlere optimize eder — Advetics'in
   * kendi kurduğu sitedeki tel: tıklaması (WEBPAGE, PHONE_CALL_LEAD) ve form
   * gönderimi dahil. Yani kapı doğru, öğrenilen sinyal yanlış: commit'in
   * "sitedeki tel: tıklaması sayılmıyor" sözü yalnız eşik için doğru.
   * Beklenen: atomik istekte kampanya düzeyi dönüşüm hedefi
   * (CampaignConversionGoal, PHONE_CALL_LEAD / CALL_FROM_ADS) ya da teklif
   * kararının bu kısıtı açıkça söylemesi. validateOnly ile ölçülmeli.
   */
  it('MAKS_DONUSUM telefon gövdesi kampanya dönüşüm hedefini sınırlıyor', () => {
    const d = derleGoogle(GIRDI, BAGLAM);
    if (d.tur !== 'govde') throw new Error(JSON.stringify(d.retler));
    expect(JSON.stringify(d.govde.mutateOperations)).toMatch(/campaignConversionGoal/i);
  });
});

describe('AJAN4-BULGU Ö-2: callClicksError hiçbir okuyucuya ulaşmıyor (sessiz hata)', () => {
  /*
   * CLAUDE.md "YAN ÖZELLİĞİN HATASI ... SESSİZ DE KALMAMALI":
   * `conversionActionsError` için okuma katmanı "dönüşüm yok" ile "detay
   * alınamadı"yı ayırıyor (`donusum-detaylari.ts`). `callClicksError` ise
   * yalnız yazılıyor: rapor SQL'i sayı olmayanı NULL sayıyor, sütun
   * `VERIYLE_ACILAN_SUTUNLAR` kuralıyla hiç açılmıyor ve "Arama düğmesi
   * tıklaması" ekranda YOK. Segment canlıda düşerse (ÖLÇÜLMEDİ) bütün
   * müşterilerde iz yalnız worker log'unda kalır. Daha kötüsü: başarılı bir
   * senkronun yazdığı sayı, sonraki düşen senkronun upsert'iyle silinir.
   */
  it('ham gövdedeki callClicksError raporlara/ekrana taşınıyor', () => {
    const kok = join(__dirname, '../../../../../..');
    const yerler = [join(kok, 'apps/api/src/modules/reports'), join(kok, 'packages/shared/src'), join(kok, 'apps/web/src/components/report')];
    const dosyalar: string[] = [];
    const gez = (d: string) => {
      for (const ad of readdirSync(d)) {
        const p = join(d, ad);
        if (statSync(p).isDirectory()) gez(p);
        else if (/\.tsx?$/.test(ad) && !/\.spec\./.test(ad)) dosyalar.push(p);
      }
    };
    yerler.forEach(gez);
    expect(dosyalar.length).toBeGreaterThan(20);
    const okuyan = dosyalar.filter((f) => readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').includes('callClicksError'));
    expect(okuyan).not.toEqual([]);
  });
});
