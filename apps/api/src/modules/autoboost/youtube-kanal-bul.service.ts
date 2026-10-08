import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  TenantContext,
  YoutubeKanalOnerileri,
  YoutubeKanalOnerisi,
  YoutubeOneriKaynagi,
} from '@advetics/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { ProviderRegistry } from '../connections/provider.registry';
import type { GoogleProvider } from '../connections/providers/google.provider';
import { TokenVaultService } from '../connections/token-vault.service';
import { sayfaHtmlGetir } from '../tenancy/site-oku';
import { YouTubeApiService, type YouTubeKanalDetayi } from './youtube-api.service';
import { youtubeIzleri } from './youtube-site-baglantilari';

/** Aynı arama bu kadar süre tekrar YouTube'a gitmiyor — tek arama 100 kota birimi. */
export const ARAMA_ONBELLEK_MS = 24 * 60 * 60 * 1000;
/** Kişi başına saatlik arama sınırı. Günlük kota (10.000) ~100 arama; bir kişi bitirmesin. */
export const SAATLIK_ARAMA_SINIRI = 20;
/** Bir workspace'te sorulan Google Ads hesabı sayısı (her biri bir sorgu). */
const EN_COK_ADS_HESABI = 3;

type Kanit = { tur: YoutubeOneriKaynagi; aciklama: string };

/**
 * ═══ YOUTUBE KANALINI BUL ═══
 *
 * Kullanıcının isteği: "şirketin ismini yazsam kanalları gösterse ya da
 * kendisi bulsa, ben bu deyip onaylasam". Kanal eklemek yalnızca adres
 * yapıştırmaktı ve adres çoğu zaman elde yoktu.
 *
 * İKİ AYRI UÇ, İKİ AYRI MALİYET:
 *   · `oneriler` — site + Google Ads geçmişi. Ucuz (birkaç kota birimi),
 *     kanıtı güçlü. Pencere açılınca kendiliğinden koşuyor.
 *   · `ara` — isimle YouTube araması. 100 birim; önbellekli, sınırlı ve
 *     yalnızca kullanıcı isteyince.
 * Tek uçta birleştirmek, ucuz yolun her açılışta pahalı yolu da
 * tetiklemesi demekti.
 *
 * HİÇBİR ŞEY YAZMIYOR. Ekleme mevcut uçlardan geçiyor (havuza ekle, sonra
 * ata): yeni bir yazma yolu, kanal-workspace atamasının iki dersini
 * (havuzun iki sahibi, şirket kapsamı) yeniden öğrenmek olurdu.
 */
@Injectable()
export class YoutubeKanalBulService {
  private readonly logger = new Logger(YoutubeKanalBulService.name);
  /** Süreç içi önbellek — API tek süreç; yeniden başlatma yalnızca bir arama maliyeti. */
  private readonly onbellek = new Map<string, { zaman: number; ids: string[] }>();
  private readonly aramaSayaci = new Map<string, number[]>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly youtube: YouTubeApiService,
    private readonly providers: ProviderRegistry,
    private readonly vault: TokenVaultService,
  ) {}

  async oneriler(ctx: TenantContext, clientId: string): Promise<YoutubeKanalOnerileri> {
    const scoped: TenantContext = { ...ctx, activeClientId: null };
    const notlar: string[] = [];
    const kanitlar = new Map<string, Kanit[]>();
    const ekle = (id: string, k: Kanit): void => {
      const liste = kanitlar.get(id) ?? [];
      if (!liste.some((x) => x.tur === k.tur)) liste.push(k);
      kanitlar.set(id, liste);
    };

    const [ws] = await this.prisma.withTenant(scoped, (tx) =>
      tx.$queryRaw<Array<{ name: string; website: string | null }>>(Prisma.sql`
        SELECT name, website FROM clients WHERE id = ${clientId}::uuid
      `),
    );
    if (!ws) throw new BadRequestException('Workspace bulunamadı.');

    await this.sitedenBul(ws.website, ekle, notlar);
    await this.reklamlardanBul(scoped, clientId, ekle, notlar);

    if (kanitlar.size === 0) {
      notlar.push(`Kanıtlı öneri bulunamadı. "${ws.name}" adıyla YouTube'da arayabilirsin.`);
    }
    return { oneriler: await this.kartlar(scoped, clientId, kanitlar, notlar), notlar };
  }

  async ara(ctx: TenantContext, q: string, clientId: string | null): Promise<YoutubeKanalOnerileri> {
    const scoped: TenantContext = { ...ctx, activeClientId: null };
    const notlar: string[] = [];
    const anahtar = q.trim().toLocaleLowerCase('tr-TR');
    const simdi = Date.now();
    const onceki = this.onbellek.get(anahtar);
    let ids: string[];
    if (onceki && simdi - onceki.zaman < ARAMA_ONBELLEK_MS) {
      ids = onceki.ids;
      notlar.push('Bu arama son 24 saatte yapılmıştı; sonuç önbellekten geldi, kota harcanmadı.');
    } else {
      /*
       * SINIR ARAMA BAŞINA, ÖNBELLEK İSABETİ SAYILMIYOR. Sınır kotayı
       * korumak için var ve önbellekten gelen sonuç kota harcamıyor.
       */
      const son = (this.aramaSayaci.get(ctx.userId) ?? []).filter((t) => simdi - t < 3_600_000);
      if (son.length >= SAATLIK_ARAMA_SINIRI) {
        throw new BadRequestException(
          `Saatte en çok ${SAATLIK_ARAMA_SINIRI} YouTube araması yapılabiliyor (YouTube günlük kotasını koruyor). Biraz sonra dene ya da kanal adresini yapıştır.`,
        );
      }
      const r = await this.youtube.kanalAra(q.trim());
      if (r.durum === 'hata') throw new BadRequestException(r.message);
      son.push(simdi);
      this.aramaSayaci.set(ctx.userId, son);
      ids = r.ids;
      this.onbellek.set(anahtar, { zaman: simdi, ids });
      notlar.push('Bu arama YouTube günlük kotasından 100 birim harcadı.');
    }
    const kanitlar = new Map<string, Kanit[]>(
      ids.map((id) => [id, [{ tur: 'arama', aciklama: `"${q.trim()}" aramasında çıktı (isim benzerliği kanıt değil)` }]]),
    );
    if (ids.length === 0) notlar.push(`"${q.trim()}" için YouTube'da kanal bulunamadı.`);
    return { oneriler: await this.kartlar(scoped, clientId, kanitlar, notlar), notlar };
  }

  /** Site: kanal bağlantıları ve gömülü videolar. */
  private async sitedenBul(
    website: string | null,
    ekle: (id: string, k: Kanit) => void,
    notlar: string[],
  ): Promise<void> {
    if (!website) {
      notlar.push('Workspace’in web sitesi girilmemiş; siteye bakılamadı (Marka Merkezi › Workspace ayarları).');
      return;
    }
    const adres = /^https?:\/\//i.test(website) ? website.replace(/^http:/i, 'https:') : `https://${website}`;
    const sayfa = await sayfaHtmlGetir(adres);
    if (!sayfa.ok) {
      notlar.push(`Site okunamadı: ${sayfa.sebep}`);
      return;
    }
    const iz = youtubeIzleri(sayfa.html);
    const host = new URL(sayfa.adres).hostname;

    for (const id of iz.kanalKimlikleri) ekle(id, { tur: 'site', aciklama: `${host} sitesinde bu kanalın bağlantısı var` });
    for (const h of iz.tanitcilar) {
      const r = await this.youtube.getChannel({ kind: 'handle', handle: h });
      if (r.durum === 'bulundu') ekle(r.kanal.channelId, { tur: 'site', aciklama: `${host} sitesinde @${h} bağlantısı var` });
      else if (r.durum === 'hata') notlar.push(`Sitedeki @${h} çözülemedi: ${r.message}`);
      else notlar.push(`Sitedeki @${h} bağlantısı YouTube'da bulunamadı (kanal kapanmış olabilir).`);
    }
    for (const ad of iz.kullaniciAdlari) {
      const r = await this.youtube.kanalKullaniciAdiyla(ad);
      if (r.durum === 'bulundu') ekle(r.channelId, { tur: 'site', aciklama: `${host} sitesinde youtube.com/user/${ad} bağlantısı var` });
      else if (r.durum === 'hata') notlar.push(`Sitedeki /user/${ad} çözülemedi: ${r.message}`);
    }
    for (const ad of iz.ozelAdlar) {
      // SESSİZ ATLAMA YOK: bağlantı var ama API'den çözülemiyor; kullanıcı bilsin.
      notlar.push(`Sitede eski biçim kanal bağlantısı var (youtube.com/c/${ad}); otomatik çözülemiyor, adıyla arayabilirsin.`);
    }
    if (iz.videoKimlikleri.length > 0) {
      const r = await this.youtube.videoKanallari(iz.videoKimlikleri);
      if (r.durum === 'hata') notlar.push(`Sitedeki videoların kanalı okunamadı: ${r.message}`);
      else {
        const sayac = new Map<string, number>();
        for (const kanal of r.kanallar.values()) sayac.set(kanal, (sayac.get(kanal) ?? 0) + 1);
        for (const [kanal, n] of sayac) ekle(kanal, { tur: 'site', aciklama: `${host} sitesinde bu kanalın ${n} videosu gömülü` });
      }
    }
    const toplam = iz.kanalKimlikleri.length + iz.tanitcilar.length + iz.kullaniciAdlari.length + iz.ozelAdlar.length + iz.videoKimlikleri.length;
    if (toplam === 0) notlar.push(`${host} ana sayfasında YouTube bağlantısı ya da videosu yok.`);
  }

  /** Google Ads: workspace'in hesaplarında reklamı yapılmış videolar. */
  private async reklamlardanBul(
    scoped: TenantContext,
    clientId: string,
    ekle: (id: string, k: Kanit) => void,
    notlar: string[],
  ): Promise<void> {
    const hesaplar = await this.prisma.withTenant(scoped, (tx) =>
      tx.$queryRaw<Array<{ name: string; external_id: string; connection_id: string; manager_external_id: string | null }>>(Prisma.sql`
        SELECT a.name, a.external_id, a.connection_id::text AS connection_id, a.manager_external_id
          FROM ad_accounts a
         WHERE a.client_id = ${clientId}::uuid AND a.platform = 'google'
         ORDER BY a.name
         LIMIT ${EN_COK_ADS_HESABI}
      `),
    );
    if (hesaplar.length === 0) {
      notlar.push('Workspace’e atanmış Google Ads hesabı yok; reklam geçmişine bakılamadı.');
      return;
    }
    /*
     * BAĞLANTI DURUMUNA JOIN İLE BAKILMIYOR: platform_connections RLS'li ve
     * iç birleşim hesabı sessizce elerdi. Pasif bağlantı token kasasında
     * hata veriyor ve o hata aşağıda nota yazılıyor.
     */
    const saglayici = this.providers.get('google');
    const google = saglayici as unknown as Partial<Pick<GoogleProvider, 'reklamVideoKimlikleri'>>;
    if (typeof google.reklamVideoKimlikleri !== 'function') {
      notlar.push('Google sağlayıcısı reklam videosu sorgusunu desteklemiyor.');
      return;
    }

    const videoHesap = new Map<string, string>();
    for (const h of hesaplar) {
      try {
        const token = await this.vault.getAccessToken(h.connection_id, saglayici);
        const ids = await google.reklamVideoKimlikleri(token, h.external_id, h.manager_external_id ?? undefined);
        for (const v of ids) if (!videoHesap.has(v)) videoHesap.set(v, h.name);
      } catch (err) {
        notlar.push(`${h.name} Google Ads hesabı sorgulanamadı: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    if (videoHesap.size === 0) {
      notlar.push('Google Ads hesabında reklamı yapılmış YouTube videosu yok.');
      return;
    }
    const r = await this.youtube.videoKanallari([...videoHesap.keys()]);
    if (r.durum === 'hata') {
      notlar.push(`Reklam videolarının kanalı okunamadı: ${r.message}`);
      return;
    }
    const sayac = new Map<string, number>();
    for (const kanal of r.kanallar.values()) sayac.set(kanal, (sayac.get(kanal) ?? 0) + 1);
    for (const [kanal, n] of sayac) {
      ekle(kanal, { tur: 'google_ads', aciklama: `Google Ads hesabında bu kanalın ${n} videosu reklam olarak eklenmiş` });
    }
    const kayip = videoHesap.size - r.kanallar.size;
    if (kayip > 0) notlar.push(`${kayip} reklam videosu YouTube'da bulunamadı (silinmiş ya da gizli).`);
  }

  /** Kanıtları karta çevir: ayrıntı (1 birim) + panelde zaten var mı. */
  private async kartlar(
    scoped: TenantContext,
    clientId: string | null,
    kanitlar: Map<string, Kanit[]>,
    notlar: string[],
  ): Promise<YoutubeKanalOnerisi[]> {
    if (kanitlar.size === 0) return [];
    const ids = [...kanitlar.keys()].slice(0, 50);
    const d = await this.youtube.kanalDetaylari(ids);
    if (d.durum === 'hata') {
      notlar.push(`Kanal ayrıntıları okunamadı: ${d.message}`);
      return [];
    }
    const mevcutlar = await this.prisma.withTenant(scoped, (tx) =>
      tx.$queryRaw<Array<{ id: string; external_id: string; client_id: string | null; client_name: string | null }>>(Prisma.sql`
        SELECT sp.id::text AS id, sp.external_id, sp.client_id::text AS client_id, c.name AS client_name
          FROM social_profiles sp
          LEFT JOIN clients c ON c.id = sp.client_id
         WHERE sp.profile_type = 'youtube_channel' AND sp.external_id = ANY(${ids}::text[])
      `),
    );
    const SIRA: Record<YoutubeOneriKaynagi, number> = { site: 0, google_ads: 1, arama: 2 };
    const kartlar = d.kanallar.map((k: YouTubeKanalDetayi): YoutubeKanalOnerisi => {
      const m = mevcutlar.find((x) => x.external_id === k.channelId);
      return {
        ...k,
        kaynaklar: [...(kanitlar.get(k.channelId) ?? [])].sort((a, b) => SIRA[a.tur] - SIRA[b.tur]),
        mevcut: !m
          ? null
          : m.client_id === null
            ? { durum: 'havuzda', socialProfileId: m.id }
            : m.client_id === clientId
              ? { durum: 'bu_workspacete', socialProfileId: m.id }
              : { durum: 'baska_workspacete', socialProfileId: m.id, workspaceAdi: m.client_name },
      };
    });
    /*
     * SIRA: en güçlü kanıt önce (site, sonra reklam, sonra arama), sonra
     * kanıt sayısı, sonra abone. Arama sonuçları YouTube'un sırasını
     * koruyor (alaka) — aboneye göre dizmek büyük ama ilgisiz kanalı öne alırdı.
     */
    const aramaSirasi = new Map(ids.map((id, i) => [id, i]));
    return kartlar.sort((a, b) => {
      const ka = SIRA[a.kaynaklar[0]?.tur ?? 'arama'];
      const kb = SIRA[b.kaynaklar[0]?.tur ?? 'arama'];
      if (ka !== kb) return ka - kb;
      if (a.kaynaklar.length !== b.kaynaklar.length) return b.kaynaklar.length - a.kaynaklar.length;
      return (aramaSirasi.get(a.channelId) ?? 0) - (aramaSirasi.get(b.channelId) ?? 0);
    });
  }
}
