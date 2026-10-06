import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ROLE_PERMISSIONS, ROLES } from '@advetics/shared';
import { SECTIONS } from '@/lib/nav-sections';
import { aktifMi } from '@/components/nav';
import { VARLIKLAR, VARLIK_YOLLARI } from './varliklar';

/**
 * ═══ VARLIKLAR MENÜDEN MARKA MERKEZİ'NE İNDİ (Bölüm 3) ═══
 */
const tumSatirlar = SECTIONS.flatMap((s) => s.items);

describe('menü', () => {
  it('Görsel Arşivi, Kreatifler ve Formlar menüde AYRI satır değil', () => {
    const hrefler = tumSatirlar.map((i) => i.href);
    for (const y of VARLIK_YOLLARI) expect(hrefler, y).not.toContain(y);
  });

  it('KRİTİK: o ekranlardayken Marka Merkezi satırı seçili görünüyor', () => {
    const mm = tumSatirlar.find((i) => i.href === '/marka-merkezi');
    if (!mm) throw new Error('Marka Merkezi satırı bulunamadı — tarama boşa düştü.');
    // Eski Bilgi Bankası adresi de (yönlendirme anında) Marka Merkezi'ni
    // seçili gösteriyor: içeriği oraya taşındı (2026-10-06).
    // Aylık Bütçe de 2026-10-06'da Marka Merkezi'ne taşındı.
    const eski = [...VARLIK_YOLLARI, '/kutuphane/bilgi-bankasi', '/butce'];
    expect(mm.ekYollar).toEqual(eski);
    for (const y of eski) {
      expect(aktifMi(mm, `${y}`), y).toBe(true);
    }
  });

  it('KRİTİK: varlık ekranını görebilen her rol Marka Merkezi’ni de görüyor — kimse ekranı kaybetmiyor', () => {
    const mm = tumSatirlar.find((i) => i.href === '/marka-merkezi')!;
    for (const rol of ROLES) {
      const izinler = ROLE_PERMISSIONS[rol];
      for (const v of VARLIKLAR) {
        if (izinler.includes(v.izin)) expect(izinler, `${rol} → ${v.ad}`).toContain(mm.perm);
      }
    }
  });
});

describe('Marka Merkezi sayfası', () => {
  it('her varlığın sayfası gerçekten var', () => {
    for (const y of VARLIK_YOLLARI) {
      expect(existsSync(resolve(__dirname, `../../app/(dashboard)${y}/page.tsx`)), y).toBe(true);
    }
  });

  /*
   * 2026-10-06'DAN BERİ VARLIKLAR SAYFANIN İÇİNDE. Eski sayfalar yönlendirme;
   * gövdeleri `varliklar/*.tsx` bileşenleri ve Marka Merkezi onları
   * `?bolum=varliklar&varlik=` ile çiziyor. Kartlar (dışarı atan
   * bağlantılar) kalktı.
   */
  const SAYFA = readFileSync(resolve(__dirname, '../../app/(dashboard)/marka-merkezi/page.tsx'), 'utf8').replace(
    /\/\*[\s\S]*?\*\//g,
    '',
  );

  it('KRİTİK: üç varlık da sayfanın içinde çiziliyor', () => {
    expect(SAYFA).toContain("{varlik === 'gorseller' && <GorsellerIcerik clientId={clientId} params={params} />}");
    expect(SAYFA).toContain("{varlik === 'kreatifler' && <KreatiflerIcerik clientId={clientId} params={params} />}");
    expect(SAYFA).toContain("{varlik === 'formlar' && <FormlarIcerik clientId={clientId} params={params} />}");
  });

  it('KRİTİK: eski varlık sayfaları içerik çizmiyor, yönleniyor', () => {
    for (const ad of ['gorseller', 'kreatifler', 'formlar']) {
      const k = readFileSync(resolve(__dirname, `../../app/(dashboard)/kutuphane/${ad}/page.tsx`), 'utf8');
      expect(k, ad).toContain(`redirect(varlikYonu(ilk(p.musteri), '${ad}'`);
      expect(k, ad).not.toContain('serverApiFetch');
    }
  });
});
