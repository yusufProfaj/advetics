import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * ═══ POTANSİYEL MÜŞTERİLER EKRANI ═══
 *
 * Kullanıcının isteği birebir: "formun ismi - cevapları - lead tarihi".
 * Üçü de veride vardı ama ekranda üçü de gizliydi — form adı tek satırlık
 * gri bir dizenin ortasına sıkışmıştı, tarih "3 gün önce" diye göreliydi ve
 * CEVAPLAR ancak satıra tıklayınca açılıyordu.
 *
 * Bileşen render edilmiyor (`vitest.config.ts` bunu bilinçli reddediyor),
 * o yüzden kararlar kaynak taramasıyla sınanıyor.
 */
const WEB_SRC = join(__dirname, '..', '..');

function kod(yol: string): string {
  return readFileSync(join(WEB_SRC, yol), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

const SAYFA = kod('app/(dashboard)/potansiyel-musteriler/page.tsx');
const LISTE = kod('components/leads/lead-table.tsx');
const DUGME = kod('components/leads/son-30-gun.tsx');

describe('tarama boşa düşmüyor', () => {
  it('dosyalar okundu ve beklenen gövdeyi taşıyor', () => {
    expect(SAYFA).toContain('LeadTable');
    expect(LISTE).toContain('export function LeadTable');
    expect(DUGME).toContain('export function Son30Gun');
  });
});

describe('FORM · CEVAPLAR · TARİH', () => {
  it('KRİTİK: CEVAPLAR KARTTA — tıklama arkasında değil', () => {
    /*
     * Ekranın taşıdığı asıl bilgi "kişi ne yazdı" ve o bilgi varsayılan
     * olarak gizliydi. İlk birkaç cevap artık kartta duruyor.
     */
    expect(LISTE).toContain('const ONDE_GOSTERILEN_CEVAP');
    expect(LISTE).toContain('cevaplar.slice(0, ONDE_GOSTERILEN_CEVAP)');
  });

  it('KRİTİK: İLETİŞİM ALANLARI CEVAPLARDA TEKRAR ETMİYOR', () => {
    /*
     * Ad, telefon ve e-posta kartın üstünde zaten yazıyor; cevaplarda ikinci
     * kez göstermek, asıl ayırt edici cevabı (bütçe, şehir, ürün) üç tekrarın
     * arkasına iter.
     */
    expect(LISTE).toContain('const ILETISIM_ALANLARI');
    expect(LISTE).toContain('!ILETISIM_ALANLARI.has(f.name.toLowerCase())');
  });

  it('KRİTİK: FORM ADI KENDİ SÜTUNUNDA ve boşsa SEBEBİ YAZIYOR', () => {
    /*
     * Meta Ads Manager'da kurulmuş formların adı bir süre boş geliyordu ve
     * kart sahipsiz görünüyordu: kayıt var, nereden geldiği yok.
     */
    expect(LISTE).toContain('lead.leadFormName ?? \'Form adı alınamadı\'');
  });

  it('KRİTİK: TARİH MUTLAK — göreli zaman ONUN YANINDA', () => {
    /*
     * "3 gün önce" tazelik sorusunun cevabı; kaydın hangi güne ait olduğu
     * takvimde aranıyor ve göreli zamandan çıkarılamıyor. İkisi birlikte
     * duruyor, biri diğerinin yerine değil.
     */
    expect(LISTE).toContain('formatTarih(lead.submittedAt)');
    expect(LISTE).toContain('formatRelative(lead.submittedAt)');
  });

  it('KRİTİK: TELEFON VE E-POSTA TIKLANABİLİR', () => {
    // Ajansın bu ekrandaki ilk işi aramak; numarayı kopyalamak günde kırk
    // kayıtta kırk kez yapılan bir angarya.
    expect(LISTE).toContain('href={`tel:');
    expect(LISTE).toContain('href={`mailto:');
  });
});

describe('SESSİZ HATA YOK', () => {
  it('KRİTİK: BOŞ LİSTENİN SEBEBİ SUNUCUDAN GELİYOR', () => {
    /*
     * Ekranda tek bir cümle vardı ve DÖRT ayrı hâli aynı kefeye koyuyordu:
     * sayfa atanmamış · token yok · tarama hiç koşmamış · gerçekten kayıt
     * yok. Üçünde yanlış, ve kullanıcının bildirdiği belirti tam da buydu.
     */
    expect(SAYFA).toContain('result.emptyReason');
    expect(SAYFA).not.toContain('Formu dolduran biri olduğunda kaydı burada görürsün');
  });

  it('KRİTİK: DURUM DEĞİŞİKLİĞİ HATASI GERİ ALINIYOR', () => {
    // Hatayı yutmak, ajansın "arandı" sandığı kaydın hâlâ "yeni" olması
    // demek — ve o kişi bir daha aranmaz.
    expect(LISTE).toContain('status: previous');
    expect(LISTE).toContain('Durum değiştirilemedi');
  });

  it('KRİTİK: SESSİZ KESME YOK', () => {
    expect(LISTE).toContain('kayıt gösteriliyor');
    expect(LISTE).toContain('toplam ${initial.total}');
  });
});

describe('SON 30 GÜNÜ GETİR', () => {
  it('KRİTİK: düğme var ve kendi ucunu çağırıyor', () => {
    expect(DUGME).toContain("'/leads/son-30-gun'");
    expect(DUGME).toContain('Son 30 günü getir');
  });

  it('KRİTİK: SONUÇ SAYFA BAZINDA YAZILIYOR', () => {
    /*
     * "0 kayıt" tek başına düğmenin bozuk olduğunu düşündürüyor; sunucu her
     * sayfa için sebebini söylüyor (token yok, form yok, kaç form tarandı).
     */
    expect(DUGME).toContain('notlar.map');
    expect(DUGME).toContain('yeni kayıt');
  });

  it('KRİTİK: HATA YUTULMUYOR', () => {
    expect(DUGME).toContain('ApiRequestError');
    expect(DUGME).not.toContain('} catch {');
  });

  it('KRİTİK: LİSTE BOŞKEN DE ÇİZİLİYOR — asıl gerekli olduğu an o', () => {
    /*
     * Kayıt varken göstermek kolay; "gelmiyor" diyen kullanıcıya hiçbir şey
     * bırakmamak ise ekranı çaresiz yapıyordu. Düğme `total` koşuluna bağlı
     * DEĞİL.
     */
    const i = SAYFA.indexOf('<Son30Gun');
    expect(i, 'düğme bulunamadı — tarama boşa düştü').toBeGreaterThan(-1);
    const bosKontrol = SAYFA.indexOf('total === 0');
    expect(bosKontrol).toBeGreaterThan(i);
  });

  it('KRİTİK: YETKİYE BAĞLI — okuyan kullanıcıda çizilmiyor', () => {
    // Kayıt çekmek `lead.write` işi; okuma yetkisi olan kullanıcıya
    // çalışmayacak bir düğme göstermek "bozuk" olarak okunur.
    expect(SAYFA).toContain('{canWrite && <Son30Gun');
  });
});
