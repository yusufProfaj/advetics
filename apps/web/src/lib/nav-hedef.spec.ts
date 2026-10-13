import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ROLE_PERMISSIONS, type Permission } from '@advetics/shared';
import {
  AYARLAR_SATIRLARI_YENI,
  BASE_SATIRLARI_YENI,
  GECIS,
  HESABIM_SATIRI,
  SECTIONS_HEDEF,
  ayarSekmeleri,
  hedefGorunurBolumler,
} from './nav-sections';

/**
 * ═══ HEDEF MENÜ — Ayarlar ve Marka Merkezi sadeleştirme (2026-10-13) ═══
 *
 * Sayfalar yazılmadan önce yeni menünün KARARLARINI kilitliyor. Geçiş
 * anahtarları çevrildikçe `nav-sections.spec.ts`in sayfa/başlık taraması
 * yeni satırları da otomatik kapsıyor; o dosyadaki ESKİ yapıya özgü
 * testler (Base'in tek kapısı, `/ayarlar/ust-hesap`, Okuma API satırı…)
 * çeviren ajan tarafından silinir (MIMARI § Testler).
 */

const izinler = (rol: keyof typeof ROLE_PERMISSIONS): Permission[] => [...ROLE_PERMISSIONS[rol]];
const etiketler = (rol: keyof typeof ROLE_PERMISSIONS, baglam = { ustHesapGorunur: true, platformSahibi: false }) =>
  hedefGorunurBolumler(izinler(rol), baglam).flatMap((s) => s.items.map((i) => i.label));

describe('HEDEF MENÜ', () => {
  it('KRİTİK: Base iki satır — Marka Merkezi ve Varlıklar (Karar B)', () => {
    const base = SECTIONS_HEDEF.find((s) => s.title === 'Base');
    expect(base?.items.map((i) => [i.href, i.label])).toEqual([
      ['/marka-merkezi', 'Marka Merkezi'],
      ['/varliklar', 'Varlıklar'],
    ]);
    expect(BASE_SATIRLARI_YENI.every((i) => i.perm)).toBe(true);
  });

  it('KRİTİK: Ayarlar menüde ÜÇ sekme; Hesabım menüde değil, sekme çubuğunda', () => {
    expect(AYARLAR_SATIRLARI_YENI.map((i) => [i.href, i.label, i.perm])).toEqual([
      ['/ayarlar/sirketler', 'Şirketler ve workspace’ler', 'client.write'],
      ['/ayarlar/baglantilar', 'Platform bağlantıları', 'connection.read'],
      ['/ayarlar/ekip', 'Ekip ve güvenlik', 'user.read'],
    ]);
    expect(HESABIM_SATIRI.perm).toBeUndefined();
    expect(SECTIONS_HEDEF.flatMap((s) => s.items).some((i) => i.href === HESABIM_SATIRI.href)).toBe(false);
  });

  it('bölüm sırası değişmedi', () => {
    expect(SECTIONS_HEDEF.map((s) => s.title)).toEqual([
      undefined,
      'Planla',
      'Oluştur',
      'Yönet',
      'İyileştir',
      'Raporlar',
      'Base',
      'Ayarlar',
    ]);
  });

  it('KRİTİK: müşteri hesabı hâlâ TAM dört ekran ve Ayarlar’ı görmüyor', () => {
    expect(etiketler('client_viewer')).toEqual(['Genel Bakış', 'AdvStrategy', 'Reklam Yöneticisi', 'Raporlar']);
    expect(hedefGorunurBolumler(izinler('client_viewer'), { ustHesapGorunur: false, platformSahibi: false }).map((s) => s.title)).not.toContain('Ayarlar');
  });

  it('KRİTİK: Reklam Yöneticisi Şirketler sekmesini GÖRÜYOR (workspace açıyor), kişi yönetimini değil', () => {
    const g = etiketler('ad_manager');
    expect(g).toEqual(expect.arrayContaining(['Şirketler ve workspace’ler', 'Platform bağlantıları', 'Ekip ve güvenlik', 'Marka Merkezi', 'Varlıklar']));
  });

  it('eski ayrı satırlar hedefte YOK — içlerine taşındılar', () => {
    const hepsi = SECTIONS_HEDEF.flatMap((s) => s.items).map((i) => i.href);
    for (const eski of ['/ayarlar/ust-hesap', '/ayarlar/ust-hesaplar', '/ayarlar/senkronizasyon', '/ayarlar/e-posta', '/ayarlar/okuma-api']) {
      expect(hepsi).not.toContain(eski);
    }
  });

  it('platform sahibi bayrağı hedef menüde hiçbir satırı saklamıyor (Okuma API Hesabım’ın içinde)', () => {
    expect(etiketler('admin', { ustHesapGorunur: true, platformSahibi: true })).toEqual(
      etiketler('admin', { ustHesapGorunur: true, platformSahibi: false }),
    );
  });
});

describe('GEÇİŞ ANAHTARLARI', () => {
  it('sekme çubuğu: geçiş yapılınca Hesabım sona ekleniyor, yapılmadan eklenmiyor', () => {
    const sekmeler = ayarSekmeleri([]);
    expect(sekmeler.map((s) => s.href)).toEqual(GECIS.ayarlar ? [HESABIM_SATIRI.href] : []);
  });

  it('anahtarlar kaynakta tek satır ve sahibi yazılı — ajanlar yalnız kendi satırını çevirir', () => {
    const kod = readFileSync(join(__dirname, 'nav-sections.ts'), 'utf8');
    expect(kod).toMatch(/^const BASE_SATIRLARI: NavEntry\[\] = BASE_SATIRLARI_(ESKI|YENI); \/\/ Ajan 3/m);
    expect(kod).toMatch(/^const AYARLAR_SATIRLARI: NavEntry\[\] = AYARLAR_SATIRLARI_(ESKI|YENI); \/\/ Ajan 2/m);
  });
});
