import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  GERI_BESLEME_OLAY_DURUM_ADI,
  META_CRM,
  geriBeslemeGecisi,
  metaCrmOlayi,
  metaGovdeMetni,
  metaLeadIdGecerli,
  metaPenceredeMi,
  metaYanitSinifi,
  partiSirala,
  partiyiYarila,
  sonrakiDenemeMs,
  type GeriBeslemeAsamasi,
  type GeriBeslemeOlayDurumu,
} from '@advetics/shared';
import { PrismaAdminService } from '../../prisma/prisma-admin.service';
import { QuotaGuardService } from '../../queue/quota-guard.service';
import { PlatformApiError } from '../connections/provider.types';
import { ProviderRegistry } from '../connections/provider.registry';
import { TokenVaultService } from '../connections/token-vault.service';
import { GB_PLATFORM } from './lead-asama';
import { MetaCrmIstemcisi, type MetaGonderimSonucu } from './meta-crm-istemcisi';

/**
 * ═══ GERİ BESLEME GÖNDERİM İŞİ (`lead_feedback_send`, MIMARI § 5.4) ═══
 *
 * Workspace başına: vadesi gelmiş aşama satırlarını Meta'ya gönderir.
 *
 * SIRA, HER BİRİ CANLIDA PAHALI BİR HATANIN KARŞILIĞI:
 *
 *   1. ÖN KOŞUL ÇAĞRIDAN ÖNCE (sıfır maliyetli ret): ayar açık, veri kümesi
 *      var, bağlantı geçerli. Değilse platform çağrısı YOK, satırlara
 *      dokunulmaz ve sebep notta (CLAUDE.md "bağımlı iş, bağlı olduğu işin
 *      kotasını yiyebilir — önce kontrol, sonra çağrı").
 *   2. 7 GÜN VE KİMLİK KONTROLÜ PARTİYE GİRMEDEN: tek eski ya da geçersiz
 *      olay bütün partiyi düşürüyor; eski bir ham lead her 5 dakikada kalan
 *      49 olayı da `vazgecildi`ye sürüklerdi.
 *   3. ÇAĞRI TRANSACTION DIŞINDA, sonuç ayrı deyimlerle (CLAUDE.md "platform
 *      çağrısı transaction'ın içinde olamaz").
 *   4. OLAY HATASI → YARILAMA, tek olaya inince `reddedildi`. Durma koşulu
 *      UZUNLUK (`partiyiYarila`).
 *   5. AYAR HATASI (token, izin, dataset erişimi) olay durumu DEĞİL:
 *      satırlar `bekliyor` kalır, deneme ARTMAZ, ayar `hata`ya düşer ve işin
 *      kalanı koşmaz (aynı token aynı hatayı verir). Aksi hâlde izin
 *      düzeldiğinde bütün kuyruğu elle yeniden denetmek gerekirdi.
 *   6. "200 DÖNDÜ" KABUL DEĞİL: `events_received` gönderilenle aynı değilse
 *      `uyusmazlik` = geçici, not düşülür.
 */

/** Bir koşuda en çok bu kadar satır. Fazlası bir sonraki 5 dakikalık tura. */
const KOSU_SINIRI = 200;

/**
 * Kota katmanı. Sonuç 7 gün içinde gönderilebiliyor ve 5 dakikalık bir
 * gecikme zararsız; çekirdek senkronizasyonun (%90) önünde kesilmeli ama
 * kırılım gibi en önce kesilenlerden (%60) de olmamalı. M-10: CAPI çağrısının
 * hesap kotasına gerçek etkisi ÖLÇÜLMEDİ.
 */
const KOTA_KATMANI = 'insights_backfill' as const;

interface Satir {
  id: string;
  lead_id: string;
  asama: GeriBeslemeAsamasi;
  durum: GeriBeslemeOlayDurumu;
  deneme: number;
  olay_kimligi: string;
  olay_zamani: Date;
  external_lead_id: string;
}

/** Parti işlenirken ayar hatası görüldü: işin kalanı koşmaz. */
class AyarHatasi extends Error {}

interface Kosu {
  datasetId: string;
  token: string;
  kotaAnahtari: string;
  clientId: string;
  simdi: Date;
  cagri: number;
  dagilim: Record<string, number>;
}

@Injectable()
export class GeriBeslemeGonderimService {
  private readonly logger = new Logger(GeriBeslemeGonderimService.name);
  /** Testte sahte cevap için değiştirilebiliyor; üretimde tek örnek. */
  istemci = new MetaCrmIstemcisi();

  constructor(
    private readonly db: PrismaAdminService,
    private readonly kasa: TokenVaultService,
    private readonly saglayicilar: ProviderRegistry,
    private readonly quota: QuotaGuardService,
  ) {}

  /**
   * Süpürme: vadesi gelmiş satırı olan ve ayarı AÇIK workspace'ler. Ayar
   * kapalı bir workspace'in satırı zaten iptal ediliyor; yine de süzgeç
   * burada da var ki kapalı workspace için 5 dakikada bir boş iş açılmasın.
   */
  async bekleyenWorkspaceler(simdi = new Date()): Promise<string[]> {
    const r = await this.db.$queryRaw<Array<{ client_id: string }>>(Prisma.sql`
      SELECT DISTINCT o.client_id::text AS client_id
        FROM geri_besleme_olaylari o
        JOIN geri_besleme_ayarlari a ON a.client_id = o.client_id AND a.platform = o.platform AND a.etkin
       WHERE o.durum IN ('bekliyor', 'basarisiz') AND o.sonraki_deneme <= ${simdi}::timestamptz
    `);
    return r.map((x) => x.client_id);
  }

  async calistir(clientId: string, simdi = new Date()): Promise<{ rows: number; apiCalls: number; note: string }> {
    // ── 1. Ön koşul: platform çağrısı YOK ─────────────────────────────────
    const [ayar] = await this.db.$queryRaw<
      Array<{ etkin: boolean; dataset_id: string | null; baglanti_id: string | null; baglanti_durumu: string | null }>
    >(Prisma.sql`
      SELECT a.etkin, a.dataset_id, a.baglanti_id::text AS baglanti_id, pc.status::text AS baglanti_durumu
        FROM geri_besleme_ayarlari a
        LEFT JOIN platform_connections pc ON pc.id = a.baglanti_id
       WHERE a.client_id = ${clientId}::uuid AND a.platform = ${GB_PLATFORM}
    `);
    if (!ayar?.etkin) return { rows: 0, apiCalls: 0, note: 'gönderilmedi: Meta’ya bildirim kapalı' };
    if (!ayar.dataset_id) return { rows: 0, apiCalls: 0, note: 'gönderilmedi: veri kümesi seçilmemiş' };
    if (!ayar.baglanti_id || !ayar.baglanti_durumu) {
      return { rows: 0, apiCalls: 0, note: 'gönderilmedi: Meta bağlantısı yok (ayarı yeniden kaydet)' };
    }
    if (ayar.baglanti_durumu !== 'active') {
      return { rows: 0, apiCalls: 0, note: `gönderilmedi: Meta bağlantısı yeniden yetki istiyor (${ayar.baglanti_durumu})` };
    }

    const satirlar = await this.db.$queryRaw<Satir[]>(Prisma.sql`
      SELECT o.id::text AS id, o.lead_id::text AS lead_id, o.asama, o.durum, o.deneme,
             o.olay_kimligi, o.olay_zamani, l.external_lead_id
        FROM geri_besleme_olaylari o
        JOIN leads l ON l.id = o.lead_id
       WHERE o.client_id = ${clientId}::uuid AND o.platform = ${GB_PLATFORM}
         AND o.durum IN ('bekliyor', 'basarisiz') AND o.sonraki_deneme <= ${simdi}::timestamptz
       ORDER BY o.sonraki_deneme, o.created_at
       LIMIT ${KOSU_SINIRI}::int
    `);
    if (satirlar.length === 0) return { rows: 0, apiCalls: 0, note: 'gönderilecek sonuç yok' };

    const kosu: Kosu = { datasetId: ayar.dataset_id, token: '', kotaAnahtari: '', clientId, simdi, cagri: 0, dagilim: {} };

    // ── 2. Partiye girmeden eleme ─────────────────────────────────────────
    const gonderilecek: Satir[] = [];
    for (const s of satirlar) {
      if (!metaPenceredeMi(Math.floor(new Date(s.olay_zamani).getTime() / 1000), simdi.getTime())) {
        await this.sonucYaz(kosu, s, 'sure_doldu', {
          hata: 'Meta 7 günden eski sonucu kabul etmiyor',
        });
      } else if (!metaLeadIdGecerli(s.external_lead_id)) {
        // Meta belgesi: 15-17 hane, aksi hâlde olay reddediliyor. Partiye
        // girseydi BÜTÜN partiyi düşürürdü.
        await this.sonucYaz(kosu, s, 'olay_hatasi', {
          hata: 'Kayıt Meta’nın kabul edeceği bir lead kimliği taşımıyor (15-17 hane bekleniyor)',
        });
      } else {
        gonderilecek.push(s);
      }
    }
    if (gonderilecek.length === 0) return this.bitir(kosu);

    // ── Token: hatası AYAR hatası ─────────────────────────────────────────
    try {
      kosu.token = await this.kasa.getAccessToken(ayar.baglanti_id, this.saglayicilar.get('meta'));
    } catch (err) {
      if (err instanceof PlatformApiError && (err.kind === 'invalid_token' || err.kind === 'permission_denied')) {
        await this.ayarHatasiYaz(clientId, err.message);
        return this.bitir(kosu, `ayar hatası: ${err.message}`);
      }
      throw err;
    }

    /*
     * KOTA ANAHTARI: aynı bağlantının bu workspace'teki Meta reklam hesabı.
     * Kota bekçisi hesap başına tutuluyor; CAPI çağrısının hangi kovadan
     * düştüğü ÖLÇÜLMEDİ (M-10). Hesap yoksa (piksel tek başına) dataset
     * kimliği kendi anahtarı olur: sayaç yine çalışır.
     */
    const [hesap] = await this.db.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT id::text AS id FROM ad_accounts
       WHERE client_id = ${clientId}::uuid AND platform = 'meta' AND connection_id = ${ayar.baglanti_id}::uuid
       ORDER BY created_at LIMIT 1
    `);
    kosu.kotaAnahtari = hesap?.id ?? `dataset_${ayar.dataset_id}`;

    // ── 3-6. Partiler ─────────────────────────────────────────────────────
    const sirali = partiSirala(gonderilecek.map((s) => ({ ...s, leadId: s.lead_id })));
    try {
      for (let i = 0; i < sirali.length; i += META_CRM.partiBoyutu) {
        const devam = await this.parti(kosu, sirali.slice(i, i + META_CRM.partiBoyutu));
        if (!devam) return this.bitir(kosu, 'kota sınırı: kalan sonuçlar bir sonraki turda');
      }
    } catch (err) {
      if (err instanceof AyarHatasi) return this.bitir(kosu, `ayar hatası: ${err.message}`);
      throw err;
    }
    return this.bitir(kosu);
  }

  /**
   * Bir partiyi gönderir. `false` = kota reddetti, işin kalanı koşmaz
   * (satırlar dokunulmadan bir sonraki tura kalır).
   */
  private async parti(kosu: Kosu, parti: Satir[]): Promise<boolean> {
    const gate = await this.quota.acquire({ platform: 'meta', adAccountId: kosu.kotaAnahtari, layer: KOTA_KATMANI });
    if (!gate.allowed) {
      this.logger.warn(`Geri besleme kota engeli (${kosu.clientId}): ${gate.reason}`);
      return false;
    }

    const govde = metaGovdeMetni(
      parti.map((s) =>
        metaCrmOlayi({
          // DİZE olarak: 17 haneli kimlik JavaScript sayısına sığmıyor.
          leadId: s.external_lead_id,
          asama: s.asama,
          olayZamaniSn: Math.floor(new Date(s.olay_zamani).getTime() / 1000),
          olayKimligi: s.olay_kimligi,
        }),
      ),
    );
    kosu.cagri++;
    const yanit = await this.istemci.olayGonder(kosu.datasetId, kosu.token, govde);
    if (yanit.rateLimit) {
      await this.quota.record({ platform: 'meta', adAccountId: kosu.kotaAnahtari, endpoint: 'capi:events', snapshot: yanit.rateLimit });
    }

    const sinif = metaYanitSinifi(yanit, parti.length);
    switch (sinif) {
      case 'kabul':
        await this.kabulYaz(kosu, parti, yanit);
        return true;
      case 'ayar_hatasi':
        await this.ayarHatasiYaz(kosu.clientId, yanit.mesaj ?? `HTTP ${yanit.http}`);
        throw new AyarHatasi(yanit.mesaj ?? `HTTP ${yanit.http}`);
      case 'gecici':
      case 'uyusmazlik': {
        const hata =
          sinif === 'uyusmazlik'
            ? `Meta ${parti.length} sonuçtan ${yanit.eventsReceived ?? 'kaçını'} aldığını bildirdi; tekrar denenecek`
            : (yanit.mesaj ?? 'Meta geçici olarak cevap vermedi');
        for (const s of parti) await this.sonucYaz(kosu, s, 'gecici_hata', { hata, yanit });
        return true;
      }
      case 'olay_hatasi': {
        const yarilar = partiyiYarila(parti);
        if (yarilar === null) {
          await this.sonucYaz(kosu, parti[0]!, 'olay_hatasi', { hata: yanit.mesaj ?? `HTTP ${yanit.http}`, yanit });
          return true;
        }
        // Yarılar AYRI istek: kötü olay hangi yarıdaysa yalnız o yarı yeniden bölünür.
        for (const y of yarilar) {
          if (!(await this.parti(kosu, y))) return false;
        }
        return true;
      }
    }
  }

  private async kabulYaz(kosu: Kosu, parti: Satir[], yanit: MetaGonderimSonucu): Promise<void> {
    const yanitJson = JSON.stringify({ events_received: yanit.eventsReceived ?? null, fbtrace_id: yanit.fbtraceId });
    /*
     * `iptal` DE GÜNCELLENİYOR: gönderim sürerken kullanıcı aşamayı geri
     * almış olabilir. Olay Meta'ya ULAŞTI; kayıt "geri alındı" derse ekran
     * platformda duran bir olayı yok sayar. Gerçek platformun cevabı.
     */
    const n = await this.db.$executeRaw(Prisma.sql`
      UPDATE geri_besleme_olaylari
         SET durum = 'iletildi', gonderildi = ${kosu.simdi}::timestamptz, gonderilen_hedef = ${kosu.datasetId},
             http_durum = ${yanit.http}::int, deneme = deneme + 1, sonraki_deneme = NULL,
             hata = NULL, hata_kodu = NULL, platform_yaniti = ${yanitJson}::jsonb, updated_at = now()
       WHERE id = ANY(${parti.map((s) => s.id)}::uuid[]) AND durum IN ('bekliyor', 'basarisiz', 'iptal')
    `);
    kosu.dagilim.iletildi = (kosu.dagilim.iletildi ?? 0) + n;
    await this.db.$executeRaw(Prisma.sql`
      UPDATE geri_besleme_ayarlari
         SET son_basarili_gonderim = ${kosu.simdi}::timestamptz, son_ayar_hatasi = NULL,
             son_ayar_hatasi_zamani = NULL, updated_at = now()
       WHERE client_id = ${kosu.clientId}::uuid AND platform = ${GB_PLATFORM}
    `);
  }

  /** Tek satırın başarısız/elenmiş sonucu. Geçiş sözleşmedeki makineden. */
  private async sonucYaz(
    kosu: Kosu,
    s: Satir,
    olay: 'sure_doldu' | 'olay_hatasi' | 'gecici_hata',
    ek: { hata: string; yanit?: MetaGonderimSonucu },
  ): Promise<void> {
    // Çağrıya giren satırın denemesi artar; elenen (süre, kimlik) artmaz.
    const deneme = olay === 'sure_doldu' || ek.yanit === undefined ? s.deneme : s.deneme + 1;
    const yeni = geriBeslemeGecisi(s.durum, olay, deneme);
    if (yeni === null) return;
    const sonraki = yeni === 'basarisiz' ? sonrakiDenemeMs(kosu.simdi.getTime(), deneme) : null;
    const kod =
      ek.yanit?.hataKodu != null
        ? `${ek.yanit.hataKodu}${ek.yanit.hataAltKodu != null ? `/${ek.yanit.hataAltKodu}` : ''}`
        : ek.yanit?.http != null
          ? `http_${ek.yanit.http}`
          : null;
    const yanitJson = ek.yanit ? JSON.stringify({ events_received: ek.yanit.eventsReceived ?? null, fbtrace_id: ek.yanit.fbtraceId }) : null;
    const n = await this.db.$executeRaw(Prisma.sql`
      UPDATE geri_besleme_olaylari
         SET durum = ${yeni}, deneme = ${deneme}::int,
             sonraki_deneme = ${sonraki === null ? null : new Date(sonraki)}::timestamptz,
             hata = ${ek.hata}, hata_kodu = ${kod}, http_durum = ${ek.yanit?.http ?? null}::int,
             platform_yaniti = COALESCE(${yanitJson}::jsonb, platform_yaniti), updated_at = now()
       WHERE id = ${s.id}::uuid AND durum IN ('bekliyor', 'basarisiz')
    `);
    if (n > 0) kosu.dagilim[yeni] = (kosu.dagilim[yeni] ?? 0) + 1;
  }

  private async ayarHatasiYaz(clientId: string, mesaj: string): Promise<void> {
    await this.db.$executeRaw(Prisma.sql`
      UPDATE geri_besleme_ayarlari
         SET son_ayar_hatasi = ${mesaj.slice(0, 2000)}, son_ayar_hatasi_zamani = now(), updated_at = now()
       WHERE client_id = ${clientId}::uuid AND platform = ${GB_PLATFORM}
    `);
  }

  /**
   * İş notu: sonuç dağılımı. `succeeded + rows=0` NOTSUZ OLAMAZ (CLAUDE.md):
   * "iletildi: 0" ile "kota sınırı" ve "ayar hatası" ayrı cümleler.
   */
  private bitir(kosu: Kosu, ek?: string): { rows: number; apiCalls: number; note: string } {
    const parcalar = Object.entries(kosu.dagilim).map(
      ([d, n]) => `${GERI_BESLEME_OLAY_DURUM_ADI[d as GeriBeslemeOlayDurumu] ?? d}: ${n}`,
    );
    const note = [parcalar.length > 0 ? parcalar.join(', ') : 'hiçbir sonuç yazılmadı', `${kosu.cagri} istek`, ek]
      .filter(Boolean)
      .join(' · ');
    return { rows: kosu.dagilim.iletildi ?? 0, apiCalls: kosu.cagri, note };
  }
}
