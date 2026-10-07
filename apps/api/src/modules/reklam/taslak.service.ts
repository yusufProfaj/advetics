import { createHash } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  taslakAlanlariSchema,
  taslakEksikleri,
  taslakKanonikIcerik,
  type OlusturanYuz,
  type ReklamTaslakKaydi,
  type TaslakAlanlari,
  type TaslakDurumu,
  type TaslakEksigi,
  type TenantContext,
} from '@advetics/shared';
import { PrismaService } from '../../prisma/prisma.service';

export type TaslakKaydi = ReklamTaslakKaydi;

/** Panelin yazabileceği kaynaklar; `workspace_profili` ve `derleyici` sunucunun. */
export type AlanDegisikligi = Partial<
  Record<keyof TaslakAlanlari, { deger: unknown; kaynak: 'kullanici' | 'marka_merkezi' } | null>
>;

/**
 * PROVA YOK, O YÜZDEN "HAZIR" DA YOK. Tasarımda `hazir` = eksik 0 VE Meta
 * provası geçti. Prova (OK-17) yazılana kadar bu eksik sunucuda ekleniyor;
 * eklenmeseydi taslak "Yayına hazır" çipiyle görünür ama yayınlanamazdı.
 */
const PROVA_EKSIGI: TaslakEksigi = {
  adim: 4,
  alan: 'niyet',
  kod: 'OK-17',
  metin: 'Meta provası henüz yapılmadı',
};

/** Yazmaya açık durumlar. Onay ve yayın akışı geldiğinde genişleyecek. */
const YAZILABILIR: readonly TaslakDurumu[] = ['taslak', 'hazir'];

interface TaslakSatiri {
  id: string;
  client_id: string;
  org_id: string;
  durum: TaslakDurumu;
  niyet_kodu: string | null;
  ad_account_id: string | null;
  aktif_surum_no: number;
  olusturan_yuz: OlusturanYuz;
  updated_at: Date;
}
interface SurumSatiri {
  alanlar: unknown;
  eksikler: unknown;
  icerik_ozeti: string;
}

/**
 * Yeni reklam taslağı (TASARIM.md § 02, § 16.2.1).
 *
 * HER DEĞİŞİKLİK YENİ, DEĞİŞMEZ BİR SÜRÜM. Prova, onay ve yayın bir sürüme
 * bağlanıyor; sürüm yerinde değişseydi müşterinin onayladığı plan ile
 * yayınlanan plan iz bırakmadan ayrışırdı. İçerik özeti öncekiyle aynıysa
 * yeni sürüm YAZILMAZ: tıklayıp hiçbir şey değiştirmeden çıkmak onayları
 * düşürmemeli.
 *
 * `kim` ve `zaman` SUNUCUDA basılıyor: istemcinin saati ve beyan ettiği kimlik
 * sürüme yazılmaz.
 */
@Injectable()
export class ReklamTaslakService {
  constructor(private readonly prisma: PrismaService) {}

  async olustur(ctx: TenantContext, clientId: string, yuz: OlusturanYuz, asilCumle: string | null): Promise<TaslakKaydi> {
    erisim(ctx, clientId);
    return this.prisma.withTenant(ctx, async (tx) => {
      /*
       * org_id HEDEF WORKSPACE'TEN. "Tüm şirketler" modunda ctx.orgId ev
       * şirketi kalıyor; ondan yazmak (client_id, org_id) kompozit anahtarını
       * deliyor ve panelde tek cümle kalıyor: "İlişkili kayıt geçersiz".
       */
      const [c] = await tx.$queryRaw<Array<{ org_id: string }>>(Prisma.sql`
        SELECT org_id::text FROM clients WHERE id = ${clientId}::uuid`);
      if (!c) throw new NotFoundException('Workspace bulunamadı');
      const [t] = await tx.$queryRaw<TaslakSatiri[]>(Prisma.sql`
        INSERT INTO reklam_taslagi (org_id, client_id, platform, olusturan_yuz, asil_cumle, olusturan_id)
        VALUES (${c.org_id}::uuid, ${clientId}::uuid, 'meta'::"Platform", ${yuz}, ${asilCumle}, ${ctx.userId}::uuid)
        RETURNING id::text, client_id::text, org_id::text, durum, niyet_kodu,
                  ad_account_id::text, aktif_surum_no, olusturan_yuz, updated_at`);
      return kayit(t!, null);
    });
  }

  async oku(ctx: TenantContext, id: string): Promise<TaslakKaydi> {
    return this.prisma.withTenant(ctx, async (tx) => {
      const t = await satir(tx, id, false);
      return kayit(t, await aktifSurum(tx, t));
    });
  }

  /** En yeni 50; toplam ayrıca dönüyor — sessiz kesme yok. */
  async listele(ctx: TenantContext, clientId: string): Promise<{ satirlar: TaslakKaydi[]; toplam: number }> {
    erisim(ctx, clientId);
    return this.prisma.withTenant(ctx, async (tx) => {
      const satirlar = await tx.$queryRaw<TaslakSatiri[]>(Prisma.sql`
        SELECT id::text, client_id::text, org_id::text, durum, niyet_kodu,
               ad_account_id::text, aktif_surum_no, olusturan_yuz, updated_at
          FROM reklam_taslagi
         WHERE client_id = ${clientId}::uuid AND durum <> 'arsivlendi'
         ORDER BY updated_at DESC, id
         LIMIT 50`);
      const [say] = await tx.$queryRaw<Array<{ n: number }>>(Prisma.sql`
        SELECT count(*)::int AS n FROM reklam_taslagi
         WHERE client_id = ${clientId}::uuid AND durum <> 'arsivlendi'`);
      const sonuc: TaslakKaydi[] = [];
      for (const t of satirlar) sonuc.push(kayit(t, await aktifSurum(tx, t)));
      return { satirlar: sonuc, toplam: say?.n ?? 0 };
    });
  }

  async surumYaz(ctx: TenantContext, id: string, degisiklik: AlanDegisikligi): Promise<TaslakKaydi> {
    const zaman = new Date().toISOString();
    return this.prisma.withTenant(ctx, async (tx) => {
      // FOR UPDATE: iki sekme aynı anda kaydederse ikisi de "sürüm 5"
      // yazmaya kalkmasın; tekil indeks ikinciyi zaten düşürür ama sebebi
      // kullanıcıya "çakışma" olarak değil kilitle sıralanarak çözülsün.
      const t = await satir(tx, id, true);
      if (!YAZILABILIR.includes(t.durum)) {
        throw new ConflictException(
          t.durum === 'arsivlendi' ? 'Taslak arşivde; önce arşivden çıkar.' : 'Bu durumda taslak düzenlenemez.',
        );
      }
      const onceki = await aktifSurum(tx, t);
      const birlesik: Record<string, unknown> = { ...((onceki?.alanlar as object) ?? {}) };
      for (const [ad, d] of Object.entries(degisiklik)) {
        if (d === null) delete birlesik[ad];
        else birlesik[ad] = { deger: d.deger, kaynak: d.kaynak, kim: ctx.userId, zaman };
      }
      const r = taslakAlanlariSchema.safeParse(birlesik);
      if (!r.success) {
        throw new BadRequestException(r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '));
      }
      const alanlar = r.data;

      // Seçilen hesap ve sayfa BU workspace'in olmalı. RLS havuzu org
      // yöneticisine açıyor; süzgeç burada açık yazılıyor.
      const hesapId = alanlar.reklamHesabiId?.deger ?? null;
      if (hesapId) await aitMi(tx, 'ad_accounts', hesapId, t.client_id, 'Reklam hesabı bu workspace’e atanmış değil.');
      if (alanlar.sayfaId) await aitMi(tx, 'social_profiles', alanlar.sayfaId.deger, t.client_id, 'Sayfa bu workspace’te değil.');

      const ozet = createHash('sha256').update(taslakKanonikIcerik(alanlar)).digest('hex');
      if (onceki && onceki.icerik_ozeti === ozet) return kayit(t, onceki);

      // Yasal uyarı profilden TAZE okunuyor; panelin gönderdiği değere
      // güvenilmiyor.
      const [profil] = await tx.$queryRaw<Array<{ yasal_uyari: string | null }>>(Prisma.sql`
        SELECT yasal_uyari FROM client_profiles WHERE client_id = ${t.client_id}::uuid`);
      const eksikler = [...taslakEksikleri(alanlar, { yasalUyari: profil?.yasal_uyari ?? null }), PROVA_EKSIGI];
      const yeniNo = t.aktif_surum_no + 1;
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO taslak_surumu (taslak_id, org_id, client_id, surum_no, alanlar, icerik_ozeti, eksikler, olusturan_id)
        VALUES (${t.id}::uuid, ${t.org_id}::uuid, ${t.client_id}::uuid, ${yeniNo},
                ${JSON.stringify(alanlar)}::jsonb, ${ozet}, ${JSON.stringify(eksikler)}::jsonb, ${ctx.userId}::uuid)`);
      const [g] = await tx.$queryRaw<TaslakSatiri[]>(Prisma.sql`
        UPDATE reklam_taslagi
           SET aktif_surum_no = ${yeniNo},
               durum = ${eksikler.length === 0 ? 'hazir' : 'taslak'},
               niyet_kodu = ${alanlar.niyet?.deger ?? null},
               ad_account_id = ${hesapId}::uuid,
               updated_at = now()
         WHERE id = ${t.id}::uuid
        RETURNING id::text, client_id::text, org_id::text, durum, niyet_kodu,
                  ad_account_id::text, aktif_surum_no, olusturan_yuz, updated_at`);
      // RLS'li UPDATE hata vermeden SIFIR satır etkileyebilir: say.
      if (!g) throw new ConflictException('Taslak güncellenemedi (erişim değişmiş olabilir).');
      return kayit(g, { alanlar, eksikler, icerik_ozeti: ozet });
    });
  }

  async arsivle(ctx: TenantContext, id: string): Promise<TaslakKaydi> {
    return this.prisma.withTenant(ctx, async (tx) => {
      const t = await satir(tx, id, true);
      if (t.durum === 'yayinda') throw new ConflictException('Yayındaki taslak buradan arşivlenmez.');
      const [g] = await tx.$queryRaw<TaslakSatiri[]>(Prisma.sql`
        UPDATE reklam_taslagi SET durum = 'arsivlendi', onay_turu = NULL, arsivlendi_at = now(), updated_at = now()
         WHERE id = ${id}::uuid
        RETURNING id::text, client_id::text, org_id::text, durum, niyet_kodu,
                  ad_account_id::text, aktif_surum_no, olusturan_yuz, updated_at`);
      if (!g) throw new ConflictException('Taslak arşivlenemedi.');
      return kayit(g, await aktifSurum(tx, g));
    });
  }
}

type Tx = Parameters<Parameters<PrismaService['withTenant']>[1]>[0];

function erisim(ctx: TenantContext, clientId: string): void {
  if (!ctx.clientIds.includes(clientId)) throw new ForbiddenException('Bu workspace’e erişimin yok');
}

async function satir(tx: Tx, id: string, kilit: boolean): Promise<TaslakSatiri> {
  const [t] = await tx.$queryRaw<TaslakSatiri[]>(Prisma.sql`
    SELECT id::text, client_id::text, org_id::text, durum, niyet_kodu,
           ad_account_id::text, aktif_surum_no, olusturan_yuz, updated_at
      FROM reklam_taslagi WHERE id = ${id}::uuid
    ${kilit ? Prisma.sql`FOR UPDATE` : Prisma.empty}`);
  if (!t) throw new NotFoundException('Taslak bulunamadı');
  return t;
}

async function aktifSurum(tx: Tx, t: TaslakSatiri): Promise<SurumSatiri | null> {
  if (t.aktif_surum_no === 0) return null;
  const [s] = await tx.$queryRaw<SurumSatiri[]>(Prisma.sql`
    SELECT alanlar, eksikler, icerik_ozeti FROM taslak_surumu
     WHERE taslak_id = ${t.id}::uuid AND surum_no = ${t.aktif_surum_no}`);
  return s ?? null;
}

async function aitMi(tx: Tx, tablo: 'ad_accounts' | 'social_profiles', id: string, clientId: string, mesaj: string) {
  const [r] = await tx.$queryRaw<Array<{ ok: number }>>(
    tablo === 'ad_accounts'
      ? Prisma.sql`SELECT 1 AS ok FROM ad_accounts WHERE id = ${id}::uuid AND client_id = ${clientId}::uuid`
      : Prisma.sql`SELECT 1 AS ok FROM social_profiles WHERE id = ${id}::uuid AND client_id = ${clientId}::uuid`,
  );
  if (!r) throw new BadRequestException(mesaj);
}

function kayit(t: TaslakSatiri, s: SurumSatiri | null): TaslakKaydi {
  return {
    id: t.id,
    clientId: t.client_id,
    durum: t.durum,
    niyetKodu: t.niyet_kodu,
    adAccountId: t.ad_account_id,
    aktifSurumNo: t.aktif_surum_no,
    olusturanYuz: t.olusturan_yuz,
    updatedAt: new Date(t.updated_at).toISOString(),
    alanlar: (s?.alanlar as TaslakAlanlari) ?? {},
    // Hiç sürümü olmayan taslağın eksikleri de hesaplanıyor: boş liste
    // "hazır" gibi okunurdu.
    eksikler: (s?.eksikler as TaslakEksigi[]) ?? [...taslakEksikleri({}), PROVA_EKSIGI],
    icerikOzeti: s?.icerik_ozeti ?? null,
  };
}
