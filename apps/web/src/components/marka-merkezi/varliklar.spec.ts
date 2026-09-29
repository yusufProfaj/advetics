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
    expect(mm.ekYollar).toEqual(VARLIK_YOLLARI);
    for (const y of VARLIK_YOLLARI) expect(aktifMi(mm, `${y}`), y).toBe(true);
    expect(aktifMi(mm, '/kutuphane/bilgi-bankasi')).toBe(false);
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

  it('Varlıklar bölümü sayfada, oturum yetkileriyle çiziliyor', () => {
    const k = readFileSync(resolve(__dirname, '../../app/(dashboard)/marka-merkezi/page.tsx'), 'utf8').replace(
      /\/\*[\s\S]*?\*\//g,
      '',
    );
    expect(k).toContain('<VarliklarBolumu clientId={clientId} izinler={session.permissions} />');
  });

  it('kartlar workspace seçimini TAŞIYOR ve bağlantı tek üreticiden', () => {
    const k = readFileSync(resolve(__dirname, 'varliklar-bolumu.tsx'), 'utf8');
    expect(k).toContain('href={baglanti(v.href, { musteri: clientId })}');
    expect(k).toContain('VARLIKLAR.filter((v) => izinler.includes(v.izin))');
  });
});
