import { describe, expect, it } from 'vitest';
import { ROLE_PERMISSIONS } from '@advetics/shared';
import { bilgiBankasiYonu, bolumCoz, mmAdresi, varlikCoz, varlikYonu } from './bolumler';

/**
 * ═══ MARKA MERKEZİ BÖLÜM MODELİ — ÇALIŞTIRILARAK ═══
 *
 * İç menü, sayfa, hazırlık bağlantıları ve eski adreslerin yönlendirmesi
 * aynı fonksiyonları okuyor; burada bir hata dördünü birden bozar.
 */
const u = (adres: string) => new URL(adres, 'https://x');

describe('bolumCoz', () => {
  const yonetici = ROLE_PERMISSIONS.admin;
  it('tanınan bölüm seçiliyor, bilinmeyen ilk görünür bölüme düşüyor', () => {
    expect(bolumCoz('kitleler', yonetici)).toBe('kitleler');
    expect(bolumCoz('yok-boyle', yonetici)).toBe('baglantilar');
    expect(bolumCoz(undefined, yonetici)).toBe('baglantilar');
  });

  it('KRİTİK: yetkisi olmayan bölüm açılmıyor — paylaşılan bağlantı boş sayfa vermesin', () => {
    // Bağlantılar connection gerektirmez ama `client.write` ister; yalnız
    // okuyabilen bir izin kümesinde ilk görünür bölüm Marka.
    const okur = ['client.read'] as const;
    expect(bolumCoz('baglantilar', [...okur])).toBe('marka');
    expect(bolumCoz('varliklar', [...okur])).toBe('marka');
    expect(bolumCoz('marka', [])).toBeNull();
  });
});

describe('adresler', () => {
  it('KRİTİK: workspace kimliği taşınıyor', () => {
    expect(u(mmAdresi('ws-1', 'kitleler')).searchParams.get('musteri')).toBe('ws-1');
  });

  it('çapa sona ekleniyor', () => {
    expect(mmAdresi('ws-1', 'marka', {}, 'logo')).toBe('/marka-merkezi?musteri=ws-1&bolum=marka#logo');
  });

  it('varlikCoz bilinmeyende görsellere düşüyor', () => {
    expect(varlikCoz('formlar')).toBe('formlar');
    expect(varlikCoz('x')).toBe('gorseller');
  });
});

describe('eski adresler', () => {
  it('KRİTİK: Bilgi Bankası bütçe sekmesi Aylık Bütçe bölümüne, gerisi Marka’ya', () => {
    // Bütçe 2026-10-06'dan beri Marka Merkezi'nin kendi bölümü.
    expect(bilgiBankasiYonu('ws-1', 'butce')).toBe('/marka-merkezi?musteri=ws-1&bolum=butce');
    const marka = u(bilgiBankasiYonu('ws-1', 'marka'));
    expect(marka.pathname).toBe('/marka-merkezi');
    expect(marka.searchParams.get('bolum')).toBe('marka');
    expect(u(bilgiBankasiYonu('ws-1', 'logo')).hash).toBe('#logo');
    expect(u(bilgiBankasiYonu('ws-1', 'hedef-kitle')).hash).toBe('#bilgi');
    expect(u(bilgiBankasiYonu(undefined, undefined)).searchParams.has('musteri')).toBe(false);
  });

  it('KRİTİK: varlık süzgeçleri yönlendirmede DÜŞMÜYOR', () => {
    const g = u(varlikYonu('ws-1', 'gorseller', { tur: 'logo' }));
    expect(g.searchParams.get('varlik')).toBe('gorseller');
    expect(g.searchParams.get('tur')).toBe('logo');
    expect(u(varlikYonu('ws-1', 'formlar', { form: 'f1' })).searchParams.get('form')).toBe('f1');
  });
});

describe('Aylık Bütçe Base’de', () => {
  it('KRİTİK: bütçe bölümü var ve okuma yetkisiyle açılıyor; eski adres oraya yönleniyor', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    expect(bolumCoz('butce', ROLE_PERMISSIONS.ad_manager)).toBe('butce');
    const eski = readFileSync(resolve(__dirname, '../../app/(dashboard)/butce/page.tsx'), 'utf8');
    expect(eski).toContain("redirect(mmAdresi(ilk(p.musteri), 'butce', { ay: ilk(p.ay) }))");
    expect(eski).not.toContain('serverApiFetch');
    const sayfa = readFileSync(resolve(__dirname, '../../app/(dashboard)/marka-merkezi/page.tsx'), 'utf8');
    expect(sayfa).toContain("{bolum === 'butce' && <ButceIcerik clientId={clientId} params={params} />}");
  });

  it('KRİTİK: ay değiştirmek Marka Merkezi’nden çıkarmıyor', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const k = readFileSync(resolve(__dirname, 'butce.tsx'), 'utf8');
    expect(k).toContain("mmAdresi(clientId, 'butce', { ay: over.ay ?? selected.key })");
    expect(k).not.toContain('`/butce?');
  });

  it('KRİTİK: Genel Bakış bütçe kartı aynı ay üreticisini kullanıyor ve hatayı yutmuyor', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const g = readFileSync(resolve(__dirname, '../../app/(dashboard)/dashboard/page.tsx'), 'utf8').replace(
      /\/\*[\s\S]*?\*\//g,
      '',
    );
    expect(g).toContain('month: ayAnahtari()');
    expect(g).toContain('butceHatasi = hataMetni(e);');
    expect(g).toContain("href={mmAdresi(session.activeClientId, 'butce')}");
  });
});
