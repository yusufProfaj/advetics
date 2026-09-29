import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { HAZIRLIK_KODLARI } from '@advetics/shared';
import { HAZIRLIK_MADDE_TANIMI } from './hazirlik-listesi';
import { havuzdaAra } from '../tenancy/bagli-kanallar';
import { visibleSections } from '@/lib/nav-sections';
import { ROLE_PERMISSIONS } from '@advetics/shared';

/**
 * ═══ MARKA MERKEZİ — BÖLÜM 1 ═══
 *
 * Hazırlık listesi, bağlantılar ve menü satırı. Kaynak taramaları yorumsuz
 * kaynakta yapılıyor: kuralı anlatan yorum aynı dosyada duruyor ve
 * `toContain` ikisini ayırt etmiyor (CLAUDE.md).
 */
const SRC = join(__dirname, '..', '..');
const yorumsuz = (yol: string): string =>
  readFileSync(join(SRC, yol), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\{\s*\}/g, '')
    .split('\n')
    .filter((l) => !l.trim().startsWith('//'))
    .join('\n');

const LISTE = yorumsuz('components/marka-merkezi/hazirlik-listesi.tsx');
const SAYFA = yorumsuz('app/(dashboard)/marka-merkezi/page.tsx');
const KANAL = yorumsuz('components/tenancy/bagli-kanallar.tsx');

describe('hazırlık listesi', () => {
  it('KRİTİK: sunucunun her maddesinin panelde başlığı ve bağlantısı var', () => {
    for (const kod of HAZIRLIK_KODLARI) {
      const t = HAZIRLIK_MADDE_TANIMI[kod];
      expect(t, kod).toBeDefined();
      expect(t.baslik.length, kod).toBeGreaterThan(3);
      expect(t.eylem('ws-1').href, kod).toMatch(/^(\/|#)/);
    }
  });

  it('workspace sayfalarına giden bağlantılar workspace kimliğini taşıyor', () => {
    // URL'deki workspace üst bardakinden farklı olabilir; taşınmazsa
    // bağlantı BAŞKA bir workspace'in bilgi bankasını açar.
    for (const kod of ['marka_bilgisi', 'logo', 'aylik_butce'] as const) {
      expect(HAZIRLIK_MADDE_TANIMI[kod].eylem('ws-1').href, kod).toContain('musteri=ws-1');
    }
  });

  it('KRİTİK: eylem yalnızca EKSİK maddede, tamam olanda değil', () => {
    expect(LISTE).toContain("{m.durum === 'eksik' && (");
  });

  it('durum yalnızca renkten okunmuyor', () => {
    expect(LISTE).toContain('<span className="sr-only">{d.okunus}: </span>');
    expect(LISTE).toContain('role="progressbar"');
    expect(LISTE).toContain('aria-valuenow={tamam}');
  });
});

describe('sayfa', () => {
  it('KRİTİK: iki çağrı ayrı hata taşıyor, biri düşünce öteki çizilmeye devam ediyor', () => {
    expect(SAYFA).toContain('Promise.all([');
    expect(SAYFA).toContain('Kurulum durumu alınamadı.');
    expect(SAYFA).toContain('Bağlantılar alınamadı.');
    expect(SAYFA).not.toContain('.catch(() => null)');
  });

  it('atama yetkisi olmayana düğmeler değil salt okunur liste', () => {
    expect(SAYFA).toContain("hasPermission(session, 'connection.write')");
    expect(SAYFA).toContain('<SaltOkunurKanallar');
  });

  it('bağlantılar bölümü hazırlık listesinin bağlantısıyla aynı çapa', () => {
    expect(SAYFA).toContain('id="baglantilar"');
    expect(HAZIRLIK_MADDE_TANIMI.reklam_hesabi.eylem('x').href).toBe('#baglantilar');
  });
});

describe('menü', () => {
  it('KRİTİK: müşteri hesabı Marka Merkezi satırını görmüyor', () => {
    // Kullanıcının kararı: müşterinin menüsü üç ekran.
    const musteri = visibleSections(ROLE_PERMISSIONS.client_viewer, { ustHesapGorunur: false })
      .flatMap((b) => b.items.map((i) => i.label));
    expect(musteri).not.toContain('Marka Merkezi');
    const yonetici = visibleSections(ROLE_PERMISSIONS.admin, { ustHesapGorunur: false })
      .flatMap((b) => b.items.map((i) => i.label));
    expect(yonetici).toContain('Marka Merkezi');
  });
});

describe('bağlantılar', () => {
  const HESAPLAR = [
    { id: '1', name: 'Öztürk Kuyumcu', externalId: 'act_111', syncEnabled: true, isManager: false },
    { id: '2', name: 'Biltaş', externalId: 'act_222', syncEnabled: true, isManager: false },
  ];

  it('havuzda ad ve hesap numarasıyla aranıyor, Türkçe harfler doğru', () => {
    expect(havuzdaAra(HESAPLAR, 'ÖZTÜRK').map((h) => h.id)).toEqual(['1']);
    expect(havuzdaAra(HESAPLAR, '222').map((h) => h.id)).toEqual(['2']);
    expect(havuzdaAra(HESAPLAR, '  ')).toHaveLength(2);
  });

  it('KRİTİK: kaldırma iki adımlı, tek tıkla çalışmıyor', () => {
    const i = KANAL.indexOf('function BagliKart(');
    expect(i).toBeGreaterThan(-1);
    const govde = KANAL.slice(i, KANAL.indexOf('function SecilebilirSatir(', i));
    const onayBlogu = govde.indexOf('{onay && (');
    const kaldir = govde.indexOf('void ata(null)');
    expect(onayBlogu).toBeGreaterThan(-1);
    // Kaldırma çağrısı onay bloğunun İÇİNDE ve ondan sonra geliyor.
    expect(kaldir).toBeGreaterThan(onayBlogu);
    expect(govde.match(/void ata\(null\)/g)).toHaveLength(1);
  });

  it('bekleyen düğmenin adı kaybolmuyor', () => {
    expect(KANAL).not.toContain("busy ? '…'");
    expect(KANAL).toContain('bekliyor={busy}');
  });
});

describe('ajansın atadığı kalemi kaldırma', () => {
  it('KRİTİK: ajans dışından kaldıran kişiye e-posta gideceği ÖNCEDEN söyleniyor', async () => {
    const { kaldirmaOnayMetni } = await import('../tenancy/bagli-kanallar');
    expect(kaldirmaOnayMetni(true, false)).toContain('ajansına e-posta gider');
    // Ajans üyesi kendi atamasını kaldırıyorsa bu cümle yanlış olurdu.
    expect(kaldirmaOnayMetni(true, true)).not.toContain('e-posta');
    expect(kaldirmaOnayMetni(false, false)).not.toContain('e-posta');
  });

  it('onay kutusu bu metni kullanıyor ve iki sayfa da üyeliği geçiriyor', () => {
    const govde = KANAL.slice(KANAL.indexOf('function BagliKart('), KANAL.indexOf('function SecilebilirSatir('));
    expect(govde).toContain('kaldirmaOnayMetni(item.ajansAtadi === true, ajansUyesi)');
    expect(SAYFA).toContain('ajansUyesi={session.managerAccount !== null}');
    const ESKI = yorumsuz('app/(dashboard)/ayarlar/musteriler/[id]/kanallar/page.tsx');
    expect(ESKI).toContain('ajansUyesi={session.managerAccount !== null}');
  });
});
