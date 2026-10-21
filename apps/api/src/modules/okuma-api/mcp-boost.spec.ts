import { ForbiddenException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { TenantContext } from '@advetics/shared';
import {
  boostOnayOzeti,
  boostSecimiCoz,
  hedefYuzeyeUyarMi,
  onizlemeKodu,
  taahhut,
  ustSinirDenetle,
  type BoostOnAyari,
  type BoostSecimi,
} from './mcp-boost';
import { yenidenZamanlama } from './mcp-boost.service';
import { ONAYLI_ARACLAR, yazmaAraciBul } from './mcp-yazma-araclari';
import { McpYazmaService, type YazmaIstegi } from './mcp-yazma.service';

/**
 * ═══ MCP BOOST'U — SEÇİM, ÖNİZLEME KODU, ÜST SINIR, ONAY KAPISI ═══
 * (`docs/okuma-api/MCP-BOOST-MIMARI.md`)
 *
 * Kritik iddialar:
 *  - eksik alan TAHMİN EDİLMİYOR (hedef, kitle, bütçe, süre kullanıcıdan),
 *  - önizleme kodu kullanıcıya gösterilen HER alana bağlı,
 *  - `boost_olustur` önizlemesiz ve onaysız Meta'ya gitmiyor; kurulum yalnız
 *    `onayla`dan ve onay anında kod yeniden tutmazsa HİÇ,
 *  - tek işlem üst sınırı onay satırı açılmadan reddediyor.
 */

const WS = '11111111-1111-4111-8111-111111111111';
const GONDERI = '55555555-5555-4555-8555-555555555555';
const BOOST = '77777777-7777-4777-8777-777777777777';
const KITLE = '99999999-9999-4999-8999-999999999999';

const ELLE = { konumlar: [{ key: '2343687', type: 'city' as const, ad: 'İzmir' }], yas_min: 25, yas_max: 45, cinsiyet: 'all' as const };
const TAM = { hedef: 'etkilesim' as const, kitle: ELLE, butce: { tip: 'toplam' as const, tutar_micros: '300000000' }, sure_gun: 5 };

const ON_AYAR: BoostOnAyari = {
  goal: 'profile_visits',
  butce: { kip: 'daily', micros: 50_000_000n },
  sureGun: 3,
  savedAudienceId: null,
  locations: [{ key: 'TR', type: 'country', label: 'Türkiye' }],
  ageMin: 18,
  ageMax: 65,
  genders: 'all',
  interests: [],
  kitleSablonuId: KITLE,
};

describe('boostSecimiCoz', () => {
  it('KRİTİK: eksik alanların HEPSİ tek hatada ve "tahmin etme" diyor', () => {
    expect(() => boostSecimiCoz({}, null)).toThrow(/hedef.*kitle.*butce.*sure_gun.*tahmin etme/s);
  });

  it('KRİTİK: ön ayar varken bile on_ayar_kullan olmadan DOLDURULMUYOR (ama varlığı söyleniyor)', () => {
    expect(() => boostSecimiCoz({}, ON_AYAR)).toThrow(/on_ayar_kullan: true/);
  });

  it('on_ayar_kullan yalnız EKSİK alanları ön ayardan dolduruyor ve hangileri olduğunu yazıyor', () => {
    const s = boostSecimiCoz({ on_ayar_kullan: true, butce: { tip: 'toplam', tutar_micros: '900000000' } }, ON_AYAR);
    expect(s.hedef).toBe('profil_ziyareti');
    expect(s.kitle).toEqual({ tur: 'kayitli', id: KITLE });
    expect(s.butce).toEqual({ kip: 'lifetime', micros: 900_000_000n });
    expect(s.sureGun).toBe(3);
    expect(s.onAyardan).toEqual(['hedef', 'kitle', 'süre']);
  });

  it('ön ayar yokken on_ayar_kullan istenirse açık hata (#85776: elle girilsin)', () => {
    expect(() => boostSecimiCoz({ on_ayar_kullan: true }, null)).toThrow(/ön ayarı yok/);
  });

  it('KRİTİK: kitle TEK yol; kayıtlı kitle ile elle alan birlikte reddediliyor', () => {
    expect(() => boostSecimiCoz({ ...TAM, kitle: { kitle_id: KITLE, yas_min: 30 } }, null)).toThrow(/TEK yol/);
    expect(() => boostSecimiCoz({ ...TAM, kitle: {} }, null)).toThrow(/TEK yol/);
  });

  it('elle kitlede konum ZORUNLU (ülke geneli bile açıkça)', () => {
    expect(() => boostSecimiCoz({ ...TAM, kitle: { yas_min: 30 } }, null)).toThrow(/konumlar zorunlu/);
  });

  it('trafik adres ister; adres trafik dışında reddediliyor', () => {
    expect(() => boostSecimiCoz({ ...TAM, hedef: 'trafik' }, null)).toThrow(/hedef_adres/);
    expect(() => boostSecimiCoz({ ...TAM, hedef_adres: 'https://o.com' }, null)).toThrow(/yalnız trafik/);
    expect(boostSecimiCoz({ ...TAM, hedef: 'trafik', hedef_adres: 'https://o.com' }, null).hedefAdres).toBe('https://o.com');
  });

  it('hedefYuzeyeUyarMi: Facebook gönderisinde mesaj yok', () => {
    expect(hedefYuzeyeUyarMi('mesaj', 'facebook_page')).toMatch(/yalnız Instagram/);
    expect(hedefYuzeyeUyarMi('etkilesim', 'facebook_page')).toBeNull();
  });
});

describe('onizlemeKodu', () => {
  const temel = { workspaceId: WS, gonderiId: GONDERI, secim: boostSecimiCoz(TAM, null), targeting: { geo_locations: { cities: [{ key: '2343687' }] }, age_min: 25 } };

  it('KRİTİK: kullanıcıya gösterilen her alan kodu değiştiriyor', () => {
    const k0 = onizlemeKodu(temel);
    const s = (d: Partial<BoostSecimi>) => ({ ...temel, secim: { ...temel.secim, ...d } });
    const degisenler = [
      { ...temel, gonderiId: WS },
      s({ hedef: 'erisim' }),
      s({ butce: { kip: 'lifetime', micros: 300_000_001n } }),
      s({ butce: { kip: 'daily', micros: 300_000_000n } }),
      s({ sureGun: 6 }),
      s({ kitle: { tur: 'kayitli', id: KITLE } }),
      { ...temel, targeting: { ...temel.targeting, age_min: 26 } },
    ];
    for (const d of degisenler) expect(onizlemeKodu(d)).not.toBe(k0);
  });

  it('anahtar sırası kodu değiştirmiyor (kanonik)', () => {
    expect(onizlemeKodu({ ...temel, targeting: { age_min: 25, geo_locations: { cities: [{ key: '2343687' }] } } })).toBe(onizlemeKodu(temel));
  });
});

describe('taahhüt ve üst sınır', () => {
  it('KRİTİK: günlükte gün sayısıyla çarpılıyor, toplamda çarpılmıyor', () => {
    expect(taahhut({ kip: 'daily', micros: 100_000_000n }, 7)).toBe(700_000_000n);
    expect(taahhut({ kip: 'lifetime', micros: 100_000_000n }, 7)).toBe(100_000_000n);
  });

  it('KRİTİK: sınırı aşan reddediliyor ve sınır cümlede; eşit geçiyor', () => {
    expect(() => ustSinirDenetle(1_000_000_001n, 1_000_000_000n, 'TRY')).toThrow(/üst sınırı 1\.000,00/);
    expect(() => ustSinirDenetle(1_000_000_000n, 1_000_000_000n, 'TRY')).not.toThrow();
    expect(() => ustSinirDenetle(10n ** 15n, null, 'TRY')).not.toThrow();
  });
});

describe('boostOnayOzeti', () => {
  const g = {
    workspaceAdi: 'Ornek WS',
    gonderi: { yuzey: 'instagram' as const, sayfa: 'ornek', tarih: '2026-10-20T10:00:00Z', metin: 'Yeni sezon', baglanti: 'https://instagram.com/p/x', medyaTuru: 'reel' },
    hesap: { ad: 'Ornek Hesap', disKimlik: 'act_1', paraBirimi: 'TRY' },
    secim: boostSecimiCoz({ ...TAM, butce: { tip: 'gunluk', tutar_micros: '100000000' } }, null),
    kitleMetni: 'İzmir · 25-45 yaş',
    ozelKategoriler: [],
    kitleBuyuklugu: { okunamadi: 'Meta kotası şu an dolu' },
    buAyTaahhut: { micros: '0', aylikButce: null },
  };
  it('KRİTİK: para, hedef, kitle, süre ve DURAKLATILMIŞ satırı yazıyor; okunamayan sayı uydurulmuyor', () => {
    const o = boostOnayOzeti(g).join('\n');
    expect(o).toContain('Bütçe: 100,00 ₺ / gün × 5 gün = en çok 500,00 ₺');
    expect(o).toContain('Hedef: Etkileşim');
    expect(o).toContain('Kitle: İzmir · 25-45 yaş');
    expect(o).toContain('Yerleşim: yalnız Instagram (Reels)');
    expect(o).toContain('Özel kategori: yok');
    expect(o).toContain('Kitle büyüklüğü: okunamadı (Meta kotası şu an dolu)');
    expect(o).toContain('DURAKLATILMIŞ');
    expect(o).not.toMatch(/0 kişi/);
  });
  it('etkileşim dışı hedefte "canlıda ölçülmedi" söyleniyor', () => {
    const o = boostOnayOzeti({ ...g, secim: { ...g.secim, hedef: 'mesaj' } }).join('\n');
    expect(o).toMatch(/Mesaj.*canlıda henüz ölçülmedi/);
  });
});

describe('yenidenZamanlama', () => {
  const simdi = new Date('2026-10-25T08:00:00.000Z');
  it('KRİTİK: yalnız duraklatılmış kurulup HİÇ başlatılmamış boost bugünden yeniden kuruluyor', () => {
    expect(yenidenZamanlama({ duraklatilmis_kur: true, yayin_baslangici: null, duration_days: 5 }, simdi)).toEqual({
      baslangic: simdi,
      bitis: new Date('2026-10-30T08:00:00.000Z'),
    });
    expect(yenidenZamanlama({ duraklatilmis_kur: true, yayin_baslangici: new Date('2026-10-22'), duration_days: 5 }, simdi)).toBeNull();
    expect(yenidenZamanlama({ duraklatilmis_kur: false, yayin_baslangici: null, duration_days: 5 }, simdi)).toBeNull();
  });
});

// ─── Servis: onay kapısı ────────────────────────────────────────────────────

const EV_CTX = { userId: 'u1', orgId: 'o1', activeClientId: null, permissions: [] } as unknown as TenantContext;
const ISTEK: YazmaIstegi = { ctx: EV_CTX, anahtarId: 'k1', yetki: 'yazma', requestId: 'r', yuklemeAdresi: 'https://advetics.com/api/mcp/yukleme' };

function kur(o: { izinler?: string[]; kodlar?: string[]; ustSinir?: bigint | null } = {}) {
  const satirlar = new Map<string, { islem: string; hedef: Record<string, unknown>; durum: string; ozet: string[] }>();
  let n = 0;
  const onay = {
    ac: vi.fn(async (_ev: unknown, islem: string, hedef: Record<string, unknown>, ozet: string[]) => {
      const id = `00000000-0000-4000-8000-00000000000${++n}`;
      satirlar.set(id, { islem, hedef, durum: 'bekliyor', ozet });
      return { id, ozet, bitis: '2026-10-21T00:15:00.000Z' };
    }),
    al: vi.fn(async (_ev: unknown, kod: string) => {
      const s = satirlar.get(kod)!;
      s.durum = 'uygulaniyor';
      return { id: kod, islem: s.islem, hedef: s.hedef, ozet: s.ozet };
    }),
    bitir: vi.fn(async () => undefined),
    isKaydi: vi.fn(async () => undefined),
  };
  // Her `hazirla` çağrısı sıradaki kodu döner: önizleme / onay / onayla anları.
  const kodlar = [...(o.kodlar ?? ['aaaaaaaaaaaaaaaa'])];
  const boost = {
    hazirla: vi.fn(async (_c: unknown, _ad: string, _a: unknown, ustSinir: bigint | null) => ({
      kod: kodlar.length > 1 ? kodlar.shift()! : kodlar[0]!,
      ozet: ['Bütçe: 300 ₺ toplam', 'Durum: DURAKLATILMIŞ kurulur'],
      uyarilar: [],
      ustSinir,
    })),
    kur: vi.fn(async () => ({ basarili: true, sonuc: { boostId: BOOST }, hata: null })),
    yonetimHazirla: vi.fn(async () => ['İşlem: BAŞLAT']),
    yonetimUygula: vi.fn(async () => ({ basarili: true, sonuc: { dogrulama: 'dogrulandi' }, hata: null })),
  };
  const tenant = {
    resolve: vi.fn(async () => ({ context: { ...EV_CTX, activeClientId: WS, permissions: o.izinler ?? ['boost.read', 'boost.approve'] } })),
  };
  const admin = {
    $queryRaw: vi.fn(async () => [{ ad: 'Ornek WS', org_id: 'o2', manager_account_id: null }]),
    okumaAnahtari: { findUnique: vi.fn(async () => ({ yetki: 'yazma', tekIslemUstSiniriMicros: o.ustSinir ?? null })) },
  };
  const svc = new McpYazmaService(
    admin as never,
    {} as never,
    tenant as never,
    {} as never,
    {} as never,
    onay as never,
    {} as never,
    {} as never,
    { jwt: { accessSecret: 'gizli' } } as never,
    {} as never,
    {} as never,
    boost as never,
  );
  return { svc, onay, boost, satirlar };
}

const cagir = (svc: McpYazmaService, ad: string, args: unknown) => svc.calistir(ISTEK, yazmaAraciBul(ad)!, args);
const ARG = { workspace_id: WS, gonderi_id: GONDERI, ...TAM };

describe('KRİTİK: boost onay kapısı', () => {
  it('boost araçlarının hepsi kayıtlı; onaylılar listede', () => {
    for (const ad of ['boost_gonderileri', 'boost_onizle', 'boost_olustur', 'boostlar', 'boost_durumu', 'boost_baslat', 'boost_duraklat', 'boost_butce_degistir', 'kitleler', 'konum_ara', 'ilgi_ara']) {
      expect(yazmaAraciBul(ad), ad).toBeDefined();
    }
    for (const ad of ['boost_olustur', 'boost_baslat', 'boost_duraklat', 'boost_butce_degistir']) {
      expect(ONAYLI_ARACLAR as readonly string[]).toContain(ad);
      expect(yazmaAraciBul(ad)!.aciklama).toMatch(/ONAY İSTER, HEMEN YAPMAZ/);
    }
  });

  it('önizleme onay satırı AÇMIYOR, kurmuyor; anahtarın sınırını hazırlığa veriyor', async () => {
    const t = kur({ ustSinir: 5_000_000_000n });
    const c = (await cagir(t.svc, 'boost_onizle', ARG)) as { onizlemeKodu: string };
    expect(c.onizlemeKodu).toBe('aaaaaaaaaaaaaaaa');
    expect(t.onay.ac).not.toHaveBeenCalled();
    expect(t.boost.kur).not.toHaveBeenCalled();
    expect(t.boost.hazirla.mock.calls[0]![3]).toBe(5_000_000_000n);
  });

  it('KRİTİK: önizleme kodu olmadan boost_olustur reddediliyor', async () => {
    const t = kur();
    await expect(cagir(t.svc, 'boost_olustur', ARG)).rejects.toThrow(/boost_onizle/);
    expect(t.onay.ac).not.toHaveBeenCalled();
  });

  it('KRİTİK: başka argümanların kodu onay AÇTIRMIYOR', async () => {
    const t = kur({ kodlar: ['bbbbbbbbbbbbbbbb'] });
    await expect(cagir(t.svc, 'boost_olustur', { ...ARG, onizleme_kodu: 'aaaaaaaaaaaaaaaa' })).rejects.toThrow(/önizlemenin kodu değil/);
    expect(t.onay.ac).not.toHaveBeenCalled();
  });

  it('KRİTİK: boost_olustur yalnız onay satırı açıyor; kurulum yalnız onayla\'dan ve workspace kaydı özetle', async () => {
    const t = kur();
    const c = (await cagir(t.svc, 'boost_olustur', { ...ARG, onizleme_kodu: 'aaaaaaaaaaaaaaaa' })) as { onayKodu: string; onayGerekli: boolean };
    expect(c.onayGerekli).toBe(true);
    expect(t.boost.kur).not.toHaveBeenCalled();
    expect(t.onay.isKaydi).toHaveBeenCalledWith(expect.objectContaining({ activeClientId: WS }), 'mcp.islem_onerildi', c.onayKodu, expect.objectContaining({ islem: 'boost_olustur' }));

    const s = (await cagir(t.svc, 'onayla', { onay_kodu: c.onayKodu })) as { durum: string };
    expect(s.durum).toBe('uygulandi');
    expect(t.boost.kur).toHaveBeenCalledTimes(1);
    expect(t.onay.isKaydi).toHaveBeenLastCalledWith(
      expect.anything(),
      'mcp.islem_uygulandi',
      c.onayKodu,
      expect.objectContaining({ islem: 'boost_olustur', ozet: ['Bütçe: 300 ₺ toplam', 'Durum: DURAKLATILMIŞ kurulur'] }),
    );
  });

  it('KRİTİK: onay anında kod tutmazsa (kitle/ön ayar değişti) Meta\'ya HİÇ gidilmiyor', async () => {
    const t = kur({ kodlar: ['aaaaaaaaaaaaaaaa', 'cccccccccccccccc'] });
    const c = (await cagir(t.svc, 'boost_olustur', { ...ARG, onizleme_kodu: 'aaaaaaaaaaaaaaaa' })) as { onayKodu: string };
    const s = (await cagir(t.svc, 'onayla', { onay_kodu: c.onayKodu })) as { durum: string; hata: string };
    expect(s.durum).toBe('basarisiz');
    expect(s.hata).toMatch(/değişti/);
    expect(t.boost.kur).not.toHaveBeenCalled();
  });

  it('KRİTİK: boost_baslat platforma yalnız onayla\'dan ve iz yol=mcp ile', async () => {
    const t = kur();
    const c = (await cagir(t.svc, 'boost_baslat', { workspace_id: WS, boost_id: BOOST })) as { onayKodu: string };
    expect(t.boost.yonetimUygula).not.toHaveBeenCalled();
    await cagir(t.svc, 'onayla', { onay_kodu: c.onayKodu });
    expect(t.boost.yonetimUygula).toHaveBeenCalledWith(expect.anything(), WS, BOOST, 'baslat', null, { yol: 'mcp', ref: c.onayKodu });
  });

  it('boost bütçesi onayla\'da SAKLI tutarla uygulanıyor; üst sınır hazırlığa gidiyor', async () => {
    const t = kur({ ustSinir: 1_000_000_000n });
    const c = (await cagir(t.svc, 'boost_butce_degistir', { workspace_id: WS, boost_id: BOOST, tutar_micros: '450000000' })) as { onayKodu: string };
    expect(t.boost.yonetimHazirla).toHaveBeenCalledWith(expect.anything(), WS, 'Ornek WS', BOOST, 'butce', 450_000_000n, 1_000_000_000n);
    await cagir(t.svc, 'onayla', { onay_kodu: c.onayKodu });
    expect(t.boost.yonetimUygula).toHaveBeenCalledWith(expect.anything(), WS, BOOST, 'butce', 450_000_000n, expect.anything());
  });

  it('KRİTİK: boost.approve izni olmayan kurulum onayı alamıyor (önizleme alabiliyor)', async () => {
    const t = kur({ izinler: ['boost.read'] });
    await expect(cagir(t.svc, 'boost_onizle', ARG)).resolves.toBeTruthy();
    await expect(cagir(t.svc, 'boost_olustur', { ...ARG, onizleme_kodu: 'aaaaaaaaaaaaaaaa' })).rejects.toBeInstanceOf(ForbiddenException);
    await expect(cagir(t.svc, 'boost_duraklat', { workspace_id: WS, boost_id: BOOST })).rejects.toBeInstanceOf(ForbiddenException);
    expect(t.onay.ac).not.toHaveBeenCalled();
  });

  it('okuma anahtarı boost araçlarını çalıştıramıyor', async () => {
    const t = kur();
    await expect(t.svc.calistir({ ...ISTEK, yetki: 'okuma' }, yazmaAraciBul('boost_onizle')!, ARG)).rejects.toBeInstanceOf(ForbiddenException);
  });
});
