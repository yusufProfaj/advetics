import { BadRequestException, ForbiddenException, Inject, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  MCP_ONAY_SURESI_DK,
  MCP_YUKLEME_BASLIGI,
  type McpOnayIslemi,
  type LeadFormRecord,
  type Permission,
  type RehberKaydi,
  type TenantContext,
} from '@advetics/shared';
import { assertPermissions } from '../../common/guards/permissions.guard';
import { CONFIG, type AppConfig } from '../../config/configuration';
import { PrismaAdminService } from '../../prisma/prisma-admin.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AssetsService } from '../assets/assets.service';
import { OkumaAnahtariDogrulayici } from '../auth/okuma-anahtari-dogrulayici.service';
import { TenantContextService } from '../auth/tenant-context.service';
import { CampaignActionsService, type UygulamaEylemi } from '../campaign-actions/campaign-actions.service';
import { FormPublisherService } from '../forms/form-publisher.service';
import { FormsService } from '../forms/forms.service';
import { RehberService } from '../reklam/rehber/rehber.service';
import { googleYazmaAcikMi, metaYazmaAcikMi } from '../reklam/yazma-kapisi';
import { taahhut, ustSinirDenetle } from './mcp-boost';
import { McpBoostService, type BoostArgumani, type BoostYonetimIslemi } from './mcp-boost.service';
import { McpOnayService, type AlinanOnay, type Ev } from './mcp-onay.service';
import { tekIslemUstSiniri } from './okuma-anahtari.service';
import { formIcerikOzeti, formOnayOzeti, rehberOnayOzeti, varlikOnayOzeti, type VarlikIslemi } from './mcp-onay-ozeti';
import type { VarlikSeviyesi, YazmaAraci, YazmaOrtami } from './mcp-yazma-araclari';
import { dosyaTuru, jetonCoz, jetonUret, YuklemeJetonuHatasi } from './mcp-yukleme';
import { AracArgumanHatasi } from './okuma-araclari';

const logger = new Logger('McpYazmaService');

/** İsteğin taşıdığı, aracın bilmesi gereken her şey. */
export interface YazmaIstegi extends Ev {
  yetki: 'okuma' | 'yazma';
  requestId: string;
  /** Bu isteğin geldiği MCP adresinden türetilmiş yükleme adresi. */
  yuklemeAdresi: string;
}

interface Workspace {
  ctx: TenantContext;
  ad: string;
}

/**
 * ═══ YAZMA ARAÇLARININ NEST TARAFI (`MCP-YAZMA-MIMARI.md`) ═══
 *
 * KAPSAM HER ÇAĞRIDA ARGÜMANDAN: okuma araçlarıyla aynı kural. Anahtarın ev
 * bağlamı yalnız KİMİN sorduğunu söylüyor; workspace'in şirketi ve üst
 * hesabı burada veritabanından okunup `TenantContextService.resolve`a
 * veriliyor ve çözülen bağlamın `activeClientId`si istenen workspace değilse
 * reddediliyor (resolve erişilemeyen seçimi SESSİZCE ev şirketine düşürüyor;
 * düşmüş bağlamla yazmak başka bir şirkete yazmak olurdu).
 *
 * İZİN, PANELİN İZNİ: her araç ucun `@RequirePermissions` değerini AYNI
 * fonksiyonla (`assertPermissions`) arıyor. Anahtar kullanıcıyı aşamaz.
 */
@Injectable()
export class McpYazmaService {
  constructor(
    private readonly admin: PrismaAdminService,
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContextService,
    private readonly rehber: RehberService,
    private readonly actions: CampaignActionsService,
    private readonly onay: McpOnayService,
    private readonly assets: AssetsService,
    private readonly anahtar: OkumaAnahtariDogrulayici,
    @Inject(CONFIG) private readonly config: AppConfig,
    private readonly forms: FormsService,
    private readonly formYayinci: FormPublisherService,
    private readonly boost: McpBoostService,
  ) {}

  /**
   * YÜKLEME UCU (`POST /mcp/yukleme`, `MCP-YAZMA-MIMARI.md` § 4). Uç
   * `@Public`: kimlik jetondan. Sıra önemli: imza → ANAHTAR YENİDEN (iptal,
   * süre, platform sahipliği, yetki) → workspace bağlamı ve `bulk.write` →
   * tür → Varlıklar'ın kendi yükleme yolu. Jeton yalnız "bu kişi bu
   * workspace'e 15 dk yükleyebilir" diyor; geri kalan her şey BU ANDA soruluyor.
   */
  async yukle(jeton: string | undefined, dosya: { buffer: Buffer; originalname: string } | undefined): Promise<unknown> {
    if (!jeton) throw new UnauthorizedException(`Yükleme jetonu yok: "${MCP_YUKLEME_BASLIGI}" başlığını gönder (yukleme_adresi aracının komutu).`);
    let j;
    try {
      j = jetonCoz(jeton, this.config.jwt.accessSecret);
    } catch (e) {
      if (e instanceof YuklemeJetonuHatasi) throw new UnauthorizedException(e.message);
      throw e;
    }
    const k = await this.anahtar.kimlikleDogrula(j.k);
    if (k.userId !== j.u) throw new UnauthorizedException('Yükleme jetonu bu anahtara ait değil.');
    if (k.yetki !== 'yazma') throw new ForbiddenException('Yükleme yazma anahtarı ister.');
    const ev = await this.tenant.resolve(k.userId, null, null, null);
    const istek: YazmaIstegi = { ctx: ev.context, anahtarId: k.anahtarId, yetki: k.yetki, requestId: '', yuklemeAdresi: '' };
    const { ctx } = await this.workspace(istek, j.w, ['bulk.write']);
    if (!dosya) throw new BadRequestException('Dosya gelmedi: curl komutundaki -F "dosya=@..." alanını kontrol et.');
    const tur = dosyaTuru(dosya.buffer);
    if ('hata' in tur) throw new BadRequestException(tur.hata);
    const r = await this.assets.upload(ctx, {
      clientId: j.w,
      kind: tur.kind,
      fileName: dosya.originalname || (tur.kind === 'video' ? 'video.mp4' : 'gorsel.jpg'),
      mimeType: tur.mime,
      bytes: dosya.buffer,
    });
    return {
      varlikId: r.asset.id,
      ad: r.asset.name,
      tur: r.asset.kind,
      genislik: r.asset.width,
      yukseklik: r.asset.height,
      // Aynı dosya bu workspace'te zaten varsa yeni kayıt açılmıyor ve bu SÖYLENİYOR.
      yinelenen: r.duplicate,
    };
  }

  /**
   * Aracı çalıştır. YETKİ BURADA DA: `tools/list` okuma anahtarına yazma
   * araçlarını göstermiyor, ama `tools/call` listede olmayan bir adı da
   * gönderebilir. Liste görüntü, kapı burası.
   */
  async calistir(istek: YazmaIstegi, arac: YazmaAraci, args: unknown): Promise<unknown> {
    if (istek.yetki !== 'yazma') {
      throw new ForbiddenException('Bu araç yazma anahtarı ister; bu bağlantı okuma anahtarıyla kurulmuş.');
    }
    return arac.calistir(args, this.ortam(istek));
  }

  ortam(istek: YazmaIstegi): YazmaOrtami {
    const ws = (id: string, ...izin: Permission[]) => this.workspace(istek, id, izin);
    return {
      yazmaDurumu: async (w) => {
        const { ctx, ad } = await ws(w, 'bulk.read');
        const tx = <T>(fn: (t: Prisma.TransactionClient) => Promise<T>) => this.prisma.withTenant(ctx, fn);
        const hazirlik = await this.rehber.hazirlik(ctx, w);
        const meta = await metaYazmaAcikMi(tx, w);
        const google = await googleYazmaAcikMi(tx, w);
        return { workspace: { id: w, ad }, yazmaSalterleri: { meta, google }, ...hazirlik };
      },
      rehberler: async (w) => this.rehber.listele((await ws(w, 'bulk.read')).ctx, w),
      rehberOku: async (w, id) => this.rehberAl((await ws(w, 'bulk.read')).ctx, w, id),
      rehberOlustur: async (w, kaynak) => this.rehber.olustur((await ws(w, 'bulk.write')).ctx, w, kaynak ?? undefined),
      rehberGuncelle: async (w, id, surum, degisiklikler) => {
        const { ctx } = await ws(w, 'bulk.write');
        await this.rehberAl(ctx, w, id);
        /*
         * KAYNAK `kullanici` (Ç-4): alanı model değil, kullanıcının söylediği
         * yazıyor ve yayının onay özeti bütün yapısal alanları gösteriyor.
         * Sunucu kaynakları (`workspace_profili`, `strateji`) istemciden
         * yazılamıyor; burası da istemci.
         */
        return this.rehber.guncelle(ctx, id, {
          surum,
          degisiklikler: degisiklikler.map((d) => ({ alan: d.alan, deger: d.deger, kaynak: 'kullanici' as const, ...(d.sil ? { sil: true } : {}) })),
        });
      },
      konumEsle: async (w, id) => {
        const { ctx } = await ws(w, 'bulk.write');
        await this.rehberAl(ctx, w, id);
        return this.rehber.konumlariEsle(ctx, id);
      },
      metinOner: async (w, id, varlikId, mod) => {
        const { ctx } = await ws(w, 'bulk.write');
        await this.rehberAl(ctx, w, id);
        return this.rehber.metinOner(ctx, id, { mod, ...(varlikId ? { varlikId } : {}) });
      },
      anahtarKelimeOner: async (w, id, tohumlar) => {
        const { ctx } = await ws(w, 'bulk.write');
        await this.rehberAl(ctx, w, id);
        return this.rehber.anahtarKelimeOner(ctx, id, tohumlar ?? undefined);
      },
      formSablonlari: async (w, sayfaId) => this.rehber.formSablonlari((await ws(w, 'bulk.read')).ctx, w, sayfaId),
      formlar: async (w) => {
        const satirlar = await this.forms.list((await ws(w, 'bulk.read')).ctx, w);
        return { satirlar: satirlar.map(formSatiri), toplam: satirlar.length };
      },
      formOlustur: async (w, girdi) => {
        const { ctx } = await ws(w, 'bulk.write');
        const f = await this.forms.create(ctx, girdi);
        // Engeller HEMEN söyleniyor ("doğrulama giriş anında"): yayın onayı
        // istendiğinde değil, form açılır açılmaz.
        const kontrol = await this.forms.checks(ctx, f.id);
        return { form: formSatiri(f), engeller: kontrol.blockers, uyarilar: kontrol.warnings, sonraki: 'Meta\'da açmak için form_yayinla (onaylı).' };
      },
      formOnayi: (w, id) => this.formOnayiAc(istek, w, id),
      pikseller: async (w, hesapId) => this.rehber.pikseller((await ws(w, 'bulk.read')).ctx, w, hesapId),
      youtubeVideolari: async (w, kanalId) => this.rehber.youtubeVideolari((await ws(w, 'bulk.read')).ctx, w, kanalId),
      prova: async (w, id) => {
        const { ctx } = await ws(w, 'bulk.write');
        await this.rehberAl(ctx, w, id);
        return this.rehber.prova(ctx, id);
      },
      provaOku: async (w, id) => {
        const { ctx } = await ws(w, 'bulk.read');
        await this.rehberAl(ctx, w, id);
        return this.rehber.provaOku(ctx, id);
      },
      yayinDurumu: async (w, id) => {
        const { ctx } = await ws(w, 'bulk.read');
        await this.rehberAl(ctx, w, id);
        return this.yayinDurumuKimlikli(ctx, w, id);
      },
      kampanyalar: async (w) => this.actions.canliListe((await ws(w, 'bulk.read')).ctx, w),
      yuklemeAdresi: async (w) => {
        await ws(w, 'bulk.write');
        const { jeton, bitis } = jetonUret({ userId: istek.ctx.userId, anahtarId: istek.anahtarId, workspaceId: w }, this.config.jwt.accessSecret);
        return {
          adres: istek.yuklemeAdresi,
          baslik: MCP_YUKLEME_BASLIGI,
          jeton,
          gecerlilikBitis: bitis.toISOString(),
          komut: `curl -sS -X POST "${istek.yuklemeAdresi}" -H "${MCP_YUKLEME_BASLIGI}: ${jeton}" -F "dosya=@/DOSYA/YOLU.jpg"`,
          not: 'Her dosya için komutu yolu değiştirerek tekrarla. Cevaptaki varlikId\'yi rehberin "medya" alanına yaz.',
        };
      },
      yayinOnayi: (w, id) => this.yayinOnayiAc(istek, w, id),
      varlikOnayi: (w, seviye, id, islem) => this.varlikOnayiAc(istek, w, seviye, id, islem),
      boostGonderileri: async (w, sayfaId, limit) => this.boost.gonderiler((await ws(w, 'boost.read')).ctx, w, sayfaId, limit),
      boostOnizle: async (a) => {
        const { ctx, ad } = await ws(a.workspace_id, 'boost.read');
        const h = await this.boost.hazirla(ctx, ad, a, await this.ustSinir(istek));
        return {
          onizlemeKodu: h.kod,
          ozet: h.ozet,
          uyarilar: h.uyarilar,
          sonraki: 'Hiçbir şey açılmadı. Özeti kullanıcıya göster; kurmak isterse AYNI argümanlar + onizleme_kodu ile boost_olustur (o da önce onay ister).',
        };
      },
      boostOnayi: (a, kod) => this.boostOnayiAc(istek, a, kod),
      boostlar: async (w, limit) => this.boost.liste((await ws(w, 'boost.read')).ctx, w, limit),
      boostDurumu: async (w, id) => this.boost.durum((await ws(w, 'boost.read')).ctx, w, id),
      boostYonetimOnayi: (w, id, islem, micros) => this.boostYonetimOnayiAc(istek, w, id, islem, micros),
      kitleler: async (w, hesapId) => {
        const { ctx } = await ws(w, 'client.read', ...(hesapId ? (['connection.read'] as const) : []));
        return this.boost.kitleListesi(ctx, w, hesapId);
      },
      konumAra: async (w, hesapId, q) => this.boost.konumAra((await ws(w, 'connection.read')).ctx, w, hesapId, q),
      ilgiAra: async (w, hesapId, q) => this.boost.ilgiAra((await ws(w, 'connection.read')).ctx, w, hesapId, q),
      onayla: (kod) => this.onayla(istek, kod),
      vazgec: (kod) => this.onay.vazgec(istek, kod),
      onaylar: () => this.onay.listele(istek.ctx, istek.anahtarId),
    };
  }

  /**
   * Workspace bağlamı. Şirket ve üst hesap VERİTABANINDAN: modelin
   * "sirket_id"yi doğru vermesine bırakmak, her yazma aracında bir argüman
   * daha ve yanlış verilince sessizce ev şirketine düşen bir çözüm demekti.
   */
  private async workspace(istek: YazmaIstegi, workspaceId: string, izin: Permission[]): Promise<Workspace> {
    const [w] = await this.admin.$queryRaw<Array<{ ad: string; org_id: string; manager_account_id: string | null }>>(Prisma.sql`
      SELECT c.name AS ad, c.org_id::text AS org_id, o.manager_account_id::text AS manager_account_id
        FROM clients c JOIN organizations o ON o.id = c.org_id
       WHERE c.id = ${workspaceId}::uuid`);
    if (!w) throw new AracArgumanHatasi(`Workspace bulunamadı: ${workspaceId}. Kimliği \`kapsam\` aracından al.`);
    const k = await this.tenant.resolve(istek.ctx.userId, workspaceId, w.org_id, w.manager_account_id);
    if (k.context.activeClientId !== workspaceId) {
      throw new ForbiddenException(`Bu workspace'e erişimin yok (${w.ad}).`);
    }
    assertPermissions(k.context, ...izin);
    return { ctx: k.context, ad: w.ad };
  }

  /** Rehber bu workspace'in mi: başka workspace'in rehberini bu workspace'in bağlamıyla işlemek yanlış yere yazar. */
  private async rehberAl(ctx: TenantContext, workspaceId: string, rehberId: string): Promise<RehberKaydi> {
    const r = await this.rehber.oku(ctx, rehberId);
    if (r.clientId !== workspaceId) throw new AracArgumanHatasi('Rehber bu workspace\'te değil; workspace_id ile rehber_id aynı yerden gelmeli.');
    return r;
  }

  /**
   * Yayın durumu + kurulan kampanyanın ADVETICS kimliği. `varlik_etkinlestir`
   * Advetics UUID'si istiyor ve yayın kaydı yalnız platform kimliğini
   * biliyor; köprü kampanya aynası. Ayna kampanyayı henüz görmediyse kimlik
   * `null` ve sebebi yazılı: tahmin edilmiş bir kimlikle başlatmak, yanlış
   * kampanyayı başlatmak olabilirdi.
   */
  private async yayinDurumuKimlikli(ctx: TenantContext, workspaceId: string, rehberId: string): Promise<unknown> {
    const d = await this.rehber.yayinDurumu(ctx, rehberId);
    const kimlikler = d.platformlar.map((p) => p.kampanyaKimligi).filter((x): x is string => !!x);
    const dis = kimlikler.map((k) => k.split('/').pop() ?? k);
    const satirlar = dis.length
      ? await this.prisma.withTenant(ctx, (tx) =>
          tx.$queryRaw<Array<{ id: string; external_id: string; platform: string; status: string }>>(Prisma.sql`
            SELECT id::text, external_id, platform::text AS platform, status::text AS status FROM campaigns
             WHERE client_id = ${workspaceId}::uuid AND external_id IN (${Prisma.join(dis)}) AND deleted_at IS NULL`),
        )
      : [];
    return {
      ...d,
      platformlar: d.platformlar.map((p) => {
        const k = p.kampanyaKimligi?.split('/').pop() ?? null;
        const s = k ? satirlar.find((x) => x.external_id === k && x.platform === p.platform) : undefined;
        return {
          ...p,
          adveticsKampanyaId: s?.id ?? null,
          aynadakiDurum: s?.status ?? null,
          ...(k && !s ? { kimlikNotu: 'Kampanya platformda kuruldu ama yapı taraması henüz görmedi; birkaç dakika sonra yeniden bak.' } : {}),
        };
      }),
    };
  }

  private async yayinOnayiAc(istek: YazmaIstegi, w: string, rehberId: string): Promise<unknown> {
    const { ctx, ad } = await this.workspace(istek, w, ['bulk.publish']);
    const r = await this.rehberAl(ctx, w, rehberId);
    if (r.durum === 'arsivlendi') throw new AracArgumanHatasi('Rehber arşivde; yayınlanamaz.');
    /*
     * ERKEN RET, ASIL KAPI DEĞİL: eksik ve prova burada da okunuyor ki
     * kullanıcıya yayınlanamayacak bir şey için "onaylıyor musunuz?"
     * sorulmasın. Asıl kapı `RehberService.yayinla` (onay anında yeniden).
     */
    const engeller = r.eksikler.filter((e) => e.seviye === 'engel');
    if (engeller.length) {
      throw new AracArgumanHatasi(`Yayından önce tamamlanmalı: ${engeller.map((e) => e.metin).join(' · ')}`);
    }
    const p = await this.rehber.provaOku(ctx, rehberId);
    if (!p || p.icerikOzeti !== r.icerikOzeti) {
      throw new AracArgumanHatasi(p ? 'Rehber provadan sonra değişti; önce `rehber_prova`.' : 'Prova yapılmadı; önce `rehber_prova`.');
    }
    const acik = r.alanlar.platformlar?.deger ?? { meta: false, google: false };
    for (const [platform, sonuc] of [['Meta', acik.meta ? p.meta : null], ['Google', acik.google ? p.google : null]] as const) {
      if (!sonuc) continue;
      if (sonuc.tur === 'bekliyor') throw new AracArgumanHatasi(`${platform} provası sürüyor; birkaç saniye sonra \`rehber_prova_oku\`, geçince yeniden dene.`);
      if (sonuc.tur === 'reddetti') throw new AracArgumanHatasi(`${platform} provası reddetti: ${sonuc.mesajlar.join(' ')}`);
      if (sonuc.tur === 'yapilmadi') throw new AracArgumanHatasi(`${platform} provası yapılmadı: ${sonuc.sebep}`);
    }
    const hazirlik = await this.rehber.hazirlik(ctx, w, rehberId);
    const butce = r.alanlar.butce?.deger;
    if (butce) {
      /*
       * TEK İŞLEM ÜST SINIRI (`MCP-BOOST-MIMARI.md` § 4): günlük bütçede
       * takvimin gün sayısı, bitişsiz takvimde 30 gün. Para birimi özetteki
       * kuralla aynı (önce Meta hesabı).
       */
      const takvim = r.alanlar.takvim?.deger;
      const gun = takvim?.bitis ? Math.max(1, Math.round((Date.parse(takvim.bitis) - Date.parse(takvim.baslangic)) / 86_400_000) + 1) : 30;
      const paraBirimi =
        hazirlik.hesaplar.find((x) => x.id === r.alanlar.metaHesabiId?.deger)?.paraBirimi ??
        hazirlik.googleHesaplari.find((x) => x.id === r.alanlar.googleHesabiId?.deger)?.paraBirimi ??
        'TRY';
      ustSinirDenetle(taahhut({ kip: butce.tip === 'gunluk' ? 'daily' : 'lifetime', micros: BigInt(butce.micros) }, gun), await this.ustSinir(istek), paraBirimi);
    }
    const ozet = rehberOnayOzeti(r, hazirlik, ad);
    return this.onayAc(istek, ctx, 'rehber_yayinla', { workspace_id: w, rehber_id: rehberId, icerik_ozeti: r.icerikOzeti }, ozet);
  }

  /** Form bu workspace'in mi: rehberde olduğu gibi, başka workspace'in formu bu bağlamla yayınlanmasın. */
  private async formAl(ctx: TenantContext, workspaceId: string, formId: string): Promise<LeadFormRecord> {
    const f = await this.forms.get(ctx, formId);
    if (f.clientId !== workspaceId) throw new AracArgumanHatasi('Form bu workspace\'te değil; workspace_id ile form_id aynı yerden gelmeli.');
    return f;
  }

  private async formOnayiAc(istek: YazmaIstegi, w: string, formId: string): Promise<unknown> {
    const { ctx, ad } = await this.workspace(istek, w, ['bulk.publish']);
    const f = await this.formAl(ctx, w, formId);
    // ERKEN RET, ASIL KAPI DEĞİL: asıl kapı `FormPublisherService.publish`
    // (onay anında yeniden). Yayınlanamayacak bir form için onay sorulmasın.
    const { blockers } = await this.forms.checks(ctx, formId);
    if (blockers.length) throw new AracArgumanHatasi(`Form yayınlanamaz: ${blockers.join(' ')}`);
    const ozet = formOnayOzeti(f, ad);
    return this.onayAc(istek, ctx, 'form_yayinla', { workspace_id: w, form_id: formId, icerik_ozeti: formIcerikOzeti(f) }, ozet);
  }

  private async varlikOnayiAc(istek: YazmaIstegi, w: string, seviye: VarlikSeviyesi, id: string, islem: VarlikIslemi): Promise<unknown> {
    const { ctx, ad } = await this.workspace(istek, w, ['budget.write']);
    const v = await this.actions.onizle(ctx, { seviye, id }, eylemOf(islem));
    if (v.clientId !== w) throw new AracArgumanHatasi('Bu varlık bu workspace\'te değil.');
    if (islem.tur === 'butce') {
      // ÜST SINIR: toplamda tutar, günlükte 30 gün (varlığın bitişi bilinmiyor).
      ustSinirDenetle(taahhut({ kip: islem.tip === 'gunluk' ? 'daily' : 'lifetime', micros: islem.micros }, 30), await this.ustSinir(istek), v.currency);
    }
    const ozet = varlikOnayOzeti(seviye, v, islem, ad);
    const tur: McpOnayIslemi = islem.tur === 'durdur' ? 'varlik_durdur' : islem.tur === 'etkinlestir' ? 'varlik_etkinlestir' : 'butce_degistir';
    const hedef: Record<string, unknown> = { workspace_id: w, seviye, varlik_id: id };
    if (islem.tur === 'butce') Object.assign(hedef, { tutar_micros: islem.micros.toString(), butce_tipi: islem.tip });
    return this.onayAc(istek, ctx, tur, hedef, ozet);
  }

  /**
   * BOOST ONAYI. Önizleme ŞART: `onizleme_kodu` aynı argümanlardan yeniden
   * hesaplanıp karşılaştırılıyor. Tutmazsa kullanıcının gördüğü özet bu
   * isteğin özeti değil (argüman, ön ayar ya da kayıtlı kitle değişti).
   */
  private async boostOnayiAc(istek: YazmaIstegi, a: BoostArgumani, kod: string): Promise<unknown> {
    const { ctx, ad } = await this.workspace(istek, a.workspace_id, ['boost.approve']);
    const h = await this.boost.hazirla(ctx, ad, a, await this.ustSinir(istek));
    if (h.kod !== kod) {
      throw new AracArgumanHatasi('onizleme_kodu bu argümanlarla yapılan önizlemenin kodu değil (ya da arada ön ayar / kayıtlı kitle değişti). Önce aynı argümanlarla boost_onizle, özeti kullanıcıya göster.');
    }
    return this.onayAc(istek, ctx, 'boost_olustur', { workspace_id: a.workspace_id, arguman: a, onizleme_kodu: kod }, h.ozet);
  }

  private async boostYonetimOnayiAc(istek: YazmaIstegi, w: string, boostId: string, islem: BoostYonetimIslemi, micros: bigint | null): Promise<unknown> {
    const { ctx, ad } = await this.workspace(istek, w, ['boost.approve']);
    const ozet = await this.boost.yonetimHazirla(ctx, w, ad, boostId, islem, micros, islem === 'butce' ? await this.ustSinir(istek) : null);
    const tur: McpOnayIslemi = islem === 'baslat' ? 'boost_baslat' : islem === 'duraklat' ? 'boost_duraklat' : 'boost_butce';
    return this.onayAc(istek, ctx, tur, { workspace_id: w, boost_id: boostId, ...(micros !== null ? { tutar_micros: micros.toString() } : {}) }, ozet);
  }

  /**
   * Onay satırı + WORKSPACE denetim kaydı (kim, ne zaman, hangi hesap, tutar:
   * özetin kendisi) + model için tek biçim.
   */
  private async onayAc(istek: YazmaIstegi, ws: TenantContext, tur: McpOnayIslemi, hedef: Record<string, unknown>, ozet: string[]): Promise<unknown> {
    const o = await this.onay.ac(istek, tur, hedef, ozet);
    await this.onay.isKaydi(ws, 'mcp.islem_onerildi', o.id, { islem: tur, ozet });
    return this.onayCevabi(o);
  }

  /**
   * Anahtarın tek işlem sınırı HER İŞLEMDE satırdan (yetki gibi): önbellek,
   * sınırı düşürülmüş bir anahtarı eski sınırla çalıştırırdı.
   */
  private async ustSinir(istek: YazmaIstegi): Promise<bigint | null> {
    const k = await this.admin.okumaAnahtari.findUnique({ where: { id: istek.anahtarId }, select: { yetki: true, tekIslemUstSiniriMicros: true } });
    if (!k) throw new UnauthorizedException('Anahtar bulunamadı.');
    return tekIslemUstSiniri(k);
  }

  /** Model için TEK biçim: kod, özet ve ne yapacağı. */
  private onayCevabi(o: { id: string; ozet: string[]; bitis: string }): unknown {
    return {
      onayGerekli: true,
      onayKodu: o.id,
      ozet: o.ozet,
      gecerlilikBitis: o.bitis,
      talimat: `Bu özeti kullanıcıya AYNEN göster ve "Onaylıyor musunuz?" diye sor. Yalnız açıkça evet derse onayla(onay_kodu) çağır; hayır derse vazgec. Kod ${MCP_ONAY_SURESI_DK} dakika geçerli. Henüz HİÇBİR ŞEY yapılmadı.`,
    };
  }

  /**
   * UYGULA. Onay satırı önce ALINIYOR (tek seferde `uygulaniyor`), sonra iş
   * yapılıyor, sonra sonuç yazılıyor. İş fırlatırsa satır `basarisiz` olur
   * ve hata modele gider; satır `uygulaniyor` kalırsa (süreç düştü) ikinci
   * `onayla` onu yeniden çalıştırmaz: platformda yarım kalmış bir yayını
   * körlemesine tekrarlamak ikinci kampanya açardı.
   */
  private async onayla(istek: YazmaIstegi, kod: string): Promise<unknown> {
    const a = await this.onay.al(istek, kod);
    try {
      const { basarili, sonuc, hata } = await this.uygula(istek, a);
      await this.onay.bitir(istek, a.id, basarili ? 'uygulandi' : 'basarisiz', sonuc, hata);
      await this.workspaceKaydi(istek, a, basarili ? 'mcp.islem_uygulandi' : 'mcp.islem_basarisiz', { sonuc, hata });
      return { durum: basarili ? 'uygulandi' : 'basarisiz', ...(hata ? { hata } : {}), sonuc };
    } catch (e) {
      const mesaj = e instanceof Error ? e.message : String(e);
      await this.onay.bitir(istek, a.id, 'basarisiz', null, mesaj.slice(0, 2000));
      await this.workspaceKaydi(istek, a, 'mcp.islem_basarisiz', { hata: mesaj.slice(0, 2000) });
      throw e;
    }
  }

  /**
   * Sonucun workspace denetim kaydı. Kendi hatası İŞLEMİ DÜŞÜRMÜYOR (işlem
   * platformda yapıldı; sonucu modelden saklamak daha kötü) ama yutulmuyor
   * da: ev bağlamındaki `mcp.uygulandi` kaydı zaten yazıldı, bu ek kayıt.
   */
  private async workspaceKaydi(
    istek: YazmaIstegi,
    a: AlinanOnay,
    action: 'mcp.islem_uygulandi' | 'mcp.islem_basarisiz',
    ek: Record<string, unknown>,
  ): Promise<void> {
    const w = (a.hedef as Record<string, unknown>).workspace_id;
    if (typeof w !== 'string') return;
    try {
      const { ctx } = await this.workspace(istek, w, []);
      await this.onay.isKaydi(ctx, action, a.id, { islem: a.islem, ozet: a.ozet, ...ek });
    } catch (e) {
      logger.error(`MCP workspace denetim kaydı yazılamadı (onay ${a.id}): ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  private async uygula(istek: YazmaIstegi, a: AlinanOnay): Promise<{ basarili: boolean; sonuc: unknown; hata: string | null }> {
    const h = a.hedef as Record<string, string>;
    if (a.islem === 'rehber_yayinla') {
      // İzin ve bağlam onay ANINDA yeniden: 15 dakikada rol değişmiş olabilir.
      const { ctx } = await this.workspace(istek, h.workspace_id!, ['bulk.publish']);
      const d = await this.rehber.yayinla(ctx, h.rehber_id!, h.icerik_ozeti!, { hepsiKapali: true });
      if (d.uyum?.tur === 'durdu') {
        return { basarili: false, sonuc: d, hata: `Uyum denetimi durdurdu: ${d.uyum.bulgular.map((b) => b.metin).join(' · ')}` };
      }
      const baslayan = d.platformlar.filter((p) => p.yayinId);
      const duran = d.platformlar.filter((p) => !p.yayinId && p.sebep);
      return {
        basarili: baslayan.length > 0,
        sonuc: { ...d, not: 'Kurulum kuyrukta ilerliyor; durumu rehber_yayin_durumu ile izle. Platformda DURAKLATILMIŞ kalacak.' },
        hata: duran.length ? duran.map((p) => `${p.platform}: ${p.sebep}`).join(' · ') : null,
      };
    }
    if (a.islem === 'form_yayinla') {
      const { ctx } = await this.workspace(istek, h.workspace_id!, ['bulk.publish']);
      const f = await this.formAl(ctx, h.workspace_id!, h.form_id!);
      /*
       * ONAYLANAN İÇERİK Mİ: kullanıcı özeti gördükten sonra taslak panelden
       * değiştiyse Meta'ya HİÇ gidilmiyor. Form silinemediği için
       * onaylanmamış bir metni açmanın geri dönüşü yok.
       */
      if (formIcerikOzeti(f) !== h.icerik_ozeti) {
        return { basarili: false, sonuc: null, hata: 'Form onaydan sonra değişti; Meta\'ya gidilmedi. form_yayinla ile yeni özet al.' };
      }
      // `belirsizOnayi` YOK: belirsiz satırı açmak Meta'yı elle kontrol etmeyi
      // istiyor ve o karar panelin Formlar ekranında.
      const r = await this.formYayinci.publish(ctx, h.form_id!);
      /*
       * GERİ OKUMA UYUŞMADIYSA "uygulandı" DEĞİL: form Meta'da açık ama KVKK
       * kutusu, dil ya da niyet adımı gönderilenden farklı ya da okunamadı.
       * Kimlik yine dönüyor; form reklama bağlanmadan önce kullanıcı bakmalı.
       */
      const ok = r.status === 'published' && !!r.externalFormId && !r.readbackWarning;
      return {
        basarili: ok,
        sonuc: { metaFormKimligi: r.externalFormId, durum: r.status, not: r.externalFormId ? 'Bu kimliği rehberin formSablonuId alanına yaz.' : null },
        hata: ok ? null : (r.readbackWarning ?? r.error ?? `Form yayında görünmüyor (durum: ${r.status}).`),
      };
    }
    if (a.islem === 'boost_olustur') {
      const hb = a.hedef as { workspace_id: string; arguman: BoostArgumani; onizleme_kodu: string };
      const { ctx, ad } = await this.workspace(istek, hb.workspace_id, ['boost.approve']);
      /*
       * HAZIRLIK ONAY ANINDA YENİDEN ve kod yine karşılaştırılıyor: 15
       * dakikada kayıtlı kitle ya da ön ayar değişmişse kullanıcının
       * onayladığı kurulum bu değil; Meta'ya HİÇ gidilmiyor.
       */
      const hz = await this.boost.hazirla(ctx, ad, hb.arguman, await this.ustSinir(istek));
      if (hz.kod !== hb.onizleme_kodu) {
        return { basarili: false, sonuc: null, hata: 'Onaydan sonra kitle, ön ayar ya da gönderi değişti; Meta\'ya gidilmedi. boost_onizle ile yeni özet al.' };
      }
      return this.boost.kur(ctx, hz, hb.arguman);
    }
    if (a.islem === 'boost_baslat' || a.islem === 'boost_duraklat' || a.islem === 'boost_butce') {
      const { ctx } = await this.workspace(istek, h.workspace_id!, ['boost.approve']);
      const islem: BoostYonetimIslemi = a.islem === 'boost_baslat' ? 'baslat' : a.islem === 'boost_duraklat' ? 'duraklat' : 'butce';
      return this.boost.yonetimUygula(ctx, h.workspace_id!, h.boost_id!, islem, h.tutar_micros ? BigInt(h.tutar_micros) : null, { yol: 'mcp', ref: a.id });
    }
    const { ctx } = await this.workspace(istek, h.workspace_id!, ['budget.write']);
    const islem: VarlikIslemi =
      a.islem === 'varlik_durdur'
        ? { tur: 'durdur' }
        : a.islem === 'varlik_etkinlestir'
          ? { tur: 'etkinlestir' }
          : { tur: 'butce', micros: BigInt(h.tutar_micros!), tip: h.butce_tipi === 'toplam' ? 'toplam' : 'gunluk' };
    const s = await this.actions.uygula(ctx, { seviye: h.seviye as VarlikSeviyesi, id: h.varlik_id! }, eylemOf(islem), {
      iz: { yol: 'mcp', ref: a.id },
    });
    /*
     * "UYUŞMADI" BAŞARI DEĞİL: platform isteği kabul etti ama geri okunan
     * değer istenen değil (ya da okunamadı). Uygulandı demek yalan olurdu
     * ("200 döndü doğrulama değil", CLAUDE.md).
     */
    const ok = s.dogrulama === 'dogrulandi';
    return {
      basarili: ok,
      sonuc: { varlikAdi: s.varlikAdi, platform: s.platform, dogrulama: s.dogrulama, platformDegeri: s.platformDegeri },
      hata: ok ? null : `Platformdan geri okunan değer istenenle uyuşmadı: ${s.platformDegeri}`,
    };
  }
}

function eylemOf(islem: VarlikIslemi): UygulamaEylemi {
  if (islem.tur === 'durdur') return { type: 'pause' };
  if (islem.tur === 'etkinlestir') return { type: 'resume' };
  return { type: 'set_budget', amountMicros: islem.micros, budgetMode: islem.tip === 'gunluk' ? 'daily' : 'lifetime' };
}

/** Modelin formu tanıması için yeten satır; panel kaydının tamamı gereksiz uzun. */
function formSatiri(f: LeadFormRecord) {
  return {
    id: f.id,
    ad: f.name,
    durum: f.status,
    metaFormKimligi: f.externalFormId,
    sayfa: f.socialProfileName,
    sorular: [...f.prefillQuestions, ...f.customQuestions.map((q) => q.label)],
    gizlilikAdresi: f.privacyPolicyUrl,
    surum: f.version,
    hata: f.error,
    geriOkumaUyarisi: f.readbackWarning,
  };
}
