import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { KURULUM_HATA_KODLARI, ROLE_PERMISSIONS, SITE_YOK_SEBEBI, kapiAcikMi, startOAuthSchema, type KurulumBeyani } from '@advetics/shared';
import { KURULUM_LISTESI, sihirbazAdresi, type KurulumSayaci } from '@/lib/panel-adresleri';
import { YOKLAMA_SINIRI } from '@/components/marka-merkezi/hazirlama-mantik';
import { acikSiteKapisiyla, amacSiteSebebi, platformDurumu, siteKapisiyla } from '@/components/rehber/rehber-mantik';
import {
  SERIT_GIZLEME_MS,
  SIHIRBAZ_SIRASI,
  acilisAdimi,
  adimBeyanlari,
  baslangicSirasi,
  hukum,
  istekSonucu,
  oncekiAdim,
  otomatikDurumu,
  seritGorunur,
  sihirbazModu,
  sirketKurulumuOku,
  sonrakiAdim,
  beyanDizisi,
  yoklamaKarari,
} from './sihirbaz-akisi';

/**
 * ═══ KURULUM SİHİRBAZI — EKRAN KARARLARI (docs/kurulum-sihirbazi/MIMARI.md § 10 "Panel") ═══
 *
 * Kararlar saf fonksiyonda ve ÇALIŞTIRILARAK sınanıyor; bileşenler için
 * yorumsuz kaynakta tarama var ve her tarama önce gövdenin gerçekten
 * yakalandığını doğruluyor (CLAUDE.md "tarama boşa düşebilir").
 */

const sayac = (s: Partial<KurulumSayaci>): KurulumSayaci => ({ tamam: 0, toplam: 10, kapsamDisi: 0, bilinmiyor: 0, bitti: false, ...s });
const hata = (status: number, mesaj: string, code = 'CONFLICT') => Object.assign(new Error(mesaj), { status, code });

describe('adres → hâl', () => {
  it('KRİTİK: `musteri` `tur`dan ÖNCE — OAuth dönüşü kaldığı adıma döner', () => {
    const id = '0b6c3c1e-2f5d-4a8e-9c1f-6a1b2c3d4e5f';
    expect(sihirbazModu({ musteri: id, tur: 'workspace', adim: 'olcum' })).toEqual({ tur: 'tamamlama', musteri: id, adim: 'olcum' });
    expect(sihirbazModu({ tur: 'sirket', adim: 'baglantilar' })).toEqual({ tur: 'acilis', acilisTuru: 'sirket', adim: 'baglantilar' });
    expect(sihirbazModu({})).toEqual({ tur: 'baslangic' });
  });

  it('kesilmiş kimlik başlangıca, tanınmayan adım "kendisi seçsin"e düşer', () => {
    expect(sihirbazModu({ musteri: '1f3a' })).toEqual({ tur: 'baslangic' });
    expect(sihirbazModu({ musteri: '0b6c3c1e-2f5d-4a8e-9c1f-6a1b2c3d4e5f', adim: 'hesaplar' })).toMatchObject({ adim: null });
  });

  it('ray sırası listelerden türüyor: şirket, workspace (KURULUM_LISTESI sırasıyla), son kontrol', () => {
    expect(SIHIRBAZ_SIRASI.slice(0, 2)).toEqual(['baglantilar', 'guvenlik']);
    expect(SIHIRBAZ_SIRASI.slice(2, -1)).toEqual(KURULUM_LISTESI.map((a) => a.kod));
    expect(SIHIRBAZ_SIRASI.at(-1)).toBe('son');
  });
});

describe('gezinme', () => {
  it('KRİTİK: açılış adımı ilk BİTMEMİŞ adım; okunamayan ATLANMAZ', () => {
    expect(acilisAdimi({ baglantilar: 'tamam', guvenlik: 'kapsam_disi', bilgiler: 'tamam', meta: 'kullanilmiyor', sayfa: 'bilinmiyor' })).toBe('sayfa');
    const hepsi = Object.fromEntries(SIHIRBAZ_SIRASI.map((k) => [k, 'tamam' as const]));
    expect(acilisAdimi(hepsi)).toBe('son');
  });

  it('KRİTİK: "Devam" bir sonraki bitmemiş adıma, kalmadıysa son kontrole', () => {
    const d = { piksel: 'tamam', google: 'kullanilmiyor', olcum: 'kapsam_disi', marka: 'eksik' } as const;
    expect(sonrakiAdim('sayfa', d)).toBe('marka');
    expect(sonrakiAdim('veri', {})).toBe('son');
    expect(sonrakiAdim('son', {})).toBe('son');
  });

  it('"Geri" sıradaki bir önceki durak, bitmiş olsa da', () => {
    expect(oncekiAdim('bilgiler')).toBe('guvenlik');
    expect(oncekiAdim('baglantilar')).toBeNull();
  });
});

describe('KRİTİK: istek düşüşü — hata mı bekleme mi (MIMARI § 3d), dört hâl ayrı', () => {
  it('409 + KURULUM_SURUYOR kodu → bekleme (kilit), hata DEĞİL — METİN ne derse desin', () => {
    expect(istekSonucu(hata(409, 'Bu workspace’te bir kurulum işlemi zaten sürüyor.', KURULUM_HATA_KODLARI.suruyor))).toEqual({ tur: 'yoklama', neden: 'kilit' });
    // Metin değişse de kod aynıysa bekleme: ayıran kod.
    expect(istekSonucu(hata(409, 'Başka bir işlem var.', KURULUM_HATA_KODLARI.suruyor))).toEqual({ tur: 'yoklama', neden: 'kilit' });
  });

  it('KRİTİK: 409 "önce bu workspace’i seç" → MESAJ; metninde "sürüyor" geçse bile kodu yoksa ya da başka kodsa bekleme DEĞİL', () => {
    expect(istekSonucu(hata(409, 'Değişiklik için önce üstten bu workspace’i seç.', KURULUM_HATA_KODLARI.workspaceSecilmeli))).toEqual({
      tur: 'mesaj',
      mesaj: 'Değişiklik için önce üstten bu workspace’i seç.',
    });
    expect(istekSonucu(hata(409, 'İşlem sürüyor gibi görünüyor.', 'CONFLICT'))).toMatchObject({ tur: 'mesaj' });
    expect(istekSonucu(hata(409, 'İşlem sürüyor.', KURULUM_HATA_KODLARI.sirketSecilmeli))).toMatchObject({ tur: 'mesaj' });
  });

  it('durum kodu yok (ağ koptu) → bekleme: işlem sunucuda sürüyor olabilir, "düştü" denmez', () => {
    expect(istekSonucu(new TypeError('Failed to fetch'))).toEqual({ tur: 'yoklama', neden: 'ag' });
  });

  it('502/503/504 → bekleme (ters vekil beklemeyi bıraktı, uygulama değil)', () => {
    for (const s of [502, 503, 504]) expect(istekSonucu(hata(s, 'İstek başarısız'))).toEqual({ tur: 'yoklama', neden: 'zaman_asimi' });
  });

  it('4xx / 500 → platformun KENDİ mesajı', () => {
    expect(istekSonucu(hata(400, 'Tag Manager: konteynerde yayınlanmamış 3 değişiklik var'))).toEqual({
      tur: 'mesaj',
      mesaj: 'Tag Manager: konteynerde yayınlanmamış 3 değişiklik var',
    });
    expect(istekSonucu(hata(500, 'Beklenmeyen'))).toMatchObject({ tur: 'mesaj' });
  });

  it('yoklama adımın görünen hâli DEĞİŞİNCE biter, değişmezse sınırda durur', () => {
    expect(yoklamaKarari('a', 'b', 0)).toBe('bitti');
    expect(yoklamaKarari('a', 'a', 0)).toBe('devam');
    expect(yoklamaKarari('a', 'a', YOKLAMA_SINIRI - 1)).toBe('devam');
    expect(yoklamaKarari('a', 'a', YOKLAMA_SINIRI)).toBe('sinir');
  });
});

describe('alt çubuk', () => {
  it('KRİTİK: "Otomatik yap" pasifken SEBEBİ yazılı — kaybolan düğme "nereye gitti" sorusu', () => {
    const bos = { kurulumAdimlari: [], hazirlamaYeniden: false, kullaniciyaKalan: [], yapacakVar: false };
    expect(otomatikDurumu({ ...bos, yapacakVar: true }, { yazabilir: true, aktifDegil: false })).toEqual({ acik: true, neden: null });
    expect(otomatikDurumu({ ...bos, yapacakVar: true }, { yazabilir: false, aktifDegil: false }).acik).toBe(false);
    expect(otomatikDurumu({ ...bos, yapacakVar: true }, { yazabilir: true, aktifDegil: true }).neden).toContain('geç');
    const kalan = otomatikDurumu({ ...bos, kullaniciyaKalan: [{ adim: 'olcum', neden: 'Sitedeki kod bulunamadı.' }] }, { yazabilir: true, aktifDegil: false });
    expect(kalan.acik).toBe(false);
    expect(kalan.neden).toContain('Sitedeki kod bulunamadı.');
  });

  it('KRİTİK: "Bunu kullanmıyorum" listeden türüyor; ödeme/hesap/marka/veri BEYANLA KAPANMAZ', () => {
    expect(adimBeyanlari('bilgiler')).toEqual([
      { tur: 'oge', oge: 'site_yok' },
      { tur: 'oge', oge: 'adres' },
    ]);
    expect(adimBeyanlari('olcum')).toEqual([{ tur: 'oge', oge: 'site_yok' }]);
    expect(adimBeyanlari('piksel')).toEqual([
      { tur: 'platform', platform: 'meta' },
      { tur: 'oge', oge: 'site_yok' },
    ]);
    expect(adimBeyanlari('bildirimler')).toEqual([
      { tur: 'oge', oge: 'bildirim' },
      { tur: 'oge', oge: 'erisim' },
    ]);
    // Ödeme ve hesap: yalnız platformun BÜTÜNÜYLE kullanılmaması kapatır.
    expect(adimBeyanlari('meta')).toEqual([{ tur: 'platform', platform: 'meta' }]);
    for (const k of ['varsayilanlar', 'veri'] as const) expect(adimBeyanlari(k), k).toEqual([]);
    // Marka adımında yalnız SİTE TARAMASI parçası kapanabilir; marka alanları ve logo kapanmaz.
    expect(adimBeyanlari('marka')).toEqual([{ tur: 'oge', oge: 'site_yok' }]);
  });
});

describe('beyanların okunuşu', () => {
  it('KRİTİK: TEK biçim dizi — dizi değilse OKUNAMADI (`null`), boş dizi "beyan yok"', () => {
    expect(beyanDizisi([])).toEqual([]);
    expect(beyanDizisi(null)).toBeNull();
    expect(beyanDizisi(undefined)).toBeNull();
    // Eski "yanıtta alan" biçimi artık okunmuyor: nesne = biçim bilinmiyor.
    expect(beyanDizisi({ beyanlar: [] })).toBeNull();
  });

  it('tanınmayan öğe atılır, listenin tamamı "okunamadı" yapılmaz', () => {
    const b: KurulumBeyani = { oge: 'adres', clientId: 'c', gerekce: null, beyanEden: null, tarih: '2026-10-13T10:00:00Z' };
    expect(beyanDizisi([b, { oge: 'yeni_bir_sey' }])).toEqual([b]);
  });
});

describe('KRİTİK: şirket kurulumu yanıtı (`GET /kurulum/sirket`, entegrasyon)', () => {
  const ORG = '11111111-1111-1111-1111-111111111111';
  const tam = { orgId: ORG, sirketAdi: 'Ege', ikiAdimZorunlu: false, beyanlar: [], workspaceler: [], kullanilanPlatformlar: ['google'] };

  it('tam yanıt okunur; platform listesi sunucudan, tanınmayan değer atılır', () => {
    const r = sirketKurulumuOku({ ok: true, v: { ...tam, kullanilanPlatformlar: ['google', 'tiktok'] } }, { tumSirketler: false, workspaceOrgId: ORG });
    expect(r).toMatchObject({ ok: true, v: { kullanilanPlatformlar: ['google'], ikiAdimZorunlu: false, beyanlar: [] } });
  });

  it('KRİTİK: "tüm şirketler" görünümünde OKUNAMADI — sunucunun şirketi ev şirketi, workspace kardeş şirketin olabilir', () => {
    const r = sirketKurulumuOku({ ok: true, v: tam }, { tumSirketler: true, workspaceOrgId: ORG });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.hata).toContain('Tüm şirketler');
  });

  it('KRİTİK: yanıtın şirketi workspace’in şirketi değilse OKUNAMADI (başlık ≠ gövde)', () => {
    expect(sirketKurulumuOku({ ok: true, v: tam }, { tumSirketler: false, workspaceOrgId: '22222222-2222-2222-2222-222222222222' }).ok).toBe(false);
    // Başlangıç ekranında workspace yok: karşılaştırma yapılmaz.
    expect(sirketKurulumuOku({ ok: true, v: tam }, { tumSirketler: false, workspaceOrgId: null }).ok).toBe(true);
  });

  it('KRİTİK: eksik alan "beyan yok" / "hiçbir platform" DEĞİL — okunamadı', () => {
    const o = { tumSirketler: false, workspaceOrgId: ORG };
    for (const bozuk of [{ ...tam, beyanlar: undefined }, { ...tam, kullanilanPlatformlar: undefined }, { orgId: ORG }, null]) {
      expect(sirketKurulumuOku({ ok: true, v: bozuk }, o).ok, JSON.stringify(bozuk)).toBe(false);
    }
    expect(sirketKurulumuOku({ ok: false, hata: 'x' }, o)).toEqual({ ok: false, hata: 'x' });
  });
});

describe('KRİTİK: OAuth dönüşü sunucunun beyaz listesinden geçiyor', () => {
  it('her adımın sihirbaz adresi `redirectTo` kuralına uyar (yoksa sunucu dönüşü düşürür, kullanıcı başlangıca düşer)', () => {
    const id = '0b6c3c1e-2f5d-4a8e-9c1f-6a1b2c3d4e5f';
    for (const k of SIHIRBAZ_SIRASI) {
      const a = sihirbazAdresi(id, k);
      expect(startOAuthSchema.shape.redirectTo.safeParse(a).success, a).toBe(true);
      expect(sihirbazModu(Object.fromEntries(new URL(a, 'https://x').searchParams))).toEqual({ tur: 'tamamlama', musteri: id, adim: k });
    }
  });

  it('açık yönlendirme reddediliyor: protokol-göreli, mutlak ve ters bölü', () => {
    for (const kotu of ['//evil.com', 'https://evil.com', '/\\evil.com', 'evil.com', '/kurulum\n']) {
      expect(startOAuthSchema.shape.redirectTo.safeParse(kotu).success, kotu).toBe(false);
    }
  });
});

describe('KRİTİK: client_viewer rolü sihirbaza giremez', () => {
  it('sayfa kapısı (`markaMerkezi.gor`) client_viewer rolünde kapalı, yönetici ve reklam yöneticisinde açık', () => {
    const oturum = (rol: keyof typeof ROLE_PERMISSIONS) => ({ permissions: [...ROLE_PERMISSIONS[rol]], isOrgAdmin: rol === 'admin', platformAdmin: false, managerAccount: null });
    expect(kapiAcikMi(oturum('client_viewer'), 'markaMerkezi.gor')).toBe(false);
    expect(kapiAcikMi(oturum('client_viewer'), 'kurulum.yaz')).toBe(false);
    expect(kapiAcikMi(oturum('ad_manager'), 'markaMerkezi.gor')).toBe(true);
    expect(kapiAcikMi(oturum('admin'), 'markaMerkezi.gor')).toBe(true);
  });
});

describe('son kontrol hükmü', () => {
  it('KRİTİK: okunamayan adım varken ASLA "Hiç eksik yok"; okunamayan AYRI söylenir', () => {
    const s = sayac({ tamam: 2, toplam: 2, bitti: true });
    expect(hukum(s, sayac({ tamam: 9, toplam: 10, bilinmiyor: 1 }))).toMatchObject({ tamam: false, baslik: '1 adım okunamadı' });
    expect(hukum(s, sayac({ tamam: 7, toplam: 10, bilinmiyor: 1 })).baslik).toBe('2 iş kaldı · 1 adım okunamadı');
    expect(hukum(s, sayac({ tamam: 9, toplam: 9, kapsamDisi: 1, bitti: true }))).toMatchObject({ tamam: true, baslik: 'Hiç eksik yok' });
  });

  it('şirket bitmemişse workspace bitmiş olsa da "hiç eksik yok" DEĞİL', () => {
    expect(hukum(sayac({ tamam: 1, toplam: 2 }), sayac({ tamam: 10, toplam: 10, bitti: true })).tamam).toBe(false);
  });
});

describe('başlangıç sırası', () => {
  it('en çok eksiği olan üstte; okunmayan/okunamayan EN ALTTA (bilinmeyeni "0 eksik" saymak bitmiş gösterirdi)', () => {
    const sira = baslangicSirasi([
      { id: 'a', ad: 'Bornova', sayac: sayac({ tamam: 11, toplam: 11, bitti: true }) },
      { id: 'b', ad: 'Narlıdere', sayac: sayac({ tamam: 8, toplam: 12 }) },
      { id: 'c', ad: 'Alsancak', sayac: null },
      { id: 'd', ad: 'Kurumsal', sayac: undefined },
      { id: 'e', ad: 'Karşıyaka', sayac: sayac({ tamam: 11, toplam: 12 }) },
    ]);
    expect(sira.map((s) => s.id)).toEqual(['b', 'e', 'a', 'c', 'd']);
  });
});

describe('Genel Bakış şeridi', () => {
  const simdi = Date.UTC(2026, 9, 13);
  const eksik = sayac({ tamam: 7, toplam: 10 });

  it('KRİTİK: yalnız kurulumu YAPABİLENE (müşteri hesabı görmez)', () => {
    expect(seritGorunur({ yazabilir: false, sayac: eksik, gizlendi: null, simdi })).toBe(false);
    expect(seritGorunur({ yazabilir: true, sayac: eksik, gizlendi: null, simdi })).toBe(true);
  });

  it('KRİTİK: "Kapat" 7 gün gizler; süre dolunca geri gelir', () => {
    expect(seritGorunur({ yazabilir: true, sayac: eksik, gizlendi: simdi - SERIT_GIZLEME_MS + 1000, simdi })).toBe(false);
    expect(seritGorunur({ yazabilir: true, sayac: eksik, gizlendi: simdi - SERIT_GIZLEME_MS - 1000, simdi })).toBe(true);
  });

  it('sayaç okunamadıysa ya da kalan her adım okunamadıysa şerit YOK (yanlış alarm)', () => {
    expect(seritGorunur({ yazabilir: true, sayac: null, gizlendi: null, simdi })).toBe(false);
    expect(seritGorunur({ yazabilir: true, sayac: sayac({ tamam: 8, toplam: 10, bilinmiyor: 2 }), gizlendi: null, simdi })).toBe(false);
    expect(seritGorunur({ yazabilir: true, sayac: sayac({ tamam: 10, toplam: 10, bitti: true }), gizlendi: null, simdi })).toBe(false);
  });
});

describe('KRİTİK: AdvCampaign — "web sitemiz yok" kapısı (kullanıcı kararı 2)', () => {
  it('site isteyen amaç kartı kapalı ve sebebi SITE_YOK_SEBEBI; beyan yoksa ya da okunamadıysa açık', () => {
    expect(amacSiteSebebi('SITE', false, true)).toBe(SITE_YOK_SEBEBI);
    expect(amacSiteSebebi('SATIS', true, true)).toBe(SITE_YOK_SEBEBI);
    expect(amacSiteSebebi('SITE', false, false)).toBeNull();
    expect(amacSiteSebebi('SITE', false, null)).toBeNull();
  });

  it('bir platform açık kalıyorsa kart seçilebilir; kapanan platform sebebiyle kapalı görünür', () => {
    // Arama amacı: Meta site istemiyor, Google istiyor.
    expect(amacSiteSebebi('TELEFON', true, true)).toBeNull();
    const g = siteKapisiyla(platformDurumu('TELEFON', 'google', true), 'TELEFON', 'google', true);
    expect(g).toEqual({ gorunur: false, sebep: SITE_YOK_SEBEBI, deneme: false });
    expect(siteKapisiyla(platformDurumu('TELEFON', 'meta', true), 'TELEFON', 'meta', true).gorunur).toBe(true);
  });

  it('KRİTİK: site isteyen platform AÇIK sayılmaz (kurulum o platformu içermesin)', () => {
    expect(acikSiteKapisiyla({ meta: true, google: true }, 'TELEFON', true)).toEqual({ meta: true, google: false });
    expect(acikSiteKapisiyla({ meta: true, google: true }, 'TELEFON', null)).toEqual({ meta: true, google: true });
    expect(acikSiteKapisiyla({ meta: true, google: true }, null, true)).toEqual({ meta: true, google: true });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Kaynak taraması
// ─────────────────────────────────────────────────────────────────────────────

const KOK = join(__dirname, '..', '..');
const yorumsuz = (m: string): string =>
  m
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
const oku = (yol: string): string => yorumsuz(readFileSync(join(KOK, yol), 'utf8'));
function dosyalar(dizin: string): string[] {
  return readdirSync(dizin).flatMap((ad) => {
    const yol = join(dizin, ad);
    if (statSync(yol).isDirectory()) return dosyalar(yol);
    return /\.(ts|tsx)$/.test(ad) && !ad.endsWith('.spec.ts') ? [yol] : [];
  });
}

describe('KRİTİK: kaynak kuralları', () => {
  const SAYFA = oku('app/(dashboard)/kurulum/page.tsx');

  it('tarama boşa düşmüyor', () => {
    expect(SAYFA).toContain('export default async function KurulumPage(');
    expect(dosyalar(KOK).length).toBeGreaterThan(200);
  });

  it('KRİTİK: `/connections` PARAMETRESİZ — `?clientId=` ajansın bağlantısını yeni workspace’te gizler (Ç-2)', () => {
    expect(SAYFA).toContain("oku<ConnectionSummary[]>('/connections')");
    for (const f of ['app/(dashboard)/kurulum/page.tsx', 'components/kurulum/tamamlama.tsx', 'components/kurulum/baslangic.tsx']) {
      expect(oku(f), f).not.toMatch(/\/connections\?clientId/);
    }
  });

  it('KRİTİK: sihirbaz adresi tek üreticiden — `/kurulum?` elle yazan panel dosyası yok', () => {
    const elle = dosyalar(KOK).filter((f) => /['"`]\/kurulum\?/.test(yorumsuz(readFileSync(f, 'utf8'))));
    expect(elle.map((f) => relative(KOK, f))).toEqual([]);
  });

  it('KRİTİK: müşteri hesabı sihirbazı görmez — Marka Merkezi kapısı yoksa Genel Bakış', () => {
    const i = SAYFA.indexOf("if (!kapi(session, 'markaMerkezi.gor')) redirect('/dashboard');");
    expect(i).toBeGreaterThan(-1);
    expect(i).toBeLessThan(SAYFA.indexOf('sihirbazModu('));
  });

  it('KRİTİK: hatayı yutan `.catch(() => setX([]))` yeni dosyalarda yok', () => {
    for (const f of [
      'components/kurulum/tamamlama.tsx',
      'components/kurulum/baslangic.tsx',
      'components/marka-merkezi/adim-icerigi.tsx',
      'components/marka-merkezi/beyan-alani.tsx',
      'components/genel-bakis/kurulum-seridi.tsx',
    ]) {
      expect(oku(f), f).not.toMatch(/\.catch\(\s*\(\)\s*=>\s*set\w+\(\s*(\[\s*\]|null)\s*\)\s*\)/);
    }
  });

  it('KRİTİK: beyanlar BÜTÜN sayaç çağıranlarına bağlı (geçici `undefined` kalmadı)', () => {
    /*
     * Bir çağıran beyanları vermezse "adresimiz yok" denmiş workspace o
     * ekranda "eksik", sihirbazda "hiç eksik yok" der — iki sayı.
     */
    const cagiranlar = dosyalar(KOK).filter((f) => /kurulumListesi\(/.test(readFileSync(f, 'utf8')));
    expect(cagiranlar.length).toBeGreaterThanOrEqual(5);
    for (const f of cagiranlar) {
      const k = yorumsuz(readFileSync(f, 'utf8'));
      expect(k, relative(KOK, f)).toMatch(/beyanlar: beyanGirdisi\(/);
    }
  });

  it('KRİTİK: liste ve sihirbaz AYNI adım içeriğini çiziyor (ikinci form yok)', () => {
    expect(oku('components/marka-merkezi/kurulum-listesi.tsx')).toContain('<AdimIcerigi {...icerik} />');
    expect(oku('components/kurulum/tamamlama.tsx')).toContain('<AdimIcerigi');
    expect(oku('components/kurulum/tamamlama.tsx')).toContain('kip="sihirbaz"');
    const icerik = oku('components/marka-merkezi/adim-icerigi.tsx');
    for (const ev of ['<FirmaBilgileri', '<BildirimlerBolumu', '<DanismanAta', '<SpecialCategoryPicker', '<BeyanAlani']) expect(icerik, ev).toContain(ev);
    expect(icerik).not.toMatch(/apiFetch\(`\/clients\/\$\{clientId\}`,\s*\{\s*method: 'PATCH'/);
  });

  it('KRİTİK: şirketin platformları SUNUCUDAN — aktif workspace’in beyanından türetilmiyor', () => {
    const t = oku('components/kurulum/tamamlama.tsx');
    expect(t).toContain('kullanilanPlatformlar: veri.sirket.ok ? veri.sirket.v.kullanilanPlatformlar : null,');
    expect(t).toContain('ikiAdimZorunlu: veri.sirket.ok ? veri.sirket.v.ikiAdimZorunlu : null,');
    expect(t).not.toMatch(/kullanilanPlatformlar:\s*KURULUM_PLATFORMLARI/);
    expect(SAYFA).toContain('kullanilanPlatformlar: sk.ok ? sk.v.kullanilanPlatformlar : null,');
    expect(SAYFA).not.toMatch(/kullanilanPlatformlar:\s*KURULUM_PLATFORMLARI/);
  });

  it('KRİTİK: OAuth dönüşünün sonucu S1 dışındaki adımda da görünüyor (ölçüm izni reddi sessiz kalmasın)', () => {
    expect(oku('components/kurulum/tamamlama.tsx')).toContain("{aktif !== 'baglantilar' && <CallbackBanner />}");
    expect(oku('components/kurulum/platform-adimi.tsx')).toContain('<CallbackBanner />');
  });

  it('KRİTİK: OAuth izin dönüşü sihirbazın AYNI adımına', () => {
    expect(oku('components/kurulum/tamamlama.tsx')).toContain('izinDonusu={sihirbazAdresi(clientId, aktifAdim.kod)}');
    expect(oku('components/marka-merkezi/kurulum-bolumu.tsx')).toContain('encodeURIComponent(izinDonusAdresi ?? izinDonusu(clientId))');
  });

  it('KRİTİK: "Otomatik yap" adım başına `kodlar` süzgeciyle ve kapsam sözleşmeden', () => {
    const t = oku('components/kurulum/tamamlama.tsx');
    expect(t).toContain('eksikleriTamamlaKapsami(girdi, aktifAdim.kod)');
    // Gövde sözleşmenin tipinden (`KurulumTamamlaIstegi`) ve YALNIZ bu adımın kodlarıyla.
    expect(t).toContain('const govde: KurulumTamamlaIstegi = { kodlar: [...kapsam.kurulumAdimlari] };');
    expect(t).toContain('body: JSON.stringify(govde)');
    expect(t).toContain("const s = istekSonucu(e);");
  });

  it('KRİTİK: Genel Bakış şeridi yalnız `kurulum.yaz` + Marka Merkezi kapısında, tercih try/catch içinde', () => {
    const gb = oku('app/(dashboard)/dashboard/page.tsx');
    expect(gb).toMatch(/session\.activeClientId && kapi\(session, 'kurulum\.yaz'\) && kapi\(session, 'markaMerkezi\.gor'\) && \(\s*<KurulumSeridi/);
    const serit = oku('components/genel-bakis/kurulum-seridi.tsx');
    for (const ad of ['function gizlendiOku(', 'function gizlendiYaz(']) {
      const g = serit.slice(serit.indexOf(ad), serit.indexOf('\n}\n', serit.indexOf(ad)));
      expect(g, ad).toContain('try {');
      expect(g, ad).toContain('localStorage');
    }
  });

  it('Marka Merkezi › Kurulum "Sihirbazla tamamla" yalnız sayaç bitmemişken', () => {
    expect(oku('components/marka-merkezi/kurulum-listesi.tsx')).toMatch(/\{!sayac\.bitti && \(\s*<Link href=\{sihirbazAdresi\(clientId\)\}/);
  });

  it('açılıp kapanan öğe DOM’dan çıkmıyor; hareket `prefers-reduced-motion` altında kapalı', () => {
    const ray = oku('components/kurulum/sihirbaz-rayi.tsx');
    expect(ray).toContain('<details');
    expect(ray).toContain('motion-reduce:animate-none');
    expect(oku('components/kurulum/baslangic.tsx')).toContain("className={acik ? '' : 'hidden'}");
  });

  it('kılavuz renkleri: sihirbazda yeşil (ok-*) ve uyarı tonları yok', () => {
    for (const f of ['components/kurulum/tamamlama.tsx', 'components/kurulum/baslangic.tsx', 'components/kurulum/sihirbaz-rayi.tsx', 'components/genel-bakis/kurulum-seridi.tsx']) {
      expect(oku(f), f).not.toMatch(/\b(bg|text|border)-(ok|warn|info)(-soft|-strong)?\b/);
    }
  });
});
