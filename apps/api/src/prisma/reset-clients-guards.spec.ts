import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * SIFIRLAMA BETİĞİNİN GÜVENLİK KİLİTLERİ.
 *
 * Bu betik ÜRETİM VERİSİNİ geri dönüşsüz siliyor ve elle çalıştırılıyor —
 * yani hiçbir birim testi onu "koşturarak" sınayamaz. Sınanabilecek şey
 * kilitlerin YERİNDE DURDUĞU: bir refaktör bunlardan birini düşürürse tek
 * belirti, birinin panele girememesi olur.
 *
 * Tarama kaynak üzerinde çünkü korunan şey davranış değil BİR KARAR.
 */
const KAYNAK = readFileSync(join(__dirname, '..', '..', 'prisma', 'reset-clients.ts'), 'utf8');

const yorumsuz = (m: string): string =>
  m.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

describe('betik gerçekten okunuyor', () => {
  it('tarama boşa düşmüyor', () => {
    expect(KAYNAK.length).toBeGreaterThan(3000);
    expect(KAYNAK).toContain('reset-clients');
    expect(yorumsuz(KAYNAK)).toContain('deleteMany');
  });
});

describe('KURU ÇALIŞMA VARSAYILAN', () => {
  it('KRİTİK: --apply olmadan silme yapılmıyor', () => {
    const kod = yorumsuz(KAYNAK);
    expect(kod).toContain("ARGV.includes('--apply')");
    // `!APPLY` erken dönüşü silme çağrılarından ÖNCE gelmeli.
    const applyGuard = kod.indexOf('if (!APPLY)');
    const ilkSilme = kod.indexOf('deleteMany');
    expect(applyGuard).toBeGreaterThan(-1);
    expect(applyGuard).toBeLessThan(ilkSilme);
  });
});

describe('SİLME SIRASI — üretimde yarım silmeye yol açan iki karar', () => {
  it('KRİTİK: taslak ağacı müşterilerden ÖNCE siliniyor', () => {
    /*
     * `draft_ads.creative_id` → `ad_creatives` bağı `onDelete: Restrict`.
     * Müşteri silinince iki cascade dalı birden işliyor ve Postgres kreatifi
     * silmeye kalkınca engel tetikliyor:
     *   Foreign key constraint violated: draft_ads_creative_id_fkey
     * Üretimde yaşandı; script yarıda kaldı.
     */
    const kod = yorumsuz(KAYNAK);
    const taslak = kod.indexOf('draftCampaign.deleteMany');
    const musteri = kod.indexOf('client.deleteMany');
    expect(taslak).toBeGreaterThan(-1);
    expect(musteri).toBeGreaterThan(-1);
    expect(taslak).toBeLessThan(musteri);
  });

  it('KRİTİK: metrikler müşterilerden SONRA siliniyor', () => {
    /*
     * Ters sıra üretimde en pahalı yarıyı yaptırdı: 4.340 metrik satırı
     * silindi, sonra müşteri silme düştü. Metrik verisi Meta'da 37 aylık
     * sınıra takılıyor ve Google'da yeniden çekmek kota harcıyor; müşteri
     * satırı ucuz. Riskli adım önce, pahalı adım sonra.
     */
    const kod = yorumsuz(KAYNAK);
    const musteri = kod.indexOf('client.deleteMany');
    const metrik = kod.indexOf('insightsDaily.deleteMany');
    expect(metrik).toBeGreaterThan(-1);
    expect(musteri).toBeLessThan(metrik);
  });
});

describe('KULLANICI SİLME KİLİTLERİ', () => {
  it('KRİTİK: kullanıcı silme AYRI bir bayrakta', () => {
    // Müşterileri sıfırlamak ile ekibi silmek iki ayrı karar; tek bayrağa
    // bağlamak "müşterileri temizleyeyim" diyenin ekibini de silmesiydi.
    expect(yorumsuz(KAYNAK)).toContain("ARGV.includes('--purge-users')");
  });

  it('KRİTİK: korunan e-postalar KODDA, argümanda değil', () => {
    /*
     * Komut satırında yazılan bir e-posta yanlış yazılırsa o kullanıcı da
     * silinir ve panele girecek kimse kalmaz.
     */
    const kod = yorumsuz(KAYNAK);
    expect(kod).toContain('hello@profaj.com');
    expect(kod).toContain('yusuf@profaj.com');
    expect(kod).toContain('ecem@profaj.com');
    expect(kod).not.toMatch(/--keep-emails|--protect/);
  });

  it('KRİTİK: korunan e-postaların hiçbiri yoksa DURUYOR', () => {
    /*
     * Yanlış veritabanı ve yazım hatasını aynı anda yakalayan kilit. Olmasa:
     * liste hiçbiriyle eşleşir, "hepsi silinecek" olur ve uygulandığında
     * panele girebilecek tek bir hesap kalmazdı.
     */
    const kod = yorumsuz(KAYNAK);
    expect(kod).toContain('korunacak.length === 0');
    // Ve gerçekten ÇIKIYOR — yalnızca uyarı yazıp devam etmiyor.
    const i = kod.indexOf('korunacak.length === 0');
    expect(kod.slice(i, i + 400)).toContain('return');
  });

  it('KRİTİK: RESTRICT taşıyan bağlantı alanı silmeden ÖNCE devrediliyor', () => {
    /*
     * `platform_connections.connected_by_user_id` ON DELETE RESTRICT.
     * Devredilmezse `user.deleteMany` Postgres tarafından reddedilir ve
     * script yarıda patlar: müşteriler silinmiş, kullanıcılar durur.
     */
    const kod = yorumsuz(KAYNAK);
    const devir = kod.indexOf('connectedByUserId');
    const silme = kod.indexOf('prisma.user.deleteMany');
    expect(devir).toBeGreaterThan(-1);
    expect(silme).toBeGreaterThan(-1);
    expect(devir).toBeLessThan(silme);
  });

  it('bağlantı SİLİNMİYOR, yalnızca devrediliyor', () => {
    // Bağlantıyı silmek 157 hesabın kaydını ve yayındaki boost'ların hesap
    // bağını götürürdü.
    const kod = yorumsuz(KAYNAK);
    expect(kod).not.toContain('platformConnection.deleteMany');
  });
});
