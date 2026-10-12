import { describe, expect, it } from 'vitest';
import {
  acikPlatformlar,
  googleMetinHavuzu,
  rehberEksikleri,
  rehberdenGoogle,
  rehberdenMeta,
  uyumDenetle,
  type GorselOrani,
  type RehberAlanlari,
  type RehberEksikBaglami,
} from '@advetics/shared';
import { rehberOzeti } from '../rehber/rehber-kayit';
import { derleGoogle, type GoogleDerlemeBaglami } from '../google/derle-google';
import { googleGeriOkumaKarsilastir, googleGeriOku, type GoogleOkunan } from '../google/google-yayin';

/**
 * GÖRSELE ÖZEL METİN (Dalga 2) ve GÖRÜNEN YOL — derleyici tarafı.
 *
 * İddialar ÇIKTIYA çapalı: Meta kavramının başlığı/metni, Google'a giden
 * başlık havuzu, RSA gövdesindeki `path1/path2` ve geri okuma beklentisi.
 * Görsel metni olmayan rehberin çıktısı ESKİSİYLE AYNI kalmalı (kayıtlı
 * provaların özeti sebepsiz değişmesin).
 */
const Z = '2026-10-12T09:00:00.000+03:00';
const KIM = '11111111-1111-4111-8111-111111111111';
const U = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const al = <T>(deger: T, kaynak: 'kullanici' | 'derleyici' | 'marka_merkezi' | 'workspace_profili' = 'kullanici') => ({ deger, kaynak, kim: KIM, zaman: Z });

function rehber(amac: 'SITE' | 'ERISIM' = 'SITE', medya: NonNullable<RehberAlanlari['medya']>['deger'] = []): RehberAlanlari {
  return {
    amac: al(amac),
    platformlar: al({ meta: true, google: true }, 'derleyici'),
    metaHesabiId: al(U(1), 'workspace_profili'),
    googleHesabiId: al(U(2), 'workspace_profili'),
    sayfaId: al(U(3), 'workspace_profili'),
    instagramId: al(null),
    konumlar: al([{ tur: 'city' as const, key: '2347574', etiket: 'İzmir', ulkeKodu: 'TR', google: { kaynak: 'geoTargetConstants/1012782', ad: 'İzmir' } }], 'marka_merkezi'),
    ekKategoriler: al([]),
    hedefAdres: al('https://ornek.com.tr/kahve-makinesi', 'marka_merkezi'),
    medya: al(medya),
    metin: al({ anaMetin: 'Ortak ana metin.', basliklar: ['Ortak Bir', 'Ortak İki', 'Ortak Üç'], aciklamalar: ['Ortak açıklama bir.', 'Ortak açıklama iki.'] }),
    anahtarKelimeler: al([{ metin: 'kahve makinesi', aylikArama: 100 }]),
    butce: al({ tip: 'gunluk' as const, micros: '500000000' }),
    metaPayiYuzde: al(50, 'derleyici'),
    takvim: al({ baslangic: '2026-10-13', bitis: null }),
  };
}
const oranlar = new Map<string, GorselOrani | null>([
  [U(10), 'kare'],
  [U(11), 'kare'],
  [U(12), 'dikey'],
]);
const meta = (a: RehberAlanlari) => {
  const r = rehberdenMeta(a, { meta: true, google: true }, 'TRY', Z, oranlar);
  if (r.tur !== 'tamam') throw new Error(r.kodlar.join(','));
  return r.deger.kavramlar!.deger;
};
const gB = { musteriId: '123-456-7890', paraBirimi: 'TRY', saatDilimi: 'Europe/Istanbul', donusumEtkin: false, satisOlcumu: null, isletmeAdi: 'Örnek', logoVarlikId: U(9), kategoriTabani: [], medyaOranlari: oranlar };
const google = (a: RehberAlanlari) => {
  const r = rehberdenGoogle(a, acikPlatformlar(a, true), gB);
  if (r.tur !== 'tamam') throw new Error(r.kodlar.join(','));
  return r.deger;
};

describe('Meta: fikir başına metin', () => {
  it('KRİTİK: fikrin kendi metni varsa ONUN başlığı ve ana metni; yoksa ortak', () => {
    const a = rehber('SITE', [
      { varlikId: U(10), metin: { anaMetin: 'Birinci görselin metni.', basliklar: ['Görsel Bir Başlık'], kaynak: 'derleyici' } },
      { varlikId: U(11), setNo: 2 },
    ]);
    const k = meta(a);
    const bul = (id: string) => k.find((x) => x.varlikId === id)!;
    expect(bul(U(10))).toMatchObject({ baslik: 'Görsel Bir Başlık', metin: 'Birinci görselin metni.' });
    expect(bul(U(11))).toMatchObject({ metin: 'Ortak ana metin.' });
    expect(bul(U(11)).baslik).toMatch(/^Ortak/);
  });

  it('KRİTİK: sette metin ÜRETİLMEMİŞ görselde dursa da fikre gider (sahip kuralı)', () => {
    const a = rehber('SITE', [
      { varlikId: U(12), metin: { anaMetin: 'Dikeyin metni.', kaynak: 'kullanici' } },
      { varlikId: U(10), uretildi: true, kaynakVarlikId: U(12) },
    ]);
    const k = meta(a);
    expect(k).toHaveLength(1);
    expect(k[0]!.metin).toBe('Dikeyin metni.');
  });

  it('KRİTİK: görsel metni olmayan rehberde içerik özeti alanı değişmiyor (kendiMetni sızmıyor)', () => {
    const k = meta(rehber('SITE', [{ varlikId: U(10) }]));
    expect(Object.keys(k[0]!).sort()).toEqual(['aciklama', 'baslik', 'metin', 'varlikId']);
  });
});

describe('Google: havuz ve görünen yol', () => {
  it('KRİTİK: görsel kurgusunda başlıklar fikirlerden toplanıyor, ortak ÖNCE, tekil, sınırlı', () => {
    const a = rehber('ERISIM', [
      { varlikId: U(10), metin: { basliklar: ['Görsel Başlık', 'ortak bir'], aciklamalar: ['Görselin açıklaması.'], kaynak: 'derleyici' } },
      { varlikId: U(11), setNo: 2, metin: { basliklar: ['Bu başlık otuz karakteri kesinlikle aşıyor'], kaynak: 'derleyici' } },
    ]);
    const g = google(a);
    expect(g.basliklar).toEqual(['Ortak Bir', 'Ortak İki', 'Ortak Üç', 'Görsel Başlık']);
    expect(g.aciklamalar).toEqual(['Ortak açıklama bir.', 'Ortak açıklama iki.', 'Görselin açıklaması.']);
  });

  it('havuz 15 başlık ve 4 açıklamada kesiliyor', () => {
    const h = googleMetinHavuzu({ basliklar: ['a'], aciklamalar: ['x'] }, [{ basliklar: Array.from({ length: 20 }, (_, i) => `b${i}`), aciklamalar: ['y', 'z', 'w', 'v'], kaynak: 'derleyici' }]);
    expect(h.basliklar).toHaveLength(15);
    expect(h.aciklamalar).toEqual(['x', 'y', 'z', 'w']);
  });

  it('Arama kurgusunda görsel metni havuza GİRMEZ (Arama görselsiz)', () => {
    const a = rehber('SITE', [{ varlikId: U(10), metin: { basliklar: ['Görsel Başlık'], kaynak: 'derleyici' } }]);
    expect(google(a).basliklar).toEqual(['Ortak Bir', 'Ortak İki', 'Ortak Üç']);
  });

  it('KRİTİK: görünen yol yalnız doluysa girdiye yazılıyor; boşsa anahtar YOK', () => {
    expect('gorunenYol' in google(rehber('SITE'))).toBe(false);
    const a = rehber('SITE');
    a.metin = al({ ...a.metin!.deger, gorunenYol: ['kahve', ''] });
    expect(google(a).gorunenYol).toEqual(['kahve']);
    // Görünen yol özete giriyor: yol değişince prova bayatlar.
    const b = rehber('SITE');
    b.metin = al({ ...b.metin!.deger, gorunenYol: ['makine'] });
    expect(rehberOzeti(a)).not.toBe(rehberOzeti(b));
  });
});

const B: GoogleDerlemeBaglami = {
  kimlik: 'abcdef12-0000-4000-8000-000000000000',
  workspaceKisaAdi: 'Örnek',
  amacEkranAdi: 'Siteme gelsinler',
  simdi: new Date('2026-10-12T09:00:00+03:00'),
  validateOnly: true,
  logo: null,
  youtubeVideoBasligi: null,
};

describe('RSA gövdesi ve geri okuma', () => {
  const rsa = (ops: Array<Record<string, unknown>>) =>
    ops.map((o) => (o.adGroupAdOperation as { create?: { ad?: { responsiveSearchAd?: Record<string, unknown> } } } | undefined)?.create?.ad?.responsiveSearchAd).find(Boolean)!;

  it('KRİTİK: path1/path2 gövdede ve beklenen yankıda; yolsuz reklamda ikisi de YOK', () => {
    const a = rehber('SITE');
    a.metin = al({ ...a.metin!.deger, gorunenYol: ['kahve', 'makinesi'] });
    const d = derleGoogle(google(a), B);
    if (d.tur !== 'govde') throw new Error(JSON.stringify(d.retler));
    expect(rsa(d.govde.mutateOperations)).toMatchObject({ path1: 'kahve', path2: 'makinesi' });
    expect(d.beklenen.gorunenYol).toEqual({ path1: 'kahve', path2: 'makinesi' });

    const yolsuz = derleGoogle(google(rehber('SITE')), B);
    if (yolsuz.tur !== 'govde') throw new Error('ret');
    expect(rsa(yolsuz.govde.mutateOperations)).not.toHaveProperty('path1');
    expect(yolsuz.beklenen).not.toHaveProperty('gorunenYol');
  });

  it('KRİTİK: 15 karakteri aşan yol KIRPILMAZ, ret', () => {
    const a = rehber('SITE');
    a.metin = al({ ...a.metin!.deger, gorunenYol: ['cokuzunbiryolparcasi'] });
    const d = derleGoogle(google(a), B);
    expect(d.tur).toBe('ret');
    expect(d.tur === 'ret' && d.retler.map((r) => r.kod)).toContain('G-YOL-UZUN');
  });

  it('KRİTİK: Google yolu düşürürse geri okuma FARK; beklenmiyorsa bakılmaz', async () => {
    const a = rehber('SITE');
    a.metin = al({ ...a.metin!.deger, gorunenYol: ['kahve'] });
    const d = derleGoogle(google(a), B);
    if (d.tur !== 'govde') throw new Error('ret');
    const sorgular: string[] = [];
    const port = (yol: Record<string, string>) => ({
      ara: async <T>(_c: unknown, q: string): Promise<T[]> => {
        sorgular.push(q);
        if (q.includes('responsive_search_ad')) return [{ adGroupAd: { ad: { responsiveSearchAd: yol } } }] as T[];
        return [];
      },
    });
    const okunan = await googleGeriOku(port({}) as never, {} as never, '123', d.beklenen);
    expect(okunan.gorunenYol).toEqual({ path1: null, path2: null });
    const k = googleGeriOkumaKarsilastir(d.beklenen, okunan);
    expect(k.satirlar.map((s) => s.alan)).toContain('reklam.gorunenYol');
    const dogru = await googleGeriOku(port({ path1: 'kahve' }) as never, {} as never, '123', d.beklenen);
    expect(googleGeriOkumaKarsilastir(d.beklenen, dogru).satirlar.map((s) => s.alan)).not.toContain('reklam.gorunenYol');
    // Sorgu `campaign.id`yi SELECT'te taşıyor (WHERE'de süzülen alan seçilmezse Google reddediyor).
    expect(sorgular.find((q) => q.includes('responsive_search_ad'))).toMatch(/SELECT campaign\.id,/);
    // Yolsuz beklenen: sorgu hiç koşmaz.
    sorgular.length = 0;
    const { gorunenYol: _g, ...eski } = d.beklenen;
    const o2: GoogleOkunan = await googleGeriOku(port({}) as never, {} as never, '123', eski);
    expect(o2).not.toHaveProperty('gorunenYol');
    expect(sorgular.some((q) => q.includes('responsive_search_ad'))).toBe(false);
  });
});

describe('eksikler ve uyum: görsel metni de kurala tabi', () => {
  const baglam = (yasal: string | null): RehberEksikBaglami => ({
    ajansYoneticisi: true,
    onKosullar: {
      metaFormKosullari: true,
      metaWhatsapp: true,
      metaSatisOlcumu: true,
      googleSatisOlcumu: true,
      googleDonusumEtkin: false,
      googleLogoVeAd: true,
      seciliForm: null,
    },
    yasalUyari: yasal,
    asgariGunluk: { meta: 49_340_000n, googleTalepYaratma: 250_000_000n },
    paraBirimi: 'TRY',
    paraBirimleriAyni: true,
    medyaOranlari: oranlar,
  });

  it('KRİTİK: görselin ana metninde yasal uyarı yoksa ENGEL (ortak metin kusursuz olsa da)', () => {
    const a = rehber('SITE', [{ varlikId: U(10), metin: { anaMetin: 'Uyarısız metin.', kaynak: 'derleyici' } }]);
    a.metin = al({ ...a.metin!.deger, anaMetin: 'Ortak. Yatırım tavsiyesi değildir.' });
    const e = rehberEksikleri(a, baglam('Yatırım tavsiyesi değildir.'));
    expect(e.find((x) => x.kod === 'GORSEL-YASAL-UYARI')).toMatchObject({ seviye: 'engel', alan: 'medya' });
    const u = uyumDenetle({
      platformlar: { meta: true, google: false },
      kategoriler: [],
      yasalUyari: 'Yatırım tavsiyesi değildir.',
      metaAnaMetin: 'Ortak. Yatırım tavsiyesi değildir.',
      metaEkAnaMetinler: ['Uyarısız metin.'],
      googleAciklamalar: [],
      enDusukYas: 18,
      yasAraligi: null,
      cinsiyetDaraltmasi: false,
    });
    expect(u.tur).toBe('durdu');
  });

  it('görsel başlığı 30 karakteri aşarsa ve görünen yol 15i aşarsa engel', () => {
    const a = rehber('SITE', [{ varlikId: U(10), metin: { basliklar: ['Bu başlık otuz karakteri kesinlikle aşıyor'], kaynak: 'derleyici' } }]);
    a.metin = al({ ...a.metin!.deger, gorunenYol: ['cokuzunbiryolparcasi'] });
    const kodlar = rehberEksikleri(a, baglam(null)).map((x) => x.kod);
    expect(kodlar).toContain('GORSEL-METIN-BASLIK-UZUN');
    expect(kodlar).toContain('G-YOL-UZUN');
  });

  it('KRİTİK: yapay zekânın ortak metne yazdığı `derleyici` kaynağı kilitlenmiyor; `ai_onerisi` kilitli', () => {
    const a = rehber('SITE');
    a.metin = { ...a.metin!, kaynak: 'derleyici' };
    expect(rehberEksikleri(a, baglam(null)).some((x) => x.kod === 'KAYNAK' && x.alan === 'metin')).toBe(false);
    a.metin = { ...a.metin!, kaynak: 'ai_onerisi' };
    expect(rehberEksikleri(a, baglam(null)).some((x) => x.kod === 'KAYNAK' && x.alan === 'metin')).toBe(true);
  });
});
