import { ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { DERLEYICI_SURUMU, type TenantContext, type YayinDurumu } from '@advetics/shared';
import { CONFIG, type AppConfig } from '../../config/configuration';
import { PrismaService } from '../../prisma/prisma.service';
import { metaSurumuDogrula } from './meta-graf';
import { ReklamKuyrugu, type YayinAdimi } from './reklam-kuyrugu';
import { provaDurumu, yayinBaslat, type ProvaDurumu, type YayinBaslatSonucu, type YayinIstegi } from './yayin-baslat';
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

  /**
   * Meta provası iste. Yalnız KULLANICININ eksiği kalmamışsa (prova
   * eksiğinin kendisi hariç): eksik taslağı Meta'ya sormak kotayı boşa
   * harcar. Aynı sürüm için bekleyen prova varsa yenisi açılmaz (kısmi
   * tekil indeks); panelin kendiliğinden tetiklemesi ile düğme üst üste
   * binebilir.
   */
  async provaIste(ctx: TenantContext, taslakId: string): Promise<ProvaGorunumu> {
    const tx = this.tx(ctx);
    const [t] = await tx((x) =>
      x.$queryRaw<Array<{ org_id: string; client_id: string; aktif_surum_no: number; ad_account_id: string | null; icerik_ozeti: string | null; eksikler: Array<{ kod: string; metin: string }> | null }>>(Prisma.sql`
        SELECT t.org_id::text, t.client_id::text, t.aktif_surum_no, t.ad_account_id::text, s.icerik_ozeti, s.eksikler
          FROM reklam_taslagi t
          LEFT JOIN taslak_surumu s ON s.taslak_id = t.id AND s.surum_no = t.aktif_surum_no
         WHERE t.id = ${taslakId}::uuid`),
    );
    if (!t) throw new NotFoundException('Taslak bulunamadı');
    if (!ctx.clientIds.includes(t.client_id)) throw new ForbiddenException('Bu workspace’e erişimin yok');
    const kalan = (t.eksikler ?? []).filter((e) => e.kod !== 'OK-17');
    if (!t.icerik_ozeti || !t.ad_account_id || kalan.length > 0) {
      throw new ConflictException(`Önce eksikleri tamamla: ${kalan.map((e) => e.metin).join(', ') || 'taslak boş'}`);
    }
    const [p] = await tx((x) =>
      x.$queryRaw<Array<{ id: string; yeni: boolean }>>(Prisma.sql`
        INSERT INTO prova (org_id, client_id, taslak_id, taslak_surum_no, icerik_ozeti, ad_account_id, api_surumu, derleyici_surumu)
        VALUES (${t.org_id}::uuid, ${t.client_id}::uuid, ${taslakId}::uuid, ${t.aktif_surum_no}, ${t.icerik_ozeti},
                ${t.ad_account_id}::uuid, ${this.apiSurumu}, ${DERLEYICI_SURUMU})
        ON CONFLICT (taslak_id, icerik_ozeti) WHERE durum = 'bekliyor' DO NOTHING
        RETURNING id::text, true AS yeni`),
    );
    if (p) {
      try {
        await this.kuyruk.ekleProva(p.id);
      } catch (e) {
        await tx((x) =>
          x.$queryRaw(Prisma.sql`UPDATE prova SET durum = 'dogrulanamadi', sebep = ${`Kuyruğa alınamadı: ${(e as Error).message}`}, bitti_at = now() WHERE id = ${p.id}::uuid RETURNING id`),
        );
      }
    }
    return this.provaOku(ctx, taslakId);
  }

  async provaOku(ctx: TenantContext, taslakId: string): Promise<ProvaGorunumu> {
    const tx = this.tx(ctx);
    const [t] = await tx((x) =>
      x.$queryRaw<Array<{ client_id: string; aktif_surum_no: number; icerik_ozeti: string | null }>>(Prisma.sql`
        SELECT t.client_id::text, t.aktif_surum_no, s.icerik_ozeti FROM reklam_taslagi t
          LEFT JOIN taslak_surumu s ON s.taslak_id = t.id AND s.surum_no = t.aktif_surum_no
         WHERE t.id = ${taslakId}::uuid`),
    );
    if (!t) throw new NotFoundException('Taslak bulunamadı');
    if (!ctx.clientIds.includes(t.client_id)) throw new ForbiddenException('Bu workspace’e erişimin yok');
    if (!t.icerik_ozeti) return { durum: { tur: 'yok', metin: 'Taslak boş.' }, sonuclar: [] };
    const durum = await provaDurumu(tx, taslakId, t.aktif_surum_no, t.icerik_ozeti, this.apiSurumu, new Date());
    const [s] = await tx((x) =>
      x.$queryRaw<Array<{ sonuclar: ProvaGorunumu['sonuclar'] }>>(Prisma.sql`
        SELECT sonuclar FROM prova WHERE taslak_id = ${taslakId}::uuid AND icerik_ozeti = ${t.icerik_ozeti}
         ORDER BY created_at DESC LIMIT 1`),
    );
    return { durum, sonuclar: s?.sonuclar ?? [] };
  }
}

export interface ProvaGorunumu {
  durum: ProvaDurumu;
  sonuclar: Array<{ ad: string; sonuc: string; mesaj?: string }>;
}
