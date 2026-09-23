import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { ConnectionSummary, ProviderAvailability } from '@advetics/shared';
import {
  ADIMLAR,
  KURULUM_TURLERI,
  adimOku,
  boostKarari,
  geriGidilebilir,
  kurulumAdresi,
  platformDurumu,
  siteAdresiDuzelt,
  turOku,
} from './kurulum-akisi';

/**
 * ═══ KURULUM SİHİRBAZI ═══
 *
 * Kararlar saf fonksiyonlarda ve ÇALIŞTIRILARAK sınanıyor. Bileşenin
 * kendisi tarayıcı olayları etrafında kurulu ve panelde DOM test altyapısı
 * yok; onun için yorumsuz kaynakta tarama var ve her tarama önce gövdenin
 * gerçekten yakalandığını doğruluyor.
 */
const yorumsuz = (m: string): string =>
  m
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

const oku = (...yol: string[]): string =>
  yorumsuz(readFileSync(join(__dirname, ...yol), 'utf8'));

const SIHIRBAZ = oku('kurulum-sihirbazi.tsx');
const SECIM = oku('hesap-secimi.tsx');
const SONUC = oku('kurulum-sonucu.tsx');
const SAYFA = oku('..', '..', 'app', '(dashboard)', 'kurulum', 'page.tsx');
const WORKSPACE_BOLUMU = oku('..', 'tenancy', 'workspace-bolumu.tsx');
const SIRKETLER = oku('..', 'ust-hesap', 'ust-hesap-ekrani.tsx');

/** Bir fonksiyonun gövdesi — süslü parantez sayarak, sabit uzunlukla değil. */
function govde(kaynak: string, bas: string): string {
  const i = kaynak.indexOf(bas);
  if (i < 0) throw new Error(`"${bas}" bulunamadı — tarama boşa düşerdi`);
  const ac = kaynak.indexOf('{', i + bas.length);
  let d = 0;
  for (let j = ac; j < kaynak.length; j++) {
    if (kaynak[j] === '{') d++;
    else if (kaynak[j] === '}' && --d === 0) return kaynak.slice(i, j + 1);
  }
  throw new Error(`"${bas}" gövdesi kapanmadı`);
}

// ---------------------------------------------------------------------------
// Akış
// ---------------------------------------------------------------------------

describe('adım sırası', () => {
  it('KRİTİK: platform adımı HER türde workspace bilgisinden ÖNCE', () => {
    /*
     * Platform bağlamak tarayıcıyı Meta'ya gönderip geri getiriyor ve
     * dönüşte ekrandaki form kayboluyor. Sıra tersi olsaydı workspace adı,
     * sitesi ve rapor adresleri her bağlantıda yeniden yazılırdı.
     */
    for (const t of KURULUM_TURLERI) {
      const a = ADIMLAR[t];
      expect(a.indexOf('baglantilar'), t).toBeGreaterThan(-1);
      expect(a.indexOf('baglantilar'), t).toBeLessThan(a.indexOf('workspace'));
      expect(a.indexOf('workspace'), t).toBeLessThan(a.indexOf('hesaplar'));
      expect(a.at(-1), t).toBe('bitti');
    }
  });

  it('üç sihirbaz aynı merdivenin basamakları', () => {
    expect(ADIMLAR['ust-hesap'].slice(0, 2)).toEqual(['ust-hesap', 'sirket']);
    expect(ADIMLAR.sirket[0]).toBe('sirket');
    expect(ADIMLAR.workspace[0]).toBe('baglantilar');
    // Üst hesap kuran şirketi de, şirket kuran workspace'i de kuruyor.
    expect(ADIMLAR['ust-hesap'].slice(1)).toEqual(ADIMLAR.sirket);
    expect(ADIMLAR.sirket.slice(1)).toEqual(ADIMLAR.workspace);
  });

  it('adres okuma: tanınmayan tür ve adım güvenli yere düşüyor', () => {
    expect(turOku('sirket')).toBe('sirket');
    expect(turOku('baska')).toBeNull();
    expect(turOku(undefined)).toBeNull();
    expect(adimOku('sirket', 'hesaplar')).toBe('hesaplar');
    expect(adimOku('sirket', 'ust-hesap')).toBe('sirket');
    expect(adimOku('workspace', undefined)).toBe('baglantilar');
  });

  it('KRİTİK: "bitti" adresten AÇILAMIYOR — sonuç yalnızca bellekte', () => {
    expect(adimOku('workspace', 'bitti')).toBe('baglantilar');
  });

  it('adres tek üreticiden ve sorgu olarak çözülebiliyor', () => {
    const u = new URL(kurulumAdresi('sirket', 'baglantilar'), 'https://x.test');
    expect(u.pathname).toBe('/kurulum');
    expect(u.searchParams.get('tur')).toBe('sirket');
    expect(u.searchParams.get('adim')).toBe('baglantilar');
  });

  it('KRİTİK: sunucuya yazılmış adıma GERİ dönülmüyor', () => {
    // Geri dönüp "Devam"a basmak ikinci bir üst hesap/şirket açardı.
    expect(geriGidilebilir('ust-hesap', 'ust-hesap')).toBe(false);
    expect(geriGidilebilir('ust-hesap', 'sirket')).toBe(false);
    expect(geriGidilebilir('sirket', 'sirket')).toBe(false);
    expect(geriGidilebilir('ust-hesap', 'baglantilar')).toBe(true);
    expect(geriGidilebilir('sirket', 'workspace')).toBe(true);
    expect(geriGidilebilir('workspace', 'baglantilar')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Platform durumu
// ---------------------------------------------------------------------------

function uygun(configured: boolean): ProviderAvailability[] {
  return [
    { platform: 'meta', configured, missingConfig: [], requiredScopes: [], optionalScopes: [] },
  ];
}

function baglanti(
  status: ConnectionSummary['status'],
  hesaplar: Array<{ clientId: string | null; isManager?: boolean }> = [],
  sayfalar: Array<{ clientId: string | null }> = [],
): ConnectionSummary {
  return {
    id: `b-${status}`,
    platform: 'meta',
    accountLabel: 'Ajans',
    status,
    adAccounts: hesaplar.map((h, i) => ({ id: `h${i}`, isManager: false, ...h })),
    socialProfiles: sayfalar.map((p, i) => ({ id: `p${i}`, ...p })),
  } as unknown as ConnectionSummary;
}

describe('platformDurumu — dört hâl ayrı', () => {
  it('sunucu ayarı yoksa "ayarsiz" — bağlantı olsa bile', () => {
    expect(platformDurumu('meta', uygun(false), [baglanti('active')]).durum).toBe('ayarsiz');
    expect(platformDurumu('meta', [], []).durum).toBe('ayarsiz');
  });

  it('hiç bağlantı yoksa "yok"; kaldırılmış bağlantı YOK sayılıyor', () => {
    expect(platformDurumu('meta', uygun(true), []).durum).toBe('yok');
    expect(platformDurumu('meta', uygun(true), [baglanti('revoked')]).durum).toBe('yok');
  });

  it('yetkisi düşmüş bağlantı "yeniden"', () => {
    expect(platformDurumu('meta', uygun(true), [baglanti('needs_reauth')]).durum).toBe('yeniden');
  });

  it('KRİTİK: sağlam bağlantı bozuk olanın ÖNÜNE geçiyor', () => {
    const d = platformDurumu('meta', uygun(true), [baglanti('needs_reauth'), baglanti('active')]);
    expect(d.durum).toBe('bagli');
  });

  it('bekleyen sayılar yalnızca ATANMAMIŞ ve yönetici OLMAYAN hesaplar', () => {
    const d = platformDurumu('meta', uygun(true), [
      baglanti(
        'active',
        [{ clientId: null }, { clientId: 'x' }, { clientId: null, isManager: true }],
        [{ clientId: null }, { clientId: null }, { clientId: 'x' }],
      ),
    ]);
    expect(d).toMatchObject({ durum: 'bagli', bostaHesap: 1, bostaSayfa: 2 });
  });
});

// ---------------------------------------------------------------------------
// Boost hesabı
// ---------------------------------------------------------------------------

describe('boostKarari', () => {
  it('sayfa seçilmediyse soru yok', () => {
    expect(boostKarari(['a', 'b'], 0, null)).toEqual({ durum: 'gereksiz', hesapId: null });
  });

  it('sayfa var, Meta hesabı yok: uyarı, engel değil', () => {
    expect(boostKarari([], 2, null)).toEqual({ durum: 'hesap-yok', hesapId: null });
  });

  it('KRİTİK: tek Meta hesabı SORULMADAN seçiliyor', () => {
    expect(boostKarari(['a'], 1, null)).toEqual({ durum: 'otomatik', hesapId: 'a' });
  });

  it('KRİTİK: birden çok hesapta TAHMİN YOK — seçilene kadar bekliyor', () => {
    expect(boostKarari(['a', 'b'], 1, null)).toEqual({ durum: 'secilmeli', hesapId: null });
    expect(boostKarari(['a', 'b'], 1, 'b')).toEqual({ durum: 'secildi', hesapId: 'b' });
  });

  it('KRİTİK: sonradan kaldırılan hesap seçim sayılmıyor', () => {
    // Kaldırılmış hesabı göndermek "bu workspace'e atanmamış" hatasıyla
    // sayfaları boost'suz bırakırdı.
    expect(boostKarari(['a', 'b'], 1, 'c')).toEqual({ durum: 'secilmeli', hesapId: null });
  });
});

describe('siteAdresiDuzelt', () => {
  it('şemasız adrese https ekliyor, http’yi https’e çeviriyor', () => {
    expect(siteAdresiDuzelt('miayapi.com')).toBe('https://miayapi.com');
    expect(siteAdresiDuzelt('  miayapi.com/tr ')).toBe('https://miayapi.com/tr');
    expect(siteAdresiDuzelt('http://miayapi.com')).toBe('https://miayapi.com');
    expect(siteAdresiDuzelt('HTTPS://miayapi.com')).toBe('HTTPS://miayapi.com');
    expect(siteAdresiDuzelt('   ')).toBe('');
  });
});

// ---------------------------------------------------------------------------
// Bileşen — kaynak taraması
// ---------------------------------------------------------------------------

describe('tarama boşa düşmüyor', () => {
  it('dosyalar okundu ve beklenen gövdeleri taşıyor', () => {
    expect(SIHIRBAZ).toContain('export function KurulumSihirbazi(');
    expect(govde(SIHIRBAZ, 'async function workspaceKur(').length).toBeGreaterThan(500);
    expect(SAYFA).toContain('KurulumSihirbazi');
  });
});

describe('KRİTİK: workspace TEK çağrıyla kuruluyor', () => {
  const kur = govde(SIHIRBAZ, 'async function workspaceKur(');

  it("uç /clients/setup — parça parça atama yok", () => {
    expect(kur).toContain("'/clients/setup'");
    expect(SIHIRBAZ).not.toContain('/connections/ad-accounts/');
    expect(SIHIRBAZ).not.toContain("apiFetch('/clients',");
  });

  it('seçilenler reklam hesabı ve profil diye ayrılıyor', () => {
    expect(kur).toContain('o.reklamHesabi && secili.has(o.id)');
    expect(kur).toContain('adAccountIds');
    expect(kur).toContain('socialProfileIds');
  });

  it('KRİTİK: boost hesabı, özel kategori ve site gövdeye giriyor', () => {
    // Üçü de kurulumun yalnızca sistemi kuran kişinin bildiği kuralı;
    // biri gövdeden düşerse ekran sorar ama hiçbir yere yazılmaz.
    expect(kur).toContain('boostHesabiId: boost.hesapId');
    expect(kur).toContain('specialAdCategories: kategoriler');
    expect(kur).toContain('siteAdresiDuzelt(site)');
    expect(kur).toContain('contactEmails: alicilar');
  });

  it('KRİTİK: başarıdan sonra adres sihirbazın başına çekiliyor', () => {
    // Yenilemede "Hesaplar" adımı boş açılır ve aynı workspace ikinci kez
    // kurulurdu.
    expect(kur.indexOf("window.history.replaceState(null, '', '/kurulum')")).toBeGreaterThan(
      kur.indexOf('setSonuc(r)'),
    );
  });

  it('boost hesabı seçilmeden kurulum düğmesi kapalı', () => {
    expect(SIHIRBAZ).toContain("eksik: boost.durum === 'secilmeli' ? 'Boost hesabını seç' : null");
    expect(SIHIRBAZ).toContain('disabled={busy || adim.eksik !== null}');
  });
});

describe('KRİTİK: üst hesap ve şirket — kur, GEÇ, tam sayfa', () => {
  it('şirket: oluştur → switch-org (yeni kimlikle) → replace', () => {
    /*
     * Geçmeden devam etmek Meta'yı ve workspace'i ESKİ şirkete kurardı.
     */
    const g = govde(SIHIRBAZ, 'async function sirketKur(');
    const olustur = g.indexOf("'/manager-account/organizations'");
    const gec = g.indexOf("'/auth/switch-org'");
    const sayfa = g.indexOf("window.location.replace(kurulumAdresi(tur, 'baglantilar'))");
    expect(olustur).toBeGreaterThan(-1);
    expect(gec).toBeGreaterThan(olustur);
    expect(sayfa).toBeGreaterThan(gec);
    expect(g).toContain('id = r.olusturulanSirketId');
    expect(g).toContain('organizationId: id');
  });

  it('üst hesap: oluştur → switch-manager → replace', () => {
    const g = govde(SIHIRBAZ, 'async function ustHesapKur(');
    const olustur = g.indexOf("'/manager-account'");
    const gec = g.indexOf("'/auth/switch-manager'");
    const sayfa = g.indexOf("window.location.replace(kurulumAdresi(tur, 'baglantilar'))");
    expect(olustur).toBeGreaterThan(-1);
    expect(gec).toBeGreaterThan(olustur);
    expect(sayfa).toBeGreaterThan(gec);
    expect(g).toContain('managerAccountId: id');
  });

  it('KRİTİK: paket ve şirket adı YALNIZCA platform sahibinde gönderiliyor', () => {
    // Org yöneticisinde sunucu bu alanları reddediyor; göndermek kurulumu
    // düşürürdü.
    const g = govde(SIHIRBAZ, 'async function ustHesapKur(');
    expect(g).toContain('...(baglam.platformAdmin ? { paket, sirketAdi: sirketAdi.trim() } : {})');
  });

  it('KRİTİK: ikinci basış İKİNCİ kayıt açmıyor — kimlik tutuluyor', () => {
    for (const ad of ['async function ustHesapKur(', 'async function sirketKur(']) {
      const g = govde(SIHIRBAZ, ad);
      expect(g, ad).toContain('let id = kurulanId;');
      expect(g, ad).toMatch(/if \(id === null\) \{[\s\S]*?setKurulanId\(id\);/);
      /*
       * HATA MESAJI YEREL KİMLİĞE BAKIYOR. Durum bu çağrının içinde
       * güncellenmediği için `kurulanId` okumak, oluşturma başarılı olup
       * geçiş düştüğünde "kurulamadı" demek olurdu.
       */
      const yakala = g.slice(g.indexOf('} catch'));
      expect(yakala, ad).toContain('id === null');
      expect(yakala, ad).not.toContain('kurulanId === null');
    }
  });

  it('`replace` — geri tuşu boş kurma formuna döndürmüyor', () => {
    expect(SIHIRBAZ).not.toMatch(/window\.location\.assign\(kurulumAdresi/);
  });
});

describe('platform adımı', () => {
  const g = govde(SIHIRBAZ, 'async function bagla(');

  it('KRİTİK: bağlantı dönüşü SİHİRBAZIN AYNI ADIMINA', () => {
    expect(g).toContain("redirectTo: kurulumAdresi(tur, 'baglantilar')");
  });

  it('yetkisi düşmüş bağlantı onay ekranını zorluyor', () => {
    expect(g).toContain('...(yeniden ? { forceReconsent: true } : {})');
  });

  it('dönüş sonucu ekranda (banner) ve liste hatası yutulmuyor', () => {
    // Parametre listesi de süslü parantezle açılıyor; gövde sayılamaz,
    // bileşen bir sonraki bileşenin başına kadar alınıyor.
    const bas = SIHIRBAZ.indexOf('function PlatformAdimi(');
    const p = SIHIRBAZ.slice(bas, SIHIRBAZ.indexOf('function Alan(', bas));
    expect(bas).toBeGreaterThan(-1);
    expect(p).toContain('<CallbackBanner />');
    expect(p).toContain('Bağlantılar okunamadı: {yuklemeHatasi}');
  });

  it('KRİTİK: "her şirket kendi bağlantısını kullanır" yazılı', () => {
    expect(SIHIRBAZ).toContain('Her şirket kendi bağlantısını kullanır.');
  });
});

describe('sessiz kalmayan yerler', () => {
  it('KRİTİK: kısmi başarı ekranda — sebepleriyle', () => {
    expect(SONUC).toContain('sonuc.failures.map');
    expect(SONUC).toContain('{f.reason}');
  });

  it('KRİTİK: boost hesabı bağlanmayan sayfa sayısı yazılı', () => {
    expect(SONUC).toContain('boostSayfaSayisi - sonuc.boostBaglanan');
  });

  it('yönetici (MCC) hesabı listede ama seçilemiyor', () => {
    expect(SECIM).toContain('disabled={o.isManager}');
  });

  it('kaç hesap gösterildiği yazılı — sessiz kesme yok', () => {
    expect(SECIM).toContain('{liste.length} / {ogeler.length} hesap');
  });

  it('parolanın elden iletileceği yazılı — davet e-postası yok', () => {
    expect(SIHIRBAZ).toContain('Davet e-postası gönderilmiyor');
  });

  it('havuz ORTAK yardımcıdan — ikinci profil eşlemesi yok', () => {
    expect(SIHIRBAZ).toContain('havuzlariCikar(baglantilar)');
    expect(SIHIRBAZ + SECIM).not.toContain("'instagram_business'");
  });
});

describe('sayfa', () => {
  it('KRİTİK: engel yalnızca İLK adımda sınanıyor', () => {
    // Üst hesabı az önce kuran kullanıcı "zaten bir üst hesabın var"
    // kuralına takılıp kendi sihirbazından atılırdı.
    expect(SAYFA).toContain('const ilkAdimda = tur !== null && ilkAdim === ADIMLAR[tur][0];');
    expect(SAYFA).toContain('!(ilkAdimda && kart?.engel)');
  });

  it('KRİTİK: "tüm şirketler" modunda önce şirket seçiliyor', () => {
    // O modda workspace EV şirketine kurulurdu ve kimse söylemezdi.
    expect(SAYFA).toMatch(/tur === 'workspace' && session\.tumSirketler && ma\)[\s\S]{0,300}<SirketSec/);
  });
});

describe('KRİTİK: eski kurulum yolları sihirbaza gidiyor', () => {
  it('workspace bölümü', () => {
    expect(WORKSPACE_BOLUMU).toContain('href="/kurulum?tur=workspace"');
    expect(WORKSPACE_BOLUMU).not.toContain('ClientSetupWizard');
  });

  it('şirketler ekranı: şirket ekle ve üst hesap kur', () => {
    expect(SIRKETLER).toContain('href="/kurulum?tur=sirket"');
    expect(SIRKETLER).toContain('href="/kurulum?tur=ust-hesap"');
    expect(SIRKETLER).not.toContain("gonder('/manager-account', { name })");
  });
});
