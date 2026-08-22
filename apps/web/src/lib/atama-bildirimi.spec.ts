import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { atamaBildirimi } from './atama-bildirimi';

describe('atama bildirimi', () => {
  it('KRİTİK: taşınan kayıt sayısı yazılıyor', () => {
    const m = atamaBildirimi({ movedRows: 1420, leftBehind: {} }, true);
    expect(m).toContain('1.420');
    expect(m).toContain('taşındı');
  });

  it('KRİTİK: kaldırmada verinin KALDIĞI ve SİLİNMEDİĞİ yazılıyor', () => {
    /*
     * "Kaldır"a basan kullanıcının ilk düşüncesi "geçmişim gitti mi" oluyor.
     * Cevap hiçbir ekranda yoktu.
     */
    const m = atamaBildirimi({ movedRows: 0, stayingRows: 830 }, false);
    expect(m).toContain('830');
    expect(m).toContain('silinmedi');
  });

  it('taşıma yoksa taşıma cümlesi de yok', () => {
    // "0 kayıt taşındı" cümlesi doğru ama işe yaramaz gürültü.
    expect(atamaBildirimi({ movedRows: 0, leftBehind: {} }, true)).toBeNull();
  });

  it('KRİTİK: eski müşteride kalanlar TÜR TÜR sayılıyor', () => {
    const m = atamaBildirimi({ movedRows: 5, leftBehind: { 'aylık bütçe': 2, kural: 1 } }, true);
    expect(m).toContain('2 aylık bütçe');
    expect(m).toContain('1 kural');
  });

  it('kaldırmada taşıma cümlesi KURULMUYOR', () => {
    // Kaldırmada hiçbir şey taşınmıyor; "taşındı" demek düpedüz yanlış olurdu.
    const m = atamaBildirimi({ movedRows: 0, stayingRows: 10 }, false);
    expect(m).not.toContain('taşındı');
  });

  it('alanlar hiç gelmezse patlamıyor', () => {
    // Sayfa atamasının yanıtında bu alanlar YOK; aynı yardımcı ikisini de
    // karşılıyor ve `undefined` okumak "0 kayıt" yazmakla aynı şey değil.
    expect(atamaBildirimi({}, true)).toBeNull();
    expect(atamaBildirimi({}, false)).toBeNull();
  });

  it('KRİTİK: hesaba bağlı OLMAYAN kayıtlar ayrıca yazılıyor', () => {
    /*
     * Şemsiye bütçe `leftBehind` listesinde YOK ve olamaz: hiçbir hesaba
     * bağlı değil. Ayrı bir cümle olmasaydı, taşımadan en çok etkilenen
     * şey hakkında hiçbir şey söylenmezdi.
     */
    const m = atamaBildirimi(
      { movedRows: 3, clientWide: { 'ay geneli (şemsiye) bütçe': 1, 'tüm hesapları kapsayan kural': 2 } },
      true,
    );
    expect(m).toContain('şemsiye');
    expect(m).toContain('2 tüm hesapları kapsayan kural');
    expect(m).toContain('kayacak');
  });

  it('müşteri geneli kayıt yoksa uyarı da yok', () => {
    const m = atamaBildirimi({ movedRows: 3, clientWide: {} }, true);
    expect(m).not.toContain('kapsamıyor');
  });

  it('KRİTİK: koparılan boost fatura bağı bildiriliyor', () => {
    // Sessiz koparma "gönderiler neden boostlanmıyor" sorusunu üretirdi ve
    // cevabı hiçbir ekranda yok.
    const m = atamaBildirimi({ movedRows: 5, unlinkedBoostPages: 2 }, true);
    expect(m).toContain('2 sayfanın');
    expect(m).toContain('yeniden eşleştir');
  });

  it('KRİTİK: üç ekran da AYNI üreticiyi kullanıyor', () => {
    /*
     * Metin üç yerde ayrı yazılsaydı, birinde güncellenmeyen bir cümle
     * kalırdı — ve o cümle bir müşterinin verisi hakkında yanlış konuşurdu.
     */
    const kok = join(__dirname, '..', 'components');
    for (const dosya of ['tenancy/bagli-kanallar.tsx', 'connections/havuz-kartlari.tsx']) {
      const src = readFileSync(join(kok, dosya), 'utf8');
      expect(src, `${dosya} bildirimi kendi kurmuş`).toContain('atamaBildirimi(');
    }
  });
});
