import { inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import type { KelimeSatiri, PlanDetayi } from '@advetics/shared';
import { medyaPlaniPdf, donemAdi } from './medya-plani-pdf';
import { medyaPlaniDosyaAdi } from './strateji.service';

/**
 * Medya planı PDF'i — ÇALIŞTIRILARAK ve METNİ OKUNARAK. "PDF üretildi"
 * yetmiyor: standart yazı tipiyle de üretilirdi, yalnız `ğ ş ı` düşerdi.
 *
 * `metinler()` rapor PDF testindekiyle aynı desen (rapor-pdf.service.spec.ts):
 * yazı tipi alt küme gömülüyor ve metin belgede glif kimliği; ToUnicode
 * haritalarının HER BİRİYLE çözülüp adaylar döndürülüyor (hangi haritanın
 * hangi fonta ait olduğu addan çıkarılamıyor).
 */
function metinler(pdf: Buffer): string[] {
  const ham = pdf.toString('latin1');
  const akislar: string[] = [];
  const re = /stream\r?\n/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(ham)) !== null) {
    const bas = m.index + m[0].length;
    const son = ham.indexOf('endstream', bas);
    if (son === -1) continue;
    try {
      akislar.push(inflateSync(Buffer.from(ham.slice(bas, son), 'latin1')).toString('latin1'));
    } catch {
      akislar.push(ham.slice(bas, son));
    }
  }
  const haritalar: Array<Map<string, string>> = [];
  for (const a of akislar) {
    if (!a.includes('begincmap')) continue;
    const h = new Map<string, string>();
    for (const mm of a.matchAll(/<([0-9a-fA-F]{4})>\s*<([0-9a-fA-F]{4,})>/g)) {
      h.set(mm[1]!.toLowerCase(), String.fromCodePoint(parseInt(mm[2]!.slice(0, 4), 16)));
    }
    haritalar.push(h);
  }
  const out: string[] = [];
  for (const a of akislar) {
    if (!a.includes('Tj')) continue;
    for (const mm of a.matchAll(/<([0-9a-fA-F]+)>\s*Tj/g)) {
      const hex = mm[1]!;
      for (const h of haritalar) {
        let t = '';
        for (let i = 0; i + 4 <= hex.length; i += 4) t += h.get(hex.slice(i, i + 4).toLowerCase()) ?? '';
        if (t) out.push(t);
      }
    }
  }
  return out;
}

const kelime = (ad: string, o: Partial<KelimeSatiri> = {}): KelimeSatiri => ({
  id: ad,
  kelime: ad,
  aylikArama: 49500,
  rekabet: 'HIGH',
  teklifAltMicros: '1500000',
  teklifUstMicros: '4250000',
  varyantlar: [],
  grup: 'kahve',
  grupElle: false,
  secili: true,
  cekimZamani: '2026-10-08T10:00:00.000Z',
  ...o,
});

function detay(o: Partial<PlanDetayi['plan']> = {}, kelimeler: KelimeSatiri[] = [kelime('filtre kahve')]): PlanDetayi {
  return {
    plan: {
      id: 'p',
      clientId: 'c',
      donem: '2026-11',
      durum: 'taslak',
      surum: 3,
      toplamButceMicros: '100000000000',
      paraBirimi: 'TRY',
      dagitilanMicros: '70000000000',
      onaylayan: null,
      aktarim: null,
      not: null,
      olusturuldu: '2026-10-08T10:00:00.000Z',
      guncellendi: '2026-10-08T10:00:00.000Z',
      ...o,
    },
    dagilim: [
      { platform: 'meta', katman: 'soguk', tutarMicros: '50000000000', kaynak: 'gecmis_veri', gerekce: 'g' },
      { platform: 'google', katman: 'yeniden_pazarlama', tutarMicros: '20000000000', kaynak: 'elle', gerekce: null },
    ],
    matris: [
      {
        id: 'm1', platform: 'meta', katman: 'soguk', niyet: 'FORM', kitle: { id: 'k', ad: 'İzmir kadın 25-44' }, kelimeGrubu: null,
        varliklar: [{ id: 'v1', ad: 'Kare görsel', kucukResimAdresi: null }, { id: 'v2', ad: null, kucukResimAdresi: null }],
        tutarMicros: '30000000000', not: null,
      },
      { id: 'm2', platform: 'meta', katman: 'soguk', niyet: 'SITE', kitle: null, kelimeGrubu: null, varliklar: [], tutarMicros: '5000000000', not: null },
    ],
    kelimeler: { erisim: 'var', satirlar: kelimeler, gosterilen: kelimeler.length, toplam: kelimeler.length, aramaSuruyor: false, sonHata: null },
    yapilabilir: [],
  };
}

const onayli = (rol: 'musteri' | 'ajans') =>
  detay({ durum: 'onaylandi', onaylayan: { userId: 'u', ad: 'A', rol, zaman: '2026-10-08T21:30:00.000Z' } });

describe('medya planı PDF', () => {
  it('gerçek bir PDF', async () => {
    const pdf = await medyaPlaniPdf({ workspace: 'Polimek', detay: detay() });
    expect(pdf.subarray(0, 5).toString('ascii')).toBe('%PDF-');
  });

  it('KRİTİK: Türkçe karakterler belgeye GİRİYOR (gömülü yazı tipi)', async () => {
    const m = metinler(await medyaPlaniPdf({ workspace: 'Şişli Iğdır Çiçekçilik', detay: detay() }));
    expect(m).toContain('Şişli Iğdır Çiçekçilik');
    expect(m).toContain('Bütçe dağılımı');
    expect(m).toContain('Kasım 2026');
  });

  it('KRİTİK: taslak plan kapakta büyük harfle TASLAK; onaylıda yok', async () => {
    expect(metinler(await medyaPlaniPdf({ workspace: 'W', detay: detay() }))).toContain('TASLAK');
    expect(metinler(await medyaPlaniPdf({ workspace: 'W', detay: onayli('musteri') }))).not.toContain('TASLAK');
  });

  it('KRİTİK: onay rolü ayrı cümleyle; tarih İstanbul takvimiyle; onaylanan sürüm yazılı', async () => {
    const m = metinler(await medyaPlaniPdf({ workspace: 'W', detay: onayli('musteri') }));
    // 21:30 UTC = İstanbul'da ertesi gün.
    expect(m).toContain('Müşteri hesabı onayladı · 09.10.2026');
    expect(m).toContain('Onaylanan sürüm: 3');
    const a = metinler(await medyaPlaniPdf({ workspace: 'W', detay: onayli('ajans') }));
    expect(a).toContain('Ajans onayladı · 09.10.2026');
    expect(a.some((t) => t.startsWith('Müşteri hesabı onayladı'))).toBe(false);
  });

  it('KRİTİK: dağılım tablosu, TOPLAM ve dağıtılmamış kısım', async () => {
    const m = metinler(await medyaPlaniPdf({ workspace: 'W', detay: detay() }));
    expect(m).toContain('TOPLAM');
    expect(m).toContain('70.000,00 TL');
    expect(m).toContain('Dağıtılmamış: 30.000,00 TL');
    expect(m).toContain('Geçmiş veriden');
    expect(m).toContain('Siteyi ziyaret edenler');
  });

  it('matris: amaç adı, kitle adı, silinmiş kitle ve silinmiş görsel söyleniyor', async () => {
    const m = metinler(await medyaPlaniPdf({ workspace: 'W', detay: detay() }));
    expect(m).toContain('Form doldursunlar');
    expect(m).toContain('İzmir kadın 25-44');
    expect(m).toContain('Silinmiş kitle');
    expect(m).toContain('Kare görsel, silinmiş görsel');
  });

  it('KRİTİK: yalnız SEÇİLİ kelimeler, grup başlığıyla, "yaklaşık" hacim ve teklif aralığı', async () => {
    const m = metinler(
      await medyaPlaniPdf({
        workspace: 'W',
        detay: detay({}, [kelime('filtre kahve'), kelime('gizli fikir', { secili: false }), kelime('philips', { grup: null, aylikArama: null })]),
      }),
    );
    expect(m).toContain('kahve (1)');
    expect(m).toContain('Diğer (1)');
    expect(m).toContain('~49.500');
    expect(m).toContain('bilinmiyor');
    expect(m).toContain('1,50 TL – 4,25 TL');
    expect(m).not.toContain('gizli fikir');
  });

  it('KRİTİK: uzun liste SESSİZCE KESİLMEZ — her satır bir sayfada', async () => {
    const cok = Array.from({ length: 120 }, (_, i) => kelime(`kelime ${String(i).padStart(3, '0')}`));
    const m = metinler(await medyaPlaniPdf({ workspace: 'W', detay: detay({}, cok) }));
    for (const k of cok) expect(m, k.kelime).toContain(k.kelime);
  });

  it('dönem adı ve dosya adı', () => {
    expect(donemAdi('2026-02')).toBe('Şubat 2026');
    expect(medyaPlaniDosyaAdi('Polimek "x"\r\nSet-Cookie', '2026-11', 3, 'onaylandi')).toBe('medya-plani-polimek-x-set-cookie-2026-11-s3.pdf');
    expect(medyaPlaniDosyaAdi('', '2026-11', 1, 'taslak')).toBe('medya-plani-workspace-2026-11-s1-taslak.pdf');
  });
});
