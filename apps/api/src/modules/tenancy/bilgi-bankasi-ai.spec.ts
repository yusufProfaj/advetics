import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { bolumleriAyir } from './bilgi-bankasi-ai.service';

/**
 * ═══ MODELİN CEVABI ÜÇ ALANA AYRILIYOR ═══
 *
 * Çıktı JSON DEĞİL ETİKETLİ: model JSON üretirken uzun serbest metinlerde
 * kaçış karakterlerinde yanılıyor ve tek bir tırnak bütün cevabı
 * çözümlenemez yapıyor. Etiketli bloklar kısmi cevapta bile işe yarıyor.
 */
describe('bolumleriAyir', () => {
  const TAM = `BILGI BANKASI:
Urla'da villa satışı yapıyor.
İkinci satır.

HEDEF KITLE:
35-55 yaş, İzmir ve çevresi.

MARKA BILGILERI:
Sakin, güven veren bir ton.`;

  it('düzenek çalışıyor', () => {
    expect(bolumleriAyir(TAM).bilgiBankasi).toContain('Urla');
  });

  it('KRİTİK: ÜÇ BÖLÜM BİRBİRİNE KARIŞMIYOR', () => {
    /*
     * Sabit uzunluklu bir dilim komşu bölümü içine alıyor ve iki bölüm tek
     * alana yazılıyordu: kullanıcı "Hedef Kitle" sekmesinde marka metnini de
     * görüyordu. Bitiş, SONRAKİ ETİKETİN başı.
     */
    const b = bolumleriAyir(TAM);
    expect(b.bilgiBankasi).toContain('İkinci satır.');
    expect(b.bilgiBankasi).not.toContain('35-55');
    expect(b.hedefKitle).toBe('35-55 yaş, İzmir ve çevresi.');
    expect(b.markaBilgileri).toBe('Sakin, güven veren bir ton.');
  });

  it('KRİTİK: TÜRKÇE BÜYÜK İ İLE YAZILMIŞ ETİKET DE TANINIYOR', () => {
    /*
     * Model "BİLGİ BANKASI" da yazabiliyor "BILGI BANKASI" da. Tek biçim
     * aramak, doğru gelmiş bir cevabı çözümlenemez saymak ve kullanıcıya
     * "tekrar dene" dedirtmek olurdu.
     */
    const b = bolumleriAyir('BİLGİ BANKASI:\nmetin\n\nHEDEF KİTLE:\nkitle');
    expect(b.bilgiBankasi).toBe('metin');
    expect(b.hedefKitle).toBe('kitle');
  });

  it('KRİTİK: TÜRKÇE KARAKTERLER ÇIKTIDA KORUNUYOR', () => {
    /*
     * Etiketi bulmak için normalize edilmiş bir kopya kullanılıyor; metin o
     * kopyadan kesilseydi kullanıcıya "Izmir'de sisli bir sabah" gibi
     * bozulmuş bir Türkçe giderdi.
     */
    const b = bolumleriAyir('BILGI BANKASI:\nİzmir’de ışıklı bir sabah');
    expect(b.bilgiBankasi).toBe('İzmir’de ışıklı bir sabah');
  });

  it('KRİTİK: EKSİK BÖLÜM BOŞ DÖNÜYOR — komşusunu yutmuyor', () => {
    // Model üç bölümden ikisini üretmiş olabilir; eksik olanı komşusundan
    // doldurmak, yanlış metni doğru sekmeye yazmak olurdu.
    const b = bolumleriAyir('BILGI BANKASI:\nyalnizca bu');
    expect(b.bilgiBankasi).toBe('yalnizca bu');
    expect(b.hedefKitle).toBe('');
    expect(b.markaBilgileri).toBe('');
  });

  it('ETİKETSİZ CEVAP ÜÇÜNÜ DE BOŞ BIRAKIYOR', () => {
    /*
     * Boş taslak çağıran tarafta HATA olarak dönüyor: boş alanları
     * "doldurdum" diye göstermek, kullanıcıya çalıştığını sandıran bir düğme
     * olurdu.
     */
    const b = bolumleriAyir('Tabii, yardımcı olayım.');
    expect(b).toEqual({ bilgiBankasi: '', hedefKitle: '', markaBilgileri: '' });
  });

  it('BÖLÜM SIRASI DEĞİŞSE DE ÇALIŞIYOR', () => {
    // Sıraya bel bağlamak, modelin bir gün sırayı değiştirmesiyle sessizce
    // yanlış alana yazmak demek.
    const b = bolumleriAyir('MARKA BILGILERI:\nmarka\n\nBILGI BANKASI:\nbilgi');
    expect(b.markaBilgileri).toBe('marka');
    expect(b.bilgiBankasi).toBe('bilgi');
  });
});

/**
 * ═══ NEST MODÜL KAYDI DERLEMEDE DEĞİL AÇILIŞTA PATLIYOR ═══
 *
 * Depoda bağımlılık grafiğini ayağa kaldıran bir test yok: `nest build`
 * başarılı olur, grafik çözülemez ve hata DEPLOY'un ortasında görünür.
 *
 * Burada iki şey birden kilitleniyor:
 *
 *   · Yeni servis sağlayıcı listesinde — yoksa uç 500 döner.
 *   · Anthropic istemcisi AYRI bir global modülde. `AiAssistantModule` zaten
 *     `TenancyModule`i import ediyor; istemci orada kalsaydı Bilgi Bankası
 *     onu kullanmak için o modülü import etmek zorunda kalır ve
 *     `TenancyModule → AiAssistantModule → TenancyModule` DÖNGÜSÜ doğardı.
 */
describe('modül kaydı', () => {
  const oku = (yol: string): string =>
    readFileSync(join(__dirname, '..', '..', yol), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

  it('KRİTİK: servis sağlayıcı listesinde', () => {
    const modul = oku('modules/tenancy/tenancy.module.ts');
    expect(modul).toContain('BilgiBankasiAiService');
  });

  it('KRİTİK: MODÜL DÖNGÜSÜ YOK — Tenancy, AiAssistant’ı import ETMİYOR', () => {
    const modul = oku('modules/tenancy/tenancy.module.ts');
    expect(modul).not.toContain('AiAssistantModule');
  });

  it('KRİTİK: Anthropic istemcisi GLOBAL modülde ve uygulamaya kayıtlı', () => {
    expect(oku('modules/ai-assistant/anthropic.module.ts')).toContain('@Global()');
    expect(oku('app.module.ts')).toContain('AnthropicModule');
    // İkinci bir kayıt, iki ayrı istemci ve iki ayrı model yapılandırması
    // demek olurdu.
    expect(oku('modules/ai-assistant/ai-assistant.module.ts')).not.toContain(
      'anthropicClientProvider',
    );
  });
});
