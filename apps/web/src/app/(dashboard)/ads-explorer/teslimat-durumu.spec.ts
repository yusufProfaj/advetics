import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { reklamYoneticisiSozlugu } from '@/dil/sozlukler/reklam-yoneticisi';

/*
 * ═══ DURUM SÜTUNU TESLİMATI GÖSTERİYOR (docs/pazar/reklam-yoneticisi.md) ═══
 * Kampanyası duraklatılmış set "Yayında" görünüp harcamıyordu. Satır durumu
 * ve "Yayında" süzgeci sunucunun teslimat kararından okunmalı; kendi
 * `status`ü yalnız durdur/başlat düğmesinin işi.
 */
const KAYNAK = readFileSync(join(__dirname, 'page.tsx'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('varlık satırının durumu', () => {
  it('KRİTİK: teslimat kararından, kendi status’ünden değil', () => {
    const i = KAYNAK.indexOf('function varlikSatiri(');
    expect(i).toBeGreaterThan(0);
    const govde = KAYNAK.slice(i, KAYNAK.indexOf('\nfunction ', i + 10));
    expect(govde).toContain("tur: b.teslimat.yayinda ? 'yayinda' : 'durdu'");
    expect(govde).toContain("ad: b.teslimat.kod === 'hesap_odeme' ? m.hesaptaOdemeSorunu : b.teslimat.ad");
    expect(govde).not.toContain("b.status === 'active' ? 'yayinda'");
  });

  it('KRİTİK: hesap satırında ödeme sorunu "İzleniyor"dan önce', () => {
    /*
     * Google'da kartı reddedilen hesap ENABLED kalıyor; izlenen hesapta
     * "İzleniyor" yazmak durmuş reklamları sağlıklı gösterirdi.
     */
    const i = KAYNAK.indexOf('function hesapSatiri(');
    const govde = KAYNAK.slice(i, KAYNAK.indexOf('\nfunction ', i + 10));
    const odeme = govde.indexOf("a.odemeSorunu\n      ? { tur: 'durdu', ad: m.odemeSorunu }");
    expect(odeme).toBeGreaterThan(-1);
    expect(odeme).toBeLessThan(govde.indexOf('m.izleniyor'));
  });

  it('ödeme metinleri iki dilde', () => {
    expect(reklamYoneticisiSozlugu.tr.satir.hesaptaOdemeSorunu).toBe('Durdu: hesapta ödeme sorunu');
    expect(reklamYoneticisiSozlugu.en.satir.hesaptaOdemeSorunu).toBe('Stopped: account payment issue');
  });
});
