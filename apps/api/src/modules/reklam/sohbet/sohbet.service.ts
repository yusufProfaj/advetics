import { readFile } from 'node:fs/promises';
import { isAbsolute, resolve, sep } from 'node:path';
import { ForbiddenException, Inject, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { MesajDurumu, SohbetOlayi, TenantContext } from '@advetics/shared';
import { CONFIG, type AppConfig } from '../../../config/configuration';
import { CryptoService } from '../../../crypto/crypto.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { ReklamHazirlikService } from '../hazirlik.service';
import { hesapErisimi } from '../meta-erisim';
import { metaSurumuDogrula } from '../meta-graf';
import { ReklamTaslakService } from '../taslak.service';
import { ReklamYayinService } from '../yayin.service';
import type { TxRunner } from '../yayin-motoru';
import { AracCalistirici, type MarkaProfili } from './araclar';
import { SohbetDongusu, YALNIZ_MEDYA, type ModelAdimi, type TurGirdisi } from './dongu';
import { metaKonumAra } from './meta-konum';
import { geminiAdimi } from './model';
import { YAPAY_ZEKA } from '../../../yapay-zeka/yapay-zeka.module';
import type { GeminiIstemcisi } from '../../../yapay-zeka/gemini';
import { AdvOnayService } from './onay.service';

/**
 * ADVCAMPAIGN SOHBETİ — Nest kabuğu. Kararlar `dongu.ts` (tur), `araclar.ts`
 * (araç kapıları) ve `packages/shared/src/reklam/sohbet` (soru, hâl, kota)
 * içinde; burası yalnız gerçek bağımlılıkları bağlıyor.
 *
 * Yapay zekâ Gemini (global `YapayZekaModule`; iş modülü değil, sınır
 * testinin yasak listesinde yok). Anahtar yoksa sohbet açılmıyor ve bu
 * SÖYLENİYOR; panel (taslak paneli) çalışmaya devam ediyor.
 */
const MODELE_GORSEL_SINIRI = 5 * 1024 * 1024;

export interface OturumOzeti {
  id: string;
  baslik: string;
  taslakId: string | null;
  durum: string;
  sahibiBenMiyim: boolean;
  updatedAt: string;
  /**
   * AdvStrategy aktarımından gelen hazır açılış (MIMARI § 6.1): mesajı
   * olmayan oturumda giriş kutusu bu metinle, ekler bu varlıklarla dolu
   * gelir. Elle açılan oturumda `null` / boş. Mesaj olarak YAZILMIYOR:
   * kullanıcı gönderene kadar yalnız bir öneri.
   */
  hazirIstem: string | null;
  hazirMedyalar: string[];
}

export interface EkranMesaji {
  id: string;
  sira: number;
  rol: 'kullanici' | 'asistan';
  metin: string;
  olaylar: SohbetOlayi[];
  durum: MesajDurumu;
}

@Injectable()
export class AdvSohbetService {
  private readonly modelAdi: string;
  private readonly yuklemeKoku: string;
  private readonly apiSurumu: string;
  /** Testte sahte model koyulabilsin diye alan. */
  model: ModelAdimi | null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly hazirlik: ReklamHazirlikService,
    private readonly taslak: ReklamTaslakService,
    private readonly yayin: ReklamYayinService,
    private readonly onay: AdvOnayService,
    private readonly crypto: CryptoService,
    @Inject(CONFIG) config: AppConfig,
    @Inject(YAPAY_ZEKA) yz: GeminiIstemcisi | null,
  ) {
    this.model = yz ? geminiAdimi(yz) : null;
    this.modelAdi = config.yapayZeka.model;
    const dir = config.uploads.dir;
    this.yuklemeKoku = isAbsolute(dir) ? dir : resolve(process.cwd(), dir);
    this.apiSurumu = metaSurumuDogrula(config.platforms.meta.apiVersion);
  }

  private tx(ctx: TenantContext): TxRunner {
    return (fn) => this.prisma.withTenant(ctx, (t) => fn(t as never));
  }

  async oturumAc(ctx: TenantContext, clientId: string): Promise<OturumOzeti> {
    if (!ctx.clientIds.includes(clientId)) throw new ForbiddenException('Bu workspace’e erişimin yok');
    const [o] = await this.tx(ctx)((t) =>
      t.$queryRaw<Array<{ id: string; updated_at: Date }>>(Prisma.sql`
        INSERT INTO adv_oturum (org_id, client_id, user_id, baslik, model)
        SELECT org_id, id, ${ctx.userId}::uuid, 'Yeni reklam', ${this.modelAdi} FROM clients WHERE id = ${clientId}::uuid
        RETURNING id::text, updated_at`),
    );
    if (!o) throw new NotFoundException('Workspace bulunamadı');
    return { id: o.id, baslik: 'Yeni reklam', taslakId: null, durum: 'acik', sahibiBenMiyim: true, updatedAt: new Date(o.updated_at).toISOString(), hazirIstem: null, hazirMedyalar: [] };
  }

  /** Son 30 oturum ve TOPLAM (sessiz kesme yok). */
  async oturumlar(ctx: TenantContext, clientId: string): Promise<{ satirlar: OturumOzeti[]; toplam: number; asistanBagli: boolean }> {
    if (!ctx.clientIds.includes(clientId)) throw new ForbiddenException('Bu workspace’e erişimin yok');
    return this.tx(ctx)(async (t) => {
      const satirlar = await t.$queryRaw<Array<{ id: string; baslik: string; taslak_id: string | null; durum: string; user_id: string; updated_at: Date; hazir_istem: string | null; hazir_medyalar: string[] }>>(Prisma.sql`
        SELECT id::text, baslik, taslak_id::text, durum, user_id::text, updated_at,
               hazir_istem, hazir_medyalar::text[] AS hazir_medyalar FROM adv_oturum
         WHERE client_id = ${clientId}::uuid ORDER BY updated_at DESC LIMIT 30`);
      const [n] = await t.$queryRaw<Array<{ n: number }>>(Prisma.sql`SELECT count(*)::int AS n FROM adv_oturum WHERE client_id = ${clientId}::uuid`);
      return {
        satirlar: satirlar.map((s) => ({
          id: s.id,
          baslik: s.baslik,
          taslakId: s.taslak_id,
          durum: s.durum,
          sahibiBenMiyim: s.user_id === ctx.userId,
          updatedAt: new Date(s.updated_at).toISOString(),
          hazirIstem: s.hazir_istem,
          hazirMedyalar: s.hazir_medyalar ?? [],
        })),
        toplam: n?.n ?? 0,
        // Ekran "anahtar yok" hâlini tahmin etmesin, sunucudan öğrensin.
        asistanBagli: this.model !== null,
      };
    });
  }

  /** Ekrana mesajlar: ham model içeriği değil, metin + olaylar. `sonra` ile yalnız yeniler. */
  async mesajlar(ctx: TenantContext, oturumId: string, sonra = 0): Promise<{ oturum: OturumOzeti; mesajlar: EkranMesaji[] }> {
    return this.tx(ctx)(async (t) => {
      const [o] = await t.$queryRaw<Array<{ id: string; baslik: string; taslak_id: string | null; durum: string; user_id: string; client_id: string; updated_at: Date; hazir_istem: string | null; hazir_medyalar: string[] }>>(Prisma.sql`
        SELECT id::text, baslik, taslak_id::text, durum, user_id::text, client_id::text, updated_at,
               hazir_istem, hazir_medyalar::text[] AS hazir_medyalar
          FROM adv_oturum WHERE id = ${oturumId}::uuid`);
      if (!o || !ctx.clientIds.includes(o.client_id)) throw new NotFoundException('Oturum bulunamadı');
      const satirlar = await t.$queryRaw<Array<{ id: string; sira: number; rol: string; icerik: unknown; olaylar: SohbetOlayi[]; durum: MesajDurumu }>>(Prisma.sql`
        SELECT id::text, sira, rol, icerik, olaylar, durum FROM adv_mesaj
         WHERE oturum_id = ${oturumId}::uuid AND sira > ${sonra} AND rol IN ('kullanici', 'asistan') ORDER BY sira`);
      return {
        oturum: {
          id: o.id,
          baslik: o.baslik,
          taslakId: o.taslak_id,
          durum: o.durum,
          sahibiBenMiyim: o.user_id === ctx.userId,
          updatedAt: new Date(o.updated_at).toISOString(),
          hazirIstem: o.hazir_istem,
          hazirMedyalar: o.hazir_medyalar ?? [],
        },
        mesajlar: satirlar.map((s) => ({
          id: s.id,
          sira: s.sira,
          rol: s.rol as 'kullanici' | 'asistan',
          metin: ekranMetni(s.rol, s.icerik),
          olaylar: s.olaylar,
          durum: s.durum,
        })),
      };
    });
  }

  tur(ctx: TenantContext, oturumId: string, g: TurGirdisi): AsyncGenerator<SohbetOlayi> {
    if (!this.model) throw new ServiceUnavailableException('Reklam asistanı bağlı değil (GEMINI_API_KEY tanımlı değil). Taslağı panelden kurabilirsin.');
    return this.dongu(ctx).tur(ctx, oturumId, g);
  }

  private dongu(ctx: TenantContext): SohbetDongusu {
    const tx = this.tx(ctx);
    const calistirici = new AracCalistirici({
      hazirlik: (c, id) => this.hazirlik.oku(c, id),
      profil: (c, id) => this.profil(c, id),
      taslakOlustur: (c, id, cumle) => this.taslak.olustur(c, id, 'ai', cumle),
      taslakOku: (c, id) => this.taslak.oku(c, id),
      surumYaz: (c, id, d) => this.taslak.surumYaz(c, id, d),
      provaIste: (c, id) => this.yayin.provaIste(c, id),
      provaOku: (c, id) => this.yayin.provaOku(c, id),
      konumAra: async (c, clientId, adAccountId, metin) => {
        const e = await hesapErisimi(this.tx(c), this.crypto, adAccountId, clientId);
        return metaKonumAra({ apiSurumu: this.apiSurumu, token: e.kullaniciToken }, metin);
      },
      onayKarti: (c, o) => this.onay.kartGoster(c, o),
    });
    return new SohbetDongusu({
      tx,
      calistirici,
      model: this.model!,
      medyaGorseli: (clientId, id) => this.medyaGorseli(ctx, clientId, id),
      saatDilimi: async (c, clientId) => (await this.hazirlik.oku(c, clientId)).hesaplar[0]?.saatDilimi ?? 'Europe/Istanbul',
      gercekDurum: (c, taslakId) => this.gercekDurum(c, taslakId),
    });
  }

  private async profil(ctx: TenantContext, clientId: string): Promise<MarkaProfili> {
    const [p] = await this.tx(ctx)((t) =>
      t.$queryRaw<Array<{ sik_sayfalar: unknown }>>(Prisma.sql`SELECT sik_sayfalar FROM client_profiles WHERE client_id = ${clientId}::uuid`),
    );
    const ham = Array.isArray(p?.sik_sayfalar) ? p.sik_sayfalar : [];
    return {
      sikSayfalar: ham
        .filter((s): s is { ad: string; url: string } => !!s && typeof (s as { url?: unknown }).url === 'string')
        .map((s) => ({ ad: s.ad, adres: s.url })),
    };
  }

  private async medyaGorseli(ctx: TenantContext, clientId: string, varlikId: string) {
    const [g] = await this.tx(ctx)((t) =>
      t.$queryRaw<Array<{ storage_key: string; mime_type: string; byte_size: number }>>(Prisma.sql`
        SELECT storage_key, mime_type, byte_size FROM assets WHERE client_id = ${clientId}::uuid AND id = ${varlikId}::uuid`),
    );
    if (!g || g.byte_size > MODELE_GORSEL_SINIRI || (g.mime_type !== 'image/jpeg' && g.mime_type !== 'image/png')) return null;
    const yol = resolve(this.yuklemeKoku, g.storage_key);
    // Anahtar veritabanından geliyor: `..` paylaşımlı sunucuda başka
    // sitelerin dosyalarını okutabilirdi.
    if (!yol.startsWith(this.yuklemeKoku.endsWith(sep) ? this.yuklemeKoku : this.yuklemeKoku + sep)) throw new Error(`Geçersiz depolama anahtarı: ${g.storage_key}`);
    return { mime: g.mime_type as 'image/jpeg' | 'image/png', base64: (await readFile(yol)).toString('base64') };
  }

  private async gercekDurum(ctx: TenantContext, taslakId: string | null): Promise<string> {
    if (!taslakId) return 'henüz taslak yok, yayın yok.';
    const [t, p, y] = await Promise.all([this.taslak.oku(ctx, taslakId), this.yayin.provaOku(ctx, taslakId), this.yayin.aktif(ctx, taslakId)]);
    const yayin = y ? `yayın kaydı ${y.durum}${y.testKipi ? ' (test kipi)' : ''}` : 'yayın yok';
    return `taslak (${t.durum}), Meta kontrolü: ${p.durum.metin} ${yayin}.`;
  }
}

export function ekranMetni(rol: string, icerik: unknown): string {
  if (rol === 'kullanici') {
    return (icerik as Array<{ text?: string }>)
      .filter((b) => typeof b.text === 'string')
      .map((b) => (b.text ?? '').replace(/\n\n\[Bırakılan medya:[^\]]*\]$/, ''))
      // YER TUTUCU MODEL İÇİN, EKRAN İÇİN DEĞİL: kullanıcı yalnız görsel
      // bıraktıysa balonda görsel görünüyor (`kayitliMedya`); "(yalnız medya
      // bıraktı)" yazısı kullanıcının hiç yazmadığı bir cümleydi.
      .map((t) => (t === YALNIZ_MEDYA ? '' : t))
      .join('\n');
  }
  // Asistan turu: yalnız görünür metin (düşünce ve araç parçaları ekranda yok).
  return (icerik as Array<{ role: string; parts: Array<{ text?: string; thought?: boolean }> }>)
    .filter((m) => m.role === 'model')
    .map((m) => m.parts.filter((p) => typeof p.text === 'string' && !p.thought).map((p) => p.text).join(''))
    .filter((t) => t.trim())
    .join('\n\n');
}
