import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { ConnectionSummary, ProviderAvailability } from '@advetics/shared';
import {
  ADIMLAR,
  KURULUM_TURLERI,
  adimOku,
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
const PLATFORM = oku('platform-adimi.tsx');
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
      // AÇILIŞ YALNIZ AÇAR (kurulum sihirbazı Ç-7): son adım workspace, hesaplar tamamlamada.
      expect(a.at(-1), t).toBe('workspace');
      expect(a as readonly string[], t).not.toContain('hesaplar');
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
    // Eski yer imi (`hesaplar`) ilk adıma düşer: o adım artık tamamlamada.
    expect(adimOku('sirket', 'hesaplar')).toBe('sirket');
    expect(adimOku('sirket', 'ust-hesap')).toBe('sirket');
    expect(adimOku('workspace', undefined)).toBe('baglantilar');
  });

  it('eski "bitti" adresi de ilk adıma düşer', () => {
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
    expect(govde(SIHIRBAZ, 'async function workspaceKur(').length).toBeGreaterThan(400);
    expect(PLATFORM).toContain('export function PlatformAdimi(');
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

  it('KRİTİK: açılış HESAP ATAMAZ — hesaplar tamamlamanın adımlarından tek yoldan (Ç-7)', () => {
    // İki atama yolu ayrışırdı: açılışın boost kararı ile kurulumun sayfa
    // adımı aynı soruyu iki ayrı kuralla cevaplıyordu.
    expect(kur).toContain('adAccountIds: []');
    expect(kur).toContain('socialProfileIds: []');
    expect(SIHIRBAZ).not.toContain('boostHesabiId');
    expect(SIHIRBAZ).not.toContain('HesapSecimi');
  });

  it('KRİTİK: özel kategori, site ve rapor alıcıları gövdeye giriyor', () => {
    // Biri gövdeden düşerse ekran sorar ama hiçbir yere yazılmaz.
    expect(kur).toContain('specialAdCategories: kategoriler');
    expect(kur).toContain('siteAdresiDuzelt(site)');
    expect(kur).toContain('contactEmails: alicilar');
  });

  it('KRİTİK: açıldıktan sonra adres başa çekiliyor, kısmi başarı ekranda kalıyor', () => {
    // Yenileme/geri tuşu formu yeniden açıp AYNI adla ikinci workspace açardı.
    const bas = kur.indexOf("window.history.replaceState(null, '', kurulumAdresi(tur, ADIMLAR[tur][0]!))");
    expect(bas).toBeGreaterThan(kur.indexOf("'/clients/setup'"));
    // `failures` varsa GEÇİLMEZ: sonuç ekranda, geçiş kullanıcının tıkıyla.
    expect(kur.indexOf('if (r.failures.length > 0)')).toBeGreaterThan(bas);
    expect(kur.indexOf('await workspaceeGec(r.clientId)')).toBeGreaterThan(kur.indexOf('if (r.failures.length > 0)'));
    // İkinci basış ikinci workspace açmıyor.
    expect(kur.indexOf('if (sonuc) return workspaceeGec(sonuc.clientId)')).toBeLessThan(kur.indexOf("'/clients/setup'"));
  });

  it('ad yazılmadan düğme kapalı', () => {
    expect(SIHIRBAZ).toContain("eksik: wsGecerli ? null : 'Workspace adını yaz'");
    expect(SIHIRBAZ).toContain('kapali: busy || adim.eksik !== null,');
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
  const g = govde(PLATFORM, 'async function bagla(');

  it('KRİTİK: bağlantı dönüşü SİHİRBAZIN AYNI ADIMINA', () => {
    // Bileşen dönüşü çağırandan alıyor; açılış kendi adımını, tamamlama kendi adımını veriyor.
    expect(g).toContain('redirectTo,');
    expect(SIHIRBAZ).toContain("redirectTo={kurulumAdresi(tur, 'baglantilar')}");
    expect(oku('tamamlama.tsx')).toContain("redirectTo={sihirbazAdresi(clientId, 'baglantilar')}");
  });

  it('yetkisi düşmüş bağlantı onay ekranını zorluyor', () => {
    expect(g).toContain('...(yeniden ? { forceReconsent: true } : {})');
  });

  it('dönüş sonucu ekranda (banner) ve liste hatası yutulmuyor', () => {
    // Parametre listesi de süslü parantezle açılıyor; gövde sayılamaz,
    // bileşen bir sonraki bileşenin başına kadar alınıyor.
    expect(PLATFORM).toContain('<CallbackBanner />');
    expect(PLATFORM).toContain('Bağlantılar okunamadı: {yuklemeHatasi}');
  });

  it('KRİTİK: AJANSIN bağlantısı yeni şirkette de kullanılır — "her şirket yeniden bağlansın" YOK (Ç-2)', () => {
    /*
     * Eski cümle kullanıcıyı ajansın kimliğini şirket başına yeniden
     * yetkilendirmeye gönderiyordu; bu önceki token'ı geçersiz kılıp bütün
     * şirketlerin bağlantısını koparıyordu.
     */
    expect(PLATFORM).not.toContain('Her şirket kendi bağlantısını kullanır.');
    expect(PLATFORM).toContain('Ajansın Meta ve Google bağlantısı bu şirkette de kullanılır; yeniden bağlanma.');
  });

  it('KRİTİK: ajansın DÜŞMÜŞ bağlantısına "Yeniden bağla" sunulmuyor (Ç-2)', () => {
    // Yanlış kişinin token'ı ajansın satırına yazılırdı.
    expect(PLATFORM).toContain("const ajansin = (d.durum === 'bagli' || d.durum === 'yeniden') && d.baglanti.sahip === 'ajans';");
    expect(PLATFORM).toContain("(d.durum === 'yok' || (d.durum === 'yeniden' && !ajansin)) && yonetebilir");
  });

  it('kurulum-akisi.ts eskimiş "yeni şirkette yeniden bağlanmak zorunda" yorumunu taşımıyor', () => {
    const ham = readFileSync(join(__dirname, 'kurulum-akisi.ts'), 'utf8');
    expect(ham).not.toContain('Yeni bir şirkette Meta ve Google yeniden bağlanmak\n * zorunda');
    expect(ham).toContain('AJANSIN BAĞLANTISI YENİ ŞİRKETTE DE GÖRÜNÜR');
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

  it('kısmi başarıda sonuç ekranda çiziliyor', () => {
    expect(SIHIRBAZ).toContain('<KurulumSonucu sonuc={sonuc} boostSayfaSayisi={0} />');
  });
});

describe('sayfa', () => {
  it('KRİTİK: engel yalnızca İLK adımda sınanıyor', () => {
    // Üst hesabı az önce kuran kullanıcı "zaten bir üst hesabın var"
    // kuralına takılıp kendi sihirbazından atılırdı.
    expect(SAYFA).toContain('const ilkAdimda = ilkAdim === ADIMLAR[tur][0];');
    expect(SAYFA).toContain('!(ilkAdimda && kart?.engel)');
  });

  it('KRİTİK: "tüm şirketler" modunda önce şirket seçiliyor', () => {
    // O modda workspace EV şirketine kurulurdu ve kimse söylemezdi.
    expect(SAYFA).toMatch(/tur === 'workspace' && session\.tumSirketler && ma\)[\s\S]{0,300}<SirketSec/);
  });
});

describe('KRİTİK: eski kurulum yolları sihirbaza gidiyor', () => {
  it('workspace bölümü', () => {
    expect(WORKSPACE_BOLUMU).toContain("href={acilisAdresi('workspace')}");
    expect(WORKSPACE_BOLUMU).not.toContain('ClientSetupWizard');
  });

  it('şirketler ekranı: şirket ekle ve üst hesap kur', () => {
    expect(SIRKETLER).toContain("href={acilisAdresi('sirket')}");
    expect(SIRKETLER).toContain("href={acilisAdresi('ust-hesap')}");
    expect(SIRKETLER).not.toContain("gonder('/manager-account', { name })");
  });
});

/**
 * Sihirbazın adı ve sonu (kurulum sihirbazı Ç-9, 2026-10-13). Sayfanın adı
 * artık "Kurulum sihirbazı" (`SIHIRBAZ_ADI`): iki ekran AYNI listenin iki
 * görünümü ve karışma sebebi kalktı. `ACILIS_ADI` açılış hâlinin başlığı.
 * Açılışın sonu tamamlama modu: yeni workspace'e GEÇ, sonra aynı sihirbaz.
 */
describe('KRİTİK: sihirbazın adı ve açılışın sonu', () => {
  it('sekme başlığı SIHIRBAZ_ADI sabitinden türüyor, düz dize yok', () => {
    expect(SAYFA).toContain('export const metadata = { title: `${SIHIRBAZ_ADI} · Advetics` };');
    // Açılış başlığı (tür kartı yoksa) ACILIS_ADI'nda.
    expect(SAYFA).toContain('{kart?.baslik ?? ACILIS_ADI}');
    expect(SAYFA).not.toMatch(/['"`]Kurulum sihirbazı/);
    expect(SAYFA).not.toMatch(/['"`]Açılış/);
  });

  it('KRİTİK: açılışın sonu önce workspace’e GEÇİYOR, sonra tamamlama moduna gidiyor', () => {
    const g = govde(SIHIRBAZ, 'async function workspaceeGec(');
    const gecis = g.indexOf("'/auth/switch-client'");
    const hedef = g.indexOf('window.location.assign(sihirbazAdresi(clientId))');
    expect(gecis).toBeGreaterThan(-1);
    expect(hedef).toBeGreaterThan(gecis);
    expect(g).not.toContain('/dashboard');
  });
});
