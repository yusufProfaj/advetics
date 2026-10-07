import { createHash } from 'node:crypto';
import { Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  ACILMADI_ONEKI,
  YAYIN_DURUMLARI,
  YAYIN_DURUM_SINIFI,
  gecisIzinliMi,
  geriOkumaKarsilastir,
  okumaAlanlari,
  type BeklenenYanki,
  type MetaGovdesi,
  type YayinDurumu,
} from '@advetics/shared';

const logger = new Logger('YayinMotoru');

/**
 * YAYIN MOTORU (TASARIM.md § 11) — karar 1'in üç adımı: PAUSED kur, geri
 * oku, fark yoksa aç.
 *
 * Meta'ya giden HER çağrı `MetaYazmaPortu`nun arkasında: motorun bütün hata
 * yolları sahte bir Meta ile sınanabiliyor ve gerçek Graph istemcisi ayrı
 * bir dosyada. Motor platform çağrısını transaction'ın İÇİNDE yapmıyor:
 * Prisma'nın sınırı 5 sn ve Meta'ya birkaç çağrı üretimde 12,5 sn sürdü.
 * Her nesne için önce kısa bir transaction'da NİYET, sonra çağrı, sonra
 * kısa bir transaction'da SONUÇ.
 *
 * BU SÜRÜMDE OLMAYANLAR (bilerek, sırada): ön kontrol ve prova (§ 11.2),
 * hesap başına yazıcı kilidi ve senkron duraklatma (§ 11.5 d), kesiciler ve
 * "Meta'ya yazmayı durdur" (§ 11.10), uzlaştırmanın zamanlı tekrarları.
 * Motor bunlar yazılmadan bir uca bağlanmıyor.
 */

/** Meta doğrulama koduyla KESİN reddetti: nesne doğmadı. */
export class MetaKesinHata extends Error {
  constructor(
    mesaj: string,
    readonly kod?: number,
    readonly altKod?: number,
    readonly fbtrace?: string,
  ) {
    super(mesaj);
  }
}

/**
 * Sonuç BİLİNMİYOR: zaman aşımı, bağlantı kopması, 5xx, kod 1/2. Nesne
 * doğmuş olabilir; aynı halka asla kendiliğinden yeniden POST edilmez.
 */
export class MetaBelirsizHata extends Error {}

export interface MetaYazmaPortu {
  /** Görseli reklam hesabına yükler, `image_hash` döner (hash hesap başına). */
  gorselYukle(hesap: string, varlikId: string): Promise<string>;
  /** `uc` derleyicinin verdiği göreli uç: `campaigns`, `<sayfa>/leadgen_forms`... */
  olustur(hesap: string, uc: string, alanlar: Record<string, unknown>): Promise<{ id: string }>;
  oku(metaId: string, alanlar: string[]): Promise<Record<string, unknown>>;
  /** `GET /act_X/{tür}bylabels` — yalnız kampanya, reklam seti, reklam. */
  etiketleAra(hesap: string, tur: 'campaigns' | 'adsets' | 'ads', etiket: string): Promise<Array<{ id: string; name: string }>>;
  durumYaz(metaId: string, alanlar: { status: 'ACTIVE' | 'ARCHIVED'; name?: string }): Promise<void>;
}

type Tx = { $queryRaw<T = unknown>(q: Prisma.Sql): Promise<T> };
/** Hazır bir `tx` değil ÇALIŞTIRICI: her adım kendi kısa transaction'ını açar. */
export type TxRunner = <T>(fn: (tx: Tx) => Promise<T>) => Promise<T>;

export type NesneTuru = 'medya' | 'form' | 'kampanya' | 'reklam_seti' | 'kreatif' | 'reklam';

interface YayinSatiri {
  id: string;
  org_id: string;
  client_id: string;
  durum: YayinDurumu;
  derlenmis_govde: MetaGovdesi[];
  beklenen_yanki: BeklenenYanki[];
  api_surumu: string;
  test_kipi: boolean;
}
interface NesneSatiri {
  id: string;
  tur: NesneTuru;
  ad: string;
  sira: number;
  meta_id: string | null;
  durum: string;
}

export type SonlanmaSebebi = 'on_kontrol_reddi' | 'geri_alindi' | 'yeniden_kurulacak' | 'kapali_kuruldu';

const YER_TUTUCU = /^\{([a-z_]+(?::[0-9a-z-]+)?)\}$/;
const ETIKET_UCU: Partial<Record<NesneTuru, 'campaigns' | 'adsets' | 'ads'>> = {
  kampanya: 'campaigns',
  reklam_seti: 'adsets',
  reklam: 'ads',
};
/** Açma YUKARIDAN AŞAĞI: alt nesneyi açmak üst kapalıyken teslim etmez. */
const ACMA_SIRASI: readonly NesneTuru[] = ['kampanya', 'reklam_seti', 'reklam'];

export class YayinMotoru {
  constructor(
    private readonly tx: TxRunner,
    private readonly meta: MetaYazmaPortu,
    private readonly hesap: string,
  ) {}

  // ---------------------------------------------------------------------------
  // KURULUM — medya → form → kampanya → reklam seti → kreatif → reklam
  // ---------------------------------------------------------------------------
  async kur(yayinId: string): Promise<YayinDurumu> {
    let y = await this.yayin(yayinId);
    if (y.durum === 'on_kontrol') y = await this.gecis(y, 'medya', null);
    const nesneler = await this.nesneler(yayinId);

    for (const n of nesneler) {
      if (n.durum === 'kuruldu' || n.durum === 'acildi') continue;
      if (n.tur !== 'medya' && y.durum === 'medya') y = await this.gecis(y, 'kuruluyor', null);
      if (n.durum !== 'bekliyor') {
        // Gönderilmiş ama sonucu yazılmamış ya da belirsiz halka: ASLA
        // kendiliğinden yeniden POST edilmez.
        throw new Error(`Nesne ${n.ad} ${n.durum}; yeniden POST yalnız uzlaştırmadan sonra`);
      }

      // (1) NİYET: POST'tan ÖNCE.
      await this.tx((tx) =>
        tx.$queryRaw(Prisma.sql`
          UPDATE yayin_nesnesi SET durum = 'gonderiliyor', deneme_sayisi = deneme_sayisi + 1, updated_at = now()
           WHERE id = ${n.id}::uuid AND durum = 'bekliyor' RETURNING id`),
      );

      // (2) ÇAĞRI — transaction DIŞINDA.
      let metaId: string;
      try {
        if (n.tur === 'medya') {
          metaId = await this.meta.gorselYukle(this.hesap, n.ad.slice('medya:'.length));
        } else {
          const govde = govdeBul(y, n.ad);
          const kimlikler = await this.kimlikHaritasi(y.id);
          metaId = (await this.meta.olustur(this.hesap, govde.uc, yerlestir(govde.alanlar, kimlikler) as Record<string, unknown>)).id;
        }
      } catch (e) {
        if (e instanceof MetaKesinHata) {
          await this.nesneYaz(n.id, 'reddedildi', null, hataKaydi(e));
          await this.gecis(y, 'kurulamadi', `${n.ad}: ${e.message}`);
          return 'kurulamadi';
        }
        await this.nesneYaz(n.id, 'belirsiz', null, hataKaydi(e));
        y = await this.gecis(y, n.tur === 'medya' ? 'kurulamadi' : 'uzlastirma', `${n.ad}: sonuç bilinmiyor`);
        // Medya para harcamaz ve yeniden yüklemek ikiz nesne doğurmaz ama
        // hash'i bilinmeden ağaç kurulamaz: insan "kaldığı yerden devam" der.
        if (n.tur === 'medya') return 'kurulamadi';
        return this.uzlastir(yayinId);
      }

      // (3) SONUÇ. Yazılamazsa nesne 'gonderiliyor'da kalır ve yayın
      // KAYIT_BELİRSİZ olur — 'reddedildi' yazmak yeniden denemeyi açar ve
      // Meta'da İKİNCİ kampanya doğar.
      try {
        await this.nesneYaz(n.id, 'kuruldu', metaId, null);
      } catch (e) {
        logger.error(`KAYIT BELİRSİZ yayin=${yayinId} nesne=${n.ad} meta_id=${metaId}: ${(e as Error).message}`);
        await this.gecis(y, 'kayit_belirsiz', `${n.ad} Meta'da kuruldu (${metaId}) ama kayıt yazılamadı`).catch(() => {
          // Durum da yazılamıyorsa elde kalan tek iz yukarıdaki log satırı.
        });
        return 'kayit_belirsiz';
      }

      // FORM GERİ DÖNÜŞÜ OLMAYAN TEK NESNE: hemen okunur, farkta başka
      // hiçbir nesne kurulmaz.
      if (n.tur === 'form') {
        const s = await this.geriOkuVeYaz(y, ['form']);
        if (s !== 'temiz') {
          if (s === 'fark') await this.meta.durumYaz(metaId, { status: 'ARCHIVED' }).catch(() => undefined);
          await this.gecis(y, s === 'fark' ? 'fark_var' : 'dogrulanamadi', 'Form Meta’da farklı kaydedildi');
          return s === 'fark' ? 'fark_var' : 'dogrulanamadi';
        }
      }
    }

    if (y.durum === 'medya') y = await this.gecis(y, 'kuruluyor', null);
    await this.gecis(y, 'geri_okuma', null);
    return this.geriOku(yayinId);
  }

  // ---------------------------------------------------------------------------
  // UZLAŞTIRMA — yalnız OKUMA: etiket + ad ile ara.
  // ---------------------------------------------------------------------------
  async uzlastir(yayinId: string): Promise<YayinDurumu> {
    let y = await this.yayin(yayinId);
    const belirsiz = (await this.nesneler(yayinId)).filter((n) => n.durum === 'belirsiz');
    for (const n of belirsiz) {
      const uc = ETIKET_UCU[n.tur];
      if (!uc) {
        // Kreatif ve form etiketle aranamıyor: insan karar verir.
        await this.gecis(y, 'sonuc_belirsiz', `${n.ad}: Meta'da oluşmuş olabilir; etiketle aranamıyor`);
        return 'sonuc_belirsiz';
      }
      let bulunan: Array<{ id: string; name: string }>;
      try {
        bulunan = await this.meta.etiketleAra(this.hesap, uc, `adv-yayin-${yayinId}`);
      } catch (e) {
        await this.gecis(y, 'kayit_belirsiz', `${n.ad}: arama da düştü (${(e as Error).message})`);
        return 'kayit_belirsiz';
      }
      // Aynı yayında birden çok reklam olabilir: etiket VE ad.
      const ad = String(govdeBul(y, n.ad).alanlar.name ?? '');
      const eslesen = bulunan.filter((b) => b.name === ad);
      if (eslesen.length !== 1) {
        await this.gecis(
          y,
          'sonuc_belirsiz',
          eslesen.length === 0
            ? `${n.ad}: Meta'da oluşmuş olabilir, aramada görünmedi`
            : `${n.ad}: Meta'da ${eslesen.length} kopya var (${eslesen.map((e) => e.id).join(', ')})`,
        );
        return 'sonuc_belirsiz';
      }
      await this.nesneYaz(n.id, 'kuruldu', eslesen[0]!.id, null, 'belirsiz');
    }
    y = await this.gecis(y, 'kuruluyor', 'Uzlaştırıldı');
    return this.kur(yayinId);
  }

  // ---------------------------------------------------------------------------
  // GERİ OKUMA → TEKİLLİK KAPISI → AÇMA
  // ---------------------------------------------------------------------------
  async geriOku(yayinId: string): Promise<YayinDurumu> {
    let y = await this.yayin(yayinId);
    const s = await this.geriOkuVeYaz(y, null);
    if (s === 'fark') return (await this.gecis(y, 'fark_var', 'Meta’da duran ayar gönderilenden farklı')).durum;
    if (s === 'dogrulanamadi') return (await this.gecis(y, 'dogrulanamadi', 'Meta’daki ayarlar okunamadı')).durum;
    y = await this.gecis(y, 'tekillik_kapisi', null);
    return this.tekillikKapisi(y);
  }

  private async tekillikKapisi(y: YayinSatiri): Promise<YayinDurumu> {
    const nesneler = await this.nesneler(y.id);
    for (const [tur, uc] of Object.entries(ETIKET_UCU) as Array<[NesneTuru, 'campaigns' | 'adsets' | 'ads']>) {
      const bizim = new Set(nesneler.filter((n) => n.tur === tur).map((n) => n.meta_id));
      let bulunan: Array<{ id: string }>;
      try {
        bulunan = await this.meta.etiketleAra(this.hesap, uc, `adv-yayin-${y.id}`);
      } catch {
        return (await this.gecis(y, 'dogrulanamadi', 'Tekillik araması yapılamadı')).durum;
      }
      const fazla = bulunan.filter((b) => !bizim.has(b.id));
      if (fazla.length > 0) {
        return (await this.gecis(y, 'fark_var', `Meta'da bu reklamın ikinci bir kopyası var: ${fazla.map((f) => f.id).join(', ')}`)).durum;
      }
      if (bulunan.length < bizim.size) {
        return (await this.gecis(y, 'dogrulanamadi', 'Kurduğumuz nesnelerin bir kısmı aramada görünmedi')).durum;
      }
    }
    if (y.test_kipi) {
      // Canlı tur: açmak yerine hemen arşiv.
      return this.geriAl(y.id);
    }
    await this.gecis(y, 'aciliyor', null);
    return this.ac(y.id);
  }

  async ac(yayinId: string): Promise<YayinDurumu> {
    const y = await this.yayin(yayinId);
    const nesneler = await this.nesneler(yayinId);
    for (const tur of ACMA_SIRASI) {
      for (const n of nesneler.filter((x) => x.tur === tur && x.durum === 'kuruldu')) {
        const ad = String(govdeBul(y, n.ad).alanlar.name ?? '');
        try {
          // Önek AYNI çağrıda kalkıyor: ayrı bir ad yazması, açılmış ama adı
          // "açılmadı" diyen bir nesne bırakabilirdi.
          await this.meta.durumYaz(n.meta_id!, { status: 'ACTIVE', name: onekKaldir(ad) });
        } catch {
          // Açma tekrarlanabilir ama önce DURUM okunur.
          const okunan = await this.meta.oku(n.meta_id!, ['configured_status']).catch(() => null);
          if (okunan?.configured_status !== 'ACTIVE') {
            return (await this.gecis(y, 'kismen_acik', `${n.ad} açılamadı`)).durum;
          }
        }
        await this.nesneYaz(n.id, 'acildi', n.meta_id, null, 'kuruldu');
      }
    }
    return (await this.gecis(y, 'iletildi', null)).durum;
  }

  /**
   * Geri al = ARŞİV. DELETED hiçbir yolda yok. Kampanya arşivlenince alt
   * nesneler miras alır; form ayrıca arşivlenir. Arşiv düşerse yayın
   * sonlanmaz ve sebebi yazılır.
   */
  async geriAl(yayinId: string): Promise<YayinDurumu> {
    const y = await this.yayin(yayinId);
    const nesneler = await this.nesneler(yayinId);
    const kalan: string[] = [];
    for (const n of nesneler.filter((x) => (x.tur === 'kampanya' || x.tur === 'form') && x.meta_id)) {
      try {
        await this.meta.durumYaz(n.meta_id!, { status: 'ARCHIVED' });
        await this.nesneYaz(n.id, 'arsivlendi', n.meta_id, null, null);
      } catch (e) {
        kalan.push(`${n.ad} (${n.meta_id}): ${(e as Error).message}`);
      }
    }
    if (kalan.length > 0) {
      await this.tx((tx) =>
        tx.$queryRaw(Prisma.sql`UPDATE yayin SET sebep = ${`Arşivlenemedi: ${kalan.join('; ')}`} WHERE id = ${y.id}::uuid RETURNING id`),
      );
      return y.durum;
    }
    return yayiniSonlandir(this.tx, y.id, 'geri_alindi');
  }

  // ---------------------------------------------------------------------------
  // Yardımcılar
  // ---------------------------------------------------------------------------
  private async geriOkuVeYaz(y: YayinSatiri, yalniz: NesneTuru[] | null): Promise<'temiz' | 'fark' | 'dogrulanamadi'> {
    const nesneler = (await this.nesneler(y.id)).filter(
      (n) => n.tur !== 'medya' && n.meta_id && (!yalniz || yalniz.includes(n.tur)),
    );
    const adlar = new Set(nesneler.map((n) => n.ad));
    const kimlikler = await this.kimlikHaritasi(y.id);
    // Yer tutucular (`{kampanya}`, `{medya:...}`) gerçek kimliklere çevrilerek
    // karşılaştırılıyor: kreatifin image_hash'i yer tutucuyla değil
    // yüklenen hash'le eşit olmalı.
    const yankilar = y.beklenen_yanki
      .filter((b) => adlar.has(b.govde))
      .map((b) => ({ ...b, gonderilen: yerlestir(b.gonderilen, kimlikler) }));
    const okunan: Record<string, Record<string, unknown> | undefined> = {};
    for (const n of nesneler) {
      try {
        okunan[n.ad] = await this.meta.oku(n.meta_id!, okumaAlanlari(yankilar, n.ad));
      } catch {
        okunan[n.ad] = undefined;
      }
    }
    const r = geriOkumaKarsilastir(yankilar, okunan);
    await this.tx((tx) =>
      tx.$queryRaw(Prisma.sql`
        INSERT INTO geri_okuma (yayin_id, org_id, client_id, sonuc, satirlar, bilgiler, ham, api_surumu)
        VALUES (${y.id}::uuid, ${y.org_id}::uuid, ${y.client_id}::uuid, ${r.sonuc},
                ${JSON.stringify('satirlar' in r ? r.satirlar : [])}::jsonb, ${JSON.stringify(r.bilgiler)}::jsonb,
                ${JSON.stringify(okunan)}::jsonb, ${y.api_surumu})
        RETURNING id`),
    );
    return r.sonuc;
  }

  private async yayin(id: string): Promise<YayinSatiri> {
    const [y] = await this.tx((tx) =>
      tx.$queryRaw<YayinSatiri[]>(Prisma.sql`
        SELECT id::text, org_id::text, client_id::text, durum, derlenmis_govde, beklenen_yanki, api_surumu, test_kipi
          FROM yayin WHERE id = ${id}::uuid`),
    );
    if (!y) throw new Error(`Yayın bulunamadı: ${id}`);
    return y;
  }

  private async nesneler(yayinId: string): Promise<NesneSatiri[]> {
    return this.tx((tx) =>
      tx.$queryRaw<NesneSatiri[]>(Prisma.sql`
        SELECT id::text, tur, ad, sira, meta_id, durum FROM yayin_nesnesi
         WHERE yayin_id = ${yayinId}::uuid ORDER BY sira`),
    );
  }

  private async kimlikHaritasi(yayinId: string): Promise<Map<string, string>> {
    const m = new Map<string, string>();
    for (const n of await this.nesneler(yayinId)) if (n.meta_id) m.set(n.ad, n.meta_id);
    return m;
  }

  private async nesneYaz(id: string, durum: string, metaId: string | null, hata: unknown, beklenen: string | null = 'gonderiliyor'): Promise<void> {
    const r = await this.tx((tx) =>
      tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        UPDATE yayin_nesnesi
           SET durum = ${durum}, meta_id = COALESCE(${metaId}, meta_id),
               son_hata = ${hata === null ? null : JSON.stringify(hata)}::jsonb, updated_at = now()
         WHERE id = ${id}::uuid ${beklenen ? Prisma.sql`AND durum = ${beklenen}` : Prisma.empty}
        RETURNING id::text`),
    );
    // Sıfır satır = başka bir süreç bu nesneyi değiştirdi ya da RLS gizledi.
    if (r.length !== 1) throw new Error(`yayin_nesnesi ${id} ${durum} yazılamadı`);
  }

  /** Durum geçişi: izinli geçiş tablosu + iyimser kilit (durum eşleşmeli). */
  private async gecis(y: YayinSatiri, yeni: YayinDurumu, sebep: string | null): Promise<YayinSatiri> {
    if (!gecisIzinliMi(y.durum, yeni)) throw new Error(`İzinsiz geçiş: ${y.durum} → ${yeni}`);
    if (!YAYIN_SONLANDIRMAYAN.has(yeni)) throw new Error(`${yeni} yalnız yayiniSonlandir ile yazılır`);
    const r = await this.tx((tx) =>
      tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        UPDATE yayin SET durum = ${yeni}, onceki_durum = durum, durum_at = now(), sebep = ${sebep}
         WHERE id = ${y.id}::uuid AND durum = ${y.durum} AND sonlandi_at IS NULL
        RETURNING id::text`),
    );
    if (r.length !== 1) throw new Error(`Yayın ${y.id} başka bir süreçte ilerlemiş (${y.durum})`);
    return { ...y, durum: yeni };
  }
}

/**
 * Aktif olmayan (sonlandıran) durumlar YALNIZ yayiniSonlandir'den yazılır.
 * Liste elle değil durum sınıfından TÜRÜYOR: yeni bir son durum eklenince
 * burası kendiliğinden doğru kalır.
 */
const YAYIN_SONLANDIRMAYAN = new Set<YayinDurumu>(
  YAYIN_DURUMLARI.filter((d) => YAYIN_DURUM_SINIFI[d].aktif),
);

/**
 * `sonlandi_at`'i YAZAN TEK FONKSİYON. Taslak başına tek aktif yayın
 * indeksinin yüklemi bu kolona bağlı; başka bir yer yazarsa ya kilit
 * açılmaz (taslak kalıcı kilitlenir) ya da ikinci yayın açılır.
 * Kaynak taraması `sonlandi_at` yazımının başka hiçbir dosyada olmadığını
 * kilitliyor.
 */
export async function yayiniSonlandir(tx: TxRunner, yayinId: string, sebep: SonlanmaSebebi): Promise<YayinDurumu> {
  const durum: YayinDurumu = sebep === 'kapali_kuruldu' ? 'kapali_kuruldu' : 'arsivlendi';
  // Ön kontrol reddi Meta'da hiçbir şey doğmadan kapanır; diğerleri yalnız
  // geçiş tablosunun izin verdiği durumlardan (ör. 'kuruluyor'dan arşive
  // atlanmaz: önce kurulumun sonucu bilinmeli).
  const kaynaklar = YAYIN_DURUMLARI.filter(
    (d) => gecisIzinliMi(d, durum) || (sebep === 'on_kontrol_reddi' && d === 'on_kontrol'),
  );
  const r = await tx((t) =>
    t.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      UPDATE yayin SET durum = ${durum}, onceki_durum = durum, durum_at = now(),
                       sonlandi_at = now(), sonlanma_sebebi = ${sebep}
       WHERE id = ${yayinId}::uuid AND sonlandi_at IS NULL AND durum IN (${Prisma.join(kaynaklar)})
      RETURNING id::text`),
  );
  if (r.length !== 1) throw new Error(`Yayın ${yayinId} bu durumdan sonlandırılamaz ya da zaten sonlanmış`);
  return durum;
}

function govdeBul(y: YayinSatiri, ad: string): MetaGovdesi {
  const g = y.derlenmis_govde.find((x) => x.ad === ad);
  if (!g) throw new Error(`Gövde bulunamadı: ${ad}`);
  return g;
}

/**
 * Yer tutucuları (`{kampanya}`, `{kreatif:2}`, `{medya:<varlık>}`) gerçek
 * Meta kimlikleriyle değiştirir. Çözülemeyen yer tutucu FIRLATIR: Meta'ya
 * "{kampanya}" dizgesi gitmesin.
 */
export function yerlestir(v: unknown, kimlikler: Map<string, string>): unknown {
  if (typeof v === 'string') {
    const m = YER_TUTUCU.exec(v);
    if (!m) return v;
    const id = kimlikler.get(m[1]!);
    if (!id) throw new Error(`Yer tutucu çözülemedi: ${v}`);
    return id;
  }
  if (Array.isArray(v)) return v.map((x) => yerlestir(x, kimlikler));
  if (v && typeof v === 'object') {
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, yerlestir(x, kimlikler)]));
  }
  return v;
}

function onekKaldir(ad: string): string {
  return ad.startsWith(ACILMADI_ONEKI) ? ad.slice(ACILMADI_ONEKI.length) : ad;
}

/** Hata kaydı token'SIZ: yalnız mesaj, kod ve fbtrace. */
function hataKaydi(e: unknown): Record<string, unknown> {
  if (e instanceof MetaKesinHata) return { mesaj: e.message, kod: e.kod, altKod: e.altKod, fbtrace: e.fbtrace };
  return { mesaj: e instanceof Error ? e.message : String(e), belirsiz: true };
}

/** Gövde özeti: yayin_nesnesi.istek_ozeti için (aynı gövde = aynı istek). */
export function istekOzeti(alanlar: unknown): string {
  return createHash('sha256').update(JSON.stringify(alanlar)).digest('hex');
}

export interface YayinKaydiGirdisi {
  /**
   * Derlemeden ÖNCE üretilir: derleyici `adv-yayin-<id>` etiketini gövdeye
   * yazıyor ve uzlaştırma ile tekillik kapısı bu etiketle arıyor.
   */
  id: string;
  orgId: string;
  clientId: string;
  taslakId: string;
  taslakSurumNo: number;
  icerikOzeti: string;
  adAccountId: string;
  govdeler: MetaGovdesi[];
  yankilar: BeklenenYanki[];
  apiSurumu: string;
  derleyiciSurumu: string;
  atifStandardi: string;
  /** Kreatiflerin `{medya:<varlık>}` yer tutucularıyla aynı kimlikler. */
  medyaVarliklari: string[];
  kaynak: 'panel' | 'ai_kart' | 'kopya' | 'toplu';
  baslatanId: string;
  testKipi: boolean;
}

/**
 * Yayın kaydı ve ZİNCİR SIRASIYLA nesne satırları, tek transaction'da.
 * Sıra: medya → form → kampanya → reklam seti → kreatif/reklam (kavram
 * sırasıyla). Taslak başına tek aktif yayın indeksi çift tıklamayı burada
 * durduruyor: ikinci INSERT tekil ihlalle düşer.
 */
export async function yayinKaydiOlustur(tx: TxRunner, g: YayinKaydiGirdisi): Promise<string> {
  const sira: Array<{ tur: NesneTuru; ad: string }> = [
    ...g.medyaVarliklari.map((v) => ({ tur: 'medya' as const, ad: `medya:${v}` })),
    ...g.govdeler.map((x) => ({ tur: x.nesne as NesneTuru, ad: x.ad })),
  ];
  return tx(async (t) => {
    const [y] = await t.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      INSERT INTO yayin (id, org_id, client_id, taslak_id, taslak_surum_no, icerik_ozeti, ad_account_id,
                         derlenmis_govde, beklenen_yanki, api_surumu, derleyici_surumu, atif_standardi,
                         kaynak, test_kipi, baslatan_id)
      VALUES (${g.id}::uuid, ${g.orgId}::uuid, ${g.clientId}::uuid, ${g.taslakId}::uuid, ${g.taslakSurumNo}, ${g.icerikOzeti},
              ${g.adAccountId}::uuid, ${JSON.stringify(g.govdeler)}::jsonb, ${JSON.stringify(g.yankilar)}::jsonb,
              ${g.apiSurumu}, ${g.derleyiciSurumu}, ${g.atifStandardi}, ${g.kaynak}, ${g.testKipi}, ${g.baslatanId}::uuid)
      RETURNING id::text`);
    for (const [i, n] of sira.entries()) {
      const govde = g.govdeler.find((x) => x.ad === n.ad);
      await t.$queryRaw(Prisma.sql`
        INSERT INTO yayin_nesnesi (yayin_id, org_id, client_id, tur, ad, sira, istek_ozeti)
        VALUES (${y!.id}::uuid, ${g.orgId}::uuid, ${g.clientId}::uuid, ${n.tur}, ${n.ad}, ${i},
                ${govde ? istekOzeti(govde.alanlar) : null})
        RETURNING id`);
    }
    return y!.id;
  });
}
