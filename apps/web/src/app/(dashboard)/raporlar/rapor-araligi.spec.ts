import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * RAPOR ARALIĞI — BUGÜN İÇERİ GİRMİYOR.
 *
 * Panel ve rapor bu kuralda bir kez AYRIŞTI: rapor devam eden ayda
 * `to = bugün` alıyordu, panel almıyordu ve iki ekran farklı rakam
 * gösteriyordu. Ay çipleri gidip genel tarih seçicisi gelince kural yeniden
 * kırılabilir hâle geldi — seçicideki "Bugün" ve "Bu ay" ön ayarları bugünü
 * İÇERİYOR (Google Ads'te de öyle ve panelde doğru).
 *
 * Rapor bir BELGE ve müşteriye gidiyor: tamamlanmamış bir günü içine almak,
 * gün içinde değişecek rakamları müşteriye göndermek demek.
 *
 * Kaynak taraması, çünkü bu bir sunucu bileşeni ve kararın kendisi tek
 * satırlık bir kırpma.
 */
const SAYFA = readFileSync(join(__dirname, 'page.tsx'), 'utf8');

function govde(): string {
  const bas = SAYFA.indexOf('export default async function ReportsPage(');
  if (bas === -1) {
    throw new Error('ReportsPage bulunamadı — tarama boşa düştü, testi güncelle.');
  }
  const g = SAYFA.slice(bas);
  if (!g.includes('/reports/preview')) {
    throw new Error('ReportsPage dilimi rapor çekmiyor — tarama boşa düştü.');
  }
  return g;
}

describe('rapor tarih aralığı', () => {
  it('KRİTİK: aralık DÜNE kırpılıyor — bugün rapora girmiyor', () => {
    const g = govde();
    expect(g).toContain("const dun = gunEkle(today(), -1)");
    expect(g).toContain('devamEden ? dun : secilen.to');
  });

  it('rapora giden aralık KIRPILMIŞ olan — ham seçim DEĞİL', () => {
    /*
     * `secilen.from/to` doğrudan sorguya girseydi kırpma bir işe yaramazdı.
     *
     * ÇAPA `raporSorgusu(` — sorgu artık elle kurulmuyor, tek bir üreticiden
     * geçiyor (bkz. `rapor-sorgusu.spec.ts`: şablon PDF'e taşınmıyordu).
     * Kırpma iddiası o değişiklikten BAĞIMSIZ ve hâlâ geçerli: üreticiye
     * verilen değerler kırpılmış olanlar mı, ham seçim mi?
     */
    const g = govde();
    const i = g.indexOf('raporSorgusu({ clientId,');
    expect(i, 'sorgu üreticisi bulunamadı — tarama boşa düştü').toBeGreaterThan(-1);
    const satir = g.slice(i, g.indexOf('\n', i));
    expect(satir).toContain('from, to');
    expect(satir).not.toContain('secilen.');
  });

  it('kırpma KULLANICIYA söyleniyor', () => {
    // Sessizce kırpmak, "Bu ay" seçen kullanıcının eksik bir raporu tam
    // sanması demek olurdu.
    expect(govde()).toContain('{devamEden && (');
  });

  it('seçicide KARŞILAŞTIRMA kapalı — rapor delta göstermiyor', () => {
    // Çalışmayan bir düğme, olmayan bir özellik vaat etmek olurdu.
    expect(govde()).toContain('karsilastirmaVar={false}');
  });

  it('takvimde DÜNDEN sonrası seçilemiyor', () => {
    expect(govde()).toContain('enGecGun={dun}');
  });

  it('varsayılan dönem GEÇEN AY — rapor takvimsel bir belge', () => {
    // Kayan "son 30 gün" burada yanlış olurdu: müşteriye "Temmuz raporu"
    // gönderiliyor, "son 30 gün raporu" değil.
    expect(govde()).toContain("first(params.aralik) ?? 'gecen_ay'");
  });
});
