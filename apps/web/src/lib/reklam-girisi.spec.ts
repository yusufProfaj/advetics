import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { RehberOzeti } from '@advetics/shared';
import {
  ONAY_METINLERI,
  aktifSekme,
  birincilEylem,
  butceMetni,
  eksikEtiketi,
  eskiTaslakMi,
  kisaSebep,
  platformRozetleri,
  satirAdi,
  satirEylemleri,
  satirSekmesi,
  sekmeyeAyir,
  taslaklariAyir,
  telefonOzeti,
  topluSonucMetni,
} from './reklam-girisi';

/**
 * ADVCAMPAIGN GİRİŞ EKRANI — saf karar mantığı ve bileşenin kaynak bekçileri.
 * Canlıdaki şikâyet: 24 satır tek listede, arşivlenmiş reklamlar canlılarla
 * karışık, satırlar ayırt edilemiyor, hiçbir şey silinemiyor.
 */
const SIMDI = Date.parse('2026-10-12T12:00:00Z');
const gunOnce = (n: number) => new Date(SIMDI - n * 86_400_000).toISOString();

function satir(p: Partial<RehberOzeti> = {}): RehberOzeti {
  return {
    id: p.id ?? 'r1',
    amac: 'SITE',
    durum: 'taslak',
    platformlar: { meta: true, google: false },
    eksikSayisi: 0,
    yayinlar: [],
    gorselVarlikId: null,
    butce: null,
    yayinAdi: null,
    createdAt: gunOnce(0),
    updatedAt: gunOnce(0),
    ...p,
  };
}
const yayin = (platform: 'meta' | 'google', durum: RehberOzeti['yayinlar'][number]['durum'], sebep: string | null = null) => ({ platform, durum, sebep });

describe('sekmeye ayırma', () => {
  it('taslak → Taslaklar; rehberi arşivde → Arşiv', () => {
    expect(satirSekmesi(satir())).toBe('taslaklar');
    expect(satirSekmesi(satir({ durum: 'arsivlendi' }))).toBe('arsiv');
    // Yayına gitmiş ama listeden kaldırılmış: platformda yayında olsa bile Arşiv.
    expect(satirSekmesi(satir({ durum: 'arsivlendi', yayinlar: [yayin('meta', 'yayinda')] }))).toBe('arsiv');
  });

  it('KRİTİK: platformdaki HER kurulum arşivlenmiş/kaldırılmışsa Arşiv (canlıda 13 satır yayındakilerle karışıktı)', () => {
    expect(satirSekmesi(satir({ durum: 'yayinda', yayinlar: [yayin('meta', 'arsivlendi'), yayin('google', 'arsivlendi')] }))).toBe('arsiv');
    // Biri hâlâ yayında: Yayındakiler.
    expect(satirSekmesi(satir({ durum: 'yayinda', yayinlar: [yayin('meta', 'arsivlendi'), yayin('google', 'yayinda')] }))).toBe('yayindakiler');
  });

  it('KRİTİK: kurulamamış ve duraklatılmış yayın Yayındakiler’de kalır (hata gözden kaybolmaz)', () => {
    expect(satirSekmesi(satir({ durum: 'yayinda', yayinlar: [yayin('meta', null, 'Başlamadı')] }))).toBe('yayindakiler');
    expect(satirSekmesi(satir({ durum: 'yayinda', yayinlar: [yayin('google', 'kapali_kuruldu')] }))).toBe('yayindakiler');
    // Yayın kaydı hiç okunmadıysa (boş liste) "her şey arşiv" sayılmaz.
    expect(satirSekmesi(satir({ durum: 'yayinda', yayinlar: [] }))).toBe('yayindakiler');
  });

  it('sekmeyeAyir her satırı tam bir sekmeye koyar (kayıp yok)', () => {
    const l = [satir({ id: 'a' }), satir({ id: 'b', durum: 'yayinda', yayinlar: [yayin('meta', 'yayinda')] }), satir({ id: 'c', durum: 'arsivlendi' })];
    const g = sekmeyeAyir(l);
    expect(g.taslaklar.map((x) => x.id)).toEqual(['a']);
    expect(g.yayindakiler.map((x) => x.id)).toEqual(['b']);
    expect(g.arsiv.map((x) => x.id)).toEqual(['c']);
  });
});

describe('varsayılan sekme', () => {
  const g = (y: number, t: number) => ({ yayindakiler: Array(y).fill(0), taslaklar: Array(t).fill(0), arsiv: [] });
  it('KRİTİK: önce Yayındakiler, boşsa Taslaklar; adresteki geçerli sekme kazanır', () => {
    expect(aktifSekme(undefined, g(2, 5))).toBe('yayindakiler');
    expect(aktifSekme(undefined, g(0, 5))).toBe('taslaklar');
    expect(aktifSekme(undefined, g(0, 0))).toBe('taslaklar');
    expect(aktifSekme('arsiv', g(2, 5))).toBe('arsiv');
    expect(aktifSekme('uydurma', g(2, 5))).toBe('yayindakiler');
  });
});

describe('eski taslak', () => {
  it('KRİTİK: amaç seçilmemiş ve bir günden eski → eski; bir saatlik yarım taslak eski DEĞİL', () => {
    expect(eskiTaslakMi(satir({ amac: null, updatedAt: gunOnce(2) }), SIMDI)).toBe(true);
    expect(eskiTaslakMi(satir({ amac: null, updatedAt: new Date(SIMDI - 3_600_000).toISOString() }), SIMDI)).toBe(false);
  });

  it('KRİTİK: bir haftadır dokunulmamış VE eksiği olan → eski; eksiksiz hazır taslak eski değil', () => {
    expect(eskiTaslakMi(satir({ eksikSayisi: 2, updatedAt: gunOnce(8) }), SIMDI)).toBe(true);
    expect(eskiTaslakMi(satir({ eksikSayisi: 2, updatedAt: gunOnce(6) }), SIMDI)).toBe(false);
    expect(eskiTaslakMi(satir({ eksikSayisi: 0, updatedAt: gunOnce(30) }), SIMDI)).toBe(false);
  });

  it('yayındaki ya da arşivdeki satır asla "eski taslak" değil', () => {
    expect(eskiTaslakMi(satir({ durum: 'yayinda', amac: null, updatedAt: gunOnce(30) }), SIMDI)).toBe(false);
    expect(eskiTaslakMi(satir({ durum: 'arsivlendi', amac: null, updatedAt: gunOnce(30) }), SIMDI)).toBe(false);
  });

  it('taslaklariAyir sırayı korur ve kimseyi düşürmez', () => {
    const l = [satir({ id: 'a' }), satir({ id: 'b', amac: null, updatedAt: gunOnce(3) }), satir({ id: 'c' })];
    const r = taslaklariAyir(l, SIMDI);
    expect(r.guncel.map((x) => x.id)).toEqual(['a', 'c']);
    expect(r.eski.map((x) => x.id)).toEqual(['b']);
  });
});

describe('satırın görünüşü', () => {
  const tarih = (iso: string) => iso.slice(0, 10);
  it('ad: yayın adı varsa o; yoksa amaç + oluşturma tarihi', () => {
    expect(satirAdi(satir({ yayinAdi: 'ADV · 12.10.2026 · Siteme gelsinler · 4F2A' }), tarih)).toBe('ADV · 12.10.2026 · Siteme gelsinler · 4F2A');
    expect(satirAdi(satir({ createdAt: '2026-10-03T08:00:00Z' }), tarih)).toBe('Siteme gelsinler · 2026-10-03');
    expect(satirAdi(satir({ amac: null, createdAt: '2026-10-03T08:00:00Z' }), tarih)).toBe('Amaç seçilmedi · 2026-10-03');
  });

  it('KRİTİK: platform başına TEK rozet; yeşil yalnız yayında, kırmızı yalnız hata ve ipucu yalnız hatada', () => {
    const r = platformRozetleri(
      satir({ durum: 'yayinda', yayinlar: [yayin('meta', 'kurulamadi','Meta reddetti: (#100) geçersiz alan'), yayin('google', 'yayinda', 'eski not')] }),
    );
    expect(r).toEqual([
      { platform: 'meta', etiket: 'Meta: Kurulamadı', ton: 'hata', ipucu: 'Meta reddetti: (#100) geçersiz alan' },
      { platform: 'google', etiket: 'Google: Yayında', ton: 'iyi', ipucu: null },
    ]);
    expect(platformRozetleri(satir({ durum: 'yayinda', yayinlar: [yayin('google', 'kapali_kuruldu')] }))[0]).toMatchObject({ etiket: 'Google: Duraklatılmış', ton: 'notr' });
    expect(platformRozetleri(satir({ durum: 'yayinda', yayinlar: [yayin('google', 'arsivlendi')] }))[0]!.etiket).toBe('Google: Kaldırıldı');
    expect(platformRozetleri(satir())).toEqual([]);
  });

  it('KRİTİK: söz son ekranla aynı: okunamayan "Kontrol edilemedi", kaydı yok ama sebepli "Kurulamadı" (sonsuz "Sürüyor" değil)', () => {
    const r = platformRozetleri(
      satir({ durum: 'yayinda', yayinlar: [yayin('meta', 'dogrulanamadi'), yayin('google', null, 'Bu platformda kurulum başlamadı')] }),
    );
    expect(r.map((x) => [x.etiket, x.ton, x.ipucu])).toEqual([
      ['Meta: Kontrol edilemedi', 'hata', null],
      ['Google: Kurulamadı', 'hata', 'Bu platformda kurulum başlamadı'],
    ]);
    expect(platformRozetleri(satir({ durum: 'yayinda', yayinlar: [yayin('meta', null)] }))[0]).toMatchObject({ etiket: 'Meta: Sürüyor', ton: 'notr' });
  });

  it('kısa sebep tek satır ve sınırlı', () => {
    expect(kisaSebep('a\n  b')).toBe('a b');
    expect(kisaSebep('x'.repeat(200), 10)).toBe(`${'x'.repeat(9)}…`);
    expect(kisaSebep(null)).toBeNull();
  });

  it('bütçe: günlük "/ gün", toplam "toplam", yoksa null', () => {
    const para = (m: string, b: string) => `${b}${Number(m) / 1e6}`;
    expect(butceMetni({ tip: 'gunluk', micros: '250000000', paraBirimi: 'TRY' }, para)).toBe('TRY250 / gün');
    expect(butceMetni({ tip: 'toplam', micros: '1000000000', paraBirimi: 'TRY' }, para)).toBe('TRY1000 toplam');
    expect(butceMetni(null, para)).toBeNull();
  });
});

describe('satır menüsü', () => {
  it('KRİTİK: taslakta "Taslağı sil", yayındakinde "Listeden kaldır", arşivde "Geri getir"', () => {
    expect(satirEylemleri(satir())).toEqual(['taslagi_sil']);
    expect(satirEylemleri(satir({ durum: 'yayinda', yayinlar: [yayin('meta', 'yayinda')] }))).toEqual(['listeden_kaldir']);
    expect(satirEylemleri(satir({ durum: 'arsivlendi' }))).toEqual(['geri_getir']);
    // Platformda arşivlenmiş (rehberi yayında) satır zaten Arşiv'de: menü yok.
    expect(satirEylemleri(satir({ durum: 'yayinda', yayinlar: [yayin('meta', 'arsivlendi')] }))).toEqual([]);
    expect(birincilEylem(satir())).toBe('Devam et');
    expect(birincilEylem(satir({ durum: 'yayinda' }))).toBe('Gör');
  });

  it('KRİTİK: "Listeden kaldır" penceresi platformun DOKUNULMADIĞINI söyler ve Reklam Yöneticisi’ne bağlar', () => {
    const m = ONAY_METINLERI.listeden_kaldir;
    expect(m.govde).toContain('Meta ve Google’daki kampanyalar olduğu gibi kalır');
    expect(m.govde).toContain('Reklam Yöneticisi');
    expect(m.yoneticiBaglantisi).toBe(true);
    expect(ONAY_METINLERI.taslagi_sil.govde).toContain('Bu taslak silinecek');
  });

  it('toplu sonuç: kısmi başarısızlık sayısıyla yazılır, tamamı geçtiyse null', () => {
    expect(topluSonucMetni(5, [])).toBeNull();
    expect(topluSonucMetni(5, ['Bu reklam zaten arşivde.', 'x'])).toBe('3 / 5 işlendi. İşlenemeyen 2 kayıt: Bu reklam zaten arşivde.');
  });
});

/** Bileşen render edilmiyor (vitest.config.ts); kurallar YORUMSUZ kaynakta taranıyor. */
describe('giriş bileşeni (kaynak bekçileri)', () => {
  const HAM = readFileSync(join(__dirname, '../components/rehber/rehber-girisi.tsx'), 'utf8');
  const KAYNAK = HAM.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '');

  /**
   * Pencere bloğu: `<Pencere` ile başlayan öğenin GERÇEK sınırı (`</Pencere>`).
   * 2026-10-14'ten beri onay penceresi ortak `Pencere` bileşeni (DOM'da
   * kalma, Esc, odak tuzağı bileşenin kendisinde).
   */
  function pencere(): string {
    const bas = KAYNAK.indexOf('<Pencere');
    if (bas < 0) throw new Error('onay penceresi bulunamadı');
    const son = KAYNAK.indexOf('</Pencere>', bas);
    if (son < 0) throw new Error('pencere kapanmadı');
    return KAYNAK.slice(bas, son);
  }

  it('BOŞA DÜŞME BEKÇİSİ: pencere bloğu gerçekten yakalandı', () => {
    expect(pencere().length).toBeGreaterThan(200);
  });

  it('KRİTİK: pencere metni ONAY_METINLERI’nden ve Reklam Yöneticisi bağlantısı pencerenin İÇİNDE', () => {
    const p = pencere();
    expect(p).toContain('{metin?.govde}');
    expect(KAYNAK).toMatch(/const metin = onay \? ONAY_METINLERI\[onay\.tur\]/);
    expect(p).toMatch(/metin\?\.yoneticiBaglantisi && \(/);
    expect(p).toContain('baglanti(REKLAM_YONETICISI, tasinan)');
  });

  it('KRİTİK: onaylanan işlem YALNIZ arşivle ucu (platforma giden bir uç çağrılmıyor)', () => {
    expect(pencere()).toContain("uygula('arsivle', onay.satirlar)");
    expect(KAYNAK).not.toMatch(/\/yayin\b|geri-al|durdur/);
  });

  it('sekme ve satır bağlantıları tek üreticiden (`baglanti`), elle sorgu dizesi yok', () => {
    expect(KAYNAK).toContain("baglanti('/reklam', tasinan, { sekme: k })");
    expect(KAYNAK).not.toMatch(/['`]\/reklam\?/);
  });

  it('menü ve pencere DOM’dan çıkmıyor (görünürlük geçişle); hata yutulmuyor', () => {
    // Satır menüsü ortak `AcilirMenu` (DOM'da kalır), pencere koşulsuz `acik` ile çiziliyor.
    expect(KAYNAK).toContain('<AcilirMenu');
    expect(pencere()).toMatch(/^<Pencere\s+acik=\{onayAcik\}/);
    expect(KAYNAK).not.toMatch(/onayAcik\s*&&\s*<Pencere/);
    expect(KAYNAK).not.toMatch(/\.catch\(\s*\(\)\s*=>/);
  });

  /*
   * AJAN 4 (mutasyon M7): `topluSonucMetni` sınanıyordu ama bileşenin onu
   * ÇAĞIRDIĞI sınanmıyordu; çağrıyı `hatalar[0] ?? null` ile değiştirmek
   * 23 testin hepsini yeşil bıraktı. Toplu silmede "5 / 7 işlendi" yerine
   * yalnız ilk hata görünür ve kaç kaydın silindiği kaybolurdu.
   */
  it('KRİTİK: toplu işlemin hatası `topluSonucMetni`nden (kısmi başarısızlık "N / M")', () => {
    const i = KAYNAK.indexOf('async function uygula(');
    if (i < 0) throw new Error('uygula bulunamadı');
    const govde = KAYNAK.slice(i, KAYNAK.indexOf('\n  function eylem(', i));
    expect(govde.length).toBeGreaterThan(200);
    expect(govde).toMatch(/setIslemHatasi\([^;]*topluSonucMetni\(satirlar\.length, hatalar\)\)/);
    // Her satırın hatası toplanıyor: döngü ilk hatada durmuyor.
    expect(govde).toMatch(/for \(const r of satirlar\) \{\s*try \{/);
  });

  it('kesilen liste "N / M" ile yazılıyor (sessiz kesme yok)', () => {
    expect(KAYNAK).toMatch(/\$?\{liste\.satirlar\.length\} \/ \$?\{liste\.toplam\} kayıt gösteriliyor/);
  });
});

/*
 * TELEFONDA "DEVAM ET" EKRAN DIŞINA DÜŞÜYORDU (2026-10-14 canlı denetim,
 * 375 px). Bütçe/eksik/platform sütunları telefonda gizleniyor, bilgileri
 * ad hücresinin altındaki özet satırına geçiyor.
 */
describe('telefon satır özeti', () => {
  const para = (m: string, b: string) => `${Number(m) / 1_000_000} ${b}`;
  const butce = { tip: 'gunluk', micros: '500000000', paraBirimi: 'TRY' } as RehberOzeti['butce'];

  it('KRİTİK: taslakta eksik sözü ve bütçe, gizlenen iki sütunun yerine', () => {
    expect(telefonOzeti(satir({ amac: null, butce }), 'taslaklar', para)).toBe('Amaç yok · 500 TRY / gün');
    expect(telefonOzeti(satir({ eksikSayisi: 3 }), 'taslaklar', para)).toBe('3 eksik');
  });

  it('yayındakilerde platform durumu ve bütçe', () => {
    const r = satir({ durum: 'yayinda', butce, yayinlar: [yayin('meta', 'yayinda')] });
    const o = telefonOzeti(r, 'yayindakiler', para)!;
    expect(o).toContain('Meta: ');
    expect(o.endsWith('500 TRY / gün')).toBe(true);
  });

  it('gösterecek bir şey yoksa null (boş satır çizilmez)', () => {
    expect(telefonOzeti(satir(), 'yayindakiler', para)).toBeNull();
  });

  it('eksik sözü rozetle aynı kaynaktan', () => {
    expect(eksikEtiketi({ amac: 'SITE', eksikSayisi: 2 })).toEqual({ metin: '2 eksik', hata: true });
    expect(eksikEtiketi({ amac: 'SITE', eksikSayisi: 0 })).toEqual({ metin: 'Eksik yok', hata: false });
  });

  it('KRİTİK: tabloda bütçe/eksik/platform telefonda gizli, ad hücresi özeti yalnız telefonda çiziyor', () => {
    const k = readFileSync(join(__dirname, '../components/rehber/rehber-girisi.tsx'), 'utf8')
      .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');
    for (const anahtar of ['butce', 'platform', 'eksik']) {
      const i = k.indexOf(`anahtar: '${anahtar}'`);
      if (i < 0) throw new Error(`${anahtar} sütunu bulunamadı: tarama boşa düştü`);
      expect(k.slice(i, k.indexOf('hucre:', i)), anahtar).toContain('ikincil: true');
    }
    expect(k).toContain("const ozet = telefonOzeti(r, sekme, (m, b) => formatMoney(m, b));");
    expect(k).toContain('<span className="block sm:hidden">{ozet}</span>');
  });
});

