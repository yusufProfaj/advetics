import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { HAZIRLIK_KODLARI, type TenantContext } from '@advetics/shared';

/** Sihirbazın altı maddesi (MIMARI § 2b) — artık `HAZIRLIK_KODLARI`nın parçası. */
const SIHIRBAZ_MADDELERI = ['site_adresi', 'iletisim', 'rapor_alicisi', 'adres', 'bildirim', 'erisim'] as const;
import { createHarness, seedTenant, IDS, type Harness } from '../../../test/pglite-harness';
import type { PrismaService } from '../../prisma/prisma.service';
import { ILK_CEKIM_BEKLEME_SINIRI_MS, hazirlikMaddeleri, type HazirlikGirdisi, type HazirlikHesabi } from './hazirlik';
import { HazirlikService } from './hazirlik.service';

/**
 * ═══ MARKA MERKEZİ HAZIRLIK LİSTESİ ═══
 *
 * İki katman: saf karar (`hazirlikMaddeleri`) ve gerçek şemaya karşı veri
 * toplama (`HazirlikService`, PGlite). İkincisi ham SQL'in gerçek kolon
 * adlarıyla çalıştığını kanıtlıyor; `$queryRaw<T>` tipi yalan söyleyebilir
 * (CLAUDE.md) ve yanlış yazılmış bir kolon adı `undefined` üretip her
 * maddeyi sessizce "eksik" gösterirdi.
 */

const SAGLAM: HazirlikHesabi = {
  name: 'Mirnas Meta',
  platform: 'meta',
  status: 'active',
  syncEnabled: true,
  lastStructureSyncAt: new Date('2026-09-20T06:00:00Z'),
  lastInsightsSyncAt: new Date('2026-09-21T06:00:00Z'),
  connection: { status: 'active' },
  client: { status: 'active' },
};

const TAM: HazirlikGirdisi = {
  hesaplar: [SAGLAM],
  sosyalKanalSayisi: 1,
  profil: {
    markaBilgileri: 'm',
    hedefKitle: 'h',
    bilgiBankasi: 'b',
    logoAssetId: 'x',
    sektor: 's',
    anaAmac: 'form',
    kategoriSayisi: 1,
    vaatSayisi: 1,
    sayfaSayisi: 0,
  },
  buAyButceVar: true,
  hazirlama: { durum: 'hazir', soruSayisi: 0 },
  bilgiler: {
    website: 'https://mirnas.com',
    contactName: 'Ayşe',
    contactPhone: '+905321112233',
    contactEmails: ['a@mirnas.com'],
    address: 'Alsancak, İzmir',
    konumVar: true,
  },
  bildirimKanali: { etkin: 1, toplam: 1 },
  sorumluKisi: 1,
  simdi: new Date('2026-09-28T10:00:00Z'),
};

const madde = (g: HazirlikGirdisi, kod: string) => hazirlikMaddeleri(g).find((m) => m.kod === kod)!;

describe('karar', () => {
  it('her kod tam bir kez ve sabitteki sırayla', () => {
    // Panel kodları bir haritayla çiziyor; eksik ya da fazla kod ekranda
    // boş satır ya da hiç görünmeyen bir madde demek.
    // Sihirbazın maddeleri SONDA (MIMARI § 6 "Geçiciler": Ajan 1 iki listeyi
    // birleştirince bu satır tek listeye döner).
    expect(hazirlikMaddeleri(TAM).map((m) => m.kod)).toEqual([...HAZIRLIK_KODLARI]);
    for (const k of SIHIRBAZ_MADDELERI) expect(HAZIRLIK_KODLARI).toContain(k);
  });

  it('hiçbir madde boş açıklama döndürmüyor', () => {
    const bosGirdi: HazirlikGirdisi = {
      hesaplar: [],
      sosyalKanalSayisi: 0,
      profil: null,
      buAyButceVar: null,
      hazirlama: null,
      bilgiler: { website: null, contactName: null, contactPhone: null, contactEmails: [], address: null, konumVar: false },
      bildirimKanali: { etkin: 0, toplam: 0 },
      sorumluKisi: null,
      simdi: TAM.simdi,
    };
    for (const g of [TAM, bosGirdi]) {
      for (const m of hazirlikMaddeleri(g)) expect(m.aciklama.length, m.kod).toBeGreaterThan(8);
    }
  });

  it('KRİTİK: hazırlık soru bekliyorsa madde eksik ve kaç soru olduğunu söylüyor (şerit "hepsi tamam" demesin)', () => {
    expect(madde({ ...TAM, hazirlama: { durum: 'soru', soruSayisi: 2 } }, 'reklam_hazirligi')).toMatchObject({ durum: 'eksik', zorunlu: false });
    expect(madde({ ...TAM, hazirlama: { durum: 'soru', soruSayisi: 2 } }, 'reklam_hazirligi').aciklama).toContain('2 soru');
    expect(madde({ ...TAM, hazirlama: null }, 'reklam_hazirligi').durum).toBe('eksik');
    expect(madde(TAM, 'reklam_hazirligi').durum).toBe('tamam');
  });

  it('yalnızca hesap ve veri akışı zorunlu', () => {
    const zorunlu = hazirlikMaddeleri(TAM).filter((m) => m.zorunlu).map((m) => m.kod);
    expect(zorunlu).toEqual(['reklam_hesabi', 'veri_akisi']);
  });

  it('hesap sayısı platform platform yazıyor', () => {
    const g = { ...TAM, hesaplar: [SAGLAM, { ...SAGLAM, platform: 'google' as const }] };
    expect(madde(g, 'reklam_hesabi').aciklama).toBe('2 reklam hesabı: 1 Meta Ads, 1 Google Ads.');
  });

  it('KRİTİK: hesap yoksa veri akışı "önce hesap ata" diyor, ikinci kez "hesap yok" değil', () => {
    const m = madde({ ...TAM, hesaplar: [] }, 'veri_akisi');
    expect(m.durum).toBe('eksik');
    expect(m.aciklama).toContain('Önce bir reklam hesabı ata');
  });

  it('KRİTİK: engel metni Senkronizasyon ekranıyla AYNI fonksiyondan', () => {
    // İzleme kapalı bir hesap: süpürme dışı sebep yapı engelinden ÖNCE gelir.
    const g = { ...TAM, hesaplar: [{ ...SAGLAM, syncEnabled: false, lastStructureSyncAt: null }] };
    const m = madde(g, 'veri_akisi');
    expect(m.durum).toBe('eksik');
    expect(m.aciklama).toContain('İzleme kapalı');
    expect(m.aciklama).not.toContain('Yapı taraması');
  });

  it('KRİTİK: kaç hesapta sorun olduğu ve toplam yazıyor (sessiz kesme yok)', () => {
    const bozuk = { ...SAGLAM, name: 'Bozuk', lastStructureSyncAt: null };
    const g = { ...TAM, hesaplar: [SAGLAM, bozuk, { ...bozuk, name: 'Bozuk 2' }] };
    const m = madde(g, 'veri_akisi');
    expect(m.aciklama).toMatch(/^3 hesaptan 2 tanesinden veri gelmiyor\. Bozuk: Yapı taraması/);
    expect(m.aciklama).toContain('(ve 1 hesap daha)');
  });

  it('marka bilgisinde HANGİ alanın boş olduğu yazıyor', () => {
    const g = { ...TAM, profil: { ...TAM.profil!, hedefKitle: '   ', kategoriSayisi: 0 } };
    const m = madde(g, 'marka_bilgisi');
    expect(m.durum).toBe('eksik');
    expect(m.aciklama).toContain('Boş: Ürün/hizmet kategorileri, Kime satıyoruz.');
    expect(m.aciklama).not.toContain('Sektör');
  });

  it('serbest metin alanları ("Ek notlar") boşsa EKSİK SAYILMIYOR', () => {
    const g = { ...TAM, profil: { ...TAM.profil!, markaBilgileri: null, bilgiBankasi: null } };
    expect(madde(g, 'marka_bilgisi').durum).toBe('tamam');
  });

  it('ana amaç web sitesi ama sık sayfa yoksa eksik — adres yine elle yazılırdı', () => {
    const g = { ...TAM, profil: { ...TAM.profil!, anaAmac: 'website', sayfaSayisi: 0 } };
    expect(madde(g, 'marka_bilgisi').aciklama).toContain('Sık kullanılan sayfalar');
    const tamam = { ...TAM, profil: { ...TAM.profil!, anaAmac: 'website', sayfaSayisi: 2 } };
    expect(madde(tamam, 'marka_bilgisi').durum).toBe('tamam');
  });

  it('KRİTİK: bütçeyi göremeyen kişiye "bütçe yok" DENMİYOR', () => {
    expect(madde({ ...TAM, buAyButceVar: null }, 'aylik_butce').durum).toBe('bilinmiyor');
    expect(madde({ ...TAM, buAyButceVar: false }, 'aylik_butce').durum).toBe('eksik');
  });
});

describe('sihirbaz maddeleri (MIMARI § 2b)', () => {
  const bilgi = (b: Partial<HazirlikGirdisi['bilgiler']>): HazirlikGirdisi => ({ ...TAM, bilgiler: { ...TAM.bilgiler, ...b } });

  it('TAM girdide altı madde de tamam ve hiçbiri zorunlu değil (hazir bayrağı anlamını korur)', () => {
    for (const kod of SIHIRBAZ_MADDELERI) {
      expect(madde(TAM, kod), kod).toMatchObject({ durum: 'tamam', zorunlu: false });
    }
  });

  it('KRİTİK: site adresi boşsa da https değilse de eksik — ve http olanı adıyla söylüyor', () => {
    expect(madde(bilgi({ website: null }), 'site_adresi').durum).toBe('eksik');
    expect(madde(bilgi({ website: '   ' }), 'site_adresi').durum).toBe('eksik');
    const http = madde(bilgi({ website: 'http://mirnas.com' }), 'site_adresi');
    expect(http.durum).toBe('eksik');
    expect(http.aciklama).toContain('http://mirnas.com');
    expect(madde(bilgi({ website: 'HTTPS://mirnas.com' }), 'site_adresi').durum).toBe('tamam');
  });

  it('KRİTİK: iletişimde HANGİ alanın boş olduğu yazıyor', () => {
    const m = madde(bilgi({ contactPhone: ' ' }), 'iletisim');
    expect(m.durum).toBe('eksik');
    expect(m.aciklama).toContain('Boş: telefon.');
    expect(m.aciklama).not.toContain('yetkili');
  });

  it('KRİTİK: boş e-posta dizisi ve yalnız boşluk içeren adres rapor alıcısı SAYILMIYOR', () => {
    expect(madde(bilgi({ contactEmails: [] }), 'rapor_alicisi').durum).toBe('eksik');
    expect(madde(bilgi({ contactEmails: ['  '] }), 'rapor_alicisi').durum).toBe('eksik');
  });

  it('KRİTİK: adres yazılı ama konumu yoksa eksik ve sebebi konum', () => {
    const m = madde(bilgi({ konumVar: false }), 'adres');
    expect(m.durum).toBe('eksik');
    expect(m.aciklama).toContain('konumu işaretlenmemiş');
    expect(madde(bilgi({ address: null, konumVar: true }), 'adres').durum).toBe('eksik');
  });

  it('KRİTİK: kanal var ama etkin değil ile hiç kanal yok AYRI cümle', () => {
    const kapali = madde({ ...TAM, bildirimKanali: { etkin: 0, toplam: 2 } }, 'bildirim');
    const yok = madde({ ...TAM, bildirimKanali: { etkin: 0, toplam: 0 } }, 'bildirim');
    expect(kapali.durum).toBe('eksik');
    expect(yok.durum).toBe('eksik');
    expect(kapali.aciklama).toContain('2 bildirim kanalı var ama hiçbiri etkin değil');
    expect(yok.aciklama).toContain('Bildirim kanalı yok');
  });

  it('KRİTİK: ekibi göremeyen kişiye "kimse yok" DENMİYOR — bilinmiyor', () => {
    expect(madde({ ...TAM, sorumluKisi: null }, 'erisim').durum).toBe('bilinmiyor');
    expect(madde({ ...TAM, sorumluKisi: 0 }, 'erisim').durum).toBe('eksik');
  });
});

describe('veri akışı: ilk çekim (MIMARI Ç-5, bekliyor)', () => {
  const TARANMAMIS: HazirlikHesabi = { ...SAGLAM, lastStructureSyncAt: null, lastInsightsSyncAt: null };
  const dk = (n: number) => new Date(TAM.simdi.getTime() - n * 60_000);

  it('KRİTİK: ilk çekim sürüyorsa bekliyor — eksik DEĞİL — ve kaç dakika önce başladığını yazıyor', () => {
    const m = madde({ ...TAM, hesaplar: [{ ...TARANMAMIS, sonIs: { durum: 'running', zaman: dk(12), hata: null } }] }, 'veri_akisi');
    expect(m.durum).toBe('bekliyor');
    expect(m.aciklama).toContain('Mirnas Meta (12 dk önce başladı)');
  });

  it('KRİTİK: sınırı aşan "sürüyor" iş bekliyor DEĞİL, eksik ve takılmış olabileceğini söylüyor', () => {
    const eski = new Date(TAM.simdi.getTime() - ILK_CEKIM_BEKLEME_SINIRI_MS - 60_000);
    const m = madde({ ...TAM, hesaplar: [{ ...TARANMAMIS, sonIs: { durum: 'queued', zaman: eski, hata: null } }] }, 'veri_akisi');
    expect(m.durum).toBe('eksik');
    expect(m.aciklama).toContain('takılmış olabilir');
  });

  it('KRİTİK: düşen iş eksik ve işin hata metnini taşıyor', () => {
    const m = madde({ ...TAM, hesaplar: [{ ...TARANMAMIS, sonIs: { durum: 'failed', zaman: dk(5), hata: '(#100) izin yok' } }] }, 'veri_akisi');
    expect(m.durum).toBe('eksik');
    expect(m.aciklama).toContain('(#100) izin yok');
  });

  it('KRİTİK: izleme kapalı hesapta iş sürse bile bekliyor DEĞİL (kullanıcının işi)', () => {
    const m = madde(
      { ...TAM, hesaplar: [{ ...TARANMAMIS, syncEnabled: false, sonIs: { durum: 'running', zaman: dk(1), hata: null } }] },
      'veri_akisi',
    );
    expect(m.durum).toBe('eksik');
    expect(m.aciklama).toContain('İzleme kapalı');
  });

  it('bir hesap bozuk, öteki bekliyorsa eksik (kesin eksik bekleyeni ezer)', () => {
    const bozuk = { ...SAGLAM, name: 'Bozuk', syncEnabled: false };
    const m = madde({ ...TAM, hesaplar: [{ ...TARANMAMIS, sonIs: { durum: 'running', zaman: dk(1), hata: null } }, bozuk] }, 'veri_akisi');
    expect(m.durum).toBe('eksik');
    expect(m.aciklama).toMatch(/^2 hesaptan 1 tanesinden veri gelmiyor\. Bozuk:/);
  });
});

// ─── Gerçek şemaya karşı ─────────────────────────────────────────────────

let h: Harness;
let svc: HazirlikService;
let sonBaglam: TenantContext | null = null;

const CTX = (izinler: string[] = ['client.read']): TenantContext =>
  ({
    orgId: IDS.org,
    userId: IDS.user,
    clientIds: [IDS.client],
    activeClientId: null,
    isOrgAdmin: true,
    permissions: izinler,
  }) as unknown as TenantContext;

const SIMDI = new Date('2026-09-28T10:00:00Z');

beforeAll(async () => {
  h = await createHarness();
  const prisma = {
    withTenant: async <T>(c: TenantContext, fn: (tx: unknown) => Promise<T>) => {
      sonBaglam = c;
      return fn(h.db);
    },
  } as unknown as PrismaService;
  svc = new HazirlikService(prisma);
});

afterAll(async () => {
  await h.close();
});

beforeEach(async () => {
  await h.reset();
  await seedTenant(h);
  sonBaglam = null;
});

describe('servis', () => {
  it('başka bir workspace\'in listesi sorulamıyor', async () => {
    await expect(svc.get(CTX(), 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', SIMDI)).rejects.toThrow(
      'Workspace bulunamadı',
    );
  });

  it('KRİTİK: bağlam BU workspace\'e daraltılıyor', async () => {
    // Üst barda başka bir workspace seçiliyken RLS bu workspace'in
    // satırlarını gizlerdi ve her madde "eksik" görünürdü.
    await svc.get(CTX(), IDS.client, SIMDI);
    expect(sonBaglam?.activeClientId).toBe(IDS.client);
  });

  it('atanmış ama hiç taranmamış hesap: hesap tamam, veri akışı eksik', async () => {
    // Keşif platformun hesap durumunu yazıyor (`mapAccountStatus`); test
    // verisinin varsayılanı `unknown` ve o ayrı bir hâl (aşağıda).
    await h.q(`UPDATE ad_accounts SET status = 'active' WHERE id = $1`, [IDS.adAccount]);
    const r = await svc.get(CTX(), IDS.client, SIMDI);
    expect(r.clientName).toBe('Workspace');
    const hesap = r.maddeler.find((m) => m.kod === 'reklam_hesabi')!;
    const veri = r.maddeler.find((m) => m.kod === 'veri_akisi')!;
    expect(hesap.durum).toBe('tamam');
    expect(hesap.aciklama).toBe('1 reklam hesabı: 1 Meta Ads.');
    expect(veri.durum).toBe('eksik');
    expect(veri.aciklama).toContain('Yapı taraması');
    expect(r.hazir).toBe(false);
  });

  it('KRİTİK: taranmış hesap + profil + bütçe + kanal = hazır, her madde tamam', async () => {
    await h.q(
      `UPDATE ad_accounts SET last_structure_sync_at = now(), last_insights_sync_at = now(),
              status = 'active' WHERE id = $1`,
      [IDS.adAccount],
    );
    await h.q(
      `INSERT INTO client_profiles (id, org_id, client_id, hedef_kitle, marka_bilgileri, bilgi_bankasi,
                                    sektor, ana_amac, urun_kategorileri, vaatler, updated_at)
       VALUES (gen_random_uuid(), $1, $2, 'h', 'm', 'b', 'Otel', 'form', '{Konaklama}', '{Deniz}', now())`,
      [IDS.org, IDS.client],
    );
    await h.q(
      `INSERT INTO assets (id, org_id, client_id, kind, name, file_name, mime_type, byte_size,
                           width, height, storage_key, content_hash, updated_at)
       VALUES ('e1e1e1e1-e1e1-e1e1-e1e1-e1e1e1e1e1e1', $1, $2, 'logo', 'Logo', 'l.png',
               'image/png', 10, 1, 1, 'k/l', $3, now())`,
      [IDS.org, IDS.client, 'a'.repeat(64)],
    );
    await h.q(`UPDATE client_profiles SET logo_asset_id = 'e1e1e1e1-e1e1-e1e1-e1e1-e1e1e1e1e1e1'`);
    await h.q(
      `INSERT INTO monthly_budgets (id, org_id, client_id, ad_account_id, month, amount_micros, currency, updated_at)
       VALUES (gen_random_uuid(), $1, $2, NULL, '2026-09-01', 1000000, 'TRY', now())`,
      [IDS.org, IDS.client],
    );
    await h.q(
      `INSERT INTO social_profiles (id, org_id, client_id, connection_id, profile_type, external_id, name, updated_at)
       VALUES (gen_random_uuid(), $1, $2, $3, 'facebook_page', 'p1', 'Sayfa', now())`,
      [IDS.org, IDS.client, IDS.connection],
    );
    await h.q(`INSERT INTO workspace_hazirlama (client_id, org_id, durum) VALUES ($1, $2, 'hazir')`, [IDS.client, IDS.org]);
    await h.q(
      `UPDATE clients SET website = 'https://test.com', contact_name = 'Ayşe', contact_phone = '+905321112233',
              contact_emails = ARRAY['a@test.com'], address = 'İzmir', address_latitude = 38.4, address_longitude = 27.1
        WHERE id = $1`,
      [IDS.client],
    );
    await h.q(
      `INSERT INTO bildirim_kanallari (id, org_id, client_id, tur, ad, hedef_enc, hedef_ipucu, alicilar, olaylar)
       VALUES (gen_random_uuid(), $1, $2, 'eposta', 'E-posta', NULL, 'a@test.com', ARRAY['a@test.com'], ARRAY['sinyal'])`,
      [IDS.org, IDS.client],
    );
    await h.q(
      `INSERT INTO memberships (id, user_id, org_id, client_id, role, updated_at) VALUES (gen_random_uuid(), $1, $2, $3, 'ad_manager', now())`,
      [IDS.user, IDS.org, IDS.client],
    );

    const r = await svc.get(CTX(['client.read', 'budget.read']), IDS.client, SIMDI);
    for (const m of r.maddeler) expect(m.durum, `${m.kod}: ${m.aciklama}`).toBe('tamam');
    expect(r.hazir).toBe(true);
  });

  it('platformda durumu bilinmeyen hesap: sebep bu, "yapı taraması" değil', async () => {
    // Zamanlanmış güncelleme yalnızca aktif ve duraklatılmış hesapları
    // alıyor; bu hesap elle güncellenince gelip kendiliğinden gelmiyor.
    const r = await svc.get(CTX(), IDS.client, SIMDI);
    const veri = r.maddeler.find((m) => m.kod === 'veri_akisi')!;
    expect(veri.aciklama).toContain('"unknown"');
    expect(veri.aciklama).not.toContain('Yapı taraması');
  });

  it('KRİTİK: geçen ayın bütçesi bu ayı karşılamıyor', async () => {
    await h.q(
      `INSERT INTO monthly_budgets (id, org_id, client_id, ad_account_id, month, amount_micros, currency, updated_at)
       VALUES (gen_random_uuid(), $1, $2, NULL, '2026-08-01', 1000000, 'TRY', now())`,
      [IDS.org, IDS.client],
    );
    const r = await svc.get(CTX(['client.read', 'budget.read']), IDS.client, SIMDI);
    expect(r.maddeler.find((m) => m.kod === 'aylik_butce')!.durum).toBe('eksik');
  });

  it('bütçe yetkisi yoksa sorulmuyor bile: bilinmiyor', async () => {
    const r = await svc.get(CTX(['client.read']), IDS.client, SIMDI);
    expect(r.maddeler.find((m) => m.kod === 'aylik_butce')!.durum).toBe('bilinmiyor');
  });

  it('KRİTİK (PGlite): boş e-posta dizisi eksik, koordinatsız adres eksik, kanal yoksa eksik — gerçek kolon adlarıyla', async () => {
    await h.q(`UPDATE clients SET contact_emails = '{}', address = 'İzmir', address_latitude = NULL WHERE id = $1`, [IDS.client]);
    const r = await svc.get(CTX(), IDS.client, SIMDI);
    const m = (kod: string) => r.maddeler.find((x) => x.kod === kod)!;
    expect(m('rapor_alicisi').durum).toBe('eksik');
    expect(m('adres').durum).toBe('eksik');
    expect(m('adres').aciklama).toContain('konumu işaretlenmemiş');
    expect(m('bildirim').durum).toBe('eksik');
    expect(m('site_adresi').durum).toBe('eksik');
  });

  it('KRİTİK (PGlite): yönetici, workspace’e özel üyelik yoksa "eksik"; yönetici olmayan sıfır görüyorsa "bilinmiyor"', async () => {
    // Org geneli üyelik (client_id NULL) SAYILMIYOR.
    await h.q(`INSERT INTO memberships (id, user_id, org_id, client_id, role, updated_at) VALUES (gen_random_uuid(), $1, $2, NULL, 'admin', now())`, [
      IDS.user,
      IDS.org,
    ]);
    const yonetici = await svc.get(CTX(), IDS.client, SIMDI);
    expect(yonetici.maddeler.find((x) => x.kod === 'erisim')!.durum).toBe('eksik');
    const calisan = await svc.get({ ...CTX(), isOrgAdmin: false } as TenantContext, IDS.client, SIMDI);
    expect(calisan.maddeler.find((x) => x.kod === 'erisim')!.durum).toBe('bilinmiyor');
  });

  it('KRİTİK (PGlite): atanmış hesabın ilk yapı işi koşuyorsa veri akışı BEKLİYOR (sync_jobs gerçek sorgusu)', async () => {
    await h.q(`UPDATE ad_accounts SET status = 'active' WHERE id = $1`, [IDS.adAccount]);
    await h.q(
      `INSERT INTO sync_jobs (client_id, ad_account_id, job_type, status, started_at, created_at)
       VALUES ($1, $2, 'structure', 'running', $3, $3)`,
      [IDS.client, IDS.adAccount, new Date(SIMDI.getTime() - 4 * 60_000)],
    );
    const r = await svc.get(CTX(), IDS.client, SIMDI);
    const veri = r.maddeler.find((m) => m.kod === 'veri_akisi')!;
    expect(veri.durum, veri.aciklama).toBe('bekliyor');
    expect(veri.aciklama).toContain('4 dk önce başladı');
  });

  it('havuzdaki (atanmamış) hesap bu workspace\'in hesabı sayılmıyor', async () => {
    await h.q(`UPDATE ad_accounts SET client_id = NULL, sync_enabled = false WHERE id = $1`, [
      IDS.adAccount,
    ]);
    const r = await svc.get(CTX(), IDS.client, SIMDI);
    expect(r.maddeler.find((m) => m.kod === 'reklam_hesabi')!.durum).toBe('eksik');
  });
});

describe('kayıt', () => {
  /*
   * NEST MODÜL KAYDI DERLEMEDE DEĞİL AÇILIŞTA PATLIYOR (CLAUDE.md). Servis
   * denetleyiciye enjekte ediliyor; modülün sağlayıcı listesinde yoksa
   * `nest build` geçer, uygulama deploy'un ortasında açılmaz.
   */
  const yorumsuz = (ad: string) =>
    readFileSync(join(__dirname, ad), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

  it('servis modülde kayıtlı ve denetleyiciye enjekte ediliyor', () => {
    const MODUL = yorumsuz('tenancy.module.ts');
    const i = MODUL.indexOf('providers: [');
    expect(i).toBeGreaterThan(-1);
    expect(MODUL.slice(i, MODUL.indexOf(']', i))).toContain('HazirlikService');
    expect(yorumsuz('clients.controller.ts')).toContain('private readonly hazirlik: HazirlikService');
  });
});
