import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { AYARLAR_SEKMELERI, ROLE_PERMISSIONS } from '@advetics/shared';
import { ayarSekmesiAcik } from '@/lib/ayar-kapilari';

/*
 * ═══ /ayarlar 404 DEĞİL, AÇILABİLEN İLK SEKME ═══
 * Adres markasız İngilizce 404 veriyordu (canlı denetim).
 */
const SAYFA = join(__dirname, 'page.tsx');
const k = () => readFileSync(SAYFA, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

describe('/ayarlar kökü', () => {
  it('KRİTİK: sayfa var ve hedefi sözleşmeden + kapıdan seçiyor (elle adres yok)', () => {
    expect(existsSync(SAYFA)).toBe(true);
    expect(k()).toContain('AYARLAR_SEKMELERI.find((s) => ayarSekmesiAcik(session, s.kod))');
    expect(k()).toContain('redirect(hedef.yol)');
    expect(k()).not.toMatch(/['"`]\/ayarlar\//);
  });

  it('her rolün açabildiği en az bir sekme var (Hesabım kapısız)', () => {
    for (const [rol, izinler] of Object.entries(ROLE_PERMISSIONS)) {
      expect(AYARLAR_SEKMELERI.some((s) => ayarSekmesiAcik({ permissions: [...izinler] }, s.kod)), rol).toBe(true);
    }
  });

  it('Türkçe markalı bulunamadı sayfası var', () => {
    const nf = readFileSync(join(__dirname, '../../not-found.tsx'), 'utf8');
    expect(nf).toContain('Sayfa bulunamadı');
    expect(nf).toContain('/advetics-logo.png');
  });
});
