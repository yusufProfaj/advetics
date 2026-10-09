import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { AsistanMesaji, Oneri } from '@advetics/shared';
import {
  adimHalleri,
  adimMetinleri,
  devretAdresi,
  eylemMetni,
  gorunenOneriler,
  iyilestirKurallarAdresi,
  kartHali,
  oneriEylemAdresi,
  uygulamaSonucuCoz,
  miniYollar,
  oneriGuncelle,
  ozetSayilari,
  parcaEkle,
  parcalariAyikla,
  sekmeCoz,
  sonucMetni,
  turaGoreSuz,
  turuBitir,
  turCipleri,
  uygulaHatasi,
  yaziyorMu,
  yoksayilanSayisi,
} from './iyilestir';

/*
 * İYİLEŞTİR EKRANININ KARARLARI. Panelde bileşen render testi yok; kartın
 * hâli, özet sayıları, onay adımları ve asistan akışı burada ÇALIŞTIRILARAK
 * sınanıyor. En altta kaynak taramaları: bileşenlerin bu kararları
 * gerçekten KULLANDIĞI ve CLAUDE.md'nin sessiz hata yasaklarının çiğnenmediği.
 */

function oneri(degisim: Partial<Oneri> = {}): Oneri {
  return {
    anahtar: 'kreatif_yorgunlugu:ad:1:2026-W41',
    tur: 'kreatif_yorgunlugu',
    platform: 'meta',
    clientId: 'c1',
    clientAdi: 'Ege',
    varlik: { seviye: 'ad', id: '1', ad: 'Reels', ustAd: 'Kampanya A' },
    baslik: '"Reels" yoruldu',
    neden: 'Sıklık arttı.',
    kanitlar: [],
    seri: null,
    harcamaMikros: '1000000',
    paraBirimi: 'TRY',
    eylem: { tur: 'durdur' },
    kisit: null,
    durum: 'acik',
    uygulama: null,
    ozet: 'a'.repeat(64),
    ...degisim,
  };
}

const butce = (onceki: string, yeni: string, tip: 'daily' | 'lifetime' = 'daily') =>
  ({ tur: 'butce', butceSeviyesi: 'campaign', butceTipi: tip, oncekiMikros: onceki, yeniMikros: yeni }) as const;

describe('sekme', () => {
  it('adresteki sekmeyi listeden çözüyor, bilinmeyen Öneriler’e düşüyor', () => {
    expect(sekmeCoz('asistan')).toBe('asistan');
    expect(sekmeCoz('kurallar')).toBe('kurallar');
    expect(sekmeCoz(undefined)).toBe('oneriler');
    expect(sekmeCoz('yok-boyle')).toBe('oneriler');
  });

  it('eski /kurallar adresi sekmeye ve yalnız bilinen parametrelere yönleniyor', () => {
    expect(iyilestirKurallarAdresi({ musteri: 'c1', kural: 'r1', sekme: 'oneriler', x: 'y' })).toBe(
      '/iyilestir?sekme=kurallar&musteri=c1&kural=r1',
    );
    expect(iyilestirKurallarAdresi({})).toBe('/iyilestir?sekme=kurallar');
  });
});

describe('kartHali', () => {
  it('KRİTİK: geri okuma sonucu yoksa "doğrulandı" DEĞİL', () => {
    expect(kartHali(oneri({ durum: 'uygulandi', uygulama: null }), true)).toBe('uygulandi');
  });

  it('KRİTİK: uyuşmayan geri okuma ayrı hâl', () => {
    const u = { durum: 'uyusmadi', platformDegeri: '590 ₺ / gün', uygulayan: 'Y', zaman: '2026-10-09T10:00:00Z' } as const;
    expect(kartHali(oneri({ durum: 'uygulandi', uygulama: u }), true)).toBe('uyusmadi');
    expect(kartHali(oneri({ durum: 'uygulandi', uygulama: { ...u, durum: 'dogrulandi' } }), true)).toBe('dogrulandi');
  });

  it('eylemsiz öneri yalnız bilgi; yetkisiz kullanıcı düğme görmüyor', () => {
    expect(kartHali(oneri({ eylem: null, kisit: 'LinkedIn’e yazma yok' }), true)).toBe('bilgi');
    expect(kartHali(oneri(), false)).toBe('yetkisiz');
    expect(kartHali(oneri(), true)).toBe('uygulanabilir');
    expect(kartHali(oneri({ durum: 'yoksayildi' }), true)).toBe('yoksayildi');
  });

  it('yoksayılan gizleniyor ama SAYISI söyleniyor; uygulanan görünür kalıyor', () => {
    const l = [oneri({ anahtar: 'a' }), oneri({ anahtar: 'b', durum: 'yoksayildi' }), oneri({ anahtar: 'c', durum: 'uygulandi' })];
    expect(gorunenOneriler(l).map((o) => o.anahtar)).toEqual(['a', 'c']);
    expect(yoksayilanSayisi(l)).toBe(1);
  });

  it('oneriGuncelle yalnız anahtarı eşleşeni değiştiriyor, sırayı koruyor', () => {
    const l = [oneri({ anahtar: 'a' }), oneri({ anahtar: 'b' })];
    const y = oneriGuncelle(l, 'b', { durum: 'yoksayildi' });
    expect(y.map((o) => [o.anahtar, o.durum])).toEqual([
      ['a', 'acik'],
      ['b', 'yoksayildi'],
    ]);
  });
});

describe('özet şeridi', () => {
  it('KRİTİK: yalnız AÇIK öneriler sayılıyor, harcama BigInt ile toplanıyor', () => {
    const o = ozetSayilari({
      oneriler: [
        oneri({ anahtar: 'a', harcamaMikros: '2340000000' }),
        oneri({ anahtar: 'b', harcamaMikros: '5500000000', eylem: null }),
        oneri({ anahtar: 'c', harcamaMikros: '999000000', durum: 'uygulandi' }),
        oneri({ anahtar: 'd', harcamaMikros: '999000000', durum: 'yoksayildi' }),
      ],
      buAyUygulanan: 5,
    });
    expect(o.uygulanabilir).toBe(1);
    expect(o.yalnizBilgi).toBe(1);
    expect(o.acik).toBe(2);
    expect(o.buAyUygulanan).toBe(5);
    expect(o.harcama).toContain('7.840');
    expect(o.harcama).toContain('₺');
  });

  it('KRİTİK: farklı para birimleri TOPLANMIYOR', () => {
    const o = ozetSayilari({
      oneriler: [oneri({ anahtar: 'a', harcamaMikros: '100000000' }), oneri({ anahtar: 'b', harcamaMikros: '50000000', paraBirimi: 'USD' })],
      buAyUygulanan: 0,
    });
    expect(o.harcama.split(' + ')).toHaveLength(2);
    expect(o.harcama).toContain('100');
    expect(o.harcama).toContain('50');
  });

  it('açık öneri yoksa harcama "—", sıfır değil', () => {
    expect(ozetSayilari({ oneriler: [], buAyUygulanan: 0 }).harcama).toBe('—');
  });
});

describe('tür çipleri', () => {
  it('iki bütçe türü TEK çip ("Bütçe"); Tümü hepsini sayıyor', () => {
    const l = [
      oneri({ anahtar: 'a' }),
      oneri({ anahtar: 'b', tur: 'butce_artir', eylem: butce('500000000', '600000000') }),
      oneri({ anahtar: 'c', tur: 'butce_azalt', eylem: butce('300000000', '240000000') }),
    ];
    expect(turCipleri(l)).toEqual([
      { anahtar: 'hepsi', etiket: 'Tümü', sayi: 3 },
      { anahtar: 'Kreatif yorgunluğu', etiket: 'Kreatif yorgunluğu', sayi: 1 },
      { anahtar: 'Bütçe', etiket: 'Bütçe', sayi: 2 },
    ]);
    expect(turaGoreSuz(l, 'Bütçe').map((o) => o.anahtar)).toEqual(['b', 'c']);
    expect(turaGoreSuz(l, 'hepsi')).toHaveLength(3);
  });
});

describe('eylem metinleri (düğme + şimdi → sonra)', () => {
  it('durdurma seviyeye ve platformun adına göre', () => {
    expect(eylemMetni(oneri())?.dugme).toBe('Reklamı durdur');
    expect(eylemMetni(oneri({ varlik: { seviye: 'ad_group', id: '1', ad: 'S', ustAd: null } }))?.dugme).toBe('Reklam setini durdur');
    expect(
      eylemMetni(oneri({ platform: 'google', varlik: { seviye: 'ad_group', id: '1', ad: 'S', ustAd: null } }))?.dugme,
    ).toBe('Reklam grubunu durdur');
    const m = eylemMetni(oneri())!;
    expect([m.once, m.sonra]).toEqual(['Yayında', 'Duraklatıldı']);
    expect(m.baslik).toBe('Reklamı durdur: onay');
  });

  it('KRİTİK: bütçe tutarı eylemin micros’undan; artış/azalış yönü doğru', () => {
    const a = eylemMetni(oneri({ eylem: butce('500000000', '600000000') }))!;
    expect(a.dugme).toBe('Bütçeyi artır');
    expect(a.once).toContain('500');
    expect(a.sonra).toContain('600');
    expect(a.sonra).toContain('/ gün');
    const d = eylemMetni(oneri({ eylem: butce('300000000', '50000000', 'lifetime') }))!;
    expect(d.dugme).toBe('Bütçeyi düşür');
    expect(d.sonra).toContain('(toplam)');
  });

  it('eylemsiz öneride metin yok', () => {
    expect(eylemMetni(oneri({ eylem: null }))).toBeNull();
  });
});

describe('onay penceresi adımları', () => {
  it('Türkçe ek platforma göre', () => {
    expect(adimMetinleri('meta')[0]).toBe('Meta’ya gönder');
    expect(adimMetinleri('google')[0]).toBe('Google’a gönder');
    expect(adimMetinleri('google')[1]).toBe('Google’dan geri oku ve karşılaştır');
  });

  it('KRİTİK: istek sürerken geri okuma "bitti" görünmüyor', () => {
    expect(adimHalleri('gonderiliyor')).toEqual(['suruyor', 'bos', 'bos']);
    expect(adimHalleri('hazir')).toEqual(['bos', 'bos', 'bos']);
  });

  it('KRİTİK: uyuşmayan sonuçta geri okuma adımı UYARI, doğrulanmış değil', () => {
    expect(adimHalleri('uyusmadi')).toEqual(['bitti', 'uyari', 'bitti']);
    expect(adimHalleri('dogrulandi')).toEqual(['bitti', 'bitti', 'bitti']);
    expect(adimHalleri('degisti')[0]).toBe('hata');
  });

  it('KRİTİK: 409 "öneri değişti" ayrı hâl; sunucunun cümlesi korunuyor', () => {
    expect(uygulaHatasi({ status: 409, message: 'Öneri değişti, yenile' })).toEqual({ asama: 'degisti', mesaj: 'Öneri değişti, yenile' });
    expect(uygulaHatasi({ status: 502, message: 'Meta: izin yok' })).toEqual({ asama: 'hata', mesaj: 'Meta: izin yok' });
    expect(uygulaHatasi(null)).toEqual({ asama: 'hata', mesaj: 'Bağlantı kurulamadı.' });
  });

  it('KRİTİK: uyuşmayan sonuçta PLATFORM DEĞERİ ve istenen değer yazılıyor', () => {
    const u = { durum: 'uyusmadi', platformDegeri: '590 ₺ / gün', uygulayan: 'Y', zaman: 'z' } as const;
    const m = sonucMetni(u, 'meta', '600 ₺ / gün', 'az önce');
    expect(m.ton).toBe('uyari');
    expect(m.metin).toContain('590 ₺ / gün');
    expect(m.metin).toContain('600 ₺ / gün');
    const d = sonucMetni({ ...u, durum: 'dogrulandi' }, 'google', null, 'az önce');
    expect(d).toEqual({ ton: 'ok', metin: 'Uygulandı · Google’da doğrulandı · az önce' });
  });
});

describe('uygula yanıtı', () => {
  const u = { durum: 'dogrulandi', platformDegeri: 'Duraklatıldı', uygulayan: 'Y', zaman: 'z' } as const;
  it('sözleşmenin `UygulamaSonucu`su ve API’nin güncel `Oneri`si ikisi de çözülüyor', () => {
    expect(uygulamaSonucuCoz(u)).toEqual(u);
    expect(uygulamaSonucuCoz(oneri({ durum: 'uygulandi', uygulama: u }))).toEqual(u);
  });

  it('KRİTİK: sonucu olmayan yanıt "doğrulandı" sayılmıyor', () => {
    expect(uygulamaSonucuCoz(oneri({ durum: 'uygulandi', uygulama: null }))).toBeNull();
    expect(uygulamaSonucuCoz({ prova: true, platformDegeri: 'x' })).toBeNull();
    expect(uygulamaSonucuCoz(undefined)).toBeNull();
  });

  it('eylem adresi anahtarı kodluyor ve workspace’i taşıyor', () => {
    expect(oneriEylemAdresi({ anahtar: 'butce_artir:campaign:9:2026-W41', clientId: 'c1' }, 'uygula')).toBe(
      '/iyilestir/oneriler/butce_artir%3Acampaign%3A9%3A2026-W41/uygula?clientId=c1',
    );
  });
});

describe('mini grafik', () => {
  it('iki seri, her biri kendi ölçeğinde, kutunun içinde', () => {
    const y = miniYollar({ adlar: ['Sıklık', 'Tıklama oranı'], a: [1, 2, 3], b: [3, 2, 1] })!;
    expect(y.a).toBe('M4.0,60.0L75.0,32.0L146.0,4.0');
    expect(y.b).toBe('M4.0,4.0L75.0,32.0L146.0,60.0');
  });

  it('düz seri ortadan; çizilemeyen seri null (boş SVG "sıfır" gibi okunur)', () => {
    expect(miniYollar({ adlar: ['a', 'b'], a: [5, 5], b: [1, 2] })!.a).toBe('M4.0,32.0L146.0,32.0');
    expect(miniYollar(null)).toBeNull();
    expect(miniYollar({ adlar: ['a', 'b'], a: [1], b: [1] })).toBeNull();
    expect(miniYollar({ adlar: ['a', 'b'], a: [1, 2], b: [1] })).toBeNull();
    expect(miniYollar({ adlar: ['a', 'b'], a: [1, Number.NaN], b: [1, 2] })).toBeNull();
  });
});

describe('asistan akışı', () => {
  it('sunucunun zarfını çözüyor (basladi/metin/parca/bitti), yarım bloğu bekletiyor', () => {
    const mesaj = { id: 'm1', rol: 'asistan', parcalar: [{ tur: 'metin', metin: 'Merhaba' }], zaman: 'z' };
    const r = parcalariAyikla(
      'event: basladi\ndata: {"tur":"basladi","mesajId":"m1"}\n\n' +
        'event: metin\ndata: {"tur":"metin","parca":"Mer"}\n\n' +
        'data: {"tur":"parca","parca":{"tur":"arac","arac":"metrik_ozeti","ozet":""}}\n\n' +
        `data: ${JSON.stringify({ tur: 'bitti', mesaj })}\n\n` +
        'data: {"tur":"me',
    );
    expect(r.parcalar).toEqual([
      { tur: 'metin', metin: 'Mer' },
      { tur: 'arac', arac: 'metrik_ozeti', ozet: '' },
    ]);
    expect(r.bitti).toEqual(mesaj);
    expect(r.kalan).toBe('data: {"tur":"me');
    expect([r.bozuk, r.taninmayan]).toEqual([0, 0]);
  });

  it('zarfsız düz parça da kabul ediliyor', () => {
    expect(parcalariAyikla('data: {"tur":"metin","metin":"x"}\n\n').parcalar).toEqual([{ tur: 'metin', metin: 'x' }]);
  });

  it('KRİTİK: bozuk ve tanınmayan olay SAYILIYOR, sessizce atılmıyor', () => {
    const r = parcalariAyikla(
      'data: {bozuk\n\ndata: {"tur":"yeni_tur"}\n\ndata: {"tur":"parca","parca":{"tur":"yeni"}}\n\ndata: {"tur":"parca","parca":{"tur":"hata","mesaj":"kota"}}\n\n',
    );
    expect(r.bozuk).toBe(1);
    expect(r.taninmayan).toBe(2);
    expect(r.parcalar).toEqual([{ tur: 'hata', mesaj: 'kota' }]);
  });

  it('KRİTİK: bitti olayı akan birikimin YERİNE geçiyor (metin iki kez görünmesin)', () => {
    const akan: AsistanMesaji[] = [
      { id: 'k', rol: 'kullanici', parcalar: [{ tur: 'metin', metin: 'soru' }], zaman: 'z' },
      { id: 'yerel', rol: 'asistan', parcalar: [{ tur: 'metin', metin: 'ham metin' }], zaman: 'z' },
    ];
    const kayit: AsistanMesaji = { id: 'm1', rol: 'asistan', parcalar: [{ tur: 'metin', metin: 'temiz' }], zaman: 'z' };
    expect(turuBitir(akan, kayit).map((m) => m.id)).toEqual(['k', 'm1']);
    expect(turuBitir(akan.slice(0, 1), kayit).map((m) => m.id)).toEqual(['k', 'm1']);
  });

  it('ardışık metin parçaları tek balonda birleşiyor; diğer parçalar ayrı', () => {
    const bas: AsistanMesaji[] = [{ id: 'a', rol: 'asistan', parcalar: [], zaman: 'z' }];
    let m = parcaEkle(bas, { tur: 'metin', metin: 'Mer' });
    m = parcaEkle(m, { tur: 'metin', metin: 'haba' });
    m = parcaEkle(m, { tur: 'arac', arac: 'oneriler', ozet: '' });
    m = parcaEkle(m, { tur: 'metin', metin: '.' });
    expect(m[0]!.parcalar).toEqual([
      { tur: 'metin', metin: 'Merhaba' },
      { tur: 'arac', arac: 'oneriler', ozet: '' },
      { tur: 'metin', metin: '.' },
    ]);
    // Kullanıcı mesajına asla eklenmiyor.
    const k: AsistanMesaji[] = [{ id: 'k', rol: 'kullanici', parcalar: [], zaman: 'z' }];
    expect(parcaEkle(k, { tur: 'metin', metin: 'x' })[0]!.parcalar).toEqual([]);
  });

  it('yazıyor göstergesi yalnız akış sürerken ve henüz parça yokken', () => {
    const bos: AsistanMesaji[] = [{ id: 'a', rol: 'asistan', parcalar: [], zaman: 'z' }];
    expect(yaziyorMu(true, bos)).toBe(true);
    expect(yaziyorMu(false, bos)).toBe(false);
    expect(yaziyorMu(true, parcaEkle(bos, { tur: 'metin', metin: 'x' }))).toBe(false);
  });

  it('KRİTİK: devir adresi oturumu VE workspace’i taşıyor', () => {
    expect(devretAdresi('c 1', 'o1')).toBe('/reklam?musteri=c+1&oturum=o1');
  });
});

// ─── Kaynak taramaları (yorumsuz kaynakta) ───────────────────────────────────

const yorumsuz = (yol: string): string =>
  readFileSync(join(__dirname, '..', yol), 'utf8')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

const BILESENLER = [
  'components/iyilestir/oneriler-sekmesi.tsx',
  'components/iyilestir/oneri-karti.tsx',
  'components/iyilestir/onay-penceresi.tsx',
  'components/iyilestir/asistan-sekmesi.tsx',
  'components/rules/kurallar-icerik.tsx',
  'app/(dashboard)/iyilestir/page.tsx',
];

describe('KAYNAK: sessiz hata yasakları', () => {
  it('tarama boşa düşmüyor — dosyalar okunuyor ve dolu', () => {
    for (const d of BILESENLER) expect(yorumsuz(d).length, d).toBeGreaterThan(500);
  });

  it('KRİTİK: hiçbir dosyada hatayı boş listeye çeviren catch yok', () => {
    for (const d of BILESENLER) {
      const k = yorumsuz(d);
      expect(k, d).not.toMatch(/\.catch\(\(\)\s*=>\s*set\w+\(\s*\[\s*\]\s*\)\)/);
      expect(k, d).not.toMatch(/\.catch\(\(\)\s*=>\s*\[\s*\]\)/);
    }
  });

  it('KRİTİK: öneri listesinin `hatalar` dizisi ekranda', () => {
    expect(yorumsuz('components/iyilestir/oneriler-sekmesi.tsx')).toContain('liste.hatalar.join(');
  });

  it('KRİTİK: Kurallar’da hesap listesi hatası yutulmuyor (eski sayfa `.catch(() => [])` diyordu)', () => {
    const k = yorumsuz('components/rules/kurallar-icerik.tsx');
    expect(k).toMatch(/\.catch\(\(e: unknown\) => \{\s*hesapHatasi = hataMetni\(e\);/);
    expect(k).toContain('{hesapHatasi && (');
  });

  it('KRİTİK: eylemsiz kartta `kisit` yazılıyor', () => {
    expect(yorumsuz('components/iyilestir/oneri-karti.tsx')).toMatch(/hal === 'bilgi' && <span className=\{i\.kisit\}>\{oneri\.kisit/);
  });
});

describe('KAYNAK: tek uygulama yolu', () => {
  const pencere = yorumsuz('components/iyilestir/onay-penceresi.tsx');

  it('KRİTİK: uygula isteği önerinin ÖZETİNİ taşıyor (409 bekçisi bununla çalışıyor)', () => {
    expect(pencere).toContain("oneriEylemAdresi(o, 'uygula')");
    expect(pencere).toContain('JSON.stringify({ ozet: o.ozet })');
    expect(pencere).toContain('uygulamaSonucuCoz(yanit)');
  });

  it('KRİTİK: /uygula YALNIZ onay penceresinde — asistan ve kart aynı pencereyi kullanıyor', () => {
    for (const d of BILESENLER.filter((x) => !x.endsWith('onay-penceresi.tsx'))) {
      expect(yorumsuz(d), d).not.toContain('/uygula');
      expect(yorumsuz(d), d).not.toContain("'uygula')");
    }
    expect(yorumsuz('components/iyilestir/asistan-sekmesi.tsx')).toContain('<OnayPenceresi');
    expect(yorumsuz('components/iyilestir/oneriler-sekmesi.tsx')).toContain('<OnayPenceresi');
  });

  it('KRİTİK: pencere DOM’dan çıkmıyor — koşulsuz çiziliyor, görünürlük sınıfla', () => {
    const govde = pencere.slice(pencere.indexOf('return (\n    <div className={`${i.perde}'));
    expect(govde.length, 'pencere gövdesi bulunamadı').toBeGreaterThan(100);
    expect(pencere).toContain("${acik ? i.perdeAcik : ''}");
    expect(pencere).not.toMatch(/if \(!(oneri|acik)\) return null/);
  });

  it('KRİTİK: uyuşmayan sonuçta pencere kendiliğinden KAPANMIYOR', () => {
    expect(pencere).toContain("if (r.durum === 'dogrulandi') setTimeout(onKapat");
  });

  it('KRİTİK: asistan akışı ayrıştırıcıyı kullanıyor, okunamayan parçayı sayıyor ve turu kayıtlı hâlle bitiriyor', () => {
    const a = yorumsuz('components/iyilestir/asistan-sekmesi.tsx');
    expect(a).toContain('parcalariAyikla(tampon)');
    expect(a).toContain('sorun += r.bozuk + r.taninmayan');
    expect(a).toContain('turuBitir(l, bitti)');
    expect(a).toContain('void kayitliOku(id)');
  });

  it('KRİTİK: devir kartı AdvCampaign oturum adresini üreticiden alıyor ve /reklam bu parametreleri okuyor', () => {
    expect(yorumsuz('components/iyilestir/asistan-sekmesi.tsx')).toContain('devretAdresi(clientId, p.oturumId)');
    const reklam = yorumsuz('app/(dashboard)/reklam/page.tsx');
    expect(reklam).toContain('params.oturum');
    expect(reklam).toContain('params.musteri');
  });
});

describe('KAYNAK: sayfa ve hareket', () => {
  it('KRİTİK: sayfa kapısı menüyle aynı yetki; Uygula `budget.write`', () => {
    const sayfa = yorumsuz('app/(dashboard)/iyilestir/page.tsx');
    expect(sayfa).toContain("hasPermission(session, 'rule.read')");
    expect(sayfa).toContain("const yazabilir = hasPermission(session, 'budget.write')");
  });

  it('KRİTİK: /kurallar eski adresi İyileştir’e yönleniyor', () => {
    expect(yorumsuz('app/(dashboard)/kurallar/page.tsx')).toContain('redirect(iyilestirKurallarAdresi(');
  });

  it('KRİTİK: bütün animasyonlar hareket azaltma tercihinin altında', () => {
    const css = readFileSync(join(__dirname, '..', 'components/taslak/iyilestir.module.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    const bas = css.indexOf('@media (prefers-reduced-motion: no-preference) {');
    expect(bas, 'hareket bloğu yok').toBeGreaterThan(-1);
    let d = 0;
    let son = -1;
    for (let j = css.indexOf('{', bas); j < css.length; j++) {
      if (css[j] === '{') d++;
      if (css[j] === '}' && --d === 0) {
        son = j;
        break;
      }
    }
    const hareket = css.slice(bas, son + 1);
    expect(hareket).toContain('animation: gir');
    const disari = (css.slice(0, bas) + css.slice(son + 1)).replace(/@keyframes[\s\S]*?\n}\n/g, '');
    expect(disari).not.toMatch(/animation:(?!\s*none)/);
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)[\s\S]*transition: none !important/);
  });
});
