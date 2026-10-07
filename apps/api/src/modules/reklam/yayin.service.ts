import { ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { TenantContext, YayinDurumu } from '@advetics/shared';
import { CONFIG, type AppConfig } from '../../config/configuration';
import { PrismaService } from '../../prisma/prisma.service';
import { metaSurumuDogrula } from './meta-graf';
import { ReklamKuyrugu, type YayinAdimi } from './reklam-kuyrugu';
import { yayinBaslat, type YayinBaslatSonucu, type YayinIstegi } from './yayin-baslat';
import { yayiniSonlandir, type TxRunner } from './yayin-motoru';

export interface YayinGorunumu {
  id: string;
  taslakId: string;
  durum: YayinDurumu;
  sebep: string | null;
  testKipi: boolean;
  durumAt: string;
  nesneler: Array<{ ad: string; tur: string; durum: string; metaId: string | null; hata: string | null }>;
  sonGeriOkuma: { sonuc: string; satirlar: unknown; bilgiler: unknown; zaman: string } | null;
}

/** İnsanın basabileceği düğmeler ve hangi durumda anlamlı oldukları (§ 11.4). */
const INSAN_ADIMLARI: Record<Exclude<YayinAdimi, 'kur'>, readonly YayinDurumu[]> = {
  devam: ['bekletildi'],
  geri_al: ['fark_var', 'dogrulanamadi', 'kurulamadi', 'kismen_acik', 'sonuc_belirsiz', 'durduruldu'],
  yeniden_oku: ['dogrulanamadi'],
};

@Injectable()
export class ReklamYayinService {
  private readonly apiSurumu;

  constructor(
    private readonly prisma: PrismaService,
    private readonly kuyruk: ReklamKuyrugu,
    @Inject(CONFIG) config: AppConfig,
  ) {
    // AÇILIŞTA denetim: desteklenmeyen sürümle yazmak yerine patla.
    this.apiSurumu = metaSurumuDogrula(config.platforms.meta.apiVersion);
  }

  private tx(ctx: TenantContext): TxRunner {
    return (fn) => this.prisma.withTenant(ctx, (t) => fn(t as never));
  }

  async baslat(ctx: TenantContext, istek: YayinIstegi): Promise<YayinBaslatSonucu> {
    const tx = this.tx(ctx);
    const r = await yayinBaslat(tx, ctx, istek, { apiSurumu: this.apiSurumu, simdi: new Date() });
    if (r.tur === 'ret') return r;
    try {
      await this.kuyruk.ekle(r.yayinId, 'kur');
    } catch (e) {
      // Kuyruğa girmeyen yayın sonsuza kadar on_kontrol'de kalırdı ve
      // taslak "yayında" kilitli olurdu. Meta'ya hiçbir şey gitmedi: kapat.
      await yayiniSonlandir(tx, r.yayinId, 'on_kontrol_reddi', `Kuyruğa alınamadı: ${(e as Error).message}`);
      return { tur: 'ret', retler: [{ kod: 'KUYRUK', mesaj: 'Yayın kuyruğa alınamadı; birazdan yeniden dene.' }] };
    }
    return r;
  }

  async adim(ctx: TenantContext, yayinId: string, adim: Exclude<YayinAdimi, 'kur'>): Promise<YayinGorunumu> {
    const g = await this.oku(ctx, yayinId);
    if (!INSAN_ADIMLARI[adim].includes(g.durum)) {
      throw new ConflictException(`Bu düğme "${g.durum}" durumunda kullanılamaz.`);
    }
    await this.kuyruk.ekle(yayinId, adim);
    return g;
  }

  async oku(ctx: TenantContext, yayinId: string): Promise<YayinGorunumu> {
    return this.prisma.withTenant(ctx, async (t) => {
      const [y] = await t.$queryRaw<Array<{ id: string; taslak_id: string; client_id: string; durum: YayinDurumu; sebep: string | null; test_kipi: boolean; durum_at: Date }>>(Prisma.sql`
        SELECT id::text, taslak_id::text, client_id::text, durum, sebep, test_kipi, durum_at FROM yayin WHERE id = ${yayinId}::uuid`);
      if (!y) throw new NotFoundException('Yayın bulunamadı');
      if (!ctx.clientIds.includes(y.client_id)) throw new ForbiddenException('Bu workspace’e erişimin yok');
      const nesneler = await t.$queryRaw<Array<{ ad: string; tur: string; durum: string; meta_id: string | null; son_hata: { mesaj?: string } | null }>>(Prisma.sql`
        SELECT ad, tur, durum, meta_id, son_hata FROM yayin_nesnesi WHERE yayin_id = ${yayinId}::uuid ORDER BY sira`);
      const [g] = await t.$queryRaw<Array<{ sonuc: string; satirlar: unknown; bilgiler: unknown; created_at: Date }>>(Prisma.sql`
        SELECT sonuc, satirlar, bilgiler, created_at FROM geri_okuma WHERE yayin_id = ${yayinId}::uuid ORDER BY created_at DESC LIMIT 1`);
      return {
        id: y.id,
        taslakId: y.taslak_id,
        durum: y.durum,
        sebep: y.sebep,
        testKipi: y.test_kipi,
        durumAt: new Date(y.durum_at).toISOString(),
        nesneler: nesneler.map((n) => ({ ad: n.ad, tur: n.tur, durum: n.durum, metaId: n.meta_id, hata: n.son_hata?.mesaj ?? null })),
        sonGeriOkuma: g ? { sonuc: g.sonuc, satirlar: g.satirlar, bilgiler: g.bilgiler, zaman: new Date(g.created_at).toISOString() } : null,
      };
    });
  }

  /** Taslağın aktif (sonlanmamış) yayını; panel taslağı açınca buna bakar. */
  async aktif(ctx: TenantContext, taslakId: string): Promise<YayinGorunumu | null> {
    const [r] = await this.prisma.withTenant(ctx, (t) =>
      t.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        SELECT id::text FROM yayin WHERE taslak_id = ${taslakId}::uuid
         ORDER BY (sonlandi_at IS NULL) DESC, created_at DESC LIMIT 1`),
    );
    return r ? this.oku(ctx, r.id) : null;
  }
}

