import { randomUUID } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Prisma } from '@prisma/client';
import {
  NESNE_DURUMLARI,
  YAYIN_DURUMLARI,
  YAYIN_DURUM_SINIFI,
  YAYIN_GECISLERI,
  beklenenYankilar,
  derleMeta,
  type DerlemeGirdisi,
} from '@advetics/shared';
import { createHarness, seedTenant, IDS, type Harness } from '../../../test/pglite-harness';
import { metaYazmaAcikMi } from './yazma-kapisi';
import {
  MetaBelirsizHata,
  MetaKesinHata,
  YayinMotoru,
  yayinKaydiOlustur,
  yayiniSonlandir,
  YazmaDurduruldu,
  type MetaYazmaPortu,
  type TxRunner,
} from './yayin-motoru';

/**
 * YAYIN MOTORU — gerçek şema (PGlite) + SAHTE META.
 *
 * Sahte Meta gönderileni saklar ve geri okumada aynen döndürür ("kusursuz
 * Meta"); her test bir sapma enjekte eder. İddialar hem veritabanına hem de
 * Meta'da ne kaldığına bakıyor: "doğru durum yazıldı" ama Meta'da ikinci
 * kampanya açıldıysa test yeşil OLMAMALI.
 */
type Kayit = { uc: string; alanlar: Record<string, unknown>; status: string };
class SahteMeta implements MetaYazmaPortu {
  kayitlar = new Map<string, Kayit>();
  private sayac = 1000;
  olusturHatasi: ((uc: string) => { hata: Error; yineDeOlustur?: number } | null) | null = null;
  okumaBozucu: ((id: string, o: Record<string, unknown>) => Record<string, unknown>) | null = null;
  durumHatasi: ((id: string) => boolean) | null = null;
  postSayisi = 0;
  acmaSirasi: string[] = [];

  async gorselYukle(_h: string, varlik: string) {
    return `hash-${varlik.slice(0, 8)}`;
  }
  async olustur(_h: string, uc: string, alanlar: Record<string, unknown>) {
    this.postSayisi++;
    const h = this.olusturHatasi?.(uc);
    if (h) {
      for (let i = 0; i < (h.yineDeOlustur ?? 0); i++) this.yaz(uc, alanlar);
      throw h.hata;
    }
    return { id: this.yaz(uc, alanlar) };
  }
  private yaz(uc: string, alanlar: Record<string, unknown>) {
    const id = String(++this.sayac);
    this.kayitlar.set(id, { uc, alanlar: structuredClone(alanlar), status: String(alanlar.status ?? 'PAUSED') });
    return id;
  }
  async oku(id: string, alanlar: string[]) {
    const k = this.kayitlar.get(id);
    if (!k) throw new MetaKesinHata('Nesne yok');
    const o: Record<string, unknown> = { configured_status: k.status };
    for (const a of alanlar) if (a in k.alanlar) o[a] = structuredClone(k.alanlar[a]);
    if ('status' in o) o.status = k.status;
    return this.okumaBozucu ? this.okumaBozucu(id, o) : o;
  }
  async etiketleAra(_h: string, tur: string, etiket: string) {
    return [...this.kayitlar.entries()]
      .filter(([, k]) => k.uc === tur && (k.alanlar.adlabels as Array<{ name: string }>).some((l) => l.name === etiket))
      .filter(([, k]) => k.status !== 'ARCHIVED')
      .map(([id, k]) => ({ id, name: String(k.alanlar.name) }));
  }
  async durumYaz(id: string, a: { status: 'ACTIVE' | 'ARCHIVED'; name?: string }) {
    if (this.durumHatasi?.(id)) throw new MetaBelirsizHata('zaman aşımı');
    const k = this.kayitlar.get(id)!;
    if (a.status === 'ACTIVE') this.acmaSirasi.push(k.uc);
    k.status = a.status;
    if (a.name) k.alanlar.name = a.name;
  }
  sayi(uc: string) {
    return [...this.kayitlar.values()].filter((k) => k.uc === uc).length;
  }
}

const ACIK = async () => ({ acik: true as const });
let h: Harness;
let tx: TxRunner;
let kayitDusur = false;
const VARLIK = '66666666-0000-4000-8000-000000000001';
const HESAP = '44444444-0000-4000-8000-000000000001';

beforeAll(async () => {
  h = await createHarness();
  /*
   * Sarmalayıcı: "nesne kuruldu" kaydını tek seferlik düşürebiliyor. Kayıt
   * düşüşü gerçek veritabanında kendiliğinden üretilemiyor; sahte bir
   * transaction yerine GERÇEK sorgunun önüne konan bir kapı.
   */
  tx = (fn) =>
    fn({
      $queryRaw: (q: Prisma.Sql) => {
        if (kayitDusur && q.sql.includes('UPDATE yayin_nesnesi') && q.values[0] === 'kuruldu') {
          kayitDusur = false;
          return Promise.reject(new Error('bağlantı koptu'));
        }
        return h.db.$queryRaw(q);
      },
    } as never);
});
afterAll(async () => {
  await h.close();
});
beforeEach(async () => {
  await h.reset();
  await seedTenant(h);
  await h.q('DELETE FROM ad_accounts');
  await h.q(
    `INSERT INTO ad_accounts (id, org_id, client_id, connection_id, platform, external_id, name, currency, timezone, updated_at)
     VALUES ($1, $2, $3, $4, 'meta', 'act_1', 'H', 'TRY', 'Europe/Istanbul', now())`,
    [HESAP, IDS.org, IDS.client, IDS.connection],
  );
});

async function hazirla(o: { testKipi?: boolean; kavram?: number } = {}) {
  const [t] = await h.q<{ id: string }>(
    `INSERT INTO reklam_taslagi (org_id, client_id, platform, olusturan_yuz, olusturan_id)
     VALUES ($1, $2, 'meta', 'acemi', $3) RETURNING id::text`,
    [IDS.org, IDS.client, IDS.user],
  );
  const id = randomUUID();
  const g: DerlemeGirdisi = {
    apiSurumu: 'v25.0',
    yayinKimligi: id,
    tarih: '2026-10-07',
    workspaceKisaAdi: 'Örnek',
    niyet: 'SITE',
    hesap: { platformId: 'act_1', paraBirimi: 'TRY' },
    sayfaPlatformId: '111',
    instagramPlatformId: null,
    hedefleme: { konumlar: [{ tur: 'region', key: '2347', etiket: 'İzmir', ulkeKodu: 'TR' }], enDusukYas: 18, ipucuYas: null, ipucuCinsiyet: null },
    kategoriler: { taban: [], ek: [] },
    butce: { tip: 'gunluk', micros: 500_000_000n, seviye: 'kampanya' },
    takvim: { baslangic: '2026-10-08T00:00:00+0300', bitis: null },
    atif: 'tik7_gor1',
    kavramlar: Array.from({ length: o.kavram ?? 1 }, (_, i) => ({ gorselHash: `{medya:${VARLIK}}`, baslik: `B${i}`, metin: 'M' })),
    hedefAdres: 'https://ornek.com.tr',
    formId: null,
    urlEtiketleri: null,
  };
  const r = derleMeta(g);
  if (r.tur !== 'govde') throw new Error(JSON.stringify(r.retler));
  await yayinKaydiOlustur(tx, {
    id,
    orgId: IDS.org,
    clientId: IDS.client,
    taslakId: t!.id,
    taslakSurumNo: 1,
    icerikOzeti: 'a'.repeat(64),
    adAccountId: HESAP,
    govdeler: r.govdeler,
    yankilar: beklenenYankilar(r.govdeler),
    apiSurumu: 'v25.0',
    derleyiciSurumu: r.derleyiciSurumu,
    atifStandardi: 'tik7_gor1',
    medyaVarliklari: [VARLIK],
    kaynak: 'panel',
    baslatanId: IDS.user,
    testKipi: o.testKipi ?? false,
  });
  return { yayinId: id, taslakId: t!.id };
}

const durum = async (id: string) => (await h.q<{ durum: string; sebep: string | null }>('SELECT durum, sebep FROM yayin WHERE id = $1', [id]))[0]!;
const nesneler = (id: string) => h.q<{ ad: string; durum: string; meta_id: string | null }>('SELECT ad, durum, meta_id FROM yayin_nesnesi WHERE yayin_id = $1 ORDER BY sira', [id]);

describe('mutlu yol', () => {
  it('KRİTİK: PAUSED kurar, geri okur, fark yoksa YUKARIDAN AŞAĞI açar, öneki kaldırır', async () => {
    const meta = new SahteMeta();
    const { yayinId } = await hazirla();
    const sonuc = await new YayinMotoru(tx, meta, 'act_1', ACIK).kur(yayinId);
    expect(sonuc).toBe('iletildi');
    expect((await nesneler(yayinId)).map((n) => n.durum)).toEqual(['kuruldu', 'acildi', 'acildi', 'kuruldu', 'acildi']);
    expect(meta.acmaSirasi).toEqual(['campaigns', 'adsets', 'ads']);
    const kampanya = [...meta.kayitlar.values()].find((k) => k.uc === 'campaigns')!;
    expect(kampanya.status).toBe('ACTIVE');
    expect(String(kampanya.alanlar.name)).not.toContain('açılmadı');
    // Yer tutucular gerçek kimliklere çevrildi.
    const kreatif = [...meta.kayitlar.values()].find((k) => k.uc === 'adcreatives')!;
    expect(JSON.stringify(kreatif.alanlar)).toContain(`hash-${VARLIK.slice(0, 8)}`);
    expect(JSON.stringify([...meta.kayitlar.values()].map((k) => k.alanlar))).not.toMatch(/\{(kampanya|reklam_seti|kreatif|medya)/);
    const [g] = await h.q<{ sonuc: string }>('SELECT sonuc FROM geri_okuma WHERE yayin_id = $1', [yayinId]);
    expect(g!.sonuc).toBe('temiz');
  });

  it('test kipi: tekillik kapısından sonra AÇMAZ, arşivler ve yayını sonlandırır', async () => {
    const meta = new SahteMeta();
    const { yayinId } = await hazirla({ testKipi: true });
    expect(await new YayinMotoru(tx, meta, 'act_1', ACIK).kur(yayinId)).toBe('arsivlendi');
    expect([...meta.kayitlar.values()].filter((k) => k.status === 'ACTIVE')).toHaveLength(0);
    expect([...meta.kayitlar.values()].find((k) => k.uc === 'campaigns')!.status).toBe('ARCHIVED');
    const [y] = await h.q<{ sonlandi_at: Date | null }>('SELECT sonlandi_at FROM yayin WHERE id = $1', [yayinId]);
    expect(y!.sonlandi_at).not.toBeNull();
  });
});

describe('kurulum hataları', () => {
  it('kesin ret: kurulamadi, sonraki halkalar KURULMAZ', async () => {
    const meta = new SahteMeta();
    meta.olusturHatasi = (uc) => (uc === 'adsets' ? { hata: new MetaKesinHata('Geçersiz hedefleme', 100, 1815946) } : null);
    const { yayinId } = await hazirla();
    expect(await new YayinMotoru(tx, meta, 'act_1', ACIK).kur(yayinId)).toBe('kurulamadi');
    expect((await durum(yayinId)).sebep).toContain('Geçersiz hedefleme');
    expect((await nesneler(yayinId)).map((n) => n.durum)).toEqual(['kuruldu', 'kuruldu', 'reddedildi', 'bekliyor', 'bekliyor']);
    expect(meta.sayi('adcreatives')).toBe(0);
  });

  it('KRİTİK: sonuç belirsiz ama Meta oluşturmuş → uzlaştırma bulur, İKİNCİ POST YOK, devam eder', async () => {
    const meta = new SahteMeta();
    let ilk = true;
    meta.olusturHatasi = (uc) => (uc === 'campaigns' && ilk ? ((ilk = false), { hata: new MetaBelirsizHata('zaman aşımı'), yineDeOlustur: 1 }) : null);
    const { yayinId } = await hazirla();
    expect(await new YayinMotoru(tx, meta, 'act_1', ACIK).kur(yayinId)).toBe('iletildi');
    expect(meta.sayi('campaigns')).toBe(1);
  });

  it('sonuç belirsiz ve Meta’da yok → sonuc_belirsiz, kendiliğinden yeniden POST yok', async () => {
    const meta = new SahteMeta();
    meta.olusturHatasi = (uc) => (uc === 'campaigns' ? { hata: new MetaBelirsizHata('5xx') } : null);
    const { yayinId } = await hazirla();
    expect(await new YayinMotoru(tx, meta, 'act_1', ACIK).kur(yayinId)).toBe('sonuc_belirsiz');
    expect(meta.postSayisi).toBe(1);
  });

  it('belirsiz ve Meta’da İKİ kopya → sonuc_belirsiz, kopyalar ekranda', async () => {
    const meta = new SahteMeta();
    meta.olusturHatasi = (uc) => (uc === 'campaigns' ? { hata: new MetaBelirsizHata('kopma'), yineDeOlustur: 2 } : null);
    const { yayinId } = await hazirla();
    expect(await new YayinMotoru(tx, meta, 'act_1', ACIK).kur(yayinId)).toBe('sonuc_belirsiz');
    expect((await durum(yayinId)).sebep).toMatch(/2 kopya/);
  });

  it('KRİTİK: Meta başarılı ama kayıt düştü → kayit_belirsiz; nesne "reddedildi" DEĞİL, yeniden denenmez', async () => {
    const meta = new SahteMeta();
    const { yayinId } = await hazirla();
    // Medya geçsin, kampanyanın kaydı düşsün.
    let gecti = 0;
    const eski = meta.olustur.bind(meta);
    meta.olustur = async (hs, uc, a) => {
      if (uc === 'campaigns' && gecti++ === 0) kayitDusur = true;
      return eski(hs, uc, a);
    };
    expect(await new YayinMotoru(tx, meta, 'act_1', ACIK).kur(yayinId)).toBe('kayit_belirsiz');
    const k = (await nesneler(yayinId)).find((n) => n.ad === 'kampanya')!;
    expect(k.durum).toBe('gonderiliyor');
    await expect(new YayinMotoru(tx, meta, 'act_1', ACIK).kur(yayinId)).rejects.toThrow();
    expect(meta.sayi('campaigns')).toBe(1);
  });
});

describe('geri okuma ve açma', () => {
  it('KRİTİK: Meta bütçeyi farklı kaydettiyse fark_var ve HİÇBİR ŞEY açılmaz', async () => {
    const meta = new SahteMeta();
    meta.okumaBozucu = (_id, o) => ('daily_budget' in o ? { ...o, daily_budget: '5000000' } : o);
    const { yayinId } = await hazirla();
    expect(await new YayinMotoru(tx, meta, 'act_1', ACIK).kur(yayinId)).toBe('fark_var');
    expect([...meta.kayitlar.values()].filter((k) => k.status === 'ACTIVE')).toHaveLength(0);
  });

  it('bir nesne okunamazsa dogrulanamadi; açılmaz', async () => {
    const meta = new SahteMeta();
    const eski = meta.oku.bind(meta);
    meta.oku = async (id, a) => {
      if (meta.kayitlar.get(id)?.uc === 'adsets') throw new MetaBelirsizHata('okunamadı');
      return eski(id, a);
    };
    const { yayinId } = await hazirla();
    expect(await new YayinMotoru(tx, meta, 'act_1', ACIK).kur(yayinId)).toBe('dogrulanamadi');
    expect([...meta.kayitlar.values()].filter((k) => k.status === 'ACTIVE')).toHaveLength(0);
  });

  it('KRİTİK: tekillik kapısı aynı etiketli İKİZ kampanya görürse açmaz', async () => {
    const meta = new SahteMeta();
    const { yayinId } = await hazirla();
    // Önceki bir "yeniden dene"den gecikmeyle görünür olmuş kopya.
    meta.kayitlar.set('9999', { uc: 'campaigns', alanlar: { name: 'ikiz', adlabels: [{ name: `adv-yayin-${yayinId}` }] }, status: 'PAUSED' });
    expect(await new YayinMotoru(tx, meta, 'act_1', ACIK).kur(yayinId)).toBe('fark_var');
    expect((await durum(yayinId)).sebep).toContain('9999');
    expect([...meta.kayitlar.values()].filter((k) => k.status === 'ACTIVE')).toHaveLength(0);
  });

  it('açma yarıda kalırsa kismen_acik; durum okunur, ACTIVE ise açılmış sayılır', async () => {
    const meta = new SahteMeta();
    meta.durumHatasi = (id) => meta.kayitlar.get(id)?.uc === 'adsets';
    const { yayinId } = await hazirla();
    expect(await new YayinMotoru(tx, meta, 'act_1', ACIK).kur(yayinId)).toBe('kismen_acik');

    const meta2 = new SahteMeta();
    meta2.durumHatasi = (id) => {
      const k = meta2.kayitlar.get(id)!;
      if (k.uc === 'adsets' && k.status !== 'ACTIVE') {
        k.status = 'ACTIVE'; // yazıldı ama cevap kayboldu
        return true;
      }
      return false;
    };
    const b = await hazirla();
    expect(await new YayinMotoru(tx, meta2, 'act_1', ACIK).kur(b.yayinId)).toBe('iletildi');
  });
});

describe('"Meta’ya yazmayı durdur"', () => {
  it('KRİTİK: anahtar kurulumun ortasında basılırsa bir sonraki POST’tan ÖNCE durur; devam yalnız elle', async () => {
    const meta = new SahteMeta();
    let acik = true;
    const kapi = async () => (acik ? { acik: true as const } : { acik: false as const, sebep: 'olay' });
    const eski = meta.olustur.bind(meta);
    meta.olustur = async (hs, uc, a) => {
      const r = await eski(hs, uc, a);
      if (uc === 'campaigns') acik = false; // kampanyadan hemen sonra basıldı
      return r;
    };
    const { yayinId } = await hazirla();
    const motor = new YayinMotoru(tx, meta, 'act_1', kapi);
    expect(await motor.kur(yayinId)).toBe('bekletildi');
    expect(meta.sayi('adsets')).toBe(0);
    expect((await nesneler(yayinId)).find((n) => n.ad === 'reklam_seti')!.durum).toBe('bekliyor');
    expect((await durum(yayinId)).sebep).toBe('olay');
    // Anahtar kapalı kalırken devam da durur.
    await expect(motor.devam(yayinId)).resolves.toBe('bekletildi');
    acik = true;
    expect(await motor.devam(yayinId)).toBe('iletildi');
    expect(meta.sayi('campaigns')).toBe(1);
  });

  it('açma sırasında basılırsa açmadan önce durur; geri alma da yazmadığı için sebep yazılır', async () => {
    const meta = new SahteMeta();
    let acik = true;
    const kapi = async () => (acik ? { acik: true as const } : { acik: false as const, sebep: 'olay' });
    meta.okumaBozucu = (_id, o) => {
      acik = false; // geri okuma sırasında basıldı
      return o;
    };
    const { yayinId } = await hazirla();
    expect(await new YayinMotoru(tx, meta, 'act_1', kapi).kur(yayinId)).toBe('bekletildi');
    expect([...meta.kayitlar.values()].filter((k) => k.status === 'ACTIVE')).toHaveLength(0);
  });

  it('tek kapı: ajansın durdurması müşteri şirketinde de geçerli; okunamazsa KAPALI', async () => {
    const [{ id: ma }] = (await h.q<{ id: string }>(
      `INSERT INTO manager_accounts (id, name, slug, status, updated_at) VALUES (gen_random_uuid(), 'Üst', 'ust', 'active', now()) RETURNING id::text`,
    )) as [{ id: string }];
    const [{ id: ajans }] = (await h.q<{ id: string }>(
      `INSERT INTO organizations (id, name, slug, manager_account_id, updated_at) VALUES (gen_random_uuid(), 'Ajans', 'ajans-x', $1, now()) RETURNING id::text`,
      [ma],
    )) as [{ id: string }];
    await h.q(`UPDATE manager_accounts SET ajans_org_id = $1 WHERE id = $2`, [ajans, ma]);
    await h.q(`UPDATE organizations SET manager_account_id = $1 WHERE id = $2`, [ma, IDS.org]);
    expect(await metaYazmaAcikMi(tx, IDS.client)).toEqual({ acik: true });
    await h.q(
      `INSERT INTO ajans_ayari (org_id, meta_yazma_durduruldu, durdurma_at, durdurma_sebebi) VALUES ($1, true, now(), 'v26 sorunu')`,
      [ajans],
    );
    expect(await metaYazmaAcikMi(tx, IDS.client)).toEqual({ acik: false, sebep: "Meta'ya yazma ajans tarafından durduruldu: v26 sorunu" });
    const bozuk: TxRunner = () => Promise.reject(new Error('db yok'));
    expect((await metaYazmaAcikMi(bozuk, IDS.client)).acik).toBe(false);
  });

  it('sebepsiz durdurma veritabanında reddedilir', async () => {
    await expect(h.q(`INSERT INTO ajans_ayari (org_id, meta_yazma_durduruldu) VALUES ($1, true)`, [IDS.org])).rejects.toThrow(/durdurma_chk/);
  });

  it('YazmaDurduruldu dışarı sızmıyor (motorun kendi durumuna çevriliyor)', () => {
    expect(new YazmaDurduruldu('x')).toBeInstanceOf(Error);
  });
});

describe('kilitler', () => {
  it('KRİTİK: taslak başına tek aktif yayın (çift tıklama)', async () => {
    const { taslakId } = await hazirla();
    await expect(
      h.q(
        `INSERT INTO yayin (org_id, client_id, taslak_id, taslak_surum_no, icerik_ozeti, derlenmis_govde, beklenen_yanki,
                            api_surumu, derleyici_surumu, atif_standardi, kaynak, baslatan_id)
         VALUES ($1, $2, $3, 1, $4, '[]', '[]', 'v25.0', '1', 'tik7', 'panel', $5)`,
        [IDS.org, IDS.client, taslakId, 'b'.repeat(64), IDS.user],
      ),
    ).rejects.toThrow(/yayin_taslak_aktif_key|unique/);
  });

  it('sonlandırma geçiş tablosuna uyar: kuruluyor’dan doğrudan arşive atlanmaz', async () => {
    const { yayinId } = await hazirla();
    await h.q(`UPDATE yayin SET durum = 'kuruluyor' WHERE id = $1`, [yayinId]);
    await expect(yayiniSonlandir(tx, yayinId, 'geri_alindi')).rejects.toThrow(/sonlandırılamaz/);
  });

  it('derlenmiş gövde DEĞİŞMEZ (trigger)', async () => {
    const { yayinId } = await hazirla();
    await expect(h.q(`UPDATE yayin SET derlenmis_govde = '[]' WHERE id = $1`, [yayinId])).rejects.toThrow(/degismez/);
  });

  it('her sonlandıran (aktif olmayan) durum geçiş tablosunda bir yerden ulaşılabilir', () => {
    for (const d of YAYIN_DURUMLARI.filter((x) => !YAYIN_DURUM_SINIFI[x].aktif && x !== 'kapali_kuruldu')) {
      expect(Object.values(YAYIN_GECISLERI).some((l) => l.includes(d)), d).toBe(true);
    }
  });

  it('KRİTİK: CHECK listeleri shared sabitleriyle aynı', () => {
    const sql = readFileSync(join(__dirname, '../../../prisma/migrations/20261007140000_reklam_yayin_motoru/migration.sql'), 'utf8');
    const liste = (kisit: string) => {
      const i = sql.indexOf(`"${kisit}"`);
      const m = /IN \(([^)]*)\)/.exec(sql.slice(i));
      return m![1]!.split(',').map((x) => x.trim().replace(/'/g, ''));
    };
    expect(liste('yayin_durum_chk')).toEqual([...YAYIN_DURUMLARI]);
    expect(liste('yayin_nesnesi_durum_chk')).toEqual([...NESNE_DURUMLARI]);
  });
});

/** Kaynak taramaları — yorumsuz kaynakta. */
describe('kaynak taraması', () => {
  const dosyalar = readdirSync(__dirname).filter((f) => f.endsWith('.ts') && !f.endsWith('.spec.ts'));
  const kaynak = (f: string) => readFileSync(join(__dirname, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

  it('dosyalar okundu', () => {
    expect(dosyalar).toContain('yayin-motoru.ts');
  });

  it('KRİTİK: sonlandi_at yalnız yayiniSonlandir içinde yazılıyor', () => {
    for (const f of dosyalar) {
      const k = kaynak(f);
      const yazan = [...k.matchAll(/sonlandi_at\s*=\s*now\(\)/g)];
      if (f !== 'yayin-motoru.ts') expect(yazan, f).toHaveLength(0);
      else {
        expect(yazan).toHaveLength(1);
        const fn = k.slice(k.indexOf('export async function yayiniSonlandir'));
        expect(fn).toMatch(/sonlandi_at\s*=\s*now\(\)/);
      }
    }
  });

  it('KRİTİK: Meta’ya yazan port çağrıları YALNIZ kapılı sarmalayıcılarda', () => {
    const k = kaynak('yayin-motoru.ts');
    const cagrilar = [...k.matchAll(/this\.meta\.(olustur|gorselYukle|durumYaz)\(/g)];
    expect(cagrilar).toHaveLength(3);
    for (const c of cagrilar) {
      const once = k.slice(Math.max(0, c.index! - 200), c.index!);
      expect(once, c[0]).toMatch(/await this\.kapi\(\);\s*return $/);
    }
  });

  it('KRİTİK: DELETED hiçbir yolda yok (geri alma = arşiv)', () => {
    for (const f of dosyalar) expect(kaynak(f), f).not.toContain('DELETED');
  });
});
