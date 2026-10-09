import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CHANNEL_KINDS, HAZIRLIK_KODLARI, type ChannelGroup, type ChannelItem } from '@advetics/shared';
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
  it('KRİTİK: marka maddesi Marka bölümünün marka bilgileri kartına açılıyor', () => {
    // Eskiden Bilgi Bankası'nın serbest metin sekmesine açılıyordu (canlı tur,
    // 2026-10-05); 2026-10-06'dan beri sayfadan çıkarmıyor.
    const u = new URL(HAZIRLIK_MADDE_TANIMI.marka_bilgisi.eylem('ws-1').href, 'https://x');
    expect(u.pathname).toBe('/marka-merkezi');
    expect(u.searchParams.get('bolum')).toBe('marka');
    expect(u.hash).toBe('#marka-bilgileri');
    expect(SAYFA).toContain('<Kart id="marka-bilgileri">');
  });

  it('KRİTİK: hazırlık bağlantıları Marka Merkezi’nden ÇIKARMIYOR (bütçe ve veri durumu hariç)', () => {
    for (const kod of ['reklam_hesabi', 'marka_bilgisi', 'logo', 'sosyal_kanal'] as const) {
      expect(HAZIRLIK_MADDE_TANIMI[kod].eylem('ws-1').href, kod).toMatch(/^\/marka-merkezi\?/);
    }
    expect(SAYFA).toContain('<Kart id="logo">');
  });

  it('dar ekranda eylem metni sıkıştırmıyor: metnin alt genişlik sınırı var', () => {
    expect(LISTE).toContain('<div className="min-w-[14rem] flex-1">');
  });

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
    for (const kod of ['reklam_hesabi', 'marka_bilgisi', 'logo', 'aylik_butce', 'sosyal_kanal'] as const) {
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
    expect(SAYFA).toContain("yaz('connection.write')");
    expect(SAYFA).toContain('<SaltOkunurKanallar');
  });

  it('bağlantılar bölümü hazırlık listesinin bağlantısıyla aynı bölüm', () => {
    expect(SAYFA).toContain("{bolum === 'baglantilar' && (");
    expect(new URL(HAZIRLIK_MADDE_TANIMI.reklam_hesabi.eylem('x').href, 'https://x').searchParams.get('bolum')).toBe('baglantilar');
  });
});

describe('menü', () => {
  it('KRİTİK: müşteri hesabı Marka Merkezi satırını görmüyor', () => {
    // Kullanıcının kararı: müşterinin menüsü üç ekran.
    const musteri = visibleSections(ROLE_PERMISSIONS.client_viewer, { ustHesapGorunur: false, platformSahibi: false })
      .flatMap((b) => b.items.map((i) => i.label));
    expect(musteri).not.toContain('Marka Merkezi');
    const yonetici = visibleSections(ROLE_PERMISSIONS.admin, { ustHesapGorunur: false, platformSahibi: false })
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

describe('Aylık Bütçe mecraya göre gruplu (2026-10-06)', () => {
  /*
   * Kullanıcı: "hangi mecraya bütçe sınırı koyduğumu göremiyorum". Hesap
   * adları çoğu zaman workspace adıyla aynı ve mecrayı söylemiyor.
   */
  // 2026-10-09'dan beri Planla › Aylık Bütçe sayfasının bileşeni.
  const BUTCE = yorumsuz('components/butce/butce-icerik.tsx');
  const i = BUTCE.indexOf('function AccountRows(');
  if (i < 0) throw new Error('AccountRows bulunamadı — tarama boşa düştü.');
  const govde = BUTCE.slice(i);

  it('KRİTİK: her mecra kendi gövdesinde ve başlığında kaç hesapta sınır olduğu yazıyor', () => {
    expect(govde).toContain('PLATFORMS.filter((p) => rows.some((a) => a.platform === p))');
    expect(govde).toContain('<section key={platform}');
    expect(govde).toContain('PLATFORM_KISA_ADLARI[platform]');
    expect(govde).toContain("'hiçbirinde bütçe sınırı yok'");
  });

  it('KRİTİK: satır kolona sığıyor — "Bütçe tanımla" düğmesi yatay kaydırmanın dışında kalmıyor', () => {
    // 860 piksellik tablo iç menünün yanındaki kolona sığmıyordu ve düğme
    // ekranın dışındaydı (canlı tur, 2026-10-06).
    expect(govde).not.toMatch(/min-w-\[\d{3,}px\]/);
    expect(govde).not.toContain('overflow-x-auto');
    const satir = govde.slice(govde.indexOf('function HesapSatiri('));
    expect(satir).toContain('<BudgetForm');
  });

  it('sınırı olmayan hesap boş tire değil, "Sınır yok" diyor', () => {
    expect(govde).toContain('Sınır yok');
  });
});

describe('Bağlantılar düzeni (2026-10-06)', () => {
  it('reklam hesapları ve sosyal kanallar AYRI kartta, sınıflandırma ortak fonksiyondan', () => {
    expect(KANAL).toContain('data.groups.filter((g) => kanalReklamHesabiMi(g.kind))');
    expect(KANAL).toContain('data.groups.filter((g) => !kanalReklamHesabiMi(g.kind))');
  });

  it('KRİTİK: izleme kapalı hesap özet satırında da sayılıyor', () => {
    expect(KANAL).toContain('tum.filter((i) => !i.syncEnabled).length');
    expect(KANAL).toContain('hesapta izleme kapalı');
  });
});

describe('Workspace ayarları Marka Merkezi’nde (2026-10-06)', () => {
  /*
   * Kullanıcı: "workspace'e geçiş yaptığımda doldurulması gereken her yeri
   * Marka Merkezi kısmından halletmek istiyorum". Bu bilgiler yalnızca
   * Şirketler ekranındaki pencerede vardı.
   */
  const AYAR = yorumsuz('components/marka-merkezi/workspace-ayarlari.tsx');

  it('KRİTİK: sayfa bölümü çiziyor', () => {
    expect(SAYFA).toContain("{bolum === 'ayarlar' && <WorkspaceAyarlari clientId={clientId} session={session} />}");
  });

  it('KRİTİK: menüdeki her alt başlık sayfadaki bir karta gidiyor', async () => {
    const { AYAR_ALT_BASLIKLARI } = await import('./ic-menu');
    expect(AYAR_ALT_BASLIKLARI.length).toBe(3);
    for (const a of AYAR_ALT_BASLIKLARI) expect(AYAR, a.capa).toMatch(new RegExp(`<(Kart|section) id="${a.capa}"`));
  });

  it('rapor alıcıları ve özel kategori aynı ekranda düzenlenebiliyor', () => {
    expect(AYAR).toContain('<FirmaBilgileri');
    expect(AYAR).toContain('<SpecialCategoryPicker');
    expect(AYAR).toContain('<TeamManager');
  });
});

describe('sosyal profilin boost hesabı Bağlantılar’da', () => {
  const hesap = (id: string): ChannelItem => ({ id, name: id, externalId: id, syncEnabled: true, isManager: false });
  const gruplar = (): ChannelGroup[] =>
    CHANNEL_KINDS.map((kind) => ({
      kind,
      connected: kind === 'meta_ads' ? [hesap('m1')] : kind === 'google_ads' ? [hesap('g1')] : [],
      available: [],
    }));

  it('KRİTİK: Instagram/Facebook Meta hesabıyla, YouTube Google hesabıyla, reklam hesabı hiç', async () => {
    const { boostSecenekleri } = await import('../tenancy/bagli-kanallar');
    const b = boostSecenekleri(gruplar());
    expect(b.instagram?.map((a) => a.id)).toEqual(['m1']);
    expect(b.facebook?.map((a) => a.id)).toEqual(['m1']);
    expect(b.youtube?.map((a) => a.id)).toEqual(['g1']);
    expect(b.meta_ads).toBeNull();
    expect(b.google_ads).toBeNull();
    expect(b.linkedin_ads).toBeNull();
  });

  it('ayarlar satırı bağlı sosyal profilde çiziliyor', () => {
    const i = KANAL.indexOf('function BagliKart(');
    const govde = KANAL.slice(i, KANAL.indexOf('function SecilebilirSatir(', i));
    expect(govde).toContain('<ProfilAyarlari item={item} kind={kind} secenekler={boostSecenekleri} />');
  });
});
