import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ACILMADI_ONEKI,
  NIYET_KATALOGU,
  NIYET_KODLARI,
  acemiNiyetleri,
  adlabels,
  kampanyaAdi,
  kisaKimlik,
  reklamAdi,
  reklamSetiAdi,
  sonucEtiketi,
} from '@advetics/shared';

/**
 * Yeni Reklam Oluştur — niyet kataloğu ve adlandırma (TASARIM.md § 06.2-06.3).
 * Derleyici yazılmadan ÖNCE kataloğun kendisi kilitleniyor: her şey bu
 * tablodan türeyecek ve buradaki tek yanlış değer bütün kampanyalara yayılır.
 */
describe('niyet kataloğu', () => {
  it('her kod kendi satırını taşıyor (anahtar ↔ kod ayrışmıyor)', () => {
    for (const k of NIYET_KODLARI) expect(NIYET_KATALOGU[k].kod).toBe(k);
  });

  it('Acemi canlı tur bitmeden YALNIZ yönlendirme kartını görür', () => {
    // Belgeden yazılmış satırı Acemi'ye göstermek, canlıda doğrulanmamış bir
    // yazma yolunu açmak demek. Satırlar canlıya geçtikçe bu test güncellenir.
    expect(acemiNiyetleri().map((n) => n.kod)).toEqual(['ONE_CIKAR']);
  });

  it('canlı kanıtlı ilk tur satırı Acemi listesine girer, ikinci tur girmez', () => {
    const form = NIYET_KATALOGU.FORM;
    const ig = NIYET_KATALOGU.IG_MESAJ;
    const eskiF = form.kanit;
    const eskiI = ig.kanit;
    form.kanit = 'canli';
    ig.kanit = 'canli';
    try {
      expect(acemiNiyetleri().map((n) => n.kod)).toEqual(['FORM', 'ONE_CIKAR']);
    } finally {
      form.kanit = eskiF;
      ig.kanit = eskiI;
    }
  });

  it('ONE_CIKAR Meta alanı TAŞIMAZ — yeni modül boost yoluna yazmaz (karar 5)', () => {
    expect(NIYET_KATALOGU.ONE_CIKAR.meta).toBeNull();
  });

  it('FORM: CTA SIGN_UP, hedef ON_AD, promoted_object yalnız page_id', () => {
    expect(NIYET_KATALOGU.FORM.meta).toMatchObject({
      objective: 'OUTCOME_LEADS',
      optimizationGoal: 'LEAD_GENERATION',
      destinationType: 'ON_AD',
      promotedObject: 'page_id',
      cta: 'SIGN_UP',
    });
  });

  it("WHATSAPP: app_destination WHATSAPP, numara alanı YOK (Meta sayfadan alıyor)", () => {
    const m = NIYET_KATALOGU.WHATSAPP.meta!;
    expect(m.appDestination).toBe('WHATSAPP');
    expect(m.destinationType).toBe('WHATSAPP');
    expect(JSON.stringify(m)).not.toMatch(/wa\.me|telefon|numara/i);
  });

  it('SITE: destination_type AÇIKÇA WEBSITE (boşsa Meta tahmin ediyor)', () => {
    expect(NIYET_KATALOGU.SITE.meta!.destinationType).toBe('WEBSITE');
  });
});

describe('sonuç etiketi', () => {
  it('WhatsApp sonucu "sohbet başlatan kişi" — amaç LEADS olsa bile', () => {
    const m = NIYET_KATALOGU.WHATSAPP.meta!;
    expect(m.objective).toBe('OUTCOME_LEADS');
    expect(sonucEtiketi(m.optimizationGoal)).toBe('sohbet başlatan kişi');
  });

  it('"potansiyel müşteri" sözlükte HİÇ geçmiyor', () => {
    const kaynak = readFileSync(
      resolve(__dirname, '../../../../../packages/shared/src/derleyici/meta/niyetler.ts'),
      'utf8',
    ).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    expect(kaynak.length).toBeGreaterThan(1000); // dilim gerçekten okundu
    expect(kaynak).not.toMatch(/potansiyel müşteri/i);
  });

  it('dönüşümde etiket olaydan gelir, bilinmeyen olay kod olarak basılmaz', () => {
    expect(sonucEtiketi('OFFSITE_CONVERSIONS', 'PURCHASE')).toBe('satın alma');
    expect(sonucEtiketi('OFFSITE_CONVERSIONS', 'GARIP_OLAY')).toBe('dönüşüm');
  });
});

describe('adlandırma', () => {
  const g = {
    workspaceKisaAdi: 'Örnek Yapı ',
    niyet: 'FORM' as const,
    tarih: '2026-10-07',
    yayinKimligi: '7q2kab12-0000-4000-8000-000000000000',
  };

  it('kampanya adı tasarımdaki biçimde', () => {
    expect(kampanyaAdi(g)).toBe('Örnek Yapı · Form doldursunlar · 2026-10-07 · 7Q2K');
  });

  it('reklam seti ve reklam kampanya adından türer', () => {
    expect(reklamSetiAdi(g)).toBe(`${kampanyaAdi(g)} · Kitle`);
    expect(reklamAdi(g, 2)).toBe(`${kampanyaAdi(g)} · Fikir 2`);
    expect(() => reklamAdi(g, 0)).toThrow();
  });

  it('Date nesnesi ya da saatli tarih reddedilir (saat dilimi kayması)', () => {
    expect(() => kampanyaAdi({ ...g, tarih: '2026-10-07T00:00:00Z' })).toThrow();
  });

  it('kısa kimlik tireleri atıyor, kısa kimliği reddediyor', () => {
    expect(kisaKimlik('ab-cd-ef')).toBe('ABCD');
    expect(() => kisaKimlik('a-b')).toThrow();
  });

  it('adlabels iki etiket taşır: advetics + yayın kimliği', () => {
    expect(adlabels('x1')).toEqual([{ name: 'advetics' }, { name: 'adv-yayin-x1' }]);
  });

  it('açılmadı öneki sonda boşlukla', () => {
    expect(ACILMADI_ONEKI).toBe('[Advetics: açılmadı] ');
  });
});
