import { describe, expect, it } from 'vitest';
import {
  ADVANTAGE_VIDEO_YERLESIM_CUMLESI,
  DUGMESIZ_VIDEO_ETIKETI,
  geriOkumaKarsilastir,
  MEDYA_SINIRLARI,
  META_THRUPLAY_CUMLESI,
  REHBER_ACILIS,
  VIDEO_DUGMESIZ_CUMLESI,
  beklenenYankilar,
  derleMeta,
  ekOkumaAlanlari,
  kararTablosu,
  medyaKontrol,
  metaKonumCumlesi,
  niyetYerlesimKisiti,
  rehberEksikleri,
  rehberYerlesimPlani,
  videoUzunBaslik,
  youtubeVideoEngeli,
  type DerlemeGirdisi,
  type MetaGovdesi,
  type RehberAlanlari,
  type RehberEksikBaglami,
} from '@advetics/shared';
import { isoSureSaniye } from '../../autoboost/youtube-api.service';
import { videoOneriGorselleri } from './rehber.service';

/*
 * "VIDEOM İZLENSİN" DENETİM TURU (Ajan 2+3, 2026-10-13). Her blok bir
 * bulguyu (B5…B20) ya da yönetici kararını (S1…S7) gövdeyle, ekranın
 * sözüyle ya da giriş kontrolüyle eşliyor. Söz ile gövde ayrışırsa ekran
 * yalan söyler: bu depoda en pahalı hata türü.
 */
const TL = (n: number) => BigInt(n) * 1_000_000n;
const temel: DerlemeGirdisi = {
  apiSurumu: 'v25.0',
  yayinKimligi: '7q2kab12-0000-4000-8000-000000000000',
  tarih: '2026-10-07',
  workspaceKisaAdi: 'Örnek Yapı',
  niyet: 'VIDEO_IZLENME',
  hesap: { platformId: 'act_1', paraBirimi: 'TRY' },
  sayfaPlatformId: '111',
  instagramPlatformId: '222',
  hedefleme: { konumlar: [{ tur: 'region', key: '2347', etiket: 'İzmir', ulkeKodu: 'TR' }], enDusukYas: 18, ipucuYas: null, ipucuCinsiyet: null },
  kategoriler: { taban: [], ek: [] },
  butce: { tip: 'gunluk', micros: TL(500), seviye: 'kampanya' },
  takvim: { baslangic: '2026-10-08T00:00:00+0300', bitis: null },
  atif: 'tik7_gor1',
  kavramlar: [{ gorselHash: 'KAPAK', videoId: 'VID', baslik: 'B', metin: 'M' }],
  hedefAdres: null,
  formId: null,
  telefon: null,
  urlEtiketleri: null,
};
function govde(g: Partial<DerlemeGirdisi> = {}) {
  const r = derleMeta({ ...temel, ...g });
  if (r.tur !== 'govde') throw new Error(JSON.stringify(r.retler));
  return r;
}
const bul = (gs: MetaGovdesi[], ad: string) => gs.find((x) => x.ad === ad)!.alanlar as Record<string, any>;

// ─────────────────────────────────────────────────────────────────────────────
describe('S1/B9 — Meta video yerleşimi: Advantage+ ama Audience Network HARİÇ', () => {
  /*
   * K1 (Ajan 4): Meta placement-targeting belgesinin konum kümesi. Gövde
   * bunun ALT KÜMESİ olmalı (belgede olmayan değer = kabul edip yok sayma
   * riski) ve kapalı dışında hepsini açmalı (söz "YALNIZ Audience Network
   * hariç"; belge video için sağ sütun ve aramayı desteklemeyebilir diyor).
   */
  const BELGE = {
    facebook_positions: ['feed', 'right_hand_column', 'marketplace', 'video_feeds', 'story', 'search', 'instream_video', 'facebook_reels', 'facebook_reels_overlay', 'profile_feed', 'notification'],
    instagram_positions: ['stream', 'story', 'explore', 'explore_home', 'reels', 'profile_feed', 'ig_search', 'profile_reels'],
  };
  it('KRİTİK (K1): video arası, video akışı, profil akışları AÇIK; sağ sütun, arama, Messenger, Audience Network KAPALI', () => {
    const t = bul(govde().govdeler, 'reklam_seti').targeting;
    expect(t.publisher_platforms).toEqual(['facebook', 'instagram']);
    expect(t.facebook_positions).toEqual(['facebook_reels', 'feed', 'instream_video', 'marketplace', 'profile_feed', 'story', 'video_feeds']);
    expect(t.instagram_positions).toEqual(['explore', 'explore_home', 'profile_feed', 'reels', 'story', 'stream']);
    for (const alan of ['facebook_positions', 'instagram_positions'] as const) for (const k of t[alan]) expect(BELGE[alan]).toContain(k);
    expect(t).not.toHaveProperty('audience_network_positions');
    expect(t).not.toHaveProperty('messenger_positions');
  });

  it('K1: diğer amaçların konum listesi DEĞİŞMEDİ (ek konum yalnız video kısıtında)', () => {
    const tel = derleMeta({ ...temel, niyet: 'TELEFON', telefon: '+905321234567', kavramlar: [{ gorselHash: 'h', baslik: 'B', metin: 'M', oran: 'kare' }] });
    if (tel.tur !== 'govde') throw new Error(JSON.stringify(tel.retler));
    expect(bul(tel.govdeler, 'reklam_seti').targeting.facebook_positions).not.toContain('instream_video');
  });

  it('Instagram hesabı yoksa Instagram düşer, Audience Network yine yok', () => {
    const t = bul(govde({ instagramPlatformId: null }).govdeler, 'reklam_seti').targeting;
    expect(t.publisher_platforms).toEqual(['facebook']);
    expect(t).not.toHaveProperty('instagram_positions');
  });

  it('"kapattıklarımız" niyetin cümlesini söylüyor (grup kapanmasa da ağ kapanıyor)', () => {
    expect(govde().kapattiklarimiz).toContain(niyetYerlesimKisiti('VIDEO_IZLENME')!.aciklama);
    expect(niyetYerlesimKisiti('VIDEO_IZLENME')!.aciklama).toMatch(/Audience Network/);
  });

  it('KRİTİK: karar tablosu "Nerede" ↔ rehberin planı (derleyicinin AYNI kararı): elle, Audience Network hariç', () => {
    const a = { amac: { deger: 'VIDEO', kaynak: 'kullanici', kim: null, zaman: 'x' }, medya: { deger: [{ varlikId: 'v', kapakVarlikId: 'k' }], kaynak: 'kullanici', kim: null, zaman: 'x' } } as unknown as RehberAlanlari;
    const plan = rehberYerlesimPlani(a, new Map());
    expect(plan?.otomatik).toBe(false);
    const h = kararTablosu('VIDEO', { meta: true, google: false }, 'MAKS_TIKLAMA', true, plan).find((x) => x.kod === 'NEREDE')!.meta!;
    expect(h.deger).toBe('Instagram ve Facebook, Audience Network hariç yerleşimlerde');
    expect(h.not).toContain('Audience Network');
    // K1: açık konumlar GÖVDEDEN türüyor; gövdenin cümlesiyle birebir.
    expect(h.not).toContain(`Açık: ${metaKonumCumlesi(bul(govde().govdeler, 'reklam_seti').targeting)}`);
    expect(h.not).toContain('video arası');
    expect(h.not).not.toMatch(/Açık:[^·]*sağ sütun/);
  });

  it('N-21: video kampanyasının Advantage+ durumu bilgi olarak okunur ve elle yerleşim cümlesi eklenir', () => {
    const y = beklenenYankilar(govde().govdeler);
    const n21 = y.find((x) => x.karsilastirma === 'yalniz_bilgi');
    expect(n21?.ekBilgi).toBe(ADVANTAGE_VIDEO_YERLESIM_CUMLESI);
    expect(ekOkumaAlanlari(y, 'kampanya')).toEqual(['advantage_state_info']);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('S3/B7 — video düğmesi yalnız site adresi varsa', () => {
  it('KRİTİK: adres YOK → video_data düğmesiz; manifesto bunu kabul ediyor (M-25 koşullu)', () => {
    const r = govde();
    expect(bul(r.govdeler, 'kreatif:1').object_story_spec.video_data).not.toHaveProperty('call_to_action');
    expect(r.kapattiklarimiz).toContain(VIDEO_DUGMESIZ_CUMLESI);
  });

  /*
   * N-22 (Ajan 4): yankılar yalnız GÖNDERİLEN alanlardan kuruluyordu;
   * düğmesiz videoda Meta varsayılan bir düğme eklese geri okuma "temiz"
   * derdi ve S3'ün kaldırdığı düğme izsiz geri gelirdi.
   */
  it('KRİTİK: düğmesiz videoda Meta düğme EKLERSE geri okuma FARK; eklemezse temiz', () => {
    const r = govde();
    const ayna = Object.fromEntries(r.govdeler.map((g) => [g.ad, structuredClone(g.alanlar) as Record<string, unknown>]));
    const yankilar = beklenenYankilar(r.govdeler).filter((y) => y.govde === 'kreatif:1' && y.alanYolu.startsWith('object_story_spec.video_data'));
    const n22 = yankilar.find((y) => y.alanYolu === 'object_story_spec.video_data.call_to_action');
    expect(n22?.karsilastirma).toBe('yok_olmali');
    expect(geriOkumaKarsilastir(yankilar, ayna, { yasalUyariVar: false }).sonuc).toBe('temiz');

    const ekli = structuredClone(ayna);
    ((ekli['kreatif:1']!.object_story_spec as any).video_data as any).call_to_action = { type: 'LEARN_MORE', value: { link: 'https://www.facebook.com/111' } };
    const s = geriOkumaKarsilastir(yankilar, ekli, { yasalUyariVar: false });
    expect(s.sonuc).toBe('fark');
    expect(s.sonuc !== 'temiz' && s.satirlar.map((x) => x.ekranEtiketi)).toEqual([DUGMESIZ_VIDEO_ETIKETI]);
  });

  it('düğmeli videoda N-22 satırı YOK (düğme normal M-25 yankısıyla kıyaslanıyor)', () => {
    const y = beklenenYankilar(govde({ hedefAdres: 'https://ornek.com.tr/v' }).govdeler);
    expect(y.some((x) => x.karsilastirma === 'yok_olmali')).toBe(false);
  });

  it('KRİTİK: adres VAR → LEARN_MORE ve site; Facebook sayfasına bağlanan düğme hiçbir dalda yok', () => {
    const r = govde({ hedefAdres: 'https://ornek.com.tr/v' });
    expect(bul(r.govdeler, 'kreatif:1').object_story_spec.video_data.call_to_action).toEqual({ type: 'LEARN_MORE', value: { link: 'https://ornek.com.tr/v' } });
    expect(JSON.stringify(govde().govdeler)).not.toContain('facebook.com/111');
  });

  it('KRİTİK: başka amaçta düğme hâlâ ZORUNLU (M-25 yalnız video izlenmede koşullu)', () => {
    // Form videosu: düğme form kimliğini taşıyor; koşul açılırsa form reklamı düğmesiz kurulurdu.
    const r = derleMeta({ ...temel, niyet: 'FORM', formId: '123', hedefAdres: null });
    expect(r.tur === 'govde' && bul(r.govdeler, 'kreatif:1').object_story_spec.video_data.call_to_action.value.lead_gen_form_id).toBe('123');
  });

  it('Kontrol tablosu aynı kuralı söylüyor: adres yoksa "Düğme yok: site adresi verilmedi"', () => {
    const satir = (siteAdresi: string | null) => kararTablosu('VIDEO', { meta: true, google: false }, 'MAKS_TIKLAMA', true, null, { siteAdresi }).find((x) => x.kod === 'DUGME')!.meta!;
    expect(satir(null).deger).toBe(VIDEO_DUGMESIZ_CUMLESI);
    expect(satir('https://ornek.com.tr').deger).toBe('Daha fazla bilgi');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('B5 — vaat ThruPlay tanımıyla', () => {
  it('Ölçüm hücresi "ThruPlay: 15 sn ya da tamamı"; reklam seti THRUPLAY', () => {
    const h = kararTablosu('VIDEO', { meta: true, google: false }, 'MAKS_TIKLAMA', true).find((x) => x.kod === 'OLCUM')!.meta!;
    expect(h.not).toBe(META_THRUPLAY_CUMLESI);
    expect(bul(govde().govdeler, 'reklam_seti').optimization_goal).toBe('THRUPLAY');
  });

  it('S5: billing IMPRESSIONS kalıyor; S7: sıklık sınırı yok', () => {
    const rs = bul(govde().govdeler, 'reklam_seti');
    expect(rs.billing_event).toBe('IMPRESSIONS');
    expect(rs).not.toHaveProperty('frequency_control_specs');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('B6 — video metinlerinin ekran etiketleri', () => {
  it('title / message / link_description ham alan yolu olarak görünmüyor', () => {
    const y = beklenenYankilar(govde({ kavramlar: [{ gorselHash: 'K', videoId: 'V', baslik: 'B', metin: 'M', aciklama: 'A' }] }).govdeler);
    const et = (yol: string) => y.find((x) => x.alanYolu === `object_story_spec.video_data.${yol}`)!.ekranEtiketi;
    expect(et('title')).toBe('Video başlığı');
    expect(et('message')).toBe('Ana metin');
    expect(et('link_description')).toBe('Açıklama');
    expect(et('image_hash')).toBe('Video kapağı');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('B8 — video süresi giriş anında', () => {
  const video = { mime: 'video/mp4', bayt: 1000, en: 1080, boy: 1920 };
  it('KRİTİK: 1 saniyeden kısa video RET (her amaçta)', () => {
    expect(medyaKontrol({ ...video, sure: 0.6 }).sonuc).toBe('ret');
    expect(medyaKontrol({ ...video, sure: MEDYA_SINIRLARI.videoEnAzSaniye }).sonuc).toBe('kabul');
  });
  it('KRİTİK: izlenme amacında 15 sn üstü BİLGİ, dikey değilse Reels/Hikâye uyarısı; ikisi birlikte söylenir', () => {
    const k = medyaKontrol({ ...video, en: 1920, boy: 1080, sure: 40 }, { videoIzlenme: true });
    expect(k.sonuc).toBe('uyari');
    expect(k.sonuc === 'uyari' && k.sebep).toContain('ilk 15 saniye kritik, ThruPlay 15. saniyede sayılır');
    expect(k.sonuc === 'uyari' && k.sebep).toContain('Reels ve Hikâye');
  });
  it('dikey ve kısa video izlenme amacında temiz; başka amaçta 15 sn bilgisi yok', () => {
    expect(medyaKontrol({ ...video, sure: 12 }, { videoIzlenme: true }).sonuc).toBe('kabul');
    expect(medyaKontrol({ ...video, sure: 40 }).sonuc).toBe('kabul');
  });
  it('süre ölçülemediyse uyarı (sessiz değil), ret değil', () => {
    const k = medyaKontrol({ ...video, sure: null }, { videoIzlenme: true });
    expect(k.sonuc === 'uyari' && k.sebep).toContain('süresi okunamadı');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('B11 — metin önerisine videonun kareleri', () => {
  const v = { varlikId: 'v', kapakVarlikId: 'k', oneriKareleri: ['a', 'b', 'c'] };
  it('KRİTİK: tek video → üç kare; kapak gitmiyor', () => {
    expect(videoOneriGorselleri(v, true)).toEqual(['a', 'b', 'c']);
  });
  it('birden çok medyada video tek kapakla temsil ediliyor; karesiz eski kayıt kapağa düşüyor; görsel kendisi', () => {
    expect(videoOneriGorselleri(v, false)).toEqual(['k']);
    expect(videoOneriGorselleri({ varlikId: 'v', kapakVarlikId: 'k' }, true)).toEqual(['k']);
    expect(videoOneriGorselleri({ varlikId: 'g' }, true)).toEqual(['g']);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('B14c — video uzun başlığı', () => {
  it('KRİTİK: en uzun başlık uzun başlık; ona eşit açıklama düşer, diğerleri kalır', () => {
    expect(videoUzunBaslik(['Kısa', 'En uzun başlık burada', 'Orta boy'], ['En uzun başlık burada', 'Başka açıklama'])).toEqual({
      uzunBaslik: 'En uzun başlık burada',
      aciklamalar: ['Başka açıklama'],
    });
    expect(videoUzunBaslik([' ', ''], ['x'])).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('B15 — YouTube videosu seçildiği an', () => {
  it('KRİTİK: gizli ya da yerleştirilemeyen video ENGEL; liste dışı ve bilinmeyen değil', () => {
    expect(youtubeVideoEngeli({ gizlilik: 'private', gomulebilir: true })).toMatch(/gizli/);
    expect(youtubeVideoEngeli({ gizlilik: 'public', gomulebilir: false })).toMatch(/oynatılması/);
    expect(youtubeVideoEngeli({ gizlilik: 'unlisted', gomulebilir: true })).toBeNull();
    expect(youtubeVideoEngeli({ gizlilik: null, gomulebilir: null })).toBeNull();
  });
  it('ISO 8601 süre çözülüyor; çözülemeyen ve P0D "bilinmiyor"', () => {
    expect(isoSureSaniye('PT1M5S')).toBe(65);
    expect(isoSureSaniye('PT2H')).toBe(7200);
    expect(isoSureSaniye('P1DT1S')).toBe(86_401);
    expect(isoSureSaniye('PT15.5S')).toBe(15.5);
    expect(isoSureSaniye('P0D')).toBeNull();
    expect(isoSureSaniye('PT')).toBeNull();
    expect(isoSureSaniye('10 dakika')).toBeNull();
    expect(isoSureSaniye(undefined)).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('eksik listesi (B15, B16, B17, B19, B8)', () => {
  const Z = '2026-10-11T09:00:00.000+03:00';
  const al = <T>(deger: T, kaynak: 'kullanici' | 'derleyici' | 'marka_merkezi' | 'workspace_profili' = 'kullanici') => ({ deger, kaynak, kim: null, zaman: Z });
  const U = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
  const rehber = (ek: Partial<RehberAlanlari> = {}): RehberAlanlari => ({
    amac: al('VIDEO' as const),
    platformlar: al({ meta: true, google: true }, 'derleyici'),
    metaHesabiId: al(U(1), 'workspace_profili'),
    googleHesabiId: al(U(2), 'workspace_profili'),
    sayfaId: al(U(3), 'workspace_profili'),
    konumlar: al([{ tur: 'region' as const, key: '2347', etiket: 'İzmir', ulkeKodu: 'TR', google: { kaynak: 'geoTargetConstants/1012782', ad: 'İzmir' } }], 'marka_merkezi'),
    ekKategoriler: al([]),
    hedefAdres: al('https://ornek.com.tr', 'marka_merkezi'),
    medya: al([{ varlikId: U(10), kapakVarlikId: U(11), sureSn: 20 }]),
    youtubeVideo: al({ videoId: 'dQw4w9WgXcQ', baslik: 'T', gizlilik: 'public', gomulebilir: true }),
    metin: al({ anaMetin: 'Ana metin', basliklar: ['Başlık'], aciklamalar: ['Açıklama'] }),
    butce: al({ tip: 'gunluk' as const, micros: '5000000000' }),
    takvim: al({ baslangic: '2026-10-12', bitis: null }),
    ...ek,
  });
  const baglam = (ek: Partial<RehberEksikBaglami> = {}, logoKare: boolean | null = true): RehberEksikBaglami => ({
    ajansYoneticisi: true,
    onKosullar: {
      metaFormKosullari: null,
      metaWhatsapp: null,
      metaSatisOlcumu: null,
      googleSatisOlcumu: null,
      googleDonusumEtkin: null,
      googleLogoVeAd: true,
      googleLogoKare: logoKare,
      seciliForm: null,
    },
    yasalUyari: null,
    asgariGunluk: { meta: 1n, googleTalepYaratma: 250_000_000n },
    paraBirimi: 'TRY',
    paraBirimleriAyni: true,
    ...ek,
  });
  const kodlar = (a: RehberAlanlari, b: RehberEksikBaglami = baglam()) => rehberEksikleri(a, b).map((x) => x.kod);

  it('ön koşul: VIDEO iki platformda da deneme açılışında (testler gerçek tabloyu okuyor)', () => {
    expect(REHBER_ACILIS.VIDEO).toEqual({ meta: 'deneme', google: 'deneme' });
  });
  it('dolu rehberde eksik yok', () => {
    expect(kodlar(rehber())).toEqual([]);
  });
  it('KRİTİK (B16): kanal bağlı değil ama video yapıştırılmış → engel YOK (G-KANAL kalktı)', () => {
    expect(kodlar(rehber({ youtubeKanaliId: undefined }))).toEqual([]);
  });
  it('KRİTİK (B15): kayıtta gizli video ikinci kapıda ENGEL', () => {
    const e = rehberEksikleri(rehber({ youtubeVideo: al({ videoId: 'dQw4w9WgXcQ', baslik: 'T', gizlilik: 'private', gomulebilir: true }) }), baglam());
    expect(e.find((x) => x.kod === 'G-VIDEO-GIZLI')?.seviye).toBe('engel');
  });
  it('KRİTİK (B17): kare olmayan logo Talep Yaratma videoda ENGEL; ölçü bilinmiyorsa susar', () => {
    expect(kodlar(rehber(), baglam({}, false))).toEqual(['G-LOGO-KARE']);
    expect(kodlar(rehber(), baglam({}, null))).toEqual([]);
  });
  it('KRİTİK (B19): para birimi TRY değilse asgari bilinmiyor UYARISI (sessiz değil)', () => {
    const e = rehberEksikleri(rehber(), baglam({ paraBirimi: 'USD', asgariGunluk: { meta: 1n, googleTalepYaratma: null } }));
    expect(e.find((x) => x.kod === 'G-ASGARI-BILINMIYOR')).toMatchObject({ seviye: 'uyari', platform: 'google' });
  });
  it('B8 ikinci kapı: kayıtta 1 saniyeden kısa video ENGEL', () => {
    expect(kodlar(rehber({ medya: al([{ varlikId: U(10), kapakVarlikId: U(11), sureSn: 0.5 }]) }))).toEqual(['M-VIDEO-KISA']);
  });
});
