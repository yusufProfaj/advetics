import { createHash } from 'node:crypto';
import { Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ACILMADI_ONEKI, geriOkumaKarsilastir, okumaAlanlari, type BeklenenYanki, type FarkSatiri, type MetaGovdesi } from '@advetics/shared';
// İZİNLİ İÇE AKTARIM (pilot-kayit.spec.ts listesi): yalnız Meta istemcisinin
// port tipi, hata sınıfları ve yer tutucu çözücü. Eski motorun TABLOLARINA
// ve servislerine dokunulmuyor.
import { MetaBelirsizHata, MetaKesinHata, YazmaDurduruldu, yerlestir, type MetaYazmaPortu, type TxRunner } from '../reklam/yayin-motoru';

const logger = new Logger('PilotKurulumMotoru');

/**
 * ═══ PİLOT KURULUM MOTORU — `pilot_nesneleri` ÜZERİNDE ═══
 *
 * Karar 1'in üç adımı (eski yayın motorundan öğrenilen ve kabul listesinin
 * F-* maddeleri): PAUSED kur → geri oku → fark yoksa aç. Tablolar yeni
 * (Ç-7), kurallar aynı:
 *
 *   · HER POST'TAN ÖNCE yazma kesici (`yazmaKapisi`) sorulur; uçuştaki
 *     çağrı kesilmez (yarıda kesmek sonucu belirsiz yapardı) (G-04/G-05).
 *   · NİYET → ÇAĞRI → SONUÇ: nesne POST'tan önce `gonderiliyor`, sonra
 *     `kuruldu`. Platform çağrısı transaction DIŞINDA (F-20).
 *   · KESİN RET: nesne doğmadı, sonraki halkalar kurulmaz (F-04).
 *   · BELİRSİZ SONUÇ: nesne doğmuş olabilir; ASLA kendiliğinden yeniden
 *     POST edilmez (F-05). Satır `kayit_belirsiz` olur; uzlaştırma Tur 2.
 *   · SONUÇ YAZILAMAZSA nesne `gonderiliyor` kalır ve satır
 *     `kayit_belirsiz`: `reddedildi` yazmak yeniden denemeyi açar ve Meta'da
 *     İKİNCİ kampanya doğar (F-06).
 *   · Açma YUKARIDAN AŞAĞI ve önek AYNI çağrıda kalkar (F-01).
 *   · DELETED hiçbir yolda yok; geri almak arşiv (F-12).
 */
export type MotorSonucu =
  | { tur: 'kuruldu' }
  | { tur: 'kesin'; mesaj: string }
  | { tur: 'belirsiz'; mesaj: string }
  | { tur: 'durduruldu'; mesaj: string };

export type GeriOkumaSonucu = { tur: 'temiz' } | { tur: 'fark'; farklar: Array<{ alan: string; beklenen: string; okunan: string }>; mesaj: string };

interface NesneSatiri {
  id: string;
  tur: string;
  ad: string;
  sira: number;
  platform_kimligi: string | null;
  durum: string;
  derlenmis_govde: MetaGovdesi | null;
  beklenen_yanki: BeklenenYanki[];
}

const ACMA_SIRASI = ['kampanya', 'reklam_seti', 'reklam'] as const;

export class PilotKurulumMotoru {
  constructor(
    private readonly tx: TxRunner,
    private readonly meta: MetaYazmaPortu,
    private readonly hesap: string,
    private readonly yazmaKapisi: () => Promise<{ acik: true } | { acik: false; sebep: string }>,
  ) {}

  // ── Yazma sarmalayıcıları: Meta'ya yazan çağrılar YALNIZ bunlardan geçer ──
  private async kapi(): Promise<void> {
    const k = await this.yazmaKapisi();
    if (!k.acik) throw new YazmaDurduruldu(k.sebep);
  }
  private async yazGorsel(varlikId: string): Promise<string> {
    await this.kapi();
    return this.meta.gorselYukle(this.hesap, varlikId);
  }
  private async yazOlustur(uc: string, alanlar: Record<string, unknown>): Promise<{ id: string }> {
    await this.kapi();
    return this.meta.olustur(this.hesap, uc, alanlar);
  }
  private async yazDurum(id: string, alanlar: { status: 'ACTIVE' | 'ARCHIVED'; name?: string }): Promise<void> {
    await this.kapi();
    return this.meta.durumYaz(id, alanlar);
  }
  async dogrula(uc: string, alanlar: Record<string, unknown>): Promise<void> {
    await this.kapi();
    return this.meta.dogrula(this.hesap, uc, alanlar);
  }
  /** Prova da gerçek hash ister; görsel yükleme para harcamaz ve hesap başına önbellekte kalır. */
  async gorselHash(varlikId: string): Promise<string> {
    return this.yazGorsel(varlikId);
  }

  /** Nesne satırlarını zincir sırasıyla açar (yoksa). Medya önce, sonra gövdeler. */
  async nesneleriAc(satir: { id: string; org_id: string; client_id: string }, medya: string[], govdeler: MetaGovdesi[], yankilar: BeklenenYanki[]): Promise<void> {
    const sira: Array<{ tur: string; ad: string; govde: MetaGovdesi | null }> = [
      ...medya.map((v) => ({ tur: 'medya', ad: `medya:${v}`, govde: null })),
      ...govdeler.map((g) => ({ tur: g.nesne, ad: g.ad, govde: g })),
    ];
    for (const [i, n] of sira.entries()) {
      const yanki = n.govde ? yankilar.filter((y) => y.govde === n.ad) : [];
      await this.tx((t) =>
        t.$queryRaw(Prisma.sql`
          INSERT INTO pilot_nesneleri (kurulum_satir_id, org_id, client_id, tur, ad, sira, derlenmis_govde, beklenen_yanki)
          VALUES (${satir.id}::uuid, ${satir.org_id}::uuid, ${satir.client_id}::uuid, ${n.tur}, ${n.ad}, ${i},
                  ${n.govde ? JSON.stringify(n.govde) : null}::jsonb, ${JSON.stringify(yanki)}::jsonb)
          ON CONFLICT (kurulum_satir_id, ad) DO NOTHING
          RETURNING id`),
      );
    }
  }

  async nesneler(satirId: string): Promise<NesneSatiri[]> {
    return this.tx((t) =>
      t.$queryRaw<NesneSatiri[]>(Prisma.sql`
        SELECT id::text, tur, ad, sira, platform_kimligi, durum, derlenmis_govde, beklenen_yanki
          FROM pilot_nesneleri WHERE kurulum_satir_id = ${satirId}::uuid ORDER BY sira`),
    );
  }

  /** Belirsiz ya da yarıda kalmış nesne var mı: varsa satır YENİDEN KURULMAZ. */
  async belirsizVarMi(satirId: string): Promise<boolean> {
    return (await this.nesneler(satirId)).some((n) => n.durum === 'gonderiliyor' || n.durum === 'belirsiz');
  }

  /** PAUSED kurulum: `bekliyor` nesneleri sırayla kurar; `kuruldu` olanları atlar (kaldığı yerden). */
  async kur(satirId: string): Promise<MotorSonucu> {
    for (const n of await this.nesneler(satirId)) {
      if (n.durum !== 'bekliyor') {
        if (n.durum === 'kuruldu' || n.durum === 'acildi') continue;
        return { tur: 'belirsiz', mesaj: `${n.ad} ${n.durum}; yeniden gönderilmez` };
      }
      await this.nesneYaz(n.id, 'gonderiliyor', null, null, 'bekliyor', true);
      let kimlik: string;
      try {
        if (n.tur === 'medya') kimlik = await this.yazGorsel(n.ad.slice('medya:'.length));
        else {
          const kimlikler = await this.kimlikHaritasi(satirId);
          kimlik = (await this.yazOlustur(n.derlenmis_govde!.uc, yerlestir(n.derlenmis_govde!.alanlar, kimlikler) as Record<string, unknown>)).id;
        }
      } catch (e) {
        if (e instanceof YazmaDurduruldu) {
          // Çağrı YAPILMADI: niyet geri alınır, "Şimdi kur" kaldığı yerden sürer.
          await this.nesneYaz(n.id, 'bekliyor', null, null, 'gonderiliyor');
          return { tur: 'durduruldu', mesaj: e.message };
        }
        if (e instanceof MetaKesinHata) {
          await this.nesneYaz(n.id, 'reddedildi', null, hataKaydi(e), 'gonderiliyor');
          return { tur: 'kesin', mesaj: `${n.ad}: ${e.message}` };
        }
        await this.nesneYaz(n.id, 'belirsiz', null, hataKaydi(e), 'gonderiliyor');
        return { tur: 'belirsiz', mesaj: `${n.ad}: Meta’da oluşmuş olabilir (${(e as Error).message})` };
      }
      try {
        await this.nesneYaz(n.id, 'kuruldu', kimlik, null, 'gonderiliyor');
      } catch (e) {
        logger.error(`KAYIT BELİRSİZ satir=${satirId} nesne=${n.ad} platform=${kimlik}: ${(e as Error).message}`);
        return { tur: 'belirsiz', mesaj: `${n.ad} Meta’da kuruldu (${kimlik}) ama kayıt yazılamadı` };
      }
    }
    return { tur: 'kuruldu' };
  }

  /**
   * Geri okuma + tekillik: gönderilen her yaprak alan yankısıyla
   * karşılaştırılır (`geriOkumaKarsilastir`, kabul listesi E-*). Ardından
   * kampanya etiketle aranır: bizim kurduğumuzdan fazlası varsa ikiz var.
   */
  async geriOku(satirId: string, etiket: string, yasalUyariVar: boolean): Promise<GeriOkumaSonucu> {
    const nesneler = (await this.nesneler(satirId)).filter((n) => n.tur !== 'medya' && n.platform_kimligi);
    const kimlikler = await this.kimlikHaritasi(satirId);
    const yankilar = nesneler.flatMap((n) => n.beklenen_yanki).map((b) => ({ ...b, gonderilen: yerlestir(b.gonderilen, kimlikler) }));
    const okunan: Record<string, Record<string, unknown> | undefined> = {};
    for (const n of nesneler) {
      try {
        okunan[n.ad] = await this.meta.oku(n.platform_kimligi!, okumaAlanlari(yankilar, n.ad));
      } catch {
        okunan[n.ad] = undefined;
      }
    }
    const r = geriOkumaKarsilastir(yankilar, okunan, { yasalUyariVar });
    if (r.sonuc !== 'temiz') {
      return { tur: 'fark', farklar: r.satirlar.map(farkSatiri), mesaj: r.sonuc === 'fark' ? 'Meta’da duran ayar gönderilenden farklı' : 'Meta’daki ayarlar okunamadı' };
    }
    const bizim = new Set(nesneler.filter((n) => n.tur === 'kampanya').map((n) => n.platform_kimligi));
    try {
      const bulunan = await this.meta.etiketleAra(this.hesap, 'campaigns', etiket);
      const fazla = bulunan.filter((b) => !bizim.has(b.id));
      if (fazla.length > 0) return { tur: 'fark', farklar: [], mesaj: `Meta’da bu kampanyanın ikinci bir kopyası var: ${fazla.map((f) => f.id).join(', ')}` };
    } catch (e) {
      return { tur: 'fark', farklar: [], mesaj: `Tekillik araması yapılamadı: ${(e as Error).message}` };
    }
    return { tur: 'temiz' };
  }

  /** Yukarıdan aşağı açar; önek aynı çağrıda kalkar. Düşerse durum OKUNUR (zaten açıksa açılmış sayılır). */
  async ac(satirId: string): Promise<MotorSonucu> {
    const nesneler = await this.nesneler(satirId);
    for (const tur of ACMA_SIRASI) {
      for (const n of nesneler.filter((x) => x.tur === tur && x.durum === 'kuruldu')) {
        const ad = String(n.derlenmis_govde?.alanlar.name ?? '');
        try {
          await this.yazDurum(n.platform_kimligi!, { status: 'ACTIVE', name: ad.startsWith(ACILMADI_ONEKI) ? ad.slice(ACILMADI_ONEKI.length) : ad });
        } catch (e) {
          if (e instanceof YazmaDurduruldu) return { tur: 'durduruldu', mesaj: e.message };
          const okunan = await this.meta.oku(n.platform_kimligi!, ['configured_status']).catch(() => null);
          if (okunan?.configured_status !== 'ACTIVE') return { tur: 'kesin', mesaj: `${n.ad} açılamadı: ${(e as Error).message}` };
        }
        await this.nesneYaz(n.id, 'acildi', n.platform_kimligi, null, 'kuruldu');
      }
    }
    return { tur: 'kuruldu' };
  }

  /** Test kipi: açmak yerine kampanyayı ARŞİVLER (F-02). Arşiv düşerse mesaj döner, satır yine test kipinde kurulmuştur. */
  async arsivle(satirId: string): Promise<string | null> {
    const k = (await this.nesneler(satirId)).filter((n) => n.tur === 'kampanya' && n.platform_kimligi);
    const kalan: string[] = [];
    for (const n of k) {
      try {
        await this.yazDurum(n.platform_kimligi!, { status: 'ARCHIVED' });
        await this.nesneYaz(n.id, 'arsivlendi', n.platform_kimligi, null, null);
      } catch (e) {
        kalan.push(`${n.platform_kimligi}: ${(e as Error).message}`);
      }
    }
    return kalan.length > 0 ? `Test kampanyası arşivlenemedi: ${kalan.join('; ')}` : null;
  }

  private async kimlikHaritasi(satirId: string): Promise<Map<string, string>> {
    const m = new Map<string, string>();
    for (const n of await this.nesneler(satirId)) if (n.platform_kimligi) m.set(n.ad, n.platform_kimligi);
    return m;
  }

  private async nesneYaz(id: string, durum: string, kimlik: string | null, hata: unknown, beklenen: string | null, deneme = false): Promise<void> {
    const r = await this.tx((t) =>
      t.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        UPDATE pilot_nesneleri
           SET durum = ${durum}, platform_kimligi = COALESCE(${kimlik}, platform_kimligi),
               son_hata = ${hata === null ? null : JSON.stringify(hata)}::jsonb,
               deneme = deneme + ${deneme ? 1 : 0}, updated_at = now()
         WHERE id = ${id}::uuid ${beklenen ? Prisma.sql`AND durum = ${beklenen}` : Prisma.empty}
        RETURNING id::text`),
    );
    // Sıfır satır = başka bir süreç bu nesneyi değiştirdi.
    if (r.length !== 1) throw new Error(`pilot_nesneleri ${id} ${durum} yazılamadı`);
  }
}

/** Hata kaydı token'SIZ: yalnız mesaj, kod ve fbtrace. */
function hataKaydi(e: unknown): Record<string, unknown> {
  if (e instanceof MetaKesinHata) return { mesaj: e.message, kod: e.kod, altKod: e.altKod, fbtrace: e.fbtrace };
  return { mesaj: e instanceof Error ? e.message : String(e), belirsiz: e instanceof MetaBelirsizHata || !(e instanceof Error) };
}

function farkSatiri(f: FarkSatiri): { alan: string; beklenen: string; okunan: string } {
  const yaz = (v: unknown) => (v === undefined ? 'dönmedi' : typeof v === 'string' ? v : JSON.stringify(v));
  return { alan: f.ekranEtiketi || f.alanYolu, beklenen: yaz(f.gonderilen), okunan: yaz(f.donen) };
}

export function taslakOzeti(icerik: string): string {
  return createHash('sha256').update(icerik).digest('hex');
}
