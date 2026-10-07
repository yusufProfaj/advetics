import { describe, expect, it } from 'vitest';
import {
  AKTARIM_ATLAMA_NEDENLERI,
  DAGILIM_BOS_NEDENLERI,
  PLAN_DURUMLARI,
  PLAN_EYLEMLERI,
  STRATEJI_UCLARI,
  type DagilimSatiri,
  type KelimeSatiri,
  type PlanOzeti,
} from '@advetics/shared';
import { ApiRequestError } from '@/lib/api';
import {
  AKTARIM_NEDEN_METNI,
  CAKISMA_METNI,
  DAGILIM_BOS_METNI,
  HUCRELER,
  STRATEJI_BOLUMLERI,
  aktarimOzeti,
  aylikAramaMetni,
  bolumCoz,
  butceOzeti,
  dagilimTaslagi,
  donemEtiketi,
  duzenlemeKilidi,
  eylemDugmeleri,
  eylemIstegi,
  gelecekAy,
  kelimeDegisiklikleri,
  matrisAsimlari,
  kitleMetni,
  matrisSatiriDogrula,
  microsGirdiMetni,
  onayMetni,
  oneriyiUygula,
  planSec,
  stratejiAdresi,
  tohumlariAyir,
  tutarCoz,
  ucAdresi,
  yazmaHatasiSinifla,
  yenidenOkunmali,
  type MatrisTaslakSatiri,
} from './hesap';

/**
 * AdvStrategy ekranının SAF kararları — çalıştırılarak sınanıyor.
 * Panelde bileşen render eden altyapı yok; JSX'teki her karar buraya
 * çıkarıldı ki kaynak taraması yerine davranış sınansın.
 */

const UUID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

describe('bölüm ve adres', () => {
  it('KRİTİK: yalnız üç bölüm var — sunum ve takvim bu turda GÖSTERİLMİYOR', () => {
    // Çalışmayan sekme, menüde ekranı olmayan satırın sayfa içi kopyası.
    expect(STRATEJI_BOLUMLERI.map((b) => b.kod)).toEqual(['butce', 'arama', 'matris']);
  });

  it('tanınan bölüm aynen, tanınmayan (eski sunum bağlantısı dahil) ilk bölüme düşüyor', () => {
    expect(bolumCoz('arama')).toBe('arama');
    expect(bolumCoz('matris')).toBe('matris');
    expect(bolumCoz('sunum')).toBe('butce');
    expect(bolumCoz('takvim')).toBe('butce');
    expect(bolumCoz(undefined)).toBe('butce');
  });

  it('KRİTİK: adres workspace’i, planı ve bölümü TAŞIYOR', () => {
    const a = stratejiAdresi('ws', { plan: 'p1', bolum: 'matris' });
    const q = new URLSearchParams(a.split('?')[1]);
    expect(a.startsWith('/strateji?')).toBe(true);
    expect(q.get('musteri')).toBe('ws');
    expect(q.get('plan')).toBe('p1');
    expect(q.get('bolum')).toBe('matris');
    // Verilmeyen anahtar düşüyor, "undefined" yazılmıyor.
    expect(stratejiAdresi('ws', {})).toBe('/strateji?musteri=ws');
  });

  it('API yolu sözleşmeden kuruluyor ve kimlik zorunlu', () => {
    expect(ucAdresi('/strateji/planlar')).toBe('/strateji/planlar');
    expect(ucAdresi('/strateji/planlar/:id/matris', 'a b')).toBe('/strateji/planlar/a%20b/matris');
    expect(() => ucAdresi('/strateji/planlar/:id')).toThrow();
  });

  it('adresteki plan yoksa en yeni açılıyor ama bu SÖYLENİYOR', () => {
    const p = (id: string) => ({ id }) as PlanOzeti;
    const liste = [p('yeni'), p('eski')];
    expect(planSec(liste, 'eski')).toEqual({ plan: liste[1], adrestekiYok: false });
    expect(planSec(liste, undefined)).toEqual({ plan: liste[0], adrestekiYok: false });
    expect(planSec(liste, 'baska')).toEqual({ plan: liste[0], adrestekiYok: true });
    expect(planSec([], 'x')).toEqual({ plan: null, adrestekiYok: true });
  });
});

describe('durum ve eylemler', () => {
  it('KRİTİK: düğmeler YALNIZCA yapilabilir listesinden', () => {
    expect(eylemDugmeleri([])).toEqual([]);
    expect(eylemDugmeleri(['onayla']).map((d) => d.eylem)).toEqual(['onayla']);
    // Sıra sabit, sunucunun gönderdiği sıra değil.
    expect(eylemDugmeleri(['iptal', 'onaya_gonder']).map((d) => d.eylem)).toEqual(['onaya_gonder', 'iptal']);
    expect(eylemDugmeleri([...PLAN_EYLEMLERI])).toHaveLength(PLAN_EYLEMLERI.length);
  });

  it('KRİTİK: onay kendi ucuna gidiyor, diğer eylemler /eylem ucuna', () => {
    const onay = eylemIstegi('p', 'onayla', 3);
    expect(onay.yol).toBe('/strateji/planlar/p/onayla');
    // `/eylem` şeması `onayla`yı reddediyor; gövdede eylem adı OLMAMALI.
    expect(onay.govde).toEqual({ surum: 3 });
    for (const e of ['onaya_gonder', 'geri_cek', 'aktar', 'iptal'] as const) {
      const r = eylemIstegi('p', e, 7);
      expect(r.yol).toBe('/strateji/planlar/p/eylem');
      expect(r.govde).toEqual({ eylem: e, surum: 7 });
    }
    // İki yol da sözleşmenin uç listesinde.
    const yollar = STRATEJI_UCLARI.map((u) => `${u.yontem} ${u.yol}`);
    expect(yollar).toContain('POST /strateji/planlar/:id/onayla');
    expect(yollar).toContain('POST /strateji/planlar/:id/eylem');
  });

  it('KRİTİK: düzenleme yalnız taslakta ve yazma yetkisiyle; diğer her durum NEDENİNİ söylüyor', () => {
    expect(duzenlemeKilidi('taslak', true)).toBeNull();
    expect(duzenlemeKilidi('taslak', false)).toMatch(/yetkin yok/);
    const nedenler = PLAN_DURUMLARI.filter((d) => d !== 'taslak').map((d) => duzenlemeKilidi(d, true));
    for (const n of nedenler) expect(n).toBeTruthy();
    // Her durumun kendi cümlesi: hepsi aynı genel metne düşmesin.
    expect(new Set(nedenler).size).toBe(nedenler.length);
  });

  it('KRİTİK: müşteri hesabının onayı ile ajansın onayı AYRI yazılıyor', () => {
    const z = '2026-10-08T09:30:00.000Z';
    const m = onayMetni({ userId: 'u', ad: 'Ayşe', rol: 'musteri', zaman: z });
    const a = onayMetni({ userId: 'u', ad: null, rol: 'ajans', zaman: z });
    expect(m).toMatch(/^Müşteri hesabı onayladı \(Ayşe\) · /);
    expect(a).toMatch(/^Ajans onayladı · /);
    // İstanbul saati: 09:30Z → 12:30.
    expect(m).toContain('12:30');
    expect(onayMetni(null)).toBeNull();
  });

  it('dönem Türkçe ay adıyla, Date’e çevrilmeden', () => {
    expect(donemEtiketi('2026-11')).toBe('Kasım 2026');
    expect(donemEtiketi('2027-01')).toBe('Ocak 2027');
    expect(donemEtiketi('bozuk')).toBe('bozuk');
  });

  it('gelecek ay İstanbul saatiyle; aralıktan sonra yıl dönüyor', () => {
    expect(gelecekAy(new Date('2026-10-15T12:00:00Z'))).toBe('2026-11');
    expect(gelecekAy(new Date('2026-12-10T12:00:00Z'))).toBe('2027-01');
    // UTC'de hâlâ 31 Ekim, İstanbul'da 1 Kasım.
    expect(gelecekAy(new Date('2026-10-31T22:30:00Z'))).toBe('2026-12');
  });

  it('aktarım özeti atlananı SAYIYOR ve nedenini yazıyor', () => {
    const o = aktarimOzeti({
      zaman: '2026-10-08T00:00:00Z',
      aktarilan: [{ matrisSatiriId: 'a', oturumId: 'o1' }],
      atlanan: [
        { matrisSatiriId: 'b', neden: 'niyet_desteklenmiyor' },
        { matrisSatiriId: 'c', neden: 'niyet_desteklenmiyor' },
        { matrisSatiriId: 'd', neden: 'platform_kapali' },
      ],
    });
    expect(o.baslik).toBe('4 satırdan 1 tanesi aktarıldı, 3 tanesi atlandı.');
    expect(o.nedenler).toEqual([
      `2 satır: ${AKTARIM_NEDEN_METNI.niyet_desteklenmiyor}`,
      `1 satır: ${AKTARIM_NEDEN_METNI.platform_kapali}`,
    ]);
    expect(Object.keys(AKTARIM_NEDEN_METNI).sort()).toEqual([...AKTARIM_ATLAMA_NEDENLERI].sort());
  });
});

describe('yazma hatası', () => {
  const r409 = (m: string) => new ApiRequestError(m, 409, 'CONFLICT');

  it('KRİTİK: 409 + sürüm İLERLEMİŞ = başkası değiştirdi, sabit cümleyle', () => {
    expect(yazmaHatasiSinifla(r409('Plan siz bakarken değişti.'), 3, 4)).toEqual({ cakisma: true, mesaj: CAKISMA_METNI });
    expect(CAKISMA_METNI).toBe('Plan başka biri tarafından değiştirildi, yenileyin.');
  });

  it('KRİTİK: 409 ama sürüm AYNI = başka bir ret; sunucunun kendi cümlesi', () => {
    // API 409'u "arama zaten sürüyor", "bu ay için açık plan var", "plan
    // düzenlenemez" için de kullanıyor. Onlara "başkası değiştirdi" demek
    // kullanıcıyı olmayan bir çakışmayı aramaya gönderirdi.
    expect(yazmaHatasiSinifla(r409('Bu planda bir kelime araması zaten sürüyor.'), 3, 3)).toEqual({
      cakisma: false,
      mesaj: 'Bu planda bir kelime araması zaten sürüyor.',
    });
    // Plan yeniden okunamadıysa çakışma İDDİA EDİLMİYOR.
    expect(yazmaHatasiSinifla(r409('x'), 3, null).cakisma).toBe(false);
    // Yeni plan (sürüm yok): "açık plan var" olduğu gibi.
    expect(yazmaHatasiSinifla(r409('Kasım için açık plan var.'), null, null).mesaj).toBe('Kasım için açık plan var.');
  });

  it('yalnız 409 yeniden okumayı tetikliyor; diğer hatalarda sunucunun cümlesi', () => {
    expect(yenidenOkunmali(r409('x'))).toBe(true);
    expect(yenidenOkunmali(new ApiRequestError('x', 400, 'X'))).toBe(false);
    expect(yazmaHatasiSinifla(new ApiRequestError('Dağılım toplamı aşıyor', 400, 'X'), 3, 4)).toEqual({
      cakisma: false,
      mesaj: 'Dağılım toplamı aşıyor',
    });
    expect(yazmaHatasiSinifla(new TypeError('fetch failed'), 3, 4).mesaj).toBe('Sunucuya ulaşılamadı.');
  });
});

describe('para', () => {
  it('boş tutar hata değil, "bütçe yok"', () => {
    expect(tutarCoz('  ', 'TRY')).toEqual({ tur: 'bos' });
    expect(tutarCoz('1.500', 'TRY')).toEqual({ tur: 'tamam', micros: 1_500_000_000n });
    // Belirsiz biçim reddediliyor (sunucunun ayrıştırıcısı).
    expect(tutarCoz('1.5', 'TRY').tur).toBe('hata');
  });

  it('KRİTİK: kayıtlı tutar kutuya konup GERİ okunduğunda aynı micros', () => {
    const ornekler: Array<[string, string]> = [
      ['1500000000', 'TRY'],
      ['1500500000', 'TRY'],
      ['1000000', 'TRY'],
      ['123456789010000', 'TRY'],
      ['5000000000', 'JPY'],
      ['1234567000', 'KWD'],
    ];
    for (const [m, para] of ornekler) {
      const metin = microsGirdiMetni(m, para);
      expect(tutarCoz(metin, para), `${m} ${para} → "${metin}"`).toEqual({ tur: 'tamam', micros: BigInt(m) });
    }
    expect(microsGirdiMetni('1500000000', 'TRY')).toBe('1.500');
    expect(microsGirdiMetni('1500500000', 'TRY')).toBe('1.500,50');
  });

  it('birimin ondalığından fazla kesir KIRPILMIYOR — hata olarak görünüyor', () => {
    const metin = microsGirdiMetni('1234567', 'TRY');
    expect(metin).toBe('1,234567');
    expect(tutarCoz(metin, 'TRY').tur).toBe('hata');
  });

  it('KRİTİK: kalan, tam ve aşım ayrı', () => {
    expect(butceOzeti('100000000', [30_000_000n, 20_000_000n])).toEqual({
      dagitilanMicros: 50_000_000n,
      durum: 'kalan',
      farkMicros: 50_000_000n,
    });
    expect(butceOzeti('100000000', [100_000_000n]).durum).toBe('tam');
    expect(butceOzeti('100000000', [80_000_000n, 30_000_000n])).toEqual({
      dagitilanMicros: 110_000_000n,
      durum: 'asim',
      farkMicros: 10_000_000n,
    });
  });
});

describe('bütçe dağılımı', () => {
  const satir = (platform: 'meta' | 'google', katman: 'soguk' | 'sicak' | 'yeniden_pazarlama', tl: number, kaynak: 'elle' | 'gecmis_veri'): DagilimSatiri => ({
    platform,
    katman,
    tutarMicros: String(BigInt(tl) * 1_000_000n),
    kaynak,
    gerekce: kaynak === 'gecmis_veri' ? 'son 90 gün' : null,
  });

  it('altı hücre: iki platform × üç katman', () => {
    expect(HUCRELER).toHaveLength(6);
    const t = dagilimTaslagi([satir('meta', 'soguk', 1500, 'elle')], 'TRY');
    expect(t['meta:soguk']).toEqual({ metin: '1.500', kaynak: 'elle', gerekce: null });
    expect(t['google:sicak']).toEqual({ metin: '', kaynak: null, gerekce: null });
  });

  it('KRİTİK: öneri ELLE hücrenin üstüne yazmıyor ve kaç hücrenin korunduğunu söylüyor', () => {
    const taslak = dagilimTaslagi([satir('meta', 'soguk', 999, 'elle'), satir('google', 'soguk', 10, 'gecmis_veri')], 'TRY');
    const r = oneriyiUygula(
      taslak,
      [satir('meta', 'soguk', 5000, 'gecmis_veri'), satir('google', 'soguk', 3000, 'gecmis_veri'), satir('meta', 'sicak', 2000, 'gecmis_veri')],
      'TRY',
    );
    expect(r.korunanElle).toBe(1);
    expect(r.taslak['meta:soguk'].metin).toBe('999');
    expect(r.taslak['google:soguk']).toEqual({ metin: '3.000', kaynak: 'gecmis_veri', gerekce: 'son 90 gün' });
    expect(r.taslak['meta:sicak'].kaynak).toBe('gecmis_veri');
    // Girdi taslağı değişmedi (React durumu yerinde bozulmasın).
    expect(taslak['google:soguk'].metin).toBe('10');
  });

  it('öneri yoksa dört nedenin her biri AYRI cümle', () => {
    expect(Object.keys(DAGILIM_BOS_METNI).sort()).toEqual([...DAGILIM_BOS_NEDENLERI].sort());
    expect(new Set(Object.values(DAGILIM_BOS_METNI)).size).toBe(DAGILIM_BOS_NEDENLERI.length);
  });
});

describe('google arama', () => {
  it('KRİTİK: hacmi olmayan kelime "veri yok", sıfır değil', () => {
    expect(aylikAramaMetni(null)).toBe('veri yok');
    expect(aylikAramaMetni(0)).toBe('yaklaşık 0');
    expect(aylikAramaMetni(49500)).toBe('yaklaşık 49.500');
  });

  it('tohumlar satır ya da virgülle ayrılıyor, tekrar bir kez sayılıyor', () => {
    expect(tohumlariAyir('filtre kahve, french press\nFiltre  Kahve\n\n')).toEqual({
      tur: 'tamam',
      tohumlar: ['filtre kahve', 'french press'],
    });
  });

  it('KRİTİK: sözleşmenin sınırları (1-20, en az iki harf) ekranda da geçerli', () => {
    expect(tohumlariAyir('   ').tur).toBe('hata');
    const yirmiBir = Array.from({ length: 21 }, (_, i) => `kelime${i}`).join('\n');
    expect(tohumlariAyir(yirmiBir)).toEqual({ tur: 'hata', mesaj: 'En çok 20 kelime' });
    const yirmi = Array.from({ length: 20 }, (_, i) => `kelime${i}`).join('\n');
    expect(tohumlariAyir(yirmi).tur).toBe('tamam');
    const kisa = tohumlariAyir('kahve, a');
    expect(kisa.tur).toBe('hata');
    if (kisa.tur === 'hata') expect(kisa.mesaj).toContain('"a"');
  });

  it('kelime tablosunda yalnız DEĞİŞEN satır ve yalnız değişen alan gönderiliyor', () => {
    const k = (id: string, secili: boolean, grup: string | null) => ({ id, secili, grup }) as KelimeSatiri;
    const satirlar = [k('a', false, null), k('b', true, 'kahve'), k('c', false, 'x')];
    expect(
      kelimeDegisiklikleri(satirlar, {
        a: { secili: true, grup: '' },
        b: { secili: true, grup: 'kahve' },
        c: { secili: false, grup: '  ' },
      }),
    ).toEqual([{ id: 'a', secili: true }, { id: 'c', grup: null }]);
  });
});

describe('matris', () => {
  const t = (p: Partial<MatrisTaslakSatiri>): MatrisTaslakSatiri => ({
    anahtar: 'k',
    platform: 'meta',
    katman: 'soguk',
    niyet: 'FORM',
    kitleSablonuId: UUID(1),
    kelimeGrubu: '',
    varlikIdleri: [],
    tutar: '1.000',
    not: '',
    ...p,
  });
  const dagilim: DagilimSatiri[] = [
    { platform: 'meta', katman: 'soguk', tutarMicros: '1500000000', kaynak: 'elle', gerekce: null },
  ];

  it('KRİTİK: hücredeki satırların toplamı dağılımı aşınca aşım CANLI hesaplanıyor', () => {
    expect(matrisAsimlari(dagilim, [t({ tutar: '1.000' }), t({ tutar: '500' })], 'TRY').asimlar).toEqual([]);
    const r = matrisAsimlari(dagilim, [t({ tutar: '1.000' }), t({ tutar: '600' })], 'TRY');
    expect(r.asimlar).toEqual([
      { platform: 'meta', katman: 'soguk', dagilimMicros: 1_500_000_000n, matrisMicros: 1_600_000_000n, asimMicros: 100_000_000n },
    ]);
  });

  it('KRİTİK: dağılımda OLMAYAN hücre sıfır bütçe sayılıyor', () => {
    const r = matrisAsimlari(dagilim, [t({ platform: 'google', kitleSablonuId: null, tutar: '1' })], 'TRY');
    expect(r.asimlar[0]).toMatchObject({ platform: 'google', dagilimMicros: 0n });
  });

  it('okunamayan tutar "aşım yok" diye yutulmuyor, sayılıyor', () => {
    expect(matrisAsimlari(dagilim, [t({ tutar: '1.5' }), t({ tutar: '' })], 'TRY').okunamayan).toBe(2);
  });

  it('KRİTİK: Meta satırında kitle zorunlu, Google’da değil (sözleşmenin şeması)', () => {
    expect(matrisSatiriDogrula(t({ kitleSablonuId: null }))).toEqual({ tur: 'hata', mesaj: 'Meta satırında kitle seçilmeli' });
    expect(matrisSatiriDogrula(t({ platform: 'google', kitleSablonuId: null, kelimeGrubu: ' kahve ' }))).toMatchObject({
      tur: 'tamam',
      govde: { kitleSablonuId: null, kelimeGrubu: 'kahve' },
    });
    expect(matrisSatiriDogrula(t({ tutar: '' }))).toEqual({ tur: 'hata', mesaj: 'Tutar yazılmalı.' });
    expect(matrisSatiriDogrula(t({ varlikIdleri: [UUID(2), UUID(2)] }))).toEqual({
      tur: 'hata',
      mesaj: 'Aynı görsel iki kez eklenemez',
    });
  });
});

describe('kitleMetni', () => {
  it('KRİTİK: Meta satırında boş kitle SİLİNMİŞ demek, Google satırında kitlesiz', () => {
    // Sunucu silinen şablonu `kitle: null` döndürüyor (SET NULL kimliği de siliyor).
    expect(kitleMetni('meta', null)).toBe('Silinmiş kitle');
    expect(kitleMetni('google', null)).toBe('Kitle yok');
    expect(kitleMetni('meta', { id: 'x', ad: 'Beyaz yaka' })).toBe('Beyaz yaka');
  });
});
