import { createHash, randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import {
  ASISTAN_ARACLARI,
  kanonikJson,
  type AsistanAraci,
  type AsistanMesaji,
  type AsistanParcasi,
  type TenantContext,
} from '@advetics/shared';
import {
  gorunurMetin,
  type GeminiAraci,
  type GeminiMesaji,
  type GeminiParcasi,
  type GeminiSonucu,
} from '../../../yapay-zeka/gemini';
import { modelGecmisi } from '../../../yapay-zeka/model-gecmisi';
import type { TxRunner } from '../../reklam/yayin-motoru';
import { aracCalistir, geminiAraclari, type AsistanOrtami } from './araclar';
import { ASISTAN_SISTEM_ISTEMI } from './istem';

/**
 * ═══ AI ASİSTAN DÖNGÜSÜ (MIMARI § 6) ═══
 *
 * Bir kullanıcı mesajı = bir TUR: model araç ister, sunucu çalıştırır,
 * sonucu verir; model bitirene ya da sınır dolana kadar.
 *
 * AdvCampaign döngüsünden (`reklam/sohbet/dongu.ts`, 2026-10-10 kaldırıldı) KOPYALANMADI: oradaki
 * tur taslak, soru, medya ve onay kartı taşıyor ve bunların hiçbiri burada
 * yok. ORTAK PARÇA ÇAĞRILIYOR: model geçmişinin kayıttan kurulması
 * (`modelGecmisi`, cevapsız araç çağrısını atıyor, ardışık rolleri
 * birleştiriyor) ve Gemini istemcisinin kendisi. İkinci bir `modelGecmisi`
 * doğduğu anda ayrışırdı ve düşünce imzası bir tarafta düşerdi.
 *
 * KAYIT: kullanıcı mesajı tur başında, asistan mesajı tur SONUNDA tek
 * satır. "Yazılıyor" durumu yok: tur yarıda kalırsa (`finally`) yine de o
 * ana kadarki parçalarla yazılıyor; ekranda sonsuza kadar açık bir balon
 * kalmıyor.
 */

export const ASISTAN_SINIRLARI = {
  /** Tur başına araç adımı; aşılırsa durulur ve söylenir. */
  aracAdimi: 8,
  /** Tur başına çıktı token'ı. */
  ciktiToken: 8_000,
  /** Kullanıcı başına saatlik mesaj: maliyet bekçisi, model çağrılmadan ÖNCE. */
  saatlikMesaj: 30,
} as const;

export type ModelAdimi = (g: {
  sistem: string;
  araclar: GeminiAraci[];
  mesajlar: GeminiMesaji[];
  enCokCikti: number;
  metinParcasi: (p: string) => void;
}) => Promise<GeminiSonucu>;

/** Akış olayları (SSE `event:` adı = `tur`). */
export type AsistanOlayi =
  | { tur: 'basladi'; mesajId: string }
  | { tur: 'metin'; parca: string }
  | { tur: 'parca'; parca: AsistanParcasi }
  | { tur: 'bitti'; mesaj: AsistanMesaji };

export class AsistanHatasi extends Error {
  constructor(
    readonly kod: 'YOK' | 'SAHIP_DEGIL' | 'KOTA' | 'MODEL_YOK',
    mesaj: string,
  ) {
    super(mesaj);
  }
}

export interface DonguBagimliliklari {
  tx: TxRunner;
  /** `null` = yapay zekâ anahtarı yok (YAPAY_ZEKA null). */
  model: ModelAdimi | null;
  /** Oturumun workspace'ine daraltılmış ortam. */
  ortam: (ctx: TenantContext, clientId: string) => AsistanOrtami;
  simdi?: () => Date;
}

interface OturumSatiri {
  id: string;
  org_id: string;
  client_id: string;
  user_id: string;
}

export class AsistanDongusu {
  constructor(private readonly d: DonguBagimliliklari) {}

  async *tur(ctx: TenantContext, oturumId: string, metin: string): AsyncGenerator<AsistanOlayi> {
    // Anahtar yoksa AÇIK hata: sessizce boş cevap dönmek "asistan bir şey
    // bulamadı" diye okunurdu.
    if (!this.d.model) {
      throw new AsistanHatasi('MODEL_YOK', 'AI Asistan bağlı değil: sunucuda yapay zekâ anahtarı (GEMINI_API_KEY) tanımlı değil.');
    }
    const model = this.d.model;
    const o = await this.oturum(oturumId);
    if (!ctx.clientIds.includes(o.client_id)) throw new AsistanHatasi('YOK', 'Oturum bulunamadı');
    if (o.user_id !== ctx.userId) throw new AsistanHatasi('SAHIP_DEGIL', 'Bu oturum başka bir kullanıcının; kendi oturumunu aç.');

    const simdi = this.d.simdi ? this.d.simdi() : new Date();
    const saatlik = await this.saatlikMesaj(o.user_id, new Date(simdi.getTime() - 3_600_000));
    if (saatlik >= ASISTAN_SINIRLARI.saatlikMesaj) {
      throw new AsistanHatasi('KOTA', `Saatlik ${ASISTAN_SINIRLARI.saatlikMesaj} mesaj sınırı doldu; biraz sonra tekrar dene. Panel çalışıyor.`);
    }

    const gecmis = await this.gecmis(oturumId);
    const kullaniciMetni = metin.normalize('NFC').trim();
    const kullaniciIcerik: GeminiParcasi[] = [{ text: kullaniciMetni }];
    await this.yaz(o, {
      id: randomUUID(),
      rol: 'kullanici',
      parcalar: [{ tur: 'metin', metin: kullaniciMetni }],
      modelIcerik: kullaniciIcerik,
      giris: 0,
      cikis: 0,
    });

    const asistanId = randomUUID();
    yield { tur: 'basladi', mesajId: asistanId };

    const bugun = simdi.toISOString().slice(0, 10);
    const ortam: AsistanOrtami = { ...this.d.ortam({ ...ctx, activeClientId: o.client_id }, o.client_id), bugun };
    const mesajlar = [...modelGecmisi(gecmis), { role: 'user' as const, parts: kullaniciIcerik }];
    const turMesajlari: GeminiMesaji[] = [];
    const parcalar: AsistanParcasi[] = [];
    const gorulen = new Set<string>();
    let giris = 0;
    let cikis = 0;
    let adim = 0;

    const parcaVer = (p: AsistanParcasi): AsistanOlayi => {
      parcalar.push(p);
      return { tur: 'parca', parca: p };
    };

    try {
      for (;;) {
        const akan: string[] = [];
        let r: GeminiSonucu;
        try {
          r = await model({
            sistem: ASISTAN_SISTEM_ISTEMI,
            araclar: geminiAraclari(),
            mesajlar: [...mesajlar, ...turMesajlari],
            enCokCikti: Math.max(1024, ASISTAN_SINIRLARI.ciktiToken - cikis),
            metinParcasi: (p) => akan.push(p),
          });
        } catch (e) {
          yield parcaVer({ tur: 'hata', mesaj: `Asistana ulaşılamadı: ${e instanceof Error ? e.message : String(e)}` });
          break;
        }
        for (const p of akan) yield { tur: 'metin', parca: p };
        giris += r.girdiToken;
        cikis += r.ciktiToken;
        // Parçalar DEĞİŞTİRİLMEDEN saklanıyor (düşünce imzaları burada).
        if (r.parcalar.length) turMesajlari.push({ role: 'model', parts: r.parcalar });
        const gorunen = gorunurMetin(r.parcalar);
        if (gorunen.trim()) parcalar.push({ tur: 'metin', metin: gorunen });

        if (r.sebep === 'ret') {
          yield parcaVer({ tur: 'hata', mesaj: `Asistan bu isteği yapamadı. ${r.aciklama ?? ''}`.trim() });
          break;
        }
        if (r.sebep === 'kesildi' || cikis >= ASISTAN_SINIRLARI.ciktiToken) {
          yield parcaVer({ tur: 'hata', mesaj: 'Cevap yarıda kesildi.' });
          break;
        }
        if (r.sebep === 'bos') {
          // Boş cevap "tamam" sayılmaz: ekran sessizce boş bir balon gösterirdi.
          yield parcaVer({ tur: 'hata', mesaj: r.aciklama ?? 'Asistan boş cevap döndü.' });
          break;
        }
        if (r.sebep !== 'arac') break;

        const sonuclar: GeminiParcasi[] = [];
        for (const b of r.parcalar.filter((x) => x.functionCall).map((x) => x.functionCall!)) {
          adim++;
          if (adim > ASISTAN_SINIRLARI.aracAdimi) {
            sonuclar.push(sonucBlogu(b, { hal: 'reddedildi', neden: 'Bu turda adım sınırı doldu.' }));
            continue;
          }
          const anahtar = `${b.name}:${createHash('sha256').update(kanonikJson(b.args ?? {})).digest('hex')}`;
          if (gorulen.has(anahtar)) {
            // TEKRAR: model aynı çağrıyı yeniden istedi; çalıştırılmıyor
            // (döngüye giren model kotayı yiyordu, AdvCampaign dersi).
            sonuclar.push(sonucBlogu(b, { hal: 'reddedildi', neden: 'TEKRAR: bu çağrı bu turda zaten yapıldı; sonucunu kullan.' }));
            continue;
          }
          gorulen.add(anahtar);
          const c = await aracCalistir(b.name, b.args ?? {}, ortam);
          // Bilinmeyen araç adı ekrana araç izi olarak gitmiyor (sözleşme
          // yalnız bilinen adları taşıyor); hata parçası olarak gidiyor.
          yield parcaVer(
            (ASISTAN_ARACLARI as readonly string[]).includes(b.name)
              ? { tur: 'arac', arac: b.name as AsistanAraci, ozet: c.ozet }
              : { tur: 'hata', mesaj: `Asistan tanımsız bir araç istedi (${b.name.slice(0, 40)}).` },
          );
          if (c.hal === 'tamam' && c.kart) yield parcaVer({ tur: 'uygula_karti', oneri: c.kart });
          sonuclar.push(
            sonucBlogu(b, c.hal === 'tamam' ? { hal: 'tamam', veri: c.veri } : { hal: c.hal, neden: c.neden }),
          );
        }
        turMesajlari.push({ role: 'user', parts: sonuclar });
        if (adim > ASISTAN_SINIRLARI.aracAdimi) {
          yield parcaVer({ tur: 'hata', mesaj: 'Asistan bu turda çok adım attı; durdurdum. "Devam et" diyebilirsin.' });
          break;
        }
      }
    } finally {
      await this.yaz(o, { id: asistanId, rol: 'asistan', parcalar, modelIcerik: turMesajlari, giris, cikis });
    }
    yield {
      tur: 'bitti',
      mesaj: { id: asistanId, rol: 'asistan', parcalar, zaman: new Date().toISOString() },
    };
  }

  private async oturum(id: string): Promise<OturumSatiri> {
    const [o] = await this.d.tx((t) =>
      t.$queryRaw<OturumSatiri[]>(Prisma.sql`
        SELECT id::text, org_id::text, client_id::text, user_id::text
          FROM iyilestir_asistan_oturum WHERE id = ${id}::uuid`),
    );
    if (!o) throw new AsistanHatasi('YOK', 'Oturum bulunamadı');
    return o;
  }

  private async gecmis(oturumId: string): Promise<Array<{ rol: 'kullanici' | 'asistan'; icerik: unknown }>> {
    const satirlar = await this.d.tx((t) =>
      t.$queryRaw<Array<{ rol: 'kullanici' | 'asistan'; model_icerik: unknown }>>(Prisma.sql`
        SELECT rol, model_icerik FROM iyilestir_asistan_mesaj
         WHERE oturum_id = ${oturumId}::uuid ORDER BY created_at, (rol = 'asistan')`),
    );
    return satirlar.map((s) => ({ rol: s.rol, icerik: s.model_icerik }));
  }

  private async saatlikMesaj(userId: string, once: Date): Promise<number> {
    const [r] = await this.d.tx((t) =>
      t.$queryRaw<Array<{ n: number }>>(Prisma.sql`
        SELECT count(*)::int AS n FROM iyilestir_asistan_mesaj
         WHERE user_id = ${userId}::uuid AND rol = 'kullanici' AND created_at > ${once}`),
    );
    return r?.n ?? 0;
  }

  private async yaz(
    o: OturumSatiri,
    m: { id: string; rol: 'kullanici' | 'asistan'; parcalar: AsistanParcasi[]; modelIcerik: unknown; giris: number; cikis: number },
  ): Promise<void> {
    const r = await this.d.tx((t) =>
      t.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        INSERT INTO iyilestir_asistan_mesaj
          (id, oturum_id, org_id, client_id, user_id, rol, parcalar, model_icerik, giris_token, cikis_token)
        VALUES (${m.id}::uuid, ${o.id}::uuid, ${o.org_id}::uuid, ${o.client_id}::uuid, ${o.user_id}::uuid, ${m.rol},
                ${JSON.stringify(m.parcalar)}::jsonb, ${JSON.stringify(m.modelIcerik)}::jsonb, ${m.giris}::int, ${m.cikis}::int)
        RETURNING id::text`),
    );
    // Sıfır satır = kayıt düşmedi (RLS); sessiz geçmez.
    if (r.length === 0) throw new Error(`Asistan mesajı yazılamadı: ${m.id}`);
  }
}

function sonucBlogu(b: NonNullable<GeminiParcasi['functionCall']>, sonuc: Record<string, unknown>): GeminiParcasi {
  return { functionResponse: { ...(b.id && { id: b.id }), name: b.name, response: sonuc } };
}
