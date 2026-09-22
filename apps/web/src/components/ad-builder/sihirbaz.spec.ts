import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * ═══ KURULUM SİHİRBAZI ═══
 *
 * Kullanıcının isteği: "reklam oluştur kısmı tasarım açısından çok kötü
 * gözüküyor, o tarafı sanki bir kurulum sihirbazıymış gibi aşama aşama
 * ilerlememiz gerekiyor... tasarım açısından ui/ux kurallarına uygun olmasını
 * istiyorum".
 *
 * Eski ekran beş bloğu alt alta basıyordu: kullanıcı hangi alanın zorunlu
 * olduğunu göremiyor ve "hazır mıyım" sorusunu ancak en alttaki düğmenin
 * kapalı olmasından anlıyordu.
 *
 * Bu dosya, sihirbazın UI/UX kurallarını kilitliyor. Bileşen render
 * edilmiyor (`vitest.config.ts` bunu bilinçli reddediyor), kararlar kaynak
 * taramasıyla sınanıyor.
 */
const KABUK = readFileSync(join(__dirname, 'sihirbaz.tsx'), 'utf8')
  .replace(/(^[ \t]*|\{)\/\*[\s\S]*?\*\//gm, '')
  .replace(/^\s*\/\/.*$/gm, '');

const BUILDER = readFileSync(join(__dirname, 'simple-builder.tsx'), 'utf8')
  .replace(/(^[ \t]*|\{)\/\*[\s\S]*?\*\//gm, '')
  .replace(/^\s*\/\/.*$/gm, '');

describe('tarama boşa düşmüyor', () => {
  it('iki kaynak da okundu', () => {
    expect(KABUK).toContain('export function Sihirbaz(');
    expect(BUILDER).toContain('<Sihirbaz');
  });
});

describe('ilerleme görünür', () => {
  it('KRİTİK: kaçıncı adım ve toplam kaç adım YAZILI', () => {
    // UX kuralı "Progress Indicators": çok adımlı akışta ilerleme
    // gösterilmeli; yoksa kullanıcı ne kadar kaldığını bilmiyor.
    expect(KABUK).toContain('Adım {aktif + 1} / {adimlar.length}');
  });

  it('KRİTİK: aktif adım `aria-current="step"` ile duyuruluyor', () => {
    // Ekran okuyucu kullanıcısı hangi adımda olduğunu renkten anlayamaz.
    expect(KABUK).toContain("aria-current={secili ? 'step' : undefined}");
  });

  it('KRİTİK: TAMAMLANMIŞ ADIM renkle DEĞİL işaretle de anlatılıyor', () => {
    // "Color not only": renk tek başına bilgi taşımamalı.
    expect(KABUK).toContain("{tamamlandi ? '✓' : i + 1}");
  });
});

describe('gezinme tahmin edilebilir', () => {
  it('KRİTİK: İLERİ ATLANAMIYOR', () => {
    /*
     * Atlanan adım, eksik alanı en sonda öğrenmek demek. Geri dönmek ise
     * serbest: kullanıcı yazdığını düzeltebilmeli.
     */
    expect(KABUK).toContain('const gidilebilir = i <= aktif || adimlar.slice(0, i).every((x) => x.tamam);');
  });

  it('KRİTİK: KAPALI DÜĞMENİN SEBEBİ yazılı', () => {
    // Tek başına kapalı bir düğme "bozuk" olarak okunuyor ve kullanıcı
    // tıklamayı deniyor.
    expect(KABUK).toContain('{!ilerleyebilir && adim.eksik && (');
  });

  it('KRİTİK: her adım KENDİ eksik cümlesini taşıyor', () => {
    expect(BUILDER).toContain("eksik: 'Önce bir hedef seç.'");
    expect(BUILDER).toContain("eksik: 'En az bir görsel seç.'");
    expect(BUILDER).toContain("eksik: 'Ana metni yaz ya da yapay zekâya yazdır.'");
  });
});

describe('erişilebilirlik', () => {
  it('KRİTİK: ODAK adım değişince yeni başlığa taşınıyor', () => {
    /*
     * Taşınmazsa odak sayfanın başında kalıyor ve ekran okuyucu kullanıcısı
     * neyin değiştiğini duymuyor.
     */
    expect(KABUK).toContain('baslikRef.current?.focus();');
    expect(KABUK).toContain('}, [aktif]);');
    expect(KABUK).toContain('tabIndex={-1}');
  });

  it('KRİTİK: her düğmede GÖRÜNÜR ODAK HALKASI var', () => {
    // `outline-none` karşılığı olmadan yazılırsa klavye kullanıcısı nerede
    // olduğunu göremiyor.
    const halkaSayisi = KABUK.split('focus-visible:ring-2').length - 1;
    expect(halkaSayisi).toBeGreaterThanOrEqual(3);
  });

  it('KRİTİK: EYLEM ÇUBUĞU SABİT DEĞİL — odağı kapatmıyor', () => {
    /*
     * WCAG 2.2 "Focus Not Obscured": sabit bir alt çubuk odaklanan alanı
     * kapatabiliyor. Bu ekranda içerik adım adım kısaldığı için sabitlemeye
     * gerek yok.
     */
    expect(KABUK).not.toContain('fixed bottom-0');
  });

  it('rayın erişilebilir bir adı var', () => {
    expect(KABUK).toContain('aria-label="Kurulum adımları"');
  });
});

describe('hareket', () => {
  it('KRİTİK: geçiş HAREKET AZALTILMIŞSA çizilmiyor', () => {
    // `prefers-reduced-motion` desteklenmezse vestibüler rahatsızlığı olan
    // kullanıcı için ekran kullanılamaz hâle geliyor.
    expect(KABUK).toContain('motion-safe:animate-');
  });
});

describe('adım sırası kullanıcının tarif ettiği akış', () => {
  it('KRİTİK: hedef → görsel → metin → bütçe → özet', () => {
    const sira = ['Hedef', 'Görsel', 'Metin', 'Bütçe', 'Özet'].map((ad) =>
      BUILDER.indexOf(`ad: '${ad}'`),
    );
    expect(sira.every((i) => i > -1), 'adımlardan biri bulunamadı').toBe(true);
    expect([...sira].sort((a, b) => a - b)).toEqual(sira);
  });
});

describe('WHATSAPP NUMARASI TEYİT EDİLİYOR', () => {
  it('KRİTİK: numara Meta’dan okunuyor', () => {
    /*
     * Kullanıcının isteği: "whatsapp numarasının doğru olup olmadığını teyit
     * etmem için gözükmesini istiyorum". Numara sorulmuyor ama hangi hatta
     * mesaj düşeceği yayından ÖNCE görünmeli.
     */
    expect(BUILDER).toContain('`/connections/social-profiles/${pageId}/whatsapp`');
  });

  it('KRİTİK: yalnızca WHATSAPP hedefinde çekiliyor', () => {
    // Her sayfa yüklemesinde çağırmak, kullanılmayacak bir Graph isteği.
    expect(BUILDER).toContain("if (goal !== 'whatsapp' || !pageId) return;");
  });

  it('KRİTİK: ÜÇ HÂL AYRI — okunuyor / numara yok / okunamadı', () => {
    /*
     * Tek bir boş kutu, "numara yok" ile "okuyamadık"ı aynı şeye çevirirdi
     * ve ikisinin yapılacak işi farklı.
     */
    expect(BUILDER).toContain("whatsapp.durum === 'bekliyor'");
    expect(BUILDER).toContain('Sayfaya bağlı WhatsApp hesabı.');
    expect(BUILDER).toContain('bağlı WhatsApp numarası okunamadı');
  });

  it('KRİTİK: OKUNAMAMASI kampanyayı ENGELLEMİYOR', () => {
    /*
     * Numara Meta tarafında zaten tanımlı olabilir; biz yalnızca
     * okuyamıyoruz. Engellemek, çalışan bir kurulumu durdurmak olurdu.
     */
    expect(BUILDER).toContain('Kampanya yine kurulabilir');
  });

  it('KRİTİK: YARIŞAN İSTEK atılıyor', () => {
    // Hızlıca sayfa değiştiren kullanıcıda geç gelen cevap YENİ sayfanın
    // altına ESKİ numarayı yazardı.
    expect(BUILDER).toContain('let birakildi = false;');
  });
});
