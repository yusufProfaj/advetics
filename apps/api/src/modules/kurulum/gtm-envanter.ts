import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import { Queue } from 'bullmq';
import Redis from 'ioredis';
import { CONFIG, type AppConfig } from '../../config/configuration';
import { GtmIstemcisi, type GtmKonteyner } from './gtm';

/**
 * ═══ TAG MANAGER ENVANTERİ — BÜTÜN HESAPLARIN KONTEYNERLERİ ═══
 *
 * Konteyner seçici yalnız ilk 30 hesabın konteynerlerini gösteriyordu
 * (ajansta 155 hesap; kullanıcı: "hesaplar eksik gözüküyor"). Sınırın
 * sebebi gerçek: Tag Manager API'si konteynerleri HESAP BAŞINA listeliyor ve
 * kotası PROJE başına saniyede 0,25 istek (100 saniyede 25; günde 10.000).
 * 155 hesap istek anında 155 çağrı, yani ~10 dakika ve 403 demek; kota da
 * bütün Advetics projesinde ortak, kurulumun kendi Tag Manager çağrıları da
 * oradan yiyor.
 *
 * Bu yüzden envanter ARKA PLANDA, kendi kuyruğunda, saniyede en çok 0,2
 * istekle (işçide `limiter`, kuyruk düzeyinde) taranıyor ve REDIS'te
 * bağlantı başına bir hash olarak duruyor. Tablo DEĞİL: yeniden üretilebilir
 * bir önbellek (hesap ve konteyner adları), gizli bilgi taşımıyor; tablo
 * migration, RLS ve üretim sırası yükü getirirdi.
 *
 * BİR KEZ TARA, HEP GÖSTER (kullanıcı, 2026-10-15): tam tarama Tag Manager
 * İZNİ VERİLDİĞİ ANDA başlıyor (`izinleBaslat`), seçici açılınca değil;
 * kullanıcı seçiciye geldiğinde liste büyük ihtimalle hazır. Anahtarın
 * ÖMRÜ YOK: süreli olsaydı bir hafta açılmayan seçici 13 dakikalık taramayı
 * baştan yaptırırdı. Yenileme yine var ama görünmez: seçici 24 saatten eski
 * hesabı arka planda yeniden kuyruğa atıyor, eski liste bu sırada ekranda
 * kalıyor. Hiç yenilememek, ajansa eklenen yeni hesabı sessizce listeden
 * düşürmek olurdu. Panelden açılan konteyner taramayı beklemeden yazılıyor
 * (`konteynerEkle`).
 *
 * TEK DENEME, HATA SATIRA YAZILIYOR: bir hesap düşerse ("izin yok", 403
 * kota) envanterde `hata` ile duruyor ve seçici onu sayıyor. Sessizce
 * "taranmadı" kalmak, eksik listeyi tam sanmak olurdu.
 */
export const GTM_ENVANTER_KUYRUGU = 'gtm-envanter';

/** Saniyede 0,2 istek: Tag Manager'ın 0,25 sınırının altında, kurulum çağrılarına pay bırakıyor. */
export const GTM_ENVANTER_HIZI = { max: 1, duration: 5_000 } as const;

/** Bu süreden eski hesap taraması seçici açıldığında yenileniyor. */
export const GTM_ENVANTER_TAZELIK_MS = 24 * 60 * 60 * 1000;

export interface GtmEnvanterIsi {
  connectionId: string;
  hesapId: string;
  hesapAdi: string;
}

export interface GtmEnvanterSatiri {
  hesapAdi: string;
  konteynerler: Array<Pick<GtmKonteyner, 'path' | 'name' | 'publicId'>>;
  /** ISO zaman. */
  taranma: string;
  /** Platformun mesajı; null = başarılı. */
  hata: string | null;
}

export function envanterAnahtari(onEk: string, connectionId: string): string {
  return `${onEk}:gtm-envanter:${connectionId}`;
}

/** Ayırıcı `__` (BullMQ `:`'yı reddediyor). Gün kimlikte: aynı gün ikinci ekleme yutulur, ertesi gün tazelenir. */
export function envanterIsKimligi(is: GtmEnvanterIsi, gun: string): string {
  return `gtm_envanter__${is.connectionId}__${is.hesapId}__${gun}`;
}

/**
 * ENVANTERİN ÖZETİ — saf, ÇALIŞTIRILARAK sınanıyor. Hangi hesaplar taze,
 * hangileri kuyruğa girmeli, ekranda ne yazmalı.
 *
 * Yalnız BUGÜN erişilebilen hesaplar sayılıyor: erişimi kalkmış bir hesabın
 * eski satırı listede kalırsa kullanıcı açamayacağı bir konteyneri seçerdi.
 */
export function envanterOzeti(
  hesaplar: ReadonlyArray<{ accountId: string; name: string }>,
  satirlar: ReadonlyMap<string, GtmEnvanterSatiri>,
  simdi: Date,
): {
  konteynerler: Array<{ path: string; name: string; publicId: string; hesapAdi: string }>;
  taranan: number;
  hatali: number;
  kuyruga: Array<{ hesapId: string; hesapAdi: string }>;
} {
  const konteynerler: Array<{ path: string; name: string; publicId: string; hesapAdi: string }> = [];
  const kuyruga: Array<{ hesapId: string; hesapAdi: string }> = [];
  let taranan = 0;
  let hatali = 0;
  for (const h of hesaplar) {
    const s = satirlar.get(h.accountId);
    if (!s) {
      kuyruga.push({ hesapId: h.accountId, hesapAdi: h.name });
      continue;
    }
    taranan += 1;
    if (s.hata) hatali += 1;
    for (const c of s.konteynerler) konteynerler.push({ ...c, hesapAdi: h.name });
    // HATALI SATIR DA YENİDEN DENENİYOR, ama tazelik süresinden sonra: her
    // açılışta tekrar denemek, kota hatasını kotayı yiyerek büyütürdü.
    if (simdi.getTime() - Date.parse(s.taranma) > GTM_ENVANTER_TAZELIK_MS) {
      kuyruga.push({ hesapId: h.accountId, hesapAdi: h.name });
    }
  }
  return { konteynerler, taranan, hatali, kuyruga };
}

/** Seçicinin notu. Tam ve hatasızsa null. */
export function envanterNotu(o: { toplam: number; taranan: number; hatali: number }): string | null {
  if (o.toplam === 0) return 'Erişilebilen Tag Manager hesabı yok: tagmanager.google.com’da bir hesap aç, sonra yenile.';
  const parcalar: string[] = [];
  if (o.taranan < o.toplam) {
    const kalan = o.toplam - o.taranan;
    // Hız saniyede 0,2 istek: hesap başına ~5 sn.
    const dk = Math.max(1, Math.ceil((kalan * GTM_ENVANTER_HIZI.duration) / 60_000));
    parcalar.push(
      `${o.taranan} / ${o.toplam} Tag Manager hesabı tarandı; kalanlar arka planda taranıyor (yaklaşık ${dk} dk). Aradığın konteyner yoksa biraz sonra yenile.`,
    );
  }
  if (o.hatali > 0) parcalar.push(`${o.hatali} hesabın konteynerleri okunamadı; yarın yeniden denenecek.`);
  return parcalar.length > 0 ? parcalar.join(' ') : null;
}

@Injectable()
export class GtmEnvanterKuyrugu implements OnModuleDestroy {
  private readonly baglanti: Redis | null;
  private readonly kuyruk: Queue<GtmEnvanterIsi> | null;
  private readonly onEk: string;

  constructor(@Inject(CONFIG) config: AppConfig) {
    this.onEk = config.redis.keyPrefix;
    if (!config.redis.url) {
      this.baglanti = null;
      this.kuyruk = null;
      return;
    }
    this.baglanti = new Redis(config.redis.url, { db: config.redis.db, maxRetriesPerRequest: null });
    this.kuyruk = new Queue<GtmEnvanterIsi>(GTM_ENVANTER_KUYRUGU, {
      connection: this.baglanti,
      prefix: config.redis.keyPrefix,
      defaultJobOptions: { attempts: 1, removeOnComplete: true, removeOnFail: true },
    });
  }

  /** `null` = Redis yok; envanter okunamıyor (seçici bunu söylüyor). */
  async oku(connectionId: string): Promise<Map<string, GtmEnvanterSatiri> | null> {
    if (!this.baglanti) return null;
    const ham = await this.baglanti.hgetall(envanterAnahtari(this.onEk, connectionId));
    const m = new Map<string, GtmEnvanterSatiri>();
    for (const [hesapId, json] of Object.entries(ham)) {
      try {
        m.set(hesapId, JSON.parse(json) as GtmEnvanterSatiri);
      } catch {
        // Bozuk satır taranmamış sayılır ve kuyruğa girer; yutulmuyor, yeniden yazılıyor.
      }
    }
    return m;
  }

  async ekle(connectionId: string, hesaplar: ReadonlyArray<{ hesapId: string; hesapAdi: string }>, simdi: Date): Promise<void> {
    if (!this.kuyruk || hesaplar.length === 0) return;
    const gun = simdi.toISOString().slice(0, 10);
    await this.kuyruk.addBulk(
      hesaplar.map((h) => {
        const is = { connectionId, hesapId: h.hesapId, hesapAdi: h.hesapAdi };
        return { name: 'gtm-envanter', data: is, opts: { jobId: envanterIsKimligi(is, gun) } };
      }),
    );
  }

  /**
   * İZİN VERİLDİĞİ ANDA TAM TARAMA. Bağlantı akışının sonundan çağrılıyor;
   * tek çağrı (hesap listesi) burada, konteynerler kuyrukta. Tag Manager
   * kapsamı yoksa hiçbir şey yapmıyor.
   */
  async izinleBaslat(connectionId: string, accessToken: string, kapsamlar: readonly string[], simdi: Date): Promise<number> {
    if (!this.kuyruk || !kapsamlar.some((k) => k.includes('/auth/tagmanager'))) return 0;
    const hesaplar = await new GtmIstemcisi(accessToken).hesaplar();
    await this.ekle(connectionId, hesaplar.map((h) => ({ hesapId: h.accountId, hesapAdi: h.name })), simdi);
    return hesaplar.length;
  }

  /**
   * PANELDEN AÇILAN KONTEYNER HEMEN LİSTEDE. Yoksa bir sonraki taramaya
   * kadar (24 saate kadar) seçicide görünmezdi. Hesabın satırı yoksa satır
   * BAYAT tarihle açılıyor: yalnız bu konteyneri taşıyan satır "tarandı"
   * sayılsaydı hesabın öbür konteynerleri bir gün listeden düşerdi.
   */
  async konteynerEkle(connectionId: string, hesapId: string, hesapAdi: string, k: Pick<GtmKonteyner, 'path' | 'name' | 'publicId'>): Promise<void> {
    if (!this.baglanti) return;
    const anahtar = envanterAnahtari(this.onEk, connectionId);
    const ham = await this.baglanti.hget(anahtar, hesapId);
    let satir: GtmEnvanterSatiri;
    try {
      satir = ham ? (JSON.parse(ham) as GtmEnvanterSatiri) : { hesapAdi, konteynerler: [], taranma: new Date(0).toISOString(), hata: null };
    } catch {
      satir = { hesapAdi, konteynerler: [], taranma: new Date(0).toISOString(), hata: null };
    }
    if (!satir.konteynerler.some((c) => c.path === k.path)) satir.konteynerler.push({ path: k.path, name: k.name, publicId: k.publicId });
    await this.baglanti.hset(anahtar, hesapId, JSON.stringify(satir));
  }

  async onModuleDestroy(): Promise<void> {
    await this.kuyruk?.close();
    await this.baglanti?.quit().catch(() => this.baglanti?.disconnect());
  }
}

/** İşçinin yazımı — envanter satırı. Ömür YOK (yukarıda: "bir kez tara, hep göster"). */
export async function envanterYaz(
  redis: Pick<Redis, 'hset'>,
  onEk: string,
  is: GtmEnvanterIsi,
  satir: GtmEnvanterSatiri,
): Promise<void> {
  await redis.hset(envanterAnahtari(onEk, is.connectionId), is.hesapId, JSON.stringify(satir));
}

/**
 * İŞÇİNİN İŞİ — bir hesabın konteynerleri. HATA FIRLATMIYOR, satıra
 * yazıyor: tek deneme ve `removeOnFail` altında fırlayan bir iş hiçbir iz
 * bırakmadan kaybolur, seçici o hesabı sonsuza kadar "taranmadı" sayıp her
 * açılışta yeniden kuyruğa atardı.
 */
export async function gtmEnvanterIsle(
  d: {
    tokenAl: (connectionId: string) => Promise<string>;
    konteynerler: (token: string, hesapId: string) => Promise<GtmKonteyner[]>;
    yaz: (is: GtmEnvanterIsi, satir: GtmEnvanterSatiri) => Promise<void>;
    simdi: () => Date;
  },
  is: GtmEnvanterIsi,
): Promise<'tamam' | 'hata'> {
  try {
    const liste = await d.konteynerler(await d.tokenAl(is.connectionId), is.hesapId);
    await d.yaz(is, {
      hesapAdi: is.hesapAdi,
      konteynerler: liste.map((c) => ({ path: c.path, name: c.name, publicId: c.publicId })),
      taranma: d.simdi().toISOString(),
      hata: null,
    });
    return 'tamam';
  } catch (e) {
    await d.yaz(is, {
      hesapAdi: is.hesapAdi,
      konteynerler: [],
      taranma: d.simdi().toISOString(),
      hata: (e instanceof Error ? e.message : String(e)).slice(0, 500),
    });
    return 'hata';
  }
}
