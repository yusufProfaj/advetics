import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  bos,
  dolu,
  ONERI_DURUMLARI,
  oneriGecisiIzinliMi,
  type Hucre,
  type OneriBosNedeni,
  type OneriDurumu,
  type OneriKarti,
  type PilotBugun,
  type PilotOneriListesi,
  type TenantContext,
} from '@advetics/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { seviyeLiterali } from '../metrics/seviye-literali';
import { yerelGun } from './plan-girdisi';
import { pilotRolu } from './plan.service';

/**
 * ═══ PİLOT AÇILIŞI VE ÖNERİ KARTLARI (AdvCampaign ekranı) ═══
 *
 * Tur 1'de tarama işi YOK (Tur 2): tablolar boş ve ekran bunu "hiç
 * taranmadı" diye söylemeli, "öneri yok" diye değil. Dört boş hâl ayrı
 * (`OneriBosNedeni`): hiç koşmadı, düştü, koştu ve kart yok, süzgeçte yok.
 *
 * UYGULA / GERİ AL bu turda YOK: listede duruyorlar (`PILOT_UCLARI`) ama
 * controller'da açılmadı ve kayıt testi bunu ADIYLA kilitliyor. Yarım bir
 * "uygula" ucu platforma yazmadan "uygulandı" demek olurdu.
 */
const TOPLAM_SEVIYESI = seviyeLiterali('campaign');
export const ONERI_LISTE_SINIRI = 100;

interface OneriSatiri {
  id: string;
  client_id: string;
  tarama_id: string;
  tur: OneriKarti['tur'];
  hedef: OneriKarti['hedef'];
  neden: string;
  olculer: OneriKarti['olculer'];
  beklenen_etki: OneriKarti['beklenenEtki'];
  eylem: OneriKarti['eylem'];
  geri_alma: OneriKarti['geriAlma'];
  durum: OneriDurumu;
  gecerlilik_sonu: Date;
  platform_mesaji: string | null;
  created_at: Date;
}

function erisim(ctx: TenantContext, clientId: string): void {
  if (!ctx.clientIds.includes(clientId)) throw new ForbiddenException('Bu workspace’e erişimin yok');
}

@Injectable()
export class PilotService {
  constructor(private readonly prisma: PrismaService) {}

  async bugun(ctx: TenantContext, clientId: string, simdi = new Date()): Promise<PilotBugun> {
    erisim(ctx, clientId);
    return this.prisma.withTenant(ctx, async (tx) => {
      const [c] = await tx.$queryRaw<Array<{ tz: string }>>(Prisma.sql`SELECT timezone AS tz FROM clients WHERE id = ${clientId}::uuid`);
      if (!c) throw new NotFoundException('Workspace bulunamadı');
      const bugun = yerelGun(simdi, c.tz || 'Europe/Istanbul');
      const [y, a, g] = bugun.split('-').map(Number) as [number, number, number];
      const dun = new Date(Date.UTC(y, a - 1, g - 1, 12)).toISOString().slice(0, 10);
      const ilk = `${bugun.slice(0, 7)}-01`;
      const ayGun = new Date(Date.UTC(y, a, 0)).getUTCDate();
      const zaman = simdi.toISOString();
      const hesaplar = (
        await tx.$queryRaw<Array<{ id: string; birim: string }>>(Prisma.sql`
          SELECT id::text, currency AS birim FROM ad_accounts
           WHERE client_id = ${clientId}::uuid AND sync_enabled = true AND platform IN ('meta'::"Platform", 'google'::"Platform")`)
      );
      const birimler = new Set(hesaplar.map((h) => h.birim));
      const paraBirimi = birimler.size === 1 ? [...birimler][0]! : null;
      const idler = hesaplar.map((h) => h.id);
      const toplam = async (from: string, to: string) => {
        if (idler.length === 0) return null;
        const [r] = await tx.$queryRaw<Array<{ h: string; s: string; n: number }>>(Prisma.sql`
          SELECT COALESCE(SUM(spend_micros), 0)::text AS h, COALESCE(SUM(conversions), 0)::text AS s, count(*)::int AS n
            FROM insights_daily
           WHERE client_id = ${clientId}::uuid AND ad_account_id = ANY(${idler}::uuid[])
             AND entity_level = ${TOPLAM_SEVIYESI} AND breakdown_key = ''
             AND date BETWEEN ${from}::date AND ${to}::date`);
        return r ?? null;
      };
      const kaynak = (from: string, to: string) => ({ tur: 'gecmis_veri' as const, kimlik: 'insights_daily', zaman, pencere: { from, to } });
      const d = paraBirimi ? await toplam(dun, dun) : null;
      // "Dün harcama yok" ile "dünün verisi gelmedi" ayrı: satır yoksa boş + neden.
      const dunHarcama: Hucre<string> = !paraBirimi ? bos(idler.length === 0 ? 'hesap_yok' : 'karisik_birim') : d && d.n > 0 ? dolu(d.h, kaynak(dun, dun)) : bos('gecmis_yok');
      const sonucSayi = d && d.n > 0 ? Math.floor(Number(d.s)) : null;
      const dunSonuc: Hucre<number> = sonucSayi === null ? bos(dunHarcama.dolu ? 'gecmis_yok' : dunHarcama.emptyReason) : dolu(sonucSayi, kaynak(dun, dun));
      const sonucBasi: Hucre<string> =
        dunHarcama.dolu && sonucSayi && sonucSayi > 0 ? dolu((BigInt(dunHarcama.deger) / BigInt(sonucSayi)).toString(), kaynak(dun, dun)) : bos(dunHarcama.dolu ? 'donusum_yok' : dunHarcama.emptyReason);
      const ay = paraBirimi && dun >= ilk ? await toplam(ilk, dun) : null;
      const [b] = await tx.$queryRaw<Array<{ id: string; micros: string; guncellendi: Date }>>(Prisma.sql`
        SELECT id::text, amount_micros::text AS micros, updated_at AS guncellendi FROM monthly_budgets
         WHERE client_id = ${clientId}::uuid AND ad_account_id IS NULL AND month = ${ilk}::date`);
      const [t] = await tx.$queryRaw<Array<{ bitis: Date | null; kart: number; taranan: Record<string, number>; notu: string | null }>>(Prisma.sql`
        SELECT bitis, kart_sayisi AS kart, taranan, notu FROM pilot_taramalari
         WHERE client_id = ${clientId}::uuid AND durum = 'bitti' ORDER BY bitis DESC NULLS LAST LIMIT 1`);
      return {
        paraBirimi,
        sonTarama: t?.bitis
          ? {
              bitis: new Date(t.bitis).toISOString(),
              kartSayisi: t.kart,
              taranan: { reklam: Number(t.taranan?.reklam ?? 0), kelime: Number(t.taranan?.kelime ?? 0), terim: Number(t.taranan?.terim ?? 0) },
              not: t.notu,
            }
          : null,
        dun: { harcamaMicros: dunHarcama, sonuc: dunSonuc, sonucBasiMicros: sonucBasi },
        ay: {
          butceMicros: b ? dolu(b.micros, { tur: 'aylik_butce', kimlik: b.id, zaman: new Date(b.guncellendi).toISOString() }) : bos('aylik_butce_yok'),
          harcananMicros: ay ? dolu(ay.h, kaynak(ilk, dun)) : bos(paraBirimi ? 'gecmis_yok' : idler.length === 0 ? 'hesap_yok' : 'karisik_birim'),
          gecenGun: g - 1,
          ayGun,
        },
      };
    });
  }

  async oneriler(ctx: TenantContext, clientId: string, durum: OneriDurumu | null): Promise<PilotOneriListesi> {
    erisim(ctx, clientId);
    if (durum !== null && !(ONERI_DURUMLARI as readonly string[]).includes(durum)) throw new ConflictException('Bilinmeyen öneri durumu');
    return this.prisma.withTenant(ctx, async (tx) => {
      const kosul = durum ? Prisma.sql`AND durum = ${durum}` : Prisma.empty;
      const r = await tx.$queryRaw<OneriSatiri[]>(Prisma.sql`
        SELECT id::text, client_id::text, tarama_id::text, tur, hedef, neden, olculer, beklenen_etki, eylem, geri_alma,
               durum, gecerlilik_sonu, platform_mesaji, created_at
          FROM pilot_onerileri WHERE client_id = ${clientId}::uuid ${kosul}
         ORDER BY created_at DESC, id LIMIT ${ONERI_LISTE_SINIRI}`);
      const [n] = await tx.$queryRaw<Array<{ suzulen: number; hepsi: number }>>(Prisma.sql`
        SELECT count(*) FILTER (WHERE TRUE ${kosul})::int AS suzulen, count(*)::int AS hepsi
          FROM pilot_onerileri WHERE client_id = ${clientId}::uuid`);
      let emptyReason: OneriBosNedeni | null = null;
      let taramaMesaji: string | null = null;
      if (r.length === 0) {
        if ((n?.hepsi ?? 0) > 0) emptyReason = 'suzgecte_yok';
        else {
          const [t] = await tx.$queryRaw<Array<{ durum: string; notu: string | null }>>(Prisma.sql`
            SELECT durum, notu FROM pilot_taramalari WHERE client_id = ${clientId}::uuid ORDER BY baslangic DESC LIMIT 1`);
          if (!t) emptyReason = 'tarama_kosmadi';
          else if (t.durum === 'dustu') {
            emptyReason = 'tarama_dustu';
            taramaMesaji = t.notu;
          } else emptyReason = t.durum === 'calisiyor' ? 'tarama_kosmadi' : 'oneri_yok';
        }
      }
      return {
        kartlar: r.map(kart),
        gosterilen: r.length,
        toplam: n?.suzulen ?? r.length,
        emptyReason,
        taramaMesaji,
      };
    });
  }

  /** "Şimdilik geç" — yalnız ajans, yalnız `yeni` kartta. */
  async gec(ctx: TenantContext, id: string): Promise<OneriKarti> {
    if (pilotRolu(ctx) !== 'ajans') throw new ForbiddenException('Bu işlem ajans hesabından yapılır.');
    return this.prisma.withTenant(ctx, async (tx) => {
      const [o] = await tx.$queryRaw<OneriSatiri[]>(Prisma.sql`
        SELECT id::text, client_id::text, tarama_id::text, tur, hedef, neden, olculer, beklenen_etki, eylem, geri_alma,
               durum, gecerlilik_sonu, platform_mesaji, created_at
          FROM pilot_onerileri WHERE id = ${id}::uuid FOR UPDATE`);
      if (!o || !ctx.clientIds.includes(o.client_id)) throw new NotFoundException('Öneri bulunamadı');
      if (!oneriGecisiIzinliMi(o.durum, 'gecildi', 'ajans')) throw new ConflictException('Bu öneri artık geçilemez; sayfayı yenile.');
      const g = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        UPDATE pilot_onerileri SET durum = 'gecildi', updated_at = now() WHERE id = ${id}::uuid AND durum = ${o.durum} RETURNING id::text`);
      if (g.length !== 1) throw new ConflictException('Öneri sen bakarken değişti; sayfayı yenile.');
      return kart({ ...o, durum: 'gecildi' });
    });
  }
}

function kart(o: OneriSatiri): OneriKarti {
  return {
    id: o.id,
    clientId: o.client_id,
    taramaId: o.tarama_id,
    tur: o.tur,
    hedef: o.hedef,
    neden: o.neden,
    olculer: o.olculer,
    beklenenEtki: o.beklenen_etki,
    eylem: o.eylem,
    geriAlma: o.geri_alma,
    durum: o.durum,
    gecerlilikSonu: new Date(o.gecerlilik_sonu).toISOString(),
    platformMesaji: o.platform_mesaji,
    olusturuldu: new Date(o.created_at).toISOString(),
  };
}
