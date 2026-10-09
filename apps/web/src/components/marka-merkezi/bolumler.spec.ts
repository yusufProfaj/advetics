import { butceAdresi } from '@/lib/butce-adresi';
import { describe, expect, it } from 'vitest';
import { ROLE_PERMISSIONS } from '@advetics/shared';
import { MM_BOLUMLERI, bilgiBankasiYonu, bolumCoz, mmAdresi, varlikCoz, varlikYonu } from './bolumler';

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
    // Bütçe 2026-10-09'dan beri Planla'da kendi sayfası (önce Base'teydi).
    expect(bilgiBankasiYonu('ws-1', 'butce')).toBe('/butce?musteri=ws-1');
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

describe('Aylık Bütçe Planla’da (2026-10-09)', () => {
  const oku = async (yol: string) => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    return readFileSync(resolve(__dirname, yol), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  };

  it('KRİTİK: Marka Merkezi bölümü DEĞİL — aynı ayarın iki kapısı olmasın', () => {
    expect(MM_BOLUMLERI.map((b) => b.kod)).not.toContain('butce');
    // Bilinmeyen bölüm gibi ilk görünür bölüme düşüyor; ama sayfa ondan
    // ÖNCE yönlendiriyor (aşağıda).
    expect(bolumCoz('butce', ROLE_PERMISSIONS.ad_manager)).toBe('baglantilar');
  });

  it('KRİTİK: eski ?bolum=butce adresi /butce’ye yönleniyor, ay taşınıyor; /butce gerçek sayfa', async () => {
    const mm = await oku('../../app/(dashboard)/marka-merkezi/page.tsx');
    expect(mm).toContain("if (first(params.bolum) === 'butce') redirect(butceAdresi(first(params.musteri), { ay: first(params.ay) }));");
    // Yönlendirme workspace kapısından ÖNCE: kapı "workspace seç" derse
    // eski bağlantı bütçeye hiç ulaşmaz.
    expect(mm.indexOf("=== 'butce') redirect(")).toBeLessThan(mm.indexOf('sayfaWorkspaceId(session'));
    expect(mm).not.toContain('ButceIcerik');
    const sayfa = await oku('../../app/(dashboard)/butce/page.tsx');
    expect(sayfa).toContain('<ButceIcerik clientId={clientId} params={params} />');
    expect(sayfa).not.toContain('redirect(');
    expect(u(butceAdresi('ws-1', { ay: '2026-11' })).searchParams.get('ay')).toBe('2026-11');
  });

  it('KRİTİK: ay değiştirmek bütçe sayfasından çıkarmıyor; hata sunucunun cümlesiyle', async () => {
    const k = await oku('../butce/butce-icerik.tsx');
    expect(k).toContain('butceAdresi(clientId, { ay: over.ay ?? selected.key })');
    expect(k).not.toContain('mmAdresi');
    expect(k).not.toMatch(/\.catch\(\(\)\s*=>\s*null\)/);
    expect(k).not.toContain('pm2 logs');
  });

  it('KRİTİK: Genel Bakış ve kurulum listesi bütçeye aynı üreticiyle gidiyor', async () => {
    const g = await oku('../../app/(dashboard)/dashboard/page.tsx');
    expect(g).toContain('month: ayAnahtari()');
    expect(g).toContain('butceHatasi = hataMetni(e);');
    expect(g).toContain('href={butceAdresi(session.activeClientId)}');
    const h = await oku('hazirlik-listesi.tsx');
    expect(h).toContain("href: butceAdresi(id)");
    expect(h).not.toContain("'butce'");
  });
});
