import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { REHBER_ACILIS, REHBER_AMAC_KODLARI, platformGorunurMu, type RehberEksigi, type RehberHazirligi, type RehberProvaSonucu } from '@advetics/shared';
import { ApiRequestError } from '@/lib/api';
import {
  adimBittiMi,
  provaYoklanmaliMi,
  bitisSecenegi,
  bugun,
  degisiklikBirlestir,
  formSecimi,
  silme,
  videoListesiHali,
  gorunurAmaclar,
  kategoriDegeri,
  kayitHatasi,
  kelimeDegistir,
  kelimeOnerisiHali,
  kelimeSatirlari,
  konumEslemeImzasi,
  metinOnerisiHali,
  onDoldurma,
  oneriHatasi,
  paraGoster,
  platformDurumu,
  platformNedeni,
  provaGosterimi,
  seciliKategori,
  telefonKaydi,
  tutarOku,
  yasKilitliMi,
  yasSecenegi,
  yayinAdimlari,
  yayinBittiMi,
  yayinSonucu,
  yayinlanabilirMi,
  yerelAlanlar,
  youtubeKimligi,
} from './rehber-mantik';

const z = '2026-10-10T10:00:00Z';
const alan = <T,>(deger: T, kaynak: 'kullanici' | 'marka_merkezi' | 'derleyici' = 'kullanici') => ({ deger, kaynak, kim: null, zaman: z });

describe('değişiklik birleştirme ve yerel görüntü', () => {
  it('aynı alan iki kez gitmez, sonuncusu kazanır, sıra ilk görünüşte', () => {
    const k = degisiklikBirlestir(
      [
        { alan: 'amac', deger: 'SITE', kaynak: 'kullanici' },
        { alan: 'telefon', deger: '+90', kaynak: 'kullanici' },
      ],
      [{ alan: 'amac', deger: 'FORM', kaynak: 'kullanici' }],
    );
    expect(k).toEqual([
      { alan: 'amac', deger: 'FORM', kaynak: 'kullanici' },
      { alan: 'telefon', deger: '+90', kaynak: 'kullanici' },
    ]);
  });

  it('KRİTİK: sunucu cevabı yazılmamış değişikliği EZMEZ; `sil` alanı siler, null DEĞER olarak kalır', () => {
    const a = yerelAlanlar(
      { hedefAdres: alan('https://eski'), telefon: alan('+905551112233'), instagramId: alan('ig') },
      [
        { alan: 'hedefAdres', deger: 'https://yeni', kaynak: 'kullanici' },
        silme('telefon'),
        { alan: 'instagramId', deger: null, kaynak: 'kullanici' },
      ],
    );
    expect(a.hedefAdres?.deger).toBe('https://yeni');
    expect(a.telefon).toBeUndefined();
    // "Instagram olmadan" bir karar: alan DURUYOR, değeri null.
    expect(a.instagramId).toBeDefined();
    expect(a.instagramId?.deger).toBeNull();
    expect(silme('telefon')).toEqual({ alan: 'telefon', deger: null, kaynak: 'kullanici', sil: true });
  });

  it('kayıt hatası: 409 çatışma, diğerleri sunucunun mesajıyla', () => {
    expect(kayitHatasi(new ApiRequestError('eski', 409, 'CONFLICT'))).toEqual({ tur: 'catisma' });
    expect(kayitHatasi(new ApiRequestError('Alan geçersiz', 400, 'VALIDATION'))).toEqual({ tur: 'hata', mesaj: 'Alan geçersiz' });
    expect(kayitHatasi('?')).toEqual({ tur: 'hata', mesaj: 'Sunucuya ulaşılamadı.' });
    expect(kayitHatasi(new TypeError('Failed to fetch'))).toEqual({ tur: 'hata', mesaj: 'Sunucuya ulaşılamadı.' });
  });
});

describe('öneri: DÖRT HÂL ayrı', () => {
  it('KRİTİK: boş kelime önerisi "geldi" değil "bos" ve sunucunun NEDENİYLE', () => {
    expect(kelimeOnerisiHali({ satirlar: [], toplam: 0, bosNeden: 'Hesap atanmamış' })).toEqual({ tur: 'bos', neden: 'Hesap atanmamış' });
    expect(kelimeOnerisiHali({ satirlar: [], toplam: 0, bosNeden: null }).tur).toBe('bos');
    const dolu = { satirlar: [{ metin: 'villa', aylikArama: 880, rekabet: 'orta' as const }], toplam: 214, bosNeden: null };
    expect(kelimeOnerisiHali(dolu)).toEqual({ tur: 'geldi', deger: dolu });
  });

  it('KRİTİK: düşen çağrı "dustu" ve platformun mesajı — boş liste DEĞİL', () => {
    expect(oneriHatasi(new ApiRequestError('Google kota doldu', 429, 'QUOTA'))).toEqual({ tur: 'dustu', mesaj: 'Google kota doldu' });
    expect(oneriHatasi(new Error('ağ'))).toEqual({ tur: 'dustu', mesaj: 'ağ' });
  });

  it('metin önerisi: tamamen boşsa notlarıyla "bos"', () => {
    expect(metinOnerisiHali({ anaMetin: ' ', basliklar: [''], aciklamalar: [], notlar: ['Site okunamadı'] })).toEqual({ tur: 'bos', neden: 'Site okunamadı' });
    expect(metinOnerisiHali({ anaMetin: 'Merhaba', basliklar: [], aciklamalar: [], notlar: [] }).tur).toBe('geldi');
  });

  it('KRİTİK: video listesi boşsa sunucunun nedeniyle "bos", doluysa "geldi"', () => {
    expect(videoListesiHali({ satirlar: [], toplam: 0, dahaFazlaVar: false, bosNeden: 'Kanal bağlantısı kopmuş' })).toEqual({ tur: 'bos', neden: 'Kanal bağlantısı kopmuş' });
    const r = { satirlar: [{ videoId: 'dQw4w9WgXcQ', baslik: 'Tanıtım', kucukResim: null, yayinTarihi: null }], toplam: 1, dahaFazlaVar: false, bosNeden: null };
    expect(videoListesiHali(r)).toEqual({ tur: 'geldi', deger: r });
  });

  it('KRİTİK: form şablonu: null "okunamadı", boş dizi "yok" — ikisi ayrı', () => {
    expect(formSecimi(null)).toEqual({ tur: 'okunamadi' });
    expect(formSecimi([])).toEqual({ tur: 'yok' });
    expect(formSecimi([{ id: 'f', ad: 'Form' }]).tur).toBe('liste');
  });

  it('kelime satırları: seçililer önce ve hepsi, öneriden gelen tekrar Türkçe küçük harfle elenir', () => {
    const s = kelimeSatirlari(
      [{ metin: 'İzmir villa', aylikArama: null }],
      { satirlar: [{ metin: 'izmir villa', aylikArama: 500, rekabet: 'dusuk' }, { metin: 'kiralık villa', aylikArama: 22200, rekabet: 'yuksek' }], toplam: 2, bosNeden: null },
    );
    expect(s.map((x) => [x.metin, x.secili, x.rekabet])).toEqual([
      ['İzmir villa', true, 'dusuk'],
      ['kiralık villa', false, 'yuksek'],
    ]);
    expect(kelimeDegistir([{ metin: 'İzmir villa', aylikArama: null }], { metin: 'izmir villa', aylikArama: 1 })).toEqual([]);
    expect(kelimeDegistir([], { metin: ' villa ', aylikArama: 5 })).toEqual([{ metin: 'villa', aylikArama: 5 }]);
  });
});

describe('görünürlük süzgeci: tek karar platformGorunurMu', () => {
  it('KRİTİK: amaç kartları platformGorunurMu ile AYNI kararı veriyor (ajans yöneticisi ve diğer kullanıcılar)', () => {
    for (const ajans of [true, false]) {
      const beklenen = REHBER_AMAC_KODLARI.filter((k) => platformGorunurMu(k, 'meta', ajans) || platformGorunurMu(k, 'google', ajans));
      expect(gorunurAmaclar(ajans)).toEqual(beklenen);
    }
    // Bugünkü tabloda her şey deneme/kapalı: müşteri hiçbir amaç görmüyor.
    // (Tablo açılınca bu satır güncellenir; ekran boş listeyi SEBEBİYLE gösteriyor.)
    const acikVarMi = REHBER_AMAC_KODLARI.some((k) => REHBER_ACILIS[k].meta === 'acik' || REHBER_ACILIS[k].google === 'acik');
    expect(gorunurAmaclar(false).length > 0).toBe(acikVarMi);
  });

  it('karşılığı olmayan Google sebebini amaç tanımından yazıyor; açılışı kapalı olan "henüz açık değil"', () => {
    expect(platformDurumu('WHATSAPP', 'google', true)).toEqual({ gorunur: false, sebep: "Google'da WhatsApp reklamı yok", deneme: false });
    expect(platformDurumu('FORM', 'google', true)).toEqual({ gorunur: false, sebep: 'Bu amaçta Google henüz açık değil', deneme: false });
    expect(platformDurumu('SITE', 'meta', true).deneme).toBe(REHBER_ACILIS.SITE.meta === 'deneme');
    expect(platformDurumu('SITE', 'meta', false).gorunur).toBe(platformGorunurMu('SITE', 'meta', false));
  });

  it('öneri cümlesi sayı UYDURMUYOR ve hesabı olmayan platformu söylüyor', () => {
    const h = { ajansYoneticisi: true, hesaplar: [{ id: 'm', ad: 'M', paraBirimi: 'TRY', saatDilimi: 'Europe/Istanbul' }], googleHesaplari: [] };
    expect(platformNedeni('SITE', h)).toContain('Google Ads hesabı atanmamış');
    const tam = { ...h, googleHesaplari: [{ id: 'g', ad: 'G', musteriNo: '1-2-3', paraBirimi: 'TRY', saatDilimi: 'Europe/Istanbul' }] };
    expect(platformNedeni('SITE', tam)).not.toMatch(/\d/);
    // Dalga 1'de tek platformlu açık amaç VIDEO (Meta dalı Dalga 2'de).
    expect(platformNedeni('VIDEO', tam)).toContain("yalnız Google'da");
  });
});

describe('ray ve eksikler', () => {
  const e = (adim: 1 | 2 | 3 | 4 | 5 | 6, seviye: 'engel' | 'uyari'): RehberEksigi => ({ adim, alan: null, platform: null, kod: 'X', seviye, metin: 'x' });
  it('KRİTİK: geçilmiş ama engeli kalan adım "bitti" GÖSTERİLMEZ; uyarı engel sayılmaz', () => {
    expect(adimBittiMi([e(2, 'engel')], 2, 4)).toBe(false);
    expect(adimBittiMi([e(2, 'uyari')], 2, 4)).toBe(true);
    expect(adimBittiMi([], 4, 4)).toBe(false); // şu anki adım
    expect(adimBittiMi([e(2, 'engel')], 2, 7)).toBe(true); // son ekran
  });
});

describe('Kime: yaş ve kategori', () => {
  it('KRİTİK: kategori sorusu HİÇ cevaplanmadıysa hiçbir şık seçili değil; "Hayır" boş dizi', () => {
    expect(seciliKategori(undefined)).toBeNull();
    expect(seciliKategori([])).toBe('YOK');
    expect(seciliKategori(['HOUSING'])).toBe('HOUSING');
    expect(kategoriDegeri('YOK')).toEqual([]);
  });

  it('KRİTİK: konut, iş ve kredi yaşı kilitliyor; workspace tabanı da sayılıyor; siyaset kilitlemiyor', () => {
    expect(yasKilitliMi(['HOUSING'], [])).toBe(true);
    expect(yasKilitliMi([], ['EMPLOYMENT'])).toBe(true);
    expect(yasKilitliMi(['ISSUES_ELECTIONS_POLITICS'], [])).toBe(false);
    expect(yasKilitliMi(undefined, [])).toBe(false);
  });

  it('yaş düğmesi kayıtlı aralıktan', () => {
    expect(yasSecenegi(null, false)).toBe('genis');
    expect(yasSecenegi({ min: 25, max: 54 }, false)).toBe('25-54');
    expect(yasSecenegi({ min: 30, max: 40 }, false)).toBe('ozel');
    expect(yasSecenegi(null, true)).toBe('ozel');
  });
});

describe('para ve tarih', () => {
  it('tutar Türkçe yazımdan micros dizgesine, belirsiz "1.5" reddedilir', () => {
    expect(tutarOku('1.250,5', 'TRY')).toEqual({ tur: 'tamam', micros: '1250500000' });
    expect(tutarOku('1.5', 'TRY').tur).toBe('hata');
    expect(paraGoster('500000000', 'TRY')).toBe('500 ₺');
    expect(paraGoster('1250500000', 'TRY')).toBe('1.250,5 ₺');
    expect(paraGoster('40000000', 'USD')).toBe('40 USD');
  });

  it('KRİTİK: "bugün" hesabın saat diliminde', () => {
    const an = new Date('2026-10-07T23:00:00Z');
    expect(bugun('Europe/Istanbul', an)).toBe('2026-10-08');
    expect(bugun('America/Los_Angeles', an)).toBe('2026-10-07');
  });

  it('bitiş düğmesi kayıtlı takvimden', () => {
    expect(bitisSecenegi(null)).toBeNull();
    expect(bitisSecenegi({ baslangic: '2026-10-10', bitis: null })).toBe('yok');
    expect(bitisSecenegi({ baslangic: '2026-10-10', bitis: '2026-11-09' })).toBe(30);
    expect(bitisSecenegi({ baslangic: '2026-10-25', bitis: '2026-11-01' })).toBe(7); // yaz saati geçişi
    expect(bitisSecenegi({ baslangic: '2026-10-10', bitis: '2026-10-20' })).toBeNull();
  });
});

describe('prova ve yayın', () => {
  const OZ = 'a'.repeat(64);
  const prova: RehberProvaSonucu = { icerikOzeti: OZ, meta: { tur: 'gecti', zaman: z, not: null }, google: { tur: 'reddetti', zaman: z, mesajlar: ['Başlık uzun'] } };

  it('KRİTİK: içerik değiştiyse eski prova "bayat" — Yayınla açılmaz', () => {
    expect(provaGosterimi(prova, OZ, 'meta', false)).toEqual({ tur: 'gecti', not: null });
    expect(provaGosterimi(prova, 'b'.repeat(64), 'meta', false)).toEqual({ tur: 'bayat' });
    expect(yayinlanabilirMi([], { meta: true, google: false }, prova, OZ)).toBe(true);
    expect(yayinlanabilirMi([], { meta: true, google: false }, prova, 'b'.repeat(64))).toBe(false);
  });

  it('KRİTİK: açık platformlardan biri reddettiyse ya da engel varsa Yayınla kapalı', () => {
    expect(yayinlanabilirMi([], { meta: true, google: true }, prova, OZ)).toBe(false);
    const engel: RehberEksigi = { adim: 5, alan: 'butce', platform: null, kod: 'BTC-01', seviye: 'engel', metin: 'x' };
    expect(yayinlanabilirMi([engel], { meta: true, google: false }, prova, OZ)).toBe(false);
    const uyari: RehberEksigi = { ...engel, seviye: 'uyari' };
    expect(yayinlanabilirMi([uyari], { meta: true, google: false }, prova, OZ)).toBe(true);
    expect(yayinlanabilirMi([], { meta: false, google: false }, prova, OZ)).toBe(false);
  });

  it('onay penceresi adımları GERÇEK durumdan; deneme "atlandi"', () => {
    expect(yayinAdimlari(null)).toEqual(['suruyor', 'bekliyor', 'bekliyor']);
    expect(yayinAdimlari('geri_okuma')).toEqual(['bitti', 'suruyor', 'bekliyor']);
    expect(yayinAdimlari('fark_var')).toEqual(['bitti', 'hata', 'bekliyor']);
    expect(yayinAdimlari('kapali_kuruldu')).toEqual(['bitti', 'bitti', 'atlandi']);
    expect(yayinAdimlari('yayinda')).toEqual(['bitti', 'bitti', 'bitti']);
  });

  it('KRİTİK: yoklama motor ilerlerken sürüyor, son durumda duruyor; uyum durdurduysa hemen', () => {
    expect(yayinSonucu({ durum: 'kuruluyor' })).toBe('suruyor');
    expect(yayinSonucu({ durum: null })).toBe('suruyor');
    expect(yayinSonucu({ durum: 'kapali_kuruldu' })).toBe('duraklatildi');
    expect(yayinSonucu({ durum: 'iletildi' })).toBe('yayinda');
    expect(yayinSonucu({ durum: 'kurulamadi' })).toBe('hata');
    expect(yayinBittiMi([{ durum: 'yayinda' }, { durum: 'aciliyor' }], false)).toBe(false);
    expect(yayinBittiMi([{ durum: 'yayinda' }, { durum: 'kurulamadi' }], false)).toBe(true);
    expect(yayinBittiMi([], false)).toBe(false);
    expect(yayinBittiMi([], true)).toBe(true);
  });
});

describe('reklam adımı yardımcıları', () => {
  it('YouTube kimliği bağlantının üç biçiminden ve çıplak kimlikten', () => {
    expect(youtubeKimligi('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=3')).toBe('dQw4w9WgXcQ');
    expect(youtubeKimligi('https://youtu.be/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    expect(youtubeKimligi('https://youtube.com/shorts/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    expect(youtubeKimligi('dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    expect(youtubeKimligi('https://vimeo.com/123')).toBeNull();
  });

  it('telefon E.164, baştaki sıfır atılıyor', () => {
    expect(telefonKaydi('0 232 555 01 23')).toBe('+902325550123');
    expect(telefonKaydi('')).toBeNull();
  });

  it('konum eşlemesi: aynı eşlenmemiş küme İKİNCİ kez istenmez, Google kapalıysa hiç', () => {
    const a = { konumlar: alan([{ tur: 'city' as const, key: '1', etiket: 'İzmir', ulkeKodu: 'TR' }]) };
    expect(konumEslemeImzasi(a, false, new Set())).toBeNull();
    const imza = konumEslemeImzasi(a, true, new Set());
    expect(imza).toBe('city:1');
    expect(konumEslemeImzasi(a, true, new Set([imza!]))).toBeNull();
    const eslenmis = { konumlar: alan([{ tur: 'city' as const, key: '1', etiket: 'İzmir', ulkeKodu: 'TR', google: { kaynak: 'geoTargetConstants/1', ad: 'İzmir' } }]) };
    expect(konumEslemeImzasi(eslenmis, true, new Set())).toBeNull();
  });
});

describe('açılışta önden doldurma', () => {
  const h = {
    hesaplar: [{ id: 'm1', ad: 'M', paraBirimi: 'TRY', saatDilimi: 'Europe/Istanbul' }],
    googleHesaplari: [],
    sayfalar: [
      { id: 's1', ad: 'A', ustSayfaPlatformId: null },
      { id: 's2', ad: 'B', ustSayfaPlatformId: null },
    ],
    instagramHesaplari: [],
    youtubeKanallari: [],
    varsayilanKitle: { id: 'k', ad: 'K', ozet: '', konumlar: [{ tur: 'city', key: '1', etiket: 'İzmir', ulkeKodu: 'TR' }] },
    iletisim: { telefon: null, siteAdresi: 'https://ornek.com' },
  } as unknown as RehberHazirligi;

  it('KRİTİK: tek seçenek doldurulur, birden çok sayfada "listenin ilki" SEÇİLMEZ', () => {
    const d = onDoldurma({}, h);
    expect(d.map((x) => [x.alan, x.kaynak])).toEqual([
      ['metaHesabiId', 'workspace_profili'],
      ['konumlar', 'marka_merkezi'],
      ['hedefAdres', 'marka_merkezi'],
    ]);
  });

  it('dolu alana dokunulmaz', () => {
    expect(onDoldurma({ metaHesabiId: alan('m9'), konumlar: alan([]), hedefAdres: alan(null) }, h)).toEqual([]);
  });
});

/**
 * KAYNAK TARAMASI: panel eksik listesi KURMAZ, hatayı YUTMAZ, görünürlüğü
 * kendisi KARAR VERMEZ, açılan pencere DOM'dan ÇIKMAZ. Taramalar yorumsuz
 * kaynakta (kuralı anlatan yorum eşleşip testi yeşil tutmasın).
 */
const yorumsuz = (f: string) =>
  readFileSync(join(__dirname, f), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/^\s*\/\/.*$/gm, '');
const DOSYALAR = ['rehber-ekrani.tsx', 'adim-amac-nerede.tsx', 'adim-kime.tsx', 'adim-reklam.tsx', 'adim-butce.tsx', 'adim-kontrol.tsx', 'rehber-girisi.tsx'];

describe('kaynak: sözleşmeye bağlılık', () => {
  it('BOŞA DÜŞME BEKÇİSİ: bileşenler gerçekten okundu', () => {
    expect(yorumsuz('rehber-ekrani.tsx')).toContain('export function RehberEkrani');
    expect(yorumsuz('adim-kontrol.tsx')).toContain('export function OnayPenceresi');
  });

  it('KRİTİK: eksik listesi sunucudan; panelde rehberEksikleri çağrılmıyor', () => {
    for (const f of DOSYALAR) expect(yorumsuz(f), f).not.toMatch(/rehberEksikleri\s*\(|yayinaEngelVarMi\s*\(/);
    expect(yorumsuz('rehber-ekrani.tsx')).toContain('kayit.eksikler');
  });

  it('KRİTİK: hata yutulmuyor (`.catch(() =>` yok)', () => {
    for (const f of DOSYALAR) expect(yorumsuz(f), f).not.toMatch(/\.catch\(\(\)\s*=>/);
  });

  it('KRİTİK: görünürlüğü REHBER_ACILIS tablosuna doğrudan bakarak değil platformGorunurMu üzerinden veriyor', () => {
    const nerede = yorumsuz('adim-amac-nerede.tsx');
    expect(nerede).toContain('gorunurAmaclar(b.h.ajansYoneticisi)');
    expect(nerede).toContain('platformDurumu(');
    expect(nerede).not.toContain('REHBER_ACILIS');
    // Anahtar görünmeyen platformda kapalı.
    expect(nerede).toContain('disabled={!d.gorunur}');
  });

  it('KRİTİK: onay penceresi koşulsuz çiziliyor, görünürlük sınıfla', () => {
    const k = yorumsuz('adim-kontrol.tsx');
    expect(k).toContain("className={`${s.perde} ${acik ? s.acik : ''}`}");
    expect(k).not.toMatch(/if \(!acik\) return null/);
    expect(yorumsuz('rehber-ekrani.tsx')).toMatch(/<OnayPenceresi\s/);
    expect(yorumsuz('rehber-ekrani.tsx')).not.toMatch(/onayAcik\s*&&\s*<OnayPenceresi/);
  });

  it('KRİTİK: yayın sözleşmedeki içerik özetiyle gidiyor; prova öncesi bekleyenler yazılıyor', () => {
    const e = yorumsuz('rehber-ekrani.tsx');
    expect(e).toContain('icerikOzeti: kaydedici.durum().kayit.icerikOzeti');
    const prova = e.slice(e.indexOf('async function provaEt'), e.indexOf('async function yayinla'));
    expect(prova.length).toBeGreaterThan(50);
    expect(prova.indexOf('kaydedici.simdi()')).toBeLessThan(prova.indexOf('/prova'));
  });

  it('KRİTİK: boşaltılan kutu alanı SİLİYOR (`sil`), null değer yazmıyor; "Instagram olmadan" null DEĞER', () => {
    const r = yorumsuz('adim-reklam.tsx');
    const bt = yorumsuz('adim-butce.tsx');
    const n = yorumsuz('adim-amac-nerede.tsx');
    for (const a of ['telefon', 'hedefAdres', 'youtubeVideo']) expect(r, a).toContain(`sil(b, '${a}')`);
    for (const a of ['butce', 'takvim']) expect(bt, a).toContain(`sil(b, '${a}')`);
    for (const f of [r, bt, n]) expect(f).not.toMatch(/yaz\(b, '(telefon|hedefAdres|youtubeVideo|butce|takvim)', null\)/);
    expect(n).toContain("degisti={(v) => yaz(b, 'instagramId', v)}");
    expect(n).toContain("v === null ? sil(b, 'metaHesabiId')");
  });

  it('KRİTİK: metin önerisi kendiliğinden yazılmıyor; "Kullan" kullanici kaynağıyla yazıyor', () => {
    const r = yorumsuz('adim-reklam.tsx');
    const oner = r.slice(r.indexOf('async function oner()'), r.indexOf('function kullan('));
    expect(oner).toContain('setOneri(metinOnerisiHali(r))');
    expect(oner).not.toContain("yaz(b, 'metin'");
    expect(r).toMatch(/function metinYaz\(yeni: Metin\) \{\s*yaz\(b, 'metin', yeni\);/);
  });
});

describe('kaynak: sayfa', () => {
  const sayfa = readFileSync(join(__dirname, '..', '..', 'app', '(dashboard)', 'reklam', 'page.tsx'), 'utf8');
  it('rehber kimliği adreste, workspace eşleşmesi kontrol ediliyor', () => {
    expect(sayfa).toContain('first(params.rehber)');
    expect(sayfa).toContain('r.value.clientId !== clientId');
    expect(sayfa).toContain('/reklam/rehber/hazirlik?clientId=');
  });
  it('eski adresler /reklam’a yönleniyor', () => {
    for (const d of ['yeni', 'onizleme']) {
      const k = readFileSync(join(__dirname, '..', '..', 'app', '(dashboard)', 'reklam', d, 'page.tsx'), 'utf8');
      expect(k).toContain("redirect(baglanti('/reklam', { musteri }))");
    }
  });
});

describe('provaYoklanmaliMi — kuyruktaki prova yoklanır', () => {
  const ozet = 'a'.repeat(64);
  it('bir platform bekliyorsa ve içerik aynıysa yoklanır; bayat ya da bitmişse yoklanmaz', () => {
    const bekliyor = { icerikOzeti: ozet, meta: { tur: 'bekliyor' as const, zaman: '2026-10-10T10:00:00Z' }, google: null };
    expect(provaYoklanmaliMi(bekliyor, ozet)).toBe(true);
    expect(provaYoklanmaliMi(bekliyor, 'b'.repeat(64))).toBe(false);
    expect(provaYoklanmaliMi({ ...bekliyor, meta: { tur: 'gecti' as const, zaman: 'x', not: null } }, ozet)).toBe(false);
    expect(provaYoklanmaliMi(null, ozet)).toBe(false);
  });
});
