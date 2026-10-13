import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  PERMISSIONS,
  ROLE_PERMISSIONS,
  type HazirlamaYaniti,
  type KurulumAdimKodu,
  type KurulumAdimDurumu,
  type KurulumYaniti,
  type Permission,
  type WorkspaceHazirlik,
} from '@advetics/shared';
import { KURULUM_TURLERI } from '@/components/kurulum/kurulum-akisi';
import {
  ACILIS_TURLERI,
  AYARLAR_SEKMELERI,
  ESKI_ADRESLER,
  KURULUM_LISTESI,
  MARKA_MERKEZI_BOLUMLERI,
  MARKA_MERKEZI_CAPALARI,
  PANEL_KAPILARI,
  acilisAdresi,
  ayarlarAdresi,
  eksikleriTamamlaKapsami,
  eskiAdresYonu,
  eskiCapaYonu,
  eskiMarkaMerkeziYonu,
  hesaplarAdresi,
  kapiAcikMi,
  kurulumListesi,
  kurulumPlatformBeyaniSchema,
  kurulumSayaci,
  markaMerkeziAdresi,
  markaMerkeziBolumu,
  varliklarAdresi,
  varliklarSekmesi,
  veriDurumuAdresi,
  type EskiAdresAnahtari,
  type KurulumListesiGirdisi,
  type PanelKapiAnahtari,
} from './panel-adresleri';

/**
 * ═══ PANEL ADRESLERİ SÖZLEŞMESİ (Ayarlar ve Marka Merkezi sadeleştirme) ═══
 *
 * Mimari: `docs/panel-sadelestirme/MIMARI.md`. Üç tür iddia var:
 *
 *   1. Üreticiler doğru dizgeyi kuruyor (sıra, düşürülen boş değer, çapa).
 *   2. Eski her adres YENİ bir adrese gidiyor ve parametre kaybetmiyor.
 *   3. KAYNAK TARAMALARI — "MANDAL" (ratchet) deseninde: geçiş bitene kadar
 *      elle adres yazan ve henüz yönlendirmeyen dosyalar bir istisna
 *      listesinde. Liste YALNIZ KÜÇÜLEBİLİR: düzeltilen dosya listede
 *      kalırsa test düşer (bayat istisna), listede olmayan yeni bir ihlal
 *      de düşer. Ajan 4'ün kapısı: listeler BOŞ.
 */

const u = (adres: string) => new URL(adres, 'https://panel.test');

// ─────────────────────────────────────────────────────────────────────────────
// 1. Üreticiler
// ─────────────────────────────────────────────────────────────────────────────

describe('ayarlarAdresi', () => {
  it('dört sekme, sırayla ve kendi yolunda', () => {
    expect(AYARLAR_SEKMELERI.map((s) => s.kod)).toEqual(['sirketler', 'baglantilar', 'ekip', 'hesabim']);
    expect(ayarlarAdresi('sirketler')).toBe('/ayarlar/sirketler');
    expect(ayarlarAdresi('baglantilar')).toBe('/ayarlar/baglantilar');
    expect(ayarlarAdresi('ekip')).toBe('/ayarlar/ekip');
    expect(ayarlarAdresi('hesabim')).toBe('/ayarlar/hesabim');
  });

  it('çapa ve Ekip’in workspace süzgeci taşınıyor', () => {
    expect(ayarlarAdresi('sirketler', { capa: 'ust-hesaplar' })).toBe('/ayarlar/sirketler#ust-hesaplar');
    expect(ayarlarAdresi('ekip', { workspace: 'ws-1', capa: 'workspace-erisimi' })).toBe(
      '/ayarlar/ekip?workspace=ws-1#workspace-erisimi',
    );
    // Boş süzgeç düşüyor — "?workspace=" ile açılan bir sayfa boş liste gösterirdi.
    expect(ayarlarAdresi('ekip', { workspace: null })).toBe('/ayarlar/ekip');
  });

  it('Hesabım kurtarma işaretini taşıyor, yanlışsa düşürüyor', () => {
    expect(ayarlarAdresi('hesabim', { kurtarma: true })).toBe('/ayarlar/hesabim?kurtarma=1');
    expect(ayarlarAdresi('hesabim', { kurtarma: false })).toBe('/ayarlar/hesabim');
  });

  it('KRİTİK: yalnız Hesabım izinsiz; diğerlerinin izni matriste var', () => {
    expect(AYARLAR_SEKMELERI.filter((s) => s.izin === null).map((s) => s.kod)).toEqual(['hesabim']);
    for (const s of AYARLAR_SEKMELERI) if (s.izin) expect(PERMISSIONS).toContain(s.izin);
  });
});

describe('markaMerkeziAdresi', () => {
  it('üç bölüm, sırayla', () => {
    expect(MARKA_MERKEZI_BOLUMLERI.map((b) => [b.kod, b.ad])).toEqual([
      ['kurulum', 'Kurulum'],
      ['marka', 'Marka'],
      ['workspace', 'Workspace bilgileri'],
    ]);
  });

  it('KRİTİK: musteri taşınıyor ve sıra eski mmAdresi ile aynı (yer imleri)', () => {
    expect(markaMerkeziAdresi('marka', 'ws-1', 'logo')).toBe('/marka-merkezi?musteri=ws-1&bolum=marka#logo');
    expect(markaMerkeziAdresi('kurulum', 'ws-1')).toBe('/marka-merkezi?musteri=ws-1&bolum=kurulum');
  });

  it('null musteri parametreyi düşürüyor (sayfa aktif workspace’i çözer)', () => {
    expect(markaMerkeziAdresi('workspace', null, 'veri-durumu')).toBe('/marka-merkezi?bolum=workspace#veri-durumu');
  });

  it('değer kodlanıyor — elle birleştirmede kaçan karakterler', () => {
    expect(u(markaMerkeziAdresi('marka', 'a&b=c')).searchParams.get('musteri')).toBe('a&b=c');
  });

  it('markaMerkeziBolumu yalnız YENİ kodları tanıyor — eski kod null (önce yönlendirilmeli)', () => {
    expect(markaMerkeziBolumu('workspace')).toBe('workspace');
    expect(markaMerkeziBolumu('ayarlar')).toBeNull();
    expect(markaMerkeziBolumu(undefined)).toBeNull();
  });
});

describe('varliklarAdresi', () => {
  it('sekme, tür ve form taşınıyor; boşlar düşüyor', () => {
    expect(varliklarAdresi('gorseller', 'ws-1')).toBe('/varliklar?musteri=ws-1&sekme=gorseller');
    expect(varliklarAdresi('formlar', 'ws-1', { form: 'f1' })).toBe('/varliklar?musteri=ws-1&sekme=formlar&form=f1');
    expect(varliklarAdresi('gorseller', null, { tur: 'video', form: null })).toBe('/varliklar?sekme=gorseller&tur=video');
  });

  it('Kitleler Varlıklar’ın dördüncü sekmesi; bilinmeyen sekme Görseller', () => {
    expect(varliklarAdresi('kitleler', 'ws-1')).toBe('/varliklar?musteri=ws-1&sekme=kitleler');
    expect(varliklarSekmesi('kitleler')).toBe('kitleler');
    expect(varliklarSekmesi('yok')).toBe('gorseller');
  });
});

describe('ortak hedefler — karar üreticide', () => {
  it('KRİTİK: hesap bağla/ata/izle — workspace biliniyorsa onun Kurulum’u, değilse Ayarlar havuzu', () => {
    expect(hesaplarAdresi('ws-1')).toBe('/marka-merkezi?musteri=ws-1&bolum=kurulum#kanallar');
    expect(hesaplarAdresi(null)).toBe('/ayarlar/baglantilar#havuz');
  });

  it('veri durumu Workspace bilgileri’nde', () => {
    expect(veriDurumuAdresi('ws-1')).toBe('/marka-merkezi?musteri=ws-1&bolum=workspace#veri-durumu');
  });

  it('açılış sihirbazı: türler paneldeki sihirbazla AYNI', () => {
    expect([...ACILIS_TURLERI]).toEqual([...KURULUM_TURLERI]);
    expect(acilisAdresi('workspace')).toBe('/kurulum?tur=workspace');
    expect(acilisAdresi('sirket', 'baglantilar')).toBe('/kurulum?tur=sirket&adim=baglantilar');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Eski adresler
// ─────────────────────────────────────────────────────────────────────────────

describe('ESKİ ADRES → YENİ ADRES', () => {
  const beklenen: Record<EskiAdresAnahtari, string> = {
    'ayarlar/ust-hesap': '/ayarlar/sirketler',
    'ayarlar/ust-hesaplar': '/ayarlar/sirketler#ust-hesaplar',
    'ayarlar/musteriler': '/ayarlar/sirketler#workspaceler',
    'ayarlar/musteriler/[id]/ekip': '/ayarlar/ekip?workspace=ws-9#workspace-erisimi',
    'ayarlar/musteriler/[id]/kanallar': '/marka-merkezi?musteri=ws-9&bolum=kurulum#kanallar',
    'ayarlar/senkronizasyon': '/marka-merkezi?musteri=ws-aktif&bolum=workspace#veri-durumu',
    'ayarlar/e-posta': '/ayarlar/hesabim#e-posta',
    'ayarlar/okuma-api': '/ayarlar/hesabim#okuma-api',
    hesabim: '/ayarlar/hesabim',
    'kutuphane/bilgi-bankasi': '/marka-merkezi?bolum=marka',
    'kutuphane/gorseller': '/varliklar?sekme=gorseller',
    'kutuphane/kreatifler': '/varliklar?sekme=kreatifler',
    'kutuphane/formlar': '/varliklar?sekme=formlar',
  };

  it('KRİTİK: her eski adresin yeni bir yeri var — eksik ya da fazla anahtar yok', () => {
    expect(Object.keys(ESKI_ADRESLER).sort()).toEqual(Object.keys(beklenen).sort());
    for (const [k, v] of Object.entries(beklenen)) {
      expect(eskiAdresYonu(k as EskiAdresAnahtari, { id: 'ws-9', aktifMusteri: 'ws-aktif' }), k).toBe(v);
    }
  });

  it('senkronizasyon: adresteki workspace oturumdakinden ÖNCE gelir', () => {
    expect(eskiAdresYonu('ayarlar/senkronizasyon', { musteri: 'ws-adres', aktifMusteri: 'ws-aktif' })).toContain(
      'musteri=ws-adres',
    );
  });

  it('KRİTİK: hesabim kurtarma işaretini KAYBETMİYOR', () => {
    expect(eskiAdresYonu('hesabim', { sorgu: { kurtarma: '1' } })).toBe('/ayarlar/hesabim?kurtarma=1');
  });

  it('eski Bilgi Bankası sekmeleri Marka’nın kartlarına', () => {
    const y = (sekme: string) => eskiAdresYonu('kutuphane/bilgi-bankasi', { musteri: 'ws-1', sorgu: { sekme } });
    expect(y('logo')).toBe('/marka-merkezi?musteri=ws-1&bolum=marka#logo');
    expect(y('bilgi-bankasi')).toBe('/marka-merkezi?musteri=ws-1&bolum=marka#markayi-anlat');
    expect(y('hedef-kitle')).toBe('/marka-merkezi?musteri=ws-1&bolum=marka#kime-satiyoruz');
  });

  it('KRİTİK: varlık sayfaları tür ve formu taşıyor; logo süzgeci logonun EVİNE gidiyor', () => {
    expect(eskiAdresYonu('kutuphane/formlar', { musteri: 'ws-1', sorgu: { form: 'f1' } })).toBe(
      '/varliklar?musteri=ws-1&sekme=formlar&form=f1',
    );
    expect(eskiAdresYonu('kutuphane/gorseller', { musteri: 'ws-1', sorgu: { tur: 'video' } })).toBe(
      '/varliklar?musteri=ws-1&sekme=gorseller&tur=video',
    );
    expect(eskiAdresYonu('kutuphane/gorseller', { musteri: 'ws-1', sorgu: { tur: 'logo' } })).toBe(
      '/marka-merkezi?musteri=ws-1&bolum=marka#logo',
    );
  });
});

describe('Marka Merkezi’nin eski ?bolum= değerleri', () => {
  const y = (bolum: string, ek: { varlik?: string; tur?: string; form?: string } = {}) =>
    eskiMarkaMerkeziYonu(bolum, { musteri: 'ws-1', ...ek });

  it('KRİTİK: yedi eski bölümün altısı yeni yerine; bütçe sayfada ayrıca yakalanıyor', () => {
    expect(y('baglantilar')).toBe('/marka-merkezi?musteri=ws-1&bolum=kurulum#kanallar');
    expect(y('olcum')).toBe('/marka-merkezi?musteri=ws-1&bolum=kurulum#olcum');
    expect(y('kitleler')).toBe('/varliklar?musteri=ws-1&sekme=kitleler');
    expect(y('ayarlar')).toBe('/marka-merkezi?musteri=ws-1&bolum=workspace');
    expect(y('bildirimler')).toBe('/marka-merkezi?musteri=ws-1&bolum=workspace#bildirimler');
    expect(y('varliklar', { varlik: 'kreatifler' })).toBe('/varliklar?musteri=ws-1&sekme=kreatifler');
    expect(y('varliklar', { varlik: 'formlar', form: 'f2' })).toBe('/varliklar?musteri=ws-1&sekme=formlar&form=f2');
    expect(y('varliklar', { tur: 'logo' })).toBe('/marka-merkezi?musteri=ws-1&bolum=marka#logo');
  });

  it('yeni ve bilinmeyen değer yönlendirilmiyor (null) — sonsuz yönlendirme olmasın', () => {
    for (const b of ['kurulum', 'marka', 'workspace', 'yok', '']) expect(y(b), b).toBeNull();
  });

  it('eski çapalar istemcide çevriliyor; bilinmeyen çapa null', () => {
    expect(eskiCapaYonu('marka', '#bilgi', 'ws-1')).toBe('/marka-merkezi?musteri=ws-1&bolum=marka#markayi-anlat');
    expect(eskiCapaYonu('workspace', 'kategori', 'ws-1')).toBe('/marka-merkezi?musteri=ws-1&bolum=kurulum#varsayilanlar');
    expect(eskiCapaYonu('workspace', 'ekip', 'ws-1')).toBe('/marka-merkezi?musteri=ws-1&bolum=workspace#erisim');
    expect(eskiCapaYonu('workspace', 'firma', 'ws-1')).toBeNull();
    expect(eskiCapaYonu('marka', 'logo', 'ws-1')).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Yetki kapıları
// ─────────────────────────────────────────────────────────────────────────────

describe('PANEL KAPILARI — API kapısının aynası', () => {
  const oturum = (rol: keyof typeof ROLE_PERMISSIONS, ek: { isOrgAdmin?: boolean; platformAdmin?: boolean } = {}) => ({
    permissions: [...ROLE_PERMISSIONS[rol]] as Permission[],
    isOrgAdmin: ek.isOrgAdmin ?? rol === 'admin',
    platformAdmin: ek.platformAdmin ?? false,
    managerAccount: null,
  });
  const acik = (rol: keyof typeof ROLE_PERMISSIONS, k: PanelKapiAnahtari, ek = {}) => kapiAcikMi(oturum(rol, ek), k);

  it('her kapının izinleri matriste var (yazım hatası "herkese kapalı" demek)', () => {
    for (const [k, v] of Object.entries(PANEL_KAPILARI)) {
      for (const i of v.izinler) expect(PERMISSIONS, k).toContain(i);
      expect(v.neden.length, k).toBeGreaterThan(0);
    }
  });

  it('KRİTİK: firma formu Reklam Yöneticisi’ne AÇIK (uç client.write; eski panel isOrgAdmin istiyordu)', () => {
    expect(acik('ad_manager', 'firma.yaz')).toBe(true);
  });

  it('KRİTİK: Arşivle/geri al yalnız org yöneticisi + client.delete', () => {
    expect(acik('admin', 'workspace.arsivle')).toBe(true);
    expect(acik('admin', 'workspace.geriAl')).toBe(true);
    expect(acik('ad_manager', 'workspace.arsivle')).toBe(false);
    // İzni override ile almış ama org yöneticisi olmayan: uç reddeder, düğme de görünmez.
    expect(kapiAcikMi({ ...oturum('ad_manager'), permissions: [...ROLE_PERMISSIONS.ad_manager, 'client.delete'] }, 'workspace.arsivle')).toBe(false);
  });

  it('KRİTİK: logo bir varlık (bulk.write), marka formu client.write — iki ayrı kapı', () => {
    expect(PANEL_KAPILARI['logo.yaz'].izinler).toEqual(['bulk.write']);
    expect(PANEL_KAPILARI['marka.yaz'].izinler).toEqual(['client.write']);
  });

  it('KRİTİK: müşteri hesabı Marka Merkezi’ne ve Varlıklar’a GİREMİYOR', () => {
    expect(acik('client_viewer', 'markaMerkezi.gor')).toBe(false);
    expect(acik('client_viewer', 'varliklar.gor')).toBe(false);
    expect(acik('ad_manager', 'markaMerkezi.gor')).toBe(true);
    expect(acik('ad_manager', 'varliklar.gor')).toBe(true);
  });

  it('KRİTİK: üst hesaplar ve okuma API yalnız platform sahibi — bütün izinli admin bile değil', () => {
    expect(acik('admin', 'ustHesap.yonet')).toBe(false);
    expect(acik('admin', 'okumaApi.yonet')).toBe(false);
    expect(acik('admin', 'ustHesap.yonet', { platformAdmin: true })).toBe(true);
  });

  it('şirket 2FA zorunluluğu yalnız org yöneticisi', () => {
    expect(acik('admin', 'ikiAdim.sirketZorunlulugu')).toBe(true);
    expect(acik('ad_manager', 'ikiAdim.sirketZorunlulugu')).toBe(false);
  });

  it('kurulumda hesap seçimi havuz atamasıyla AYNI izinleri istiyor', () => {
    for (const i of PANEL_KAPILARI['hesap.ata'].izinler) expect(PANEL_KAPILARI['kurulum.hesap'].izinler).toContain(i);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Kurulum: tek liste, tek sayaç
// ─────────────────────────────────────────────────────────────────────────────

const KURULUM_KODLARI: KurulumAdimKodu[] = [
  'meta_hesap', 'meta_odeme', 'sayfa', 'google_hesap', 'google_odeme', 'google_izin', 'gtm_konteyner',
  'ga4_mulk', 'meta_piksel', 'ads_donusum', 'ga4_ads_bag', 'gtm_etiket', 'site_kodu', 'dogrulama', 'marka',
];

function kurulumYaniti(ozel: Partial<Record<KurulumAdimKodu, { durum: KurulumAdimDurumu; otomatik?: boolean }>> = {}): KurulumYaniti {
  return {
    clientId: 'ws-1',
    workspaceAdi: 'Ege',
    site: null,
    hesapSahibi: null,
    kullanilmayanPlatformlar: [],
    adimlar: KURULUM_KODLARI.map((kod) => ({
      kod,
      grup: 'hesaplar',
      durum: ozel[kod]?.durum ?? 'tamam',
      baslik: kod,
      neden: `${kod} nedeni`,
      eylem: null,
      otomatik: ozel[kod]?.otomatik ?? false,
    })),
    ozet: { tamam: 0, toplam: 0, otomatikYapilabilir: 0, kullanicida: 0 },
    siteKodu: null,
    donusumTetigi: null,
  };
}

function hazirlamaYaniti(ozel: Partial<Record<string, 'tamam' | 'soru' | 'eksik' | 'hata' | 'atlandi'>> = {}, durum: HazirlamaYaniti['durum'] = 'hazir'): HazirlamaYaniti {
  return {
    clientId: 'ws-1',
    durum,
    adimlar: (['site', 'marka', 'olcum', 'piksel', 'kategori', 'konum', 'butce'] as const).map((kod) => ({
      kod,
      durum: ozel[kod] ?? 'tamam',
      baslik: kod,
      neden: `${kod} nedeni`,
    })),
    sorular: [],
    varsayilanlar: { pikselId: null, gunlukButceMicros: null, gunlukButceParaBirimi: null, kategoriCevaplandi: true },
    sonCalisma: null,
  };
}

function hazirlik(ozel: Partial<Record<string, 'tamam' | 'eksik' | 'bilinmiyor'>> = {}): WorkspaceHazirlik {
  return {
    clientId: 'ws-1',
    clientName: 'Ege',
    hazir: true,
    maddeler: ([
      'reklam_hesabi', 'veri_akisi', 'marka_bilgisi', 'logo', 'aylik_butce', 'sosyal_kanal', 'reklam_hazirligi',
      // Sihirbazın yeni maddeleri (HAZIRLIK_SIHIRBAZ_KODLARI).
      'site_adresi', 'iletisim', 'rapor_alicisi', 'adres', 'bildirim', 'erisim',
    ] as const).map(
      (kod) => ({ kod, zorunlu: false, durum: ozel[kod] ?? 'tamam', aciklama: `${kod} açıklaması` }),
    ),
  };
}

const tamGirdi = (ek: Partial<KurulumListesiGirdisi> = {}): KurulumListesiGirdisi => ({
  kurulum: kurulumYaniti(),
  hazirlama: hazirlamaYaniti(),
  hazirlik: hazirlik(),
  kullanilmayanlar: [],
  ...ek,
});

describe('KURULUM — tek sıralı liste', () => {
  it('KRİTİK: on adım — onaylı yedi + sihirbazın üçü (bilgiler başta, bildirimler ve veri sonda)', () => {
    expect(KURULUM_LISTESI.map((a) => a.kod)).toEqual([
      'bilgiler', 'meta', 'sayfa', 'piksel', 'google', 'olcum', 'marka', 'varsayilanlar', 'bildirimler', 'veri',
    ]);
  });

  it('her adımın çapası Marka Merkezi çapa listesinde (Kurulum kartları bu kimliklerle)', () => {
    for (const a of KURULUM_LISTESI) expect(MARKA_MERKEZI_CAPALARI.kurulum).toContain(a.kod);
  });

  it('her şey tamamsa 10 / 10 ve bitti', () => {
    const s = kurulumSayaci(kurulumListesi(tamGirdi()));
    expect(s).toEqual({ tamam: 10, toplam: 10, kapsamDisi: 0, bilinmiyor: 0, bitti: true });
  });

  it('KRİTİK: bir kaynak okunamazsa "eksik" DEĞİL "bilinmiyor" ve bitti ASLA true değil', () => {
    const adimlar = kurulumListesi(tamGirdi({ kurulum: null }));
    expect(adimlar.find((a) => a.kod === 'meta')?.durum).toBe('bilinmiyor');
    const s = kurulumSayaci(adimlar);
    expect(s.bitti).toBe(false);
    expect(s.bilinmiyor).toBeGreaterThan(0);
  });

  it('KRİTİK: kullanılmayan platform sayaçtan düşüyor ve parçaları başka adımda da sayılmıyor', () => {
    const g = tamGirdi({
      kullanilmayanlar: ['google'],
      kurulum: kurulumYaniti({ google_hesap: { durum: 'eksik' }, ads_donusum: { durum: 'eksik' } }),
    });
    const adimlar = kurulumListesi(g);
    expect(adimlar.find((a) => a.kod === 'google')?.durum).toBe('kullanilmiyor');
    const olcum = adimlar.find((a) => a.kod === 'olcum')!;
    expect(olcum.parcalar.map((p) => p.kod)).not.toContain('ads_donusum');
    expect(olcum.durum).toBe('tamam');
    expect(kurulumSayaci(adimlar)).toEqual({ tamam: 9, toplam: 9, kapsamDisi: 0, bilinmiyor: 0, bitti: true });
  });

  it('öncelik: hata > soru > eksik > kullanıcıda > bilinmiyor > bekliyor', () => {
    const durum = (k: Partial<Record<KurulumAdimKodu, { durum: KurulumAdimDurumu }>>, h: Partial<Record<string, 'tamam' | 'soru' | 'eksik' | 'hata' | 'atlandi'>> = {}) =>
      kurulumListesi(tamGirdi({ kurulum: kurulumYaniti(k), hazirlama: hazirlamaYaniti(h) })).find((a) => a.kod === 'piksel')!.durum;
    expect(durum({ meta_piksel: { durum: 'eksik' } }, { piksel: 'hata' })).toBe('hata');
    expect(durum({ meta_piksel: { durum: 'eksik' } }, { piksel: 'soru' })).toBe('soru');
    expect(durum({ meta_piksel: { durum: 'kullanicida' } }, { piksel: 'eksik' })).toBe('eksik');
    expect(durum({ meta_piksel: { durum: 'kullanicida' } }, { piksel: 'atlandi' })).toBe('kullanicida');
    expect(durum({ meta_piksel: { durum: 'atlandi' } })).toBe('bekliyor');
  });

  it('hazırlama adım satırı yoksa parça "bekliyor" (hazırlık henüz oraya gelmedi), "bilinmiyor" değil', () => {
    const h = hazirlamaYaniti();
    h.adimlar = h.adimlar.filter((a) => a.kod !== 'kategori');
    const v = kurulumListesi(tamGirdi({ hazirlama: h })).find((a) => a.kod === 'varsayilanlar')!;
    expect(v.durum).toBe('bekliyor');
  });

  it('marka adımı hazırlıktaki logo ve marka bilgisini de sayıyor', () => {
    const v = kurulumListesi(tamGirdi({ hazirlik: hazirlik({ logo: 'eksik' }) })).find((a) => a.kod === 'marka')!;
    expect(v.durum).toBe('eksik');
    expect(v.parcalar.find((p) => p.kod === 'logo')?.neden).toBe('logo açıklaması');
  });

  it('KRİTİK: aylık bütçe sayaca GİRMİYOR (her ayın 1’inde "eksik" dememek için)', () => {
    const g = tamGirdi({ hazirlik: hazirlik({ aylik_butce: 'eksik' }) });
    expect(kurulumSayaci(kurulumListesi(g)).bitti).toBe(true);
  });

  it('KRİTİK: veri akışı ARTIK sayaca giriyor (kurulum-sihirbazi Ç-5): hesap atanmış ama veri yoksa bitmedi', () => {
    const g = tamGirdi({ hazirlik: hazirlik({ veri_akisi: 'eksik' }) });
    const adimlar = kurulumListesi(g);
    expect(adimlar.find((a) => a.kod === 'veri')?.durum).toBe('eksik');
    expect(kurulumSayaci(adimlar).bitti).toBe(false);
  });
});

describe('KULLANILMAYAN PLATFORM BEYANI', () => {
  it('tek platform kapatılabilir; ikisi birden ve tekrar reddediliyor', () => {
    expect(kurulumPlatformBeyaniSchema.safeParse({ kullanilmayanlar: ['google'] }).success).toBe(true);
    expect(kurulumPlatformBeyaniSchema.safeParse({ kullanilmayanlar: [] }).success).toBe(true);
    expect(kurulumPlatformBeyaniSchema.safeParse({ kullanilmayanlar: ['meta', 'google'] }).success).toBe(false);
    expect(kurulumPlatformBeyaniSchema.safeParse({ kullanilmayanlar: ['meta', 'meta'] }).success).toBe(false);
    expect(kurulumPlatformBeyaniSchema.safeParse({ kullanilmayanlar: ['linkedin'] }).success).toBe(false);
  });
});

describe('"EKSİKLERİ TAMAMLA" — tek düğmenin kapsamı', () => {
  it('yalnız otomatik ve kullanılan platformun adımları', () => {
    const g = tamGirdi({
      kullanilmayanlar: ['google'],
      kurulum: kurulumYaniti({
        gtm_konteyner: { durum: 'eksik', otomatik: true },
        ads_donusum: { durum: 'eksik', otomatik: true },
      }),
    });
    const k = eksikleriTamamlaKapsami(g);
    expect(k.kurulumAdimlari).toEqual(['gtm_konteyner']);
    expect(k.yapacakVar).toBe(true);
  });

  it('KRİTİK: gerçek hesap açan adım düğmede değil, kullanıcıya kalan listesinde ve NEDENİYLE', () => {
    const g = tamGirdi({ kurulum: kurulumYaniti({ meta_hesap: { durum: 'eksik', otomatik: false } }) });
    const k = eksikleriTamamlaKapsami(g);
    expect(k.kurulumAdimlari).not.toContain('meta_hesap');
    expect(k.kullaniciyaKalan).toEqual([{ adim: 'meta', neden: 'meta_hesap nedeni' }]);
    expect(k.yapacakVar).toBe(false);
  });

  it('hazırlama eksikse yeniden koşturuluyor ve onun eksiği kullanıcıya kalmıyor', () => {
    const g = tamGirdi({ hazirlama: hazirlamaYaniti({ site: 'eksik' }, 'eksik') });
    const k = eksikleriTamamlaKapsami(g);
    expect(k.hazirlamaYeniden).toBe(true);
    expect(k.kullaniciyaKalan).toEqual([]);
  });

  it('soru düğmenin işi değil — kullanıcıya kalan', () => {
    const g = tamGirdi({ hazirlama: hazirlamaYaniti({ kategori: 'soru' }, 'soru') });
    const k = eksikleriTamamlaKapsami(g);
    expect(k.hazirlamaYeniden).toBe(false);
    expect(k.kullaniciyaKalan.map((x) => x.adim)).toEqual(['varsayilanlar']);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Kaynak taramaları — MANDAL (yalnız küçülen istisna listeleri)
// ─────────────────────────────────────────────────────────────────────────────

const WEB_SRC = join(__dirname, '..');
const API_SRC = join(__dirname, '..', '..', '..', 'api', 'src');
const DASHBOARD = join(WEB_SRC, 'app', '(dashboard)');

function dosyalar(kok: string): string[] {
  const out: string[] = [];
  for (const ad of readdirSync(kok)) {
    const yol = join(kok, ad);
    if (statSync(yol).isDirectory()) {
      if (ad === 'node_modules' || ad.startsWith('.')) continue;
      out.push(...dosyalar(yol));
    } else if (/\.(ts|tsx)$/.test(ad) && !/\.spec\.ts$/.test(ad)) out.push(yol);
  }
  return out;
}

/** Yorumsuz kaynak — kuralı ANLATAN yorum eşleşmesin (CLAUDE.md). */
function yorumsuz(kod: string): string {
  return kod
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/[^:]\/\/ .*$/gm, '');
}

/** Tırnakla başlayan ve bu modülün yollarından birine giden dizge. */
const ELLE_ADRES = /['"`]\/(ayarlar(?=['"`/?#])|marka-merkezi(?=['"`?#])|varliklar(?=['"`?#])|kutuphane\/|hesabim(?=['"`?#])|kurulum(?=['"`?#]))/;

/** Kalıcı istisnalar — tanımın kendisi ya da yol dizgesi olması gereken yer. */
const KALICI_ISTISNA = new Set<string>([
  // arama motoru yasağı bir YOL ÖNEKİ, bağlantı değil
  'app/robots.ts',
]);

/**
 * GEÇİŞ İSTİSNALARI — bugün elle adres yazan dosyalar. Düzelten ajan
 * dosyayı listeden SİLER (silmezse "bayat istisna" testi düşer). Sahibi
 * MIMARI § Dosya sahipliği.
 */
const ELLE_ADRES_GECIS_ISTISNASI = new Set<string>([
]);

/**
 * ESKİ ÜRETİCİYİ (`mmAdresi`, `varlikYonu`, `bilgiBankasiYonu`) çağıran
 * dosyalar — eski bölüm kodlarına gidiyorlar. Aynı mandal.
 */
const ESKI_URETICI = /\b(mmAdresi|varlikYonu|bilgiBankasiYonu)\(/;
const ESKI_URETICI_GECIS_ISTISNASI = new Set<string>([
]);

/** API'de panel yolu yazan dosyalar — shared üreticiye geçecek (Ajan 2). */
const API_GECIS_ISTISNASI = new Set<string>([
]);

function ihlaller(kok: string, desen: RegExp): string[] {
  return dosyalar(kok)
    .filter((d) => desen.test(yorumsuz(readFileSync(d, 'utf8'))))
    .map((d) => relative(kok, d).split('\\').join('/'))
    .sort();
}

function mandal(bulunan: string[], istisna: Set<string>) {
  const yeni = bulunan.filter((d) => !istisna.has(d) && !KALICI_ISTISNA.has(d));
  const bayat = [...istisna].filter((d) => !bulunan.includes(d)).sort();
  return { yeni, bayat };
}

describe('KRİTİK: TEK ÜRETİCİ — panelde elle Ayarlar / Marka Merkezi / Varlıklar adresi yok', () => {
  const bulunan = ihlaller(WEB_SRC, ELLE_ADRES);

  it('tarama boşa düşmüyor — desen gerçekten eşleşiyor', () => {
    // Dosya sistemi gezilmezse ya da desen bozulursa bütün iddialar boş geçerdi.
    expect(dosyalar(WEB_SRC).length).toBeGreaterThan(100);
    expect(ELLE_ADRES.test(`href="/ayarlar/baglantilar"`)).toBe(true);
    expect(ELLE_ADRES.test(`'/marka-merkezi?bolum=marka'`)).toBe(true);
    expect(ELLE_ADRES.test('`/kurulum?tur=${t}`')).toBe(true);
    expect(ELLE_ADRES.test(`'/hesabim'`)).toBe(true);
    // Yanlış pozitif yok: API yolu, başka sayfa.
    expect(ELLE_ADRES.test('`/clients/${id}/kurulum`')).toBe(false);
    expect(ELLE_ADRES.test(`'/varliklar-raporu'`)).toBe(false);
    expect(bulunan).toContain('app/robots.ts');
  });

  it('yeni bir dosya elle adres YAZMIYOR', () => {
    expect(mandal(bulunan, ELLE_ADRES_GECIS_ISTISNASI).yeni).toEqual([]);
  });

  it('düzeltilen dosya istisna listesinden SİLİNMİŞ (bayat istisna yok)', () => {
    expect(mandal(bulunan, ELLE_ADRES_GECIS_ISTISNASI).bayat).toEqual([]);
  });

  it('eski üretici (mmAdresi/varlikYonu/bilgiBankasiYonu) yeni dosyada kullanılmıyor; bayat istisna yok', () => {
    const b = ihlaller(WEB_SRC, ESKI_URETICI);
    // Liste BOŞALDI (Ajan 3, 2026-10-13): tarama boşa düşmesin diye desenin
    // kendisi sınanıyor; "hiç ihlal yok" ile "desen bozuk" ayırt edilsin.
    expect(ESKI_URETICI.test("mmAdresi(id, 'marka')")).toBe(true);
    expect(ESKI_URETICI.test('markaMerkeziAdresi(')).toBe(false);
    expect(mandal(b, ESKI_URETICI_GECIS_ISTISNASI)).toEqual({ yeni: [], bayat: [] });
  });

  it('API panel yolu yazmıyor (shared üreticiden); bayat istisna yok', () => {
    const b = ihlaller(API_SRC, ELLE_ADRES);
    expect(mandal(b, API_GECIS_ISTISNASI)).toEqual({ yeni: [], bayat: [] });
  });
});

/**
 * ESKİ ADRES SAYFALARI YÖNLENDİRİYOR. Bugün hiçbiri `eskiAdresYonu`yu
 * çağırmıyor (eski sayfalar ya içerik çiziyor ya kendi eşlemesiyle
 * yönleniyor); her biri yazıldıkça listeden çıkar.
 */
const YONLENDIRME_BEKLEYEN = new Set<EskiAdresAnahtari>([
]);

describe('KRİTİK: ESKİ ADRESLER YÖNLENİYOR — 404 yok', () => {
  const sayfa = (yol: string) => join(DASHBOARD, ...yol.split('/'), 'page.tsx');

  it('her eski adresin sayfası DURUYOR (silinmiyor, yönleniyor)', () => {
    for (const [k, v] of Object.entries(ESKI_ADRESLER)) expect(existsSync(sayfa(v.yol)), k).toBe(true);
  });

  it('yönlendirmesi yazılan sayfa eşlemeyi kullanıyor; bekleyen listesi bayat değil', () => {
    const yonlenen: string[] = [];
    for (const [k, v] of Object.entries(ESKI_ADRESLER)) {
      const kod = yorumsuz(readFileSync(sayfa(v.yol), 'utf8'));
      if (kod.includes(`eskiAdresYonu('${k}'`)) yonlenen.push(k);
    }
    expect(yonlenen.filter((k) => YONLENDIRME_BEKLEYEN.has(k as EskiAdresAnahtari))).toEqual([]);
    expect(
      Object.keys(ESKI_ADRESLER).filter((k) => !yonlenen.includes(k) && !YONLENDIRME_BEKLEYEN.has(k as EskiAdresAnahtari)),
    ).toEqual([]);
  });

  it('Marka Merkezi eski ?bolum= değerlerini eşlemeden yönlendiriyor (Ajan 3 yazınca bayrak false olur)', () => {
    const MM_ESKI_BOLUM_BEKLIYOR = false;
    const kod = yorumsuz(readFileSync(join(DASHBOARD, 'marka-merkezi', 'page.tsx'), 'utf8'));
    expect(kod.includes('eskiMarkaMerkeziYonu(')).toBe(!MM_ESKI_BOLUM_BEKLIYOR);
  });
});
