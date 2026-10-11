import { createHash } from 'node:crypto';
import { BadRequestException, ForbiddenException, Inject, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  gunlukButceBasligi,
  hazirlamaDurumu,
  kategoriBasligi,
  pikselSec,
  varsayilanGunlukButce,
  type HazirlamaAdimi,
  type HazirlamaCevabi,
  type HazirlamaDurumu,
  type HazirlamaSorusu,
  type HazirlamaYaniti,
  type TenantContext,
  type UpsertClientProfileInput,
} from '@advetics/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { CryptoService } from '../../crypto/crypto.service';
import { AuditService } from '../audit/audit.service';
import { CONFIG, type AppConfig } from '../../config/configuration';
import { OlcumService } from '../olcum/olcum.service';
import { BilgiBankasiAiService } from '../tenancy/bilgi-bankasi-ai.service';
import { ClientProfileService } from '../tenancy/client-profile.service';
import { KitleSablonuService } from '../tenancy/kitle-sablonu.service';
import { GOOGLE_TY_ASGARI_TRY_MICROS } from '../reklam/hazirlik.service';

const logger = new Logger('HazirlamaService');

const mesaj = (e: unknown) => (e instanceof Error ? e.message : String(e));

interface Satir {
  durum: HazirlamaDurumu;
  adimlar: HazirlamaAdimi[];
  sorular: HazirlamaSorusu[];
  piksel_id: string | null;
  gunluk_butce_micros: bigint | null;
  gunluk_butce_para_birimi: string | null;
  kategori_cevaplandi: boolean;
  son_calisma: Date | null;
  girdi_imzasi: string | null;
}

/**
 * Sayfanın `website` alanı birden çok adres taşıyabiliyor (boşlukla ya da
 * satırla ayrılmış) ve şemasız gelebiliyor ("www.x.com"). İLKİ alınır ve
 * https'e çevrilir; Ölçüm taraması http'yi zaten reddediyor.
 */
export function sayfaSitesi(ham: unknown): string | null {
  if (typeof ham !== 'string') return null;
  const ilk = ham.split(/[\s,]+/).find((x) => x.trim().length > 3);
  if (!ilk) return null;
  const tam = /^https?:\/\//i.test(ilk) ? ilk.replace(/^http:\/\//i, 'https://') : `https://${ilk}`;
  try {
    const u = new URL(tam);
    return u.hostname.includes('.') && !/(facebook|instagram)\.com$/i.test(u.hostname) ? u.toString() : null;
  } catch {
    return null;
  }
}

/** Boş metin alanları (null, ''): AI taslağı YALNIZ bunlara yazar; dolu alana dokunulmaz. */
export function bosAlanlariDoldur(
  mevcut: Record<string, unknown>,
  taslak: Record<string, unknown>,
  alanlar: readonly string[],
): Record<string, unknown> {
  const yaz: Record<string, unknown> = {};
  for (const a of alanlar) {
    const m = mevcut[a];
    const t = taslak[a];
    const mevcutBos = m === null || m === undefined || (typeof m === 'string' && !m.trim()) || (Array.isArray(m) && m.length === 0);
    const taslakDolu = (typeof t === 'string' && t.trim().length > 0) || (Array.isArray(t) && t.length > 0);
    if (mevcutBos && taslakDolu) yaz[a] = t;
  }
  return yaz;
}

const MARKA_ALANLARI = ['markaAdi', 'sektor', 'markaBilgileri', 'bilgiBankasi', 'hedefKitle', 'uslup', 'urunKategorileri', 'vaatler'] as const;

/**
 * ═══ HAZIR WORKSPACE (HAZIR-WORKSPACE-PLANI.md § Dalga 3) ═══
 *
 * Hesap atanınca workspace'i reklama hazırlar; kullanıcı Marka Merkezi'ni
 * doldurmakla uğraşmaz. TETİK OKUMADA: hazırlık okunduğunda workspace'in
 * hesap/sayfa/site imzası son çalışmadan farklıysa iş arka planda yeniden
 * koşar. Hesap atama koduna bağlanmak modüller arası döngü kurardı; imza
 * aynı şeyi bağlamsız yapıyor ve "elle atandı, hazırlık koşmadı" hâli
 * kalmıyor.
 *
 * ADIMLAR BAĞIMSIZ: biri düşerse diğerleri sürer; düşenin platform mesajı
 * adımda kalır (sessiz hata yok). Belirsizlik TAHMİN EDİLMEZ, soru olur.
 */
@Injectable()
export class HazirlamaService {
  private readonly calisan = new Set<string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly olcum: OlcumService,
    private readonly ai: BilgiBankasiAiService,
    private readonly profil: ClientProfileService,
    private readonly kitle: KitleSablonuService,
    private readonly crypto: CryptoService,
    @Inject(CONFIG) private readonly config: AppConfig,
    private readonly audit: AuditService,
  ) {}

  private erisim(ctx: TenantContext, clientId: string): void {
    if (!ctx.clientIds.includes(clientId)) throw new ForbiddenException('Bu workspace’e erişimin yok.');
  }

  private async satir(ctx: TenantContext, clientId: string): Promise<Satir | null> {
    const [r] = await this.prisma.withTenant(ctx, (t) =>
      t.$queryRaw<Satir[]>(Prisma.sql`
        SELECT durum, adimlar, sorular, piksel_id, gunluk_butce_micros, gunluk_butce_para_birimi, kategori_cevaplandi, son_calisma, girdi_imzasi
          FROM workspace_hazirlama WHERE client_id = ${clientId}::uuid`),
    );
    return r ?? null;
  }

  /** Hazırlığın girdisi: atanmış hesaplar, sayfalar ve site adresi. Biri değişince hazırlık yeniden koşar. */
  private async girdiImzasi(ctx: TenantContext, clientId: string): Promise<{ deger: string; hesapVar: boolean }> {
    const [r] = await this.prisma.withTenant(ctx, (t) =>
      t.$queryRaw<Array<{ hesaplar: string[] | null; profiller: string[] | null; website: string | null }>>(Prisma.sql`
        SELECT (SELECT array_agg(id::text ORDER BY id) FROM ad_accounts WHERE client_id = c.id) AS hesaplar,
               (SELECT array_agg(id::text ORDER BY id) FROM social_profiles WHERE client_id = c.id) AS profiller,
               c.website
          FROM clients c WHERE c.id = ${clientId}::uuid`),
    );
    const hesaplar = r?.hesaplar ?? [];
    const deger = createHash('sha256').update(JSON.stringify([hesaplar, r?.profiller ?? [], r?.website ?? ''])).digest('hex');
    return { deger, hesapVar: hesaplar.length > 0 };
  }

  private yanit(clientId: string, s: Satir | null): HazirlamaYaniti {
    return {
      clientId,
      durum: this.calisan.has(clientId) ? 'calisiyor' : (s?.durum ?? 'bekliyor'),
      adimlar: s?.adimlar ?? [],
      sorular: s?.sorular ?? [],
      varsayilanlar: {
        pikselId: s?.piksel_id ?? null,
        gunlukButceMicros: s?.gunluk_butce_micros != null ? s.gunluk_butce_micros.toString() : null,
        gunlukButceParaBirimi: s?.gunluk_butce_para_birimi?.trim() ?? null,
        kategoriCevaplandi: s?.kategori_cevaplandi ?? false,
      },
      sonCalisma: s?.son_calisma ? s.son_calisma.toISOString() : null,
    };
  }

  async oku(ctx: TenantContext, clientId: string): Promise<HazirlamaYaniti> {
    this.erisim(ctx, clientId);
    // KİLİT SATIRDAN ÖNCE OKUNUR. İş satırı yazıp SONRA kilidi bırakıyor;
    // ters sırada (önce satır, sonra kilit) biten işin yoklaması eski satırı
    // görüp kilidi boş buluyor ve işi bir kez daha başlatıyordu (test yakaladı).
    const calisiyordu = this.calisan.has(clientId);
    const s = await this.satir(ctx, clientId);
    const imza = await this.girdiImzasi(ctx, clientId);
    // OKUMA YETKİSİ YAZMA YAPTIRMAZ (Ajan 4, B1): iş site adresini ve marka
    // profilini YAZIYOR ve paralı çağrı (AI, Graph) yapıyor. Yalnız okuyabilen
    // müşteri hesabı kartı açınca iş başlamaz; satır olduğu gibi döner.
    const yazabilir = ctx.permissions.includes('client.write');
    if (yazabilir && imza.hesapVar && s?.girdi_imzasi !== imza.deger && !calisiyordu && !this.calisan.has(clientId)) {
      this.baslat(ctx, clientId, imza.deger);
    }
    // Okurken biten işin satırı taze okunur; eskisi "bekliyor" gösterip yoklamayı durdururdu.
    return this.yanit(clientId, calisiyordu && !this.calisan.has(clientId) ? await this.satir(ctx, clientId) : s);
  }

  async yeniden(ctx: TenantContext, clientId: string): Promise<HazirlamaYaniti> {
    this.erisim(ctx, clientId);
    if (!this.calisan.has(clientId)) this.baslat(ctx, clientId, (await this.girdiImzasi(ctx, clientId)).deger);
    return this.yanit(clientId, await this.satir(ctx, clientId));
  }

  /** Arka planda: istek dönerken iş sürer, panel yoklar. Aynı workspace'te iki iş üst üste binmez. */
  private baslat(ctx: TenantContext, clientId: string, imza: string): void {
    this.calisan.add(clientId);
    void this.calistir(ctx, clientId, imza)
      .catch(async (e) => {
        logger.error(`Hazırlık düştü (${clientId}): ${mesaj(e)}`);
        await this.dustu(ctx, clientId, imza, mesaj(e)).catch((e2) => logger.error(`Hazırlık hatası da yazılamadı (${clientId}): ${mesaj(e2)}`));
      })
      .finally(() => this.calisan.delete(clientId));
  }

  /**
   * İŞ TAMAMEN DÜŞERSE DE SATIR YAZILIR — imzayla birlikte. Yazılmasaydı
   * imza hiç eşleşmez, panelin her okuması işi YENİDEN başlatır (site
   * taraması + AI çağrısı her 3 saniyede) ve ekranda sebep görünmezdi.
   * Önceki kararlar (piksel, bütçe, kategori) korunur; "Yeniden hazırla"
   * tekrar dener.
   */
  async dustu(ctx: TenantContext, clientId: string, imza: string, sebep: string): Promise<void> {
    const adimlar: HazirlamaAdimi[] = [{ kod: 'site', durum: 'hata', baslik: 'Hazırlık tamamlanamadı', neden: sebep }];
    await this.prisma.withTenant(ctx, (t) =>
      t.$queryRaw(Prisma.sql`
        INSERT INTO workspace_hazirlama (client_id, org_id, durum, adimlar, sorular, son_calisma, girdi_imzasi, updated_at)
        SELECT ${clientId}::uuid, c.org_id, 'eksik', ${JSON.stringify(adimlar)}::jsonb, '[]'::jsonb, now(), ${imza}, now()
          FROM clients c WHERE c.id = ${clientId}::uuid
        ON CONFLICT (client_id) DO UPDATE SET
          durum = 'eksik', adimlar = EXCLUDED.adimlar, sorular = '[]'::jsonb,
          son_calisma = now(), girdi_imzasi = EXCLUDED.girdi_imzasi, updated_at = now()
        RETURNING client_id`),
    );
  }

  /** Testte doğrudan çağrılır (arka plan beklenmez). */
  async calistir(ctx: TenantContext, clientId: string, imza: string): Promise<void> {
    const once = await this.satir(ctx, clientId);
    const adimlar: HazirlamaAdimi[] = [];
    const sorular: HazirlamaSorusu[] = [];
    let pikselId = once?.piksel_id ?? null;
    let butce = once?.gunluk_butce_micros ?? null;
    const oncekiBirim = once?.gunluk_butce_para_birimi?.trim() ?? null;
    let kategoriCevaplandi = once?.kategori_cevaplandi ?? false;

    const c = await this.prisma.withTenant(ctx, async (t) => {
      const [k] = await t.$queryRaw<Array<{ website: string | null; kategoriler: string[] }>>(Prisma.sql`
        SELECT website, special_ad_categories AS kategoriler FROM clients WHERE id = ${clientId}::uuid`);
      const hesaplar = await t.$queryRaw<Array<{ platform: string; currency: string }>>(Prisma.sql`
        SELECT platform::text AS platform, currency FROM ad_accounts WHERE client_id = ${clientId}::uuid AND platform IN ('meta', 'google')`);
      const [sayfa] = await t.$queryRaw<Array<{ external_id: string; token: Buffer | Uint8Array | null }>>(Prisma.sql`
        SELECT external_id, page_access_token_enc AS token FROM social_profiles
         WHERE client_id = ${clientId}::uuid AND profile_type = 'facebook_page' ORDER BY name, id LIMIT 1`);
      const [p] = await t.$queryRaw<Array<{ varsayilan_kitle_id: string | null; kitle_adi: string | null }>>(Prisma.sql`
        SELECT p.varsayilan_kitle_id::text, a.name AS kitle_adi
          FROM client_profiles p LEFT JOIN audience_templates a ON a.id = p.varsayilan_kitle_id
         WHERE p.client_id = ${clientId}::uuid`);
      return { ...k!, hesaplar, sayfa: sayfa ?? null, kitle: p ?? null };
    });

    // ── site ────────────────────────────────────────────────────────────
    let site = c.website;
    let siteYazildi = false;
    if (site) {
      adimlar.push({ kod: 'site', durum: 'tamam', baslik: site, neden: 'Workspace ayarlarında girilmiş' });
    } else if (c.sayfa?.token) {
      try {
        const token = this.crypto.decrypt(Buffer.from(c.sayfa.token));
        const r = await fetch(`https://graph.facebook.com/${this.config.platforms.meta.apiVersion}/${c.sayfa.external_id}?fields=website`, {
          headers: { Authorization: `Bearer ${token}` },
          // Yanıt vermeyen Graph, hazırlığı (ve `calisan` kilidini) sonsuza tutmasın.
          signal: AbortSignal.timeout(15_000),
        });
        const j = (await r.json()) as { website?: unknown; error?: { message?: string } };
        if (j.error) throw new Error(j.error.message ?? `HTTP ${r.status}`);
        site = sayfaSitesi(j.website);
        if (site) {
          // YALNIZ BOŞSA: arada kullanıcı adres yazdıysa üstüne yazılmaz.
          const yazilan = await this.prisma.withTenant(ctx, (t) =>
            t.$queryRaw<unknown[]>(Prisma.sql`UPDATE clients SET website = ${site} WHERE id = ${clientId}::uuid AND (website IS NULL OR website = '') RETURNING id`),
          );
          siteYazildi = yazilan.length > 0;
          if (siteYazildi) {
            adimlar.push({ kod: 'site', durum: 'tamam', baslik: site, neden: 'Facebook sayfasının bilgilerinden alındı' });
          } else {
            // Sıfır satır: arada kullanıcı adres yazdı ya da yazma reddedildi.
            // Sayfadaki adresle sürmek, kayıtta olmayan bir siteyi taramak
            // ve "tamam" demek olurdu (Ajan 4, Ö5).
            const [g] = await this.prisma.withTenant(ctx, (t) =>
              t.$queryRaw<Array<{ website: string | null }>>(Prisma.sql`SELECT website FROM clients WHERE id = ${clientId}::uuid`),
            );
            site = g?.website?.trim() || null;
            adimlar.push(
              site
                ? { kod: 'site', durum: 'tamam', baslik: site, neden: 'Workspace ayarlarında girilmiş' }
                : { kod: 'site', durum: 'hata', baslik: 'Site adresi yazılamadı', neden: 'Facebook sayfasındaki adres workspace’e kaydedilemedi; Workspace ayarları’ndan gir' },
            );
          }
        } else {
          adimlar.push({ kod: 'site', durum: 'eksik', baslik: 'Site adresi yok', neden: "Facebook sayfasında da site adresi yazmıyor; Workspace ayarları'ndan gir" });
        }
      } catch (e) {
        adimlar.push({ kod: 'site', durum: 'hata', baslik: 'Site adresi okunamadı', neden: `Facebook sayfası okunamadı: ${mesaj(e)}` });
      }
    } else {
      adimlar.push({ kod: 'site', durum: 'eksik', baslik: 'Site adresi yok', neden: "Workspace ayarları'ndan site adresini gir; sayfa bağlıysa oradan da alınır" });
    }

    // ── marka ───────────────────────────────────────────────────────────
    if (!site) {
      adimlar.push({ kod: 'marka', durum: 'atlandi', baslik: 'Marka bilgileri', neden: 'Site adresi olmadan siteden okunamıyor' });
    } else {
      try {
        const mevcut = (await this.profil.get(ctx, clientId)) as unknown as Record<string, unknown>;
        const bos = MARKA_ALANLARI.filter((a) => Object.keys(bosAlanlariDoldur(mevcut, { [a]: 'x' }, [a])).length > 0);
        if (bos.length === 0) {
          adimlar.push({ kod: 'marka', durum: 'tamam', baslik: 'Marka bilgileri dolu', neden: 'Dolu alanlara dokunulmadı' });
        } else {
          const taslak = (await this.ai.taslak(ctx, clientId)) as unknown as Record<string, unknown>;
          const yaz = bosAlanlariDoldur(mevcut, taslak, MARKA_ALANLARI);
          if (Object.keys(yaz).length) await this.profil.upsert(ctx, { clientId, ...yaz } as UpsertClientProfileInput, {});
          adimlar.push({
            kod: 'marka',
            durum: 'tamam',
            baslik: Object.keys(yaz).length ? `${Object.keys(yaz).length} alan siteden dolduruldu` : 'Siteden yeni bilgi çıkmadı',
            neden: 'Yalnız boş alanlar yazıldı; dolu alanlara dokunulmadı',
          });
        }
      } catch (e) {
        adimlar.push({ kod: 'marka', durum: 'hata', baslik: 'Marka bilgileri doldurulamadı', neden: mesaj(e) });
      }
    }

    // ── ölçüm ve piksel ───────────────────────────────────────────────────
    const metaVar = c.hesaplar.some((h) => h.platform === 'meta');
    try {
      const o = await this.olcum.durum(ctx, clientId, true);
      adimlar.push({
        kod: 'olcum',
        durum: o.oneri.kod === 'HEPSI_HAZIR' ? 'tamam' : o.oneri.kod === 'OKUNAMADI' ? 'hata' : 'eksik',
        baslik: o.oneri.baslik,
        neden: o.oneri.kod === 'HEPSI_HAZIR' ? o.oneri.metin : `${o.oneri.metin} Ölçüm bölümünde ayrıntısı var.`,
      });
      if (!metaVar) {
        adimlar.push({ kod: 'piksel', durum: 'atlandi', baslik: 'Meta pikseli', neden: "Bu workspace'e Meta reklam hesabı atanmamış" });
      } else if (pikselId && o.metaPikselleri?.satirlar.some((p) => p.id === pikselId)) {
        const p = o.metaPikselleri.satirlar.find((x) => x.id === pikselId)!;
        adimlar.push({ kod: 'piksel', durum: 'tamam', baslik: p.ad, neden: 'Önceden seçildi' });
      } else if (o.metaPikselleri) {
        const s = pikselSec(o.metaPikselleri.satirlar, o.site.metaPiksel);
        if (s.tur === 'secildi') {
          pikselId = s.id;
          adimlar.push({ kod: 'piksel', durum: 'tamam', baslik: o.metaPikselleri.satirlar.find((x) => x.id === s.id)!.ad, neden: s.neden });
        } else if (s.tur === 'soru') {
          pikselId = null;
          sorular.push({ kod: 'piksel', soru: 'Bu workspace hangi Meta pikselini kullanıyor?', secenekler: s.adaylar.map((a) => ({ deger: a.id, etiket: a.ad })) });
          adimlar.push({ kod: 'piksel', durum: 'soru', baslik: 'Meta pikseli', neden: `${s.adaylar.length} aday var; hangisinin sitende çalıştığını sen seç` });
        } else {
          pikselId = null;
          adimlar.push({ kod: 'piksel', durum: 'eksik', baslik: 'Meta pikseli yok', neden: s.neden });
        }
      } else {
        adimlar.push({ kod: 'piksel', durum: 'hata', baslik: 'Meta pikseli', neden: o.okumaHatalari.find((h) => h.kaynak === 'meta')?.mesaj ?? 'Pikseller okunamadı' });
      }
    } catch (e) {
      adimlar.push({ kod: 'olcum', durum: 'hata', baslik: 'Ölçüm okunamadı', neden: mesaj(e) });
      adimlar.push({ kod: 'piksel', durum: 'hata', baslik: 'Meta pikseli', neden: 'Ölçüm okunamadığı için piksel seçilemedi' });
    }

    // ── özel reklam kategorisi (bir kez sorulur) ────────────────────────
    if (!kategoriCevaplandi && c.kategoriler.length > 0) kategoriCevaplandi = true;
    if (kategoriCevaplandi) {
      adimlar.push({ kod: 'kategori', durum: 'tamam', baslik: kategoriBasligi(c.kategoriler), neden: 'Bir kez cevaplandı; her reklamda yeniden sorulmaz' });
    } else {
      sorular.push({ kod: 'kategori', soru: 'Bu workspace’in reklamları konut, iş ilanı, kredi ya da siyasetle ilgili mi?' });
      adimlar.push({ kod: 'kategori', durum: 'soru', baslik: 'Özel reklam kategorisi', neden: 'Yasal bir beyan; tahmin edilmez, bir kez sorulur' });
    }

    // ── varsayılan konum ─────────────────────────────────────────────────
    if (c.kitle?.varsayilan_kitle_id) {
      adimlar.push({ kod: 'konum', durum: 'tamam', baslik: c.kitle.kitle_adi ?? 'Varsayılan kitle', neden: 'Her reklamın konumu buradan önden dolar' });
    } else {
      sorular.push({ kod: 'konum', soru: 'Reklamlar varsayılan olarak hangi bölgede gösterilsin?' });
      adimlar.push({ kod: 'konum', durum: 'soru', baslik: 'Varsayılan konum', neden: 'İşletmenin hizmet bölgesi tahmin edilmez; bir kez seçilir' });
    }

    // ── varsayılan bütçe ─────────────────────────────────────────────────
    const paraBirimi = c.hesaplar.find((h) => h.platform === 'meta')?.currency ?? c.hesaplar[0]?.currency ?? 'TRY';
    // Birim değiştiyse eski tutar anlamsız: 500 ₺ korunup "500 USD" olurdu.
    if (butce !== null && oncekiBirim !== paraBirimi) butce = null;
    if (butce === null) {
      const googleTry = c.hesaplar.some((h) => h.platform === 'google' && h.currency === 'TRY');
      butce = varsayilanGunlukButce(paraBirimi, [googleTry ? GOOGLE_TY_ASGARI_TRY_MICROS : null]);
    }
    adimlar.push({ kod: 'butce', durum: 'tamam', baslik: gunlukButceBasligi(butce, paraBirimi), neden: 'Her reklamda önerilir; değiştirilebilir' });

    const durum = hazirlamaDurumu(adimlar, sorular);
    // Site adresini BU İŞ yazdıysa imza da değişti: eski imzayı saklamak bir
    // sonraki okumada aynı işi (site taraması + AI) boşuna yeniden koşturur.
    const sonImza = siteYazildi ? (await this.girdiImzasi(ctx, clientId)).deger : imza;
    await this.prisma.withTenant(ctx, (t) =>
      t.$queryRaw(Prisma.sql`
        INSERT INTO workspace_hazirlama (client_id, org_id, durum, adimlar, sorular, piksel_id, gunluk_butce_micros, gunluk_butce_para_birimi, kategori_cevaplandi, son_calisma, girdi_imzasi, updated_at)
        SELECT ${clientId}::uuid, c.org_id, ${durum}, ${JSON.stringify(adimlar)}::jsonb, ${JSON.stringify(sorular)}::jsonb,
               ${pikselId}, ${butce}, ${paraBirimi}, ${kategoriCevaplandi}, now(), ${sonImza}, now()
          FROM clients c WHERE c.id = ${clientId}::uuid
        ON CONFLICT (client_id) DO UPDATE SET
          durum = EXCLUDED.durum, adimlar = EXCLUDED.adimlar, sorular = EXCLUDED.sorular,
          piksel_id = EXCLUDED.piksel_id, gunluk_butce_micros = EXCLUDED.gunluk_butce_micros,
          gunluk_butce_para_birimi = EXCLUDED.gunluk_butce_para_birimi,
          kategori_cevaplandi = EXCLUDED.kategori_cevaplandi, son_calisma = EXCLUDED.son_calisma,
          girdi_imzasi = EXCLUDED.girdi_imzasi, updated_at = now()
        RETURNING client_id`),
    );
  }

  /**
   * Tek soruya cevap: yalnız o adım güncellenir, soru listeden düşer. Kategori
   * workspace'in kendi beyanı olarak `clients.special_ad_categories`e yazılır
   * (rehber ve bütün reklamlar oradan okuyor); konum "Varsayılan" kitle
   * şablonu olur.
   */
  async cevap(ctx: TenantContext, clientId: string, c: HazirlamaCevabi): Promise<HazirlamaYaniti> {
    this.erisim(ctx, clientId);
    const s = await this.satir(ctx, clientId);
    if (!s) throw new BadRequestException('Önce hazırlık çalışmalı.');
    // SORU BEKLEMİYORSA CEVAP YOK (Ajan 4, Ö6): bu uç bir ayar ekranı değil.
    // Bekleyen soru olmadan kabul edilen kategori cevabı, workspace'in konut
    // beyanını Workspace ayarları'nın dışından sessizce silebiliyordu.
    // Bütçe istisna: kart her zaman "Değiştir" sunuyor.
    if (c.kod !== 'butce' && !s.sorular.some((q) => q.kod === c.kod)) {
      throw new BadRequestException('Bu soru artık beklemiyor; sayfayı yenile.');
    }
    const adimlar = [...s.adimlar];
    const guncelle = (a: HazirlamaAdimi) => {
      const i = adimlar.findIndex((x) => x.kod === a.kod);
      if (i >= 0) adimlar[i] = a;
      else adimlar.push(a);
    };
    let pikselId = s.piksel_id;
    let butce = s.gunluk_butce_micros;
    let birim = s.gunluk_butce_para_birimi?.trim() ?? null;
    let kategori = s.kategori_cevaplandi;
    if (c.kod === 'piksel') {
      const soru = s.sorular.find((x) => x.kod === 'piksel');
      const secenek = soru?.kod === 'piksel' ? soru.secenekler.find((x) => x.deger === c.pikselId) : undefined;
      if (!secenek) throw new BadRequestException('Bu piksel seçenekler arasında değil.');
      pikselId = c.pikselId;
      guncelle({ kod: 'piksel', durum: 'tamam', baslik: secenek.etiket, neden: 'Sen seçtin' });
    } else if (c.kod === 'kategori') {
      // Beyan ve denetim kaydı AYNI işlemde: konut beyanının kim tarafından
      // ne zaman değiştirildiği politika soruşturmasında ilk sorulan şey
      // (`clients.service.ts` ile aynı `client.updated` kaydı).
      await this.prisma.withTenant(ctx, async (t) => {
        const [once] = await t.$queryRaw<Array<{ kategoriler: string[] }>>(
          Prisma.sql`SELECT special_ad_categories AS kategoriler FROM clients WHERE id = ${clientId}::uuid`,
        );
        // Politikası izin vermeyen UPDATE hata vermez, SIFIR satır etkiler:
        // beyan yazılmadan "cevaplandı" basılırsa reklam kategorisiz açılır.
        const yazilan = await t.$queryRaw<Array<{ id: string }>>(
          Prisma.sql`UPDATE clients SET special_ad_categories = ${c.kategoriler}::text[] WHERE id = ${clientId}::uuid RETURNING id`,
        );
        if (yazilan.length !== 1 || !once) throw new ForbiddenException('Reklam kategorisi kaydedilemedi: bu workspace’i değiştirme yetkin yok.');
        await this.audit.record(t as never, ctx, {
          action: 'client.updated',
          targetType: 'client',
          targetId: clientId,
          clientId,
          before: { specialAdCategories: once.kategoriler },
          after: { specialAdCategories: c.kategoriler, kaynak: 'hazirlama' },
        });
      });
      kategori = true;
      guncelle({ kod: 'kategori', durum: 'tamam', baslik: kategoriBasligi(c.kategoriler), neden: 'Bir kez cevaplandı; her reklamda yeniden sorulmaz' });
    } else if (c.kod === 'konum') {
      const sablon = await this.kitle.create(
        ctx,
        { clientId, name: 'Varsayılan', locations: c.konumlar, ageMin: 18, ageMax: 65, genders: 'all', interests: [], ozelKitleler: [] },
        {},
      );
      await this.kitle.varsayilanYap(ctx, clientId, sablon.id, {});
      guncelle({ kod: 'konum', durum: 'tamam', baslik: c.konumlar.map((k) => k.label).join(', '), neden: 'Her reklamın konumu buradan önden dolar' });
    } else {
      butce = BigInt(c.gunlukButceMicros);
      if (butce <= 0n) throw new BadRequestException('Günlük bütçe sıfırdan büyük olmalı.');
      const hesap = await this.prisma.withTenant(ctx, (t) =>
        t.$queryRaw<Array<{ currency: string | null }>>(Prisma.sql`
          SELECT currency FROM ad_accounts WHERE client_id = ${clientId}::uuid AND currency IS NOT NULL
           ORDER BY (platform = 'meta') DESC LIMIT 1`),
      );
      birim = hesap[0]?.currency?.trim() ?? 'TRY';
      guncelle({ kod: 'butce', durum: 'tamam', baslik: gunlukButceBasligi(butce, birim), neden: 'Sen belirledin; her reklamda önerilir' });
    }
    const sorular = s.sorular.filter((x) => x.kod !== c.kod);
    const durum = hazirlamaDurumu(adimlar, sorular);
    const yazildi = await this.prisma.withTenant(ctx, (t) =>
      t.$queryRaw<unknown[]>(Prisma.sql`
        UPDATE workspace_hazirlama SET durum = ${durum}, adimlar = ${JSON.stringify(adimlar)}::jsonb, sorular = ${JSON.stringify(sorular)}::jsonb,
               piksel_id = ${pikselId}, gunluk_butce_micros = ${butce}, gunluk_butce_para_birimi = ${birim},
               kategori_cevaplandi = ${kategori}, updated_at = now()
         WHERE client_id = ${clientId}::uuid RETURNING client_id`),
    );
    if (yazildi.length !== 1) throw new ForbiddenException('Hazırlık kaydedilemedi: bu workspace’i değiştirme yetkin yok.');
    return this.yanit(clientId, await this.satir(ctx, clientId));
  }
}
