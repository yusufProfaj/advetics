import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * PAYLAŞ VE GÖNDER EKRANI.
 *
 * Bu ekrandan MÜŞTERİYE mail gidiyor: yanlış giden bir şey geri alınamıyor.
 * Kapılar hem sunucuda hem burada; ekrandaki kontrol kullanıcıyı bir hata
 * mesajıyla karşılaşmadan doğru yere yönlendiriyor.
 */
const KAYNAK = readFileSync(join(__dirname, 'rapor-gonder.tsx'), 'utf8');

describe('RaporGonder', () => {
  it('KRİTİK: DOĞRULANMAMIŞ gönderende "Gönder" KAPALI', () => {
    // Sunucu da reddediyor; ekranda söylemek kullanıcıyı hata almadan
    // Ayarlar ekranına yönlendiriyor.
    expect(KAYNAK).toContain('!taslak?.senderReady');
    expect(KAYNAK).toContain('E-posta ayarların doğrulanmamış');
  });

  it('KRİTİK: HİÇ ALICI YOKSA gönderilemiyor ve sebebi yazılı', () => {
    /*
     * Alıcı artık LİSTE ve boş liste tek başına engel DEĞİL: müşterinin
     * kayıtlı adresleri varsa gönderim geçerli. Düğmeyi her boş listede
     * kapatmak, çoğunlukla hiçbir adres yazmayacak kullanıcıyı her seferinde
     * adres yazmaya zorlardı.
     *
     * Engel yalnızca İKİSİ DE boşken: ne yazılan ne kayıtlı adres var.
     */
    expect(KAYNAK).toContain('alici.length === 0 && (taslak?.defaultTo.length ?? 0) === 0');
    // Ve sebebi ekranda yazıyor — "gönder"e basınca hata almak yetmez.
    expect(KAYNAK).toContain('bosVarsayilan');
    const alan = readFileSync(join(__dirname, '../alici-listesi-alani.tsx'), 'utf8');
    expect(alan).toContain('Müşterinin kayıtlı rapor alıcısı yok');
  });

  it('KRİTİK: alıcıların birbirini GÖRECEĞİ ekranda yazılı', () => {
    /*
     * Tek mail, herkes `To:` alanında — yani her alıcı diğerlerinin adresini
     * görüyor. Bu bir gizlilik kararı ve kullanıcının GÖNDERMEDEN ÖNCE
     * bilmesi gerekiyor: danışman + müşteri karışık bir listede sürpriz
     * olurdu.
     */
    const alan = readFileSync(join(__dirname, '../alici-listesi-alani.tsx'), 'utf8');
    expect(alan).toContain('hepsi birbirinin adresini görecek');
  });

  it('mail metni DÜZENLENEBİLİR — anlatı veriden üretilemiyor', () => {
    /*
     * Sayılar rapordan geliyor ama "Urla bölgesindeki konut aramalarında..."
     * gibi cümleler uydurulamaz; uydurmak müşteriye yanlış bir strateji
     * anlatmak olurdu.
     */
    expect(KAYNAK).toContain('<textarea');
    expect(KAYNAK).toContain('değerlendirme kısmını sen yaz');
  });

  it('PDF DÜZ BAĞLANTI — fetch ile belleğe alınmıyor', () => {
    // `fetch` gövdeyi belleğe alıp blob üretmek demek; tarayıcının kendi
    // indirme akışı hem ucuz hem de ilerleme gösteriyor.
    expect(KAYNAK).toContain('href={`${API_URL}/reports/pdf');
    expect(KAYNAK).not.toContain("apiFetch('/reports/pdf");
  });

  it('KRİTİK: veri yokken indirme ve paylaşma KAPALI', () => {
    /*
     * KORUMA İKİ DOSYAYA BÖLÜNDÜ ve iddia da öyle olmalı: "Müşteriye gönder"
     * düğmesi kalkıp yerine "Paylaş" menüsü geldiğinde (`share-controls.tsx`)
     * `disabled` kontrolü oraya taşındı. Yalnızca bu dosyaya bakan bir iddia,
     * korumanın kaybolduğu bir dünyada da geçerdi.
     *
     * Veri yokken üretilen bir PDF ya da paylaşım linki, müşteriye BOŞ bir
     * belge göndermek demek.
     */
    expect(KAYNAK).toContain('pointer-events-none');
    const menu = readFileSync(join(__dirname, 'share-controls.tsx'), 'utf8');
    expect(menu).toContain('disabled={busy || !hasData}');
  });

  it('sunucunun KENDİ hata mesajı gösteriliyor', () => {
    expect(KAYNAK).toContain('err instanceof ApiRequestError ? err.message');
  });

  it('gönderim sonucu ALICILARI yazıyor — "gönderildi" tek başına yetmiyor', () => {
    expect(KAYNAK).toContain('adrese gönderildi');
    expect(KAYNAK).toContain('r.to.join');
  });

  it('KRİTİK: REDDEDİLEN alıcılar ayrı ve UYARI olarak gösteriliyor', () => {
    /*
     * nodemailer, alıcılardan bazıları reddedilse bile FIRLATMIYOR (yalnızca
     * hepsi reddedilirse). Yani istek başarılı dönüyor ve ekran tek bir
     * "gönderildi" yazsaydı kullanıcı müşterisinin raporu almadığını günler
     * sonra öğrenirdi — bu projenin en pahalı hata türü.
     *
     * Yeşil kutunun İÇİNE sıkıştırmak da yetmez: kısmi bir arıza başarı gibi
     * görünürdü. Ayrı kutu ve uyarı rengi.
     */
    expect(KAYNAK).toContain('adres reddedildi');
    expect(KAYNAK).toContain('border-warn/40');
    // İddia RENGE değil, reddi TAŞIYAN duruma da çapalı olmalı.
    expect(KAYNAK).toContain('setReddedilen(r.reddedilen)');
  });
});
