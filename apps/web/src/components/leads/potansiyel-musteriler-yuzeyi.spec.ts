import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { leadsSozlugu } from '@/dil/sozlukler/leads';

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
    expect(LISTE).toContain('lead.leadFormName ?? d.formAdiYok');
    expect(leadsSozlugu.tr.tablo.formAdiYok).toBe('Form adı alınamadı');
  });

  it('KRİTİK: TARİH MUTLAK — göreli zaman ONUN YANINDA', () => {
    /*
     * "3 gün önce" tazelik sorusunun cevabı; kaydın hangi güne ait olduğu
     * takvimde aranıyor ve göreli zamandan çıkarılamıyor. İkisi birlikte
     * duruyor, biri diğerinin yerine değil.
     */
    expect(LISTE).toContain('formatTarih(lead.submittedAt, dil)');
    expect(LISTE).toContain('formatRelative(lead.submittedAt, dil)');
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
    expect(SAYFA).toContain('<BosDurum baslik={d.henuzKayitYok} neden={result.emptyReason} />');
    expect(leadsSozlugu.tr.sayfa.henuzKayitYok).toBe('Henüz kayıt yok');
  });

  it('KRİTİK: DURUM DEĞİŞİKLİĞİ HATASI GERİ ALINIYOR', () => {
    // Hatayı yutmak, ajansın "arandı" sandığı kaydın hâlâ "yeni" olması
    // demek — ve o kişi bir daha aranmaz.
    expect(LISTE).toContain('status: previous');
    expect(LISTE).toContain('d.durumDegistirilemedi');
    expect(leadsSozlugu.tr.tablo.durumDegistirilemedi).toBe('Durum değiştirilemedi.');
  });

  it('KRİTİK: SESSİZ KESME YOK', () => {
    expect(LISTE).toContain('d.gosteriliyor(rows.length)');
    expect(LISTE).toContain('d.toplam(initial.total)');
    expect(leadsSozlugu.tr.tablo.gosteriliyor(5)).toBe('5 kayıt gösteriliyor');
    expect(leadsSozlugu.tr.tablo.toplam(61)).toBe(' · toplam 61. Aramayı daralt.');
  });
});

describe('SON 30 GÜNÜ GETİR', () => {
  it('KRİTİK: düğme var ve kendi ucunu çağırıyor', () => {
    expect(DUGME).toContain("'/leads/son-30-gun'");
    expect(DUGME).toContain('d.dugme');
    expect(leadsSozlugu.tr.son30.dugme).toBe('Son 30 günü getir');
  });

  it('KRİTİK: SONUÇ SAYFA BAZINDA YAZILIYOR', () => {
    /*
     * "0 kayıt" tek başına düğmenin bozuk olduğunu düşündürüyor; sunucu her
     * sayfa için sebebini söylüyor (token yok, form yok, kaç form tarandı).
     */
    expect(DUGME).toContain('notlar.map');
    expect(DUGME).toContain('d.yeniKayit(kayitlar)');
    expect(leadsSozlugu.tr.son30.yeniKayit(3)).toBe('3 yeni kayıt');
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

/**
 * ═══ TABLO + YAN PANEL (kullanıcı kararı 2026-10-14, taslak `#leads`) ═══
 */
describe('tablo ve yan panel', () => {
  it('KRİTİK: satır klavyeyle de açılıyor; telefon/e-posta bağlantısı satırı açmıyor', () => {
    expect(LISTE).toContain("if (e.key === 'Enter' || e.key === ' ') {");
    expect(LISTE).toContain('tabIndex={0}');
    expect(LISTE).toContain('onClick={(e) => e.stopPropagation()}');
  });

  it('KRİTİK: notu kaydetmek DURUMU DEĞİŞTİRMİYOR — mevcut durum aynen gidiyor', () => {
    // Uç durum ve notu birlikte alıyor; başka bir durum göndermek Meta'ya
    // istenmemiş bir sonuç bildirirdi.
    expect(LISTE).toContain('body: JSON.stringify({ status: lead.status, note: not.trim() }),');
  });

  it('KRİTİK: süzgece uyan kayıt yoksa nedeni ayrı ("henüz kayıt yok" değil)', () => {
    expect(LISTE).toContain('baslik={d.suzgeceUyanYok}');
    expect(leadsSozlugu.tr.tablo.suzgeceUyanYok).toBe('Bu süzgece uyan kayıt yok');
    expect(SAYFA).toContain('<BosDurum baslik={d.henuzKayitYok} neden={result.emptyReason} />');
  });

  it('KRİTİK: liste düşerse sunucunun cümlesi ekranda', () => {
    expect(SAYFA).toContain('listeHatasi = hataMetni(e);');
    expect(SAYFA).toContain('<HataDurumu baslik={d.kayitlarYuklenemedi} mesaj={listeHatasi ?? d.sebepYok} />');
    expect(leadsSozlugu.tr.sayfa.kayitlarYuklenemedi).toBe('Kayıtlar yüklenemedi');
  });

  it('KRİTİK: Meta gönderim sorunu yan menüde kırmızı nokta', () => {
    expect(SAYFA).toContain('uyari: sorunlu > 0,');
  });
});

