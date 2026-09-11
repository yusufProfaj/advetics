import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * ═══ SİLME EKRANI — NE GİDECEĞİ YAZILMADAN ONAY İSTENMİYOR ═══
 *
 * Kullanıcının isteği: *"ürettiğim şirketi silemiyorum … şirketi silerken
 * içerisinde workspace varsa içindeki workspace'i de sil ama 'workspace'iniz
 * de silinecek' tarzında bir bildirim çıkart."*
 *
 * Ama silme workspace'lerle sınırlı değil: reklam hesapları, KULLANICILAR ve
 * bütün METRİK GEÇMİŞİ de gidiyor (PGlite ile ölçüldü —
 * `sirket-silme.spec.ts`). "Emin misiniz?" deyip ne gideceğini söylememek,
 * bu depoda `reset-clients`in yarım kalıp metrik verisini götürmesiyle aynı
 * sınıf hata: pahalı yarısı yapılır, kullanıcı ne kaybettiğini sonra öğrenir.
 */
function kod(yol: string): string {
  return readFileSync(join(__dirname, '..', '..', yol), 'utf8')
    .split('\n')
    .filter((l) => {
      const t = l.trim();
      return !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*');
    })
    .join('\n');
}

const SIL = kod('components/ust-hesap/sirket-sil.tsx');
const FORM = kod('components/tenancy/musteri-bilgi-formu.tsx');

describe('tarama boşa düşmüyor', () => {
  it('kaynaklar okundu', () => {
    expect(SIL).toContain('export function SirketSil');
    expect(FORM).toContain('const ALANLAR');
    expect(SIL.length).toBeGreaterThan(1500);
  });
});

describe('KRİTİK: onaydan ÖNCE özet', () => {
  it('özet ucu çağrılıyor ve gelmeden silme açılmıyor', () => {
    /*
     * Özet alınamazsa boş bir onay kutusu göstermek, kullanıcının NE
     * gideceğini bilmeden onaylaması demekti.
     */
    expect(SIL).toContain('/silme-ozeti');
    expect(SIL).toContain('if (ozet === null) {');
  });

  it('KRİTİK: workspace SAYISI DEĞİL ADLARI yazılıyor', () => {
    // "3 workspace" kimseye ne kaybedeceğini söylemiyor; adları görünce
    // kullanıcı yanlış şirketi seçtiğini fark ediyor.
    expect(SIL).toContain('ozet.workspaceAdlari.join');
  });

  it('KRİTİK: kullanıcı ve METRİK kaybı da yazılıyor', () => {
    /*
     * Kullanıcı istemi yalnızca workspace'ten bahsediyordu; cascade ondan
     * geniş ve eksik yazılan bir uyarı, kullanıcının kaybedeceğini
     * bilmediği şeyi silmesi demek.
     */
    expect(SIL).toContain('giriş hesapları da silinir');
    expect(SIL).toContain('platformdan yeniden çekilemez');
  });
});

describe('KRİTİK: boş şirket ile DOLU şirket ayrı', () => {
  it('eşiği SUNUCU belirliyor', () => {
    /*
     * Yanlışlıkla açılmış bir test kaydı için ad yazdırmak angarya; içinde
     * veri olan bir şirkette aynı kolaylık geri alınamayan bir silme demek.
     * Karar panelde ÜRETİLMİYOR, sunucudan geliyor — iki taraf ayrışsaydı
     * panel kolay yolu gösterip uç reddederdi.
     */
    expect(SIL).toContain('const bosSirket = !ozet.adOnayiGerekli;');
  });

  it('ad eşleşmeden düğme KAPALI', () => {
    expect(SIL).toContain("(!bosSirket && onayAdi.trim() !== ozet.name)");
  });

  it('KRİTİK: ENGEL varsa sebep yazılıyor, düğme hiç çizilmiyor', () => {
    // Kapalı bir düğme "neden" sorusunu ekranda bırakıyor ve kullanıcı onu
    // aramaya gidiyor.
    expect(SIL).toContain('if (ozet.engel !== null) {');
    expect(SIL).toContain('{ozet.engel}');
  });
});

describe('KRİTİK: workspace adı düzenlenebiliyor', () => {
  it('ad ALANLAR listesinde — listenin dışında değil', () => {
    /*
     * Bu dosyanın tek değişmezi "her alan TEK listeden türetiliyor".
     * Adı ayrı bir JSX bloğu olarak yazmak kolaydı; listenin dışına çıkan
     * bir alan, bir sonraki eklemede sessizce unutulacak olandır.
     */
    const bas = FORM.indexOf('const ALANLAR');
    const dilim = FORM.slice(bas, FORM.indexOf('];', bas));
    expect(dilim.length, 'liste bulunamadı — tarama boşa düştü').toBeGreaterThan(100);
    expect(dilim).toContain("{ anahtar: 'name', etiket: 'Workspace adı', tur: 'text' }");
  });

  it('KRİTİK: ad BOŞ gönderilemiyor', () => {
    /*
     * Diğer alanlarda boş dizge "temizle" demek ve uç onu `null`a
     * çeviriyor; ad için aynı şey 400 demek. Sunucunun cevabını beklemeden
     * söylemek, "Kaydet"e basıp anlaşılmaz bir hata almaktan iyi.
     */
    expect(FORM).toContain('if (yeniAd.length < 2) {');
    expect(FORM).toContain('name: yeniAd');
  });
});
