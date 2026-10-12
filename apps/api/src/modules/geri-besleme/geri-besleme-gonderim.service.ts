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
import { GB_PLATFORM, SONUC_BILINMIYOR } from './lead-asama';
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

/** Sahiplenmenin "sonucu bilinmiyor" sayılması için geçmesi gereken süre. */
const SAHIPLENME_ZAMAN_ASIMI_MS = 30 * 60_000;
const SONUC_BILINMIYOR_METNI =
  'Sonucu bilinmiyor: istek Meta’ya gitti ama cevabı kaydedilemedi. Olay ulaşmış olabilir; iki kez sayılmasın diye yeniden gönderilmedi.';

interface Gonderim {
  yanit: MetaGonderimSonucu;
  sinif: ReturnType<typeof metaYanitSinifi>;
}

/** İki ret AYNI hata mı: Meta kodu/alt kodu, yoksa HTTP durumu. */
function ayniHata(a: MetaGonderimSonucu, b: MetaGonderimSonucu): boolean {
  const k = (y: MetaGonderimSonucu) => `${y.hataKodu ?? ''}/${y.hataAltKodu ?? ''}/${y.hataKodu == null ? y.http : ''}`;
  return k(a) === k(b);
}

interface Kosu {
  datasetId: string;
  token: string;
  kotaAnahtari: string;
  clientId: string;
  simdi: Date;
  cagri: number;
  dagilim: Record<string, number>;
  /** Meta'nın KABUL ETTİĞİ satırlar: hiçbir yolda gönderilebilir duruma dönmez. */
  kabulEdilen: Set<string>;
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

  /**
   * ═══ SONUCU BİLİNMEYEN GÖNDERİMLER (Ajan 4 Ö-1) ═══
   *
   * `gonderiliyor`da yaşlanan satır: istek gitti ama cevabı yazılamadı
   * (worker öldü, veritabanı koptu). Olay Meta'ya ULAŞMIŞ olabilir, yani
   * yeniden GÖNDERİLMİYOR; yalnız "sonucu bilinmiyor" diye işaretleniyor ve
   * uyarıda görünüyor. Tekrar göndermek Meta'nın tekilleştirmesine
   * yaslanmak olurdu (M-6, ölçülmedi). Süpürme her turda çağırıyor.
   */
  async yasliSahiplenmeleriIsaretle(simdi = new Date()): Promise<number> {
    const esik = new Date(simdi.getTime() - SAHIPLENME_ZAMAN_ASIMI_MS);
    return this.db.$executeRaw(Prisma.sql`
      UPDATE geri_besleme_olaylari
         SET hata = ${SONUC_BILINMIYOR_METNI}, hata_kodu = ${SONUC_BILINMIYOR}, updated_at = now()
       WHERE durum = 'gonderiliyor' AND sahiplenme_zamani < ${esik}::timestamptz
         AND hata_kodu IS DISTINCT FROM ${SONUC_BILINMIYOR}
    `);
  }

  async calistir(clientId: string, simdi = new Date()): Promise<{ rows: number; apiCalls: number; note: string }> {
    // ── 1. Ön koşul: platform çağrısı YOK ─────────────────────────────────
    const [ayar] = await this.db.$queryRaw<
      Array<{
        etkin: boolean;
        dataset_id: string | null;
        baglanti_id: string | null;
        baglanti_durumu: string | null;
        son_ayar_hatasi: string | null;
      }>
    >(Prisma.sql`
      SELECT a.etkin, a.dataset_id, a.baglanti_id::text AS baglanti_id, pc.status::text AS baglanti_durumu,
             a.son_ayar_hatasi
        FROM geri_besleme_ayarlari a
        LEFT JOIN platform_connections pc ON pc.id = a.baglanti_id
       WHERE a.client_id = ${clientId}::uuid AND a.platform = ${GB_PLATFORM}
    `);
    if (!ayar?.etkin) return { rows: 0, apiCalls: 0, note: 'gönderilmedi: Meta’ya bildirim kapalı' };
    if (!ayar.dataset_id) return { rows: 0, apiCalls: 0, note: 'gönderilmedi: veri kümesi seçilmemiş' };
    if (!ayar.baglanti_id || !ayar.baglanti_durumu) {
      return {
        rows: 0,
        apiCalls: 0,
        note: `gönderilmedi: ${ayar.son_ayar_hatasi ?? 'Meta bağlantısı yok (ayarı yeniden kaydet)'}`,
      };
    }
    if (ayar.baglanti_durumu !== 'active') {
      return { rows: 0, apiCalls: 0, note: `gönderilmedi: Meta bağlantısı yeniden yetki istiyor (${ayar.baglanti_durumu})` };
    }

    /*
     * ═══ VERİ KÜMESİNİN SAHİBİ HÂLÂ BU WORKSPACE Mİ (Ajan 4 Ö-2) ═══
     *
     * Kayıtta veri kümesi workspace'in Meta hesaplarının piksel listesinde
     * doğrulanıyor (Ç-7) ama doğrulama YALNIZ kayıt anında. Hesap sonradan
     * havuza döner ya da başka müşteriye atanırsa bu bağlantıyla workspace'te
     * hiç Meta hesabı kalmaz; o zaman başka bir projenin modelini eğitiyor
     * olabiliriz ve geri alınamaz. ÇAĞRI YOK, satırlara dokunulmaz; ayar
     * "kurulum eksik"e düşer (bağlantı boşaltılır) ve sebep notta ve uyarıda.
     * Yeniden açmak ayarı yeniden kaydetmek: veri kümesi yeniden doğrulanır.
     */
    const [hesap] = await this.db.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT id::text AS id FROM ad_accounts
       WHERE client_id = ${clientId}::uuid AND platform = 'meta' AND connection_id = ${ayar.baglanti_id}::uuid
       ORDER BY created_at LIMIT 1
    `);
    if (!hesap) {
      const mesaj =
        'Workspace’te bu veri kümesini kullanan hesap kalmadı (Meta reklam hesabı havuza döndü ya da başka workspace’e atandı); sonuçlar başka bir projenin modelini eğitmesin diye gönderim durdu. Hesabı yeniden ata ve ayarı kaydet.';
      await this.db.$executeRaw(Prisma.sql`
        UPDATE geri_besleme_ayarlari
           SET baglanti_id = NULL, son_ayar_hatasi = ${mesaj}, son_ayar_hatasi_zamani = now(), updated_at = now()
         WHERE client_id = ${clientId}::uuid AND platform = ${GB_PLATFORM}
      `);
      return { rows: 0, apiCalls: 0, note: `gönderilmedi: ${mesaj}` };
    }

    /*
     * ═══ SAHİPLENME (Ajan 4 Ö-1) ═══
     *
     * Satırlar GÖNDERMEDEN ÖNCE `gonderiliyor`a alınıyor ve yalnız bu
     * koşunun güncellediği (RETURNING) satırlar gönderiliyor. İş `stalled`
     * sayılıp ikinci bir slotta başlasa da aynı satırı ikinci kez alamaz:
     * dış UPDATE'in `durum IN (...)` koşulu satır kilitlendikten SONRA
     * yeniden değerlendiriliyor. Tek koruma BullMQ iş kimliği değil.
     */
    const satirlar = await this.db.$queryRaw<Satir[]>(Prisma.sql`
      UPDATE geri_besleme_olaylari o
         SET durum = 'gonderiliyor', sahiplenme_zamani = now(), updated_at = now()
        FROM leads l
       WHERE l.id = o.lead_id
         AND o.durum IN ('bekliyor', 'basarisiz')
         AND o.id IN (
           SELECT x.id FROM geri_besleme_olaylari x
            WHERE x.client_id = ${clientId}::uuid AND x.platform = ${GB_PLATFORM}
              AND x.durum IN ('bekliyor', 'basarisiz') AND x.sonraki_deneme <= ${simdi}::timestamptz
            ORDER BY x.sonraki_deneme, x.created_at
            LIMIT ${KOSU_SINIRI}::int
            FOR UPDATE SKIP LOCKED
         )
      RETURNING o.id::text AS id, o.lead_id::text AS lead_id, o.asama, o.durum, o.deneme,
                o.olay_kimligi, o.olay_zamani, l.external_lead_id
    `);
    if (satirlar.length === 0) return { rows: 0, apiCalls: 0, note: 'gönderilecek sonuç yok' };

    const kosu: Kosu = {
      datasetId: ayar.dataset_id,
      token: '',
      kotaAnahtari: hesap.id,
      clientId,
      simdi,
      cagri: 0,
      dagilim: {},
      kabulEdilen: new Set(),
    };
    try {
      return await this.sahiplenilenleriGonder(kosu, satirlar, ayar.baglanti_id);
    } finally {
      /*
       * BIRAKMA: bu koşunun aldığı ama Meta'nın KABUL ETMEDİĞİ satırlar
       * (gönderilmedi, kota, ayar hatası, sonuç yazımı düştü) gönderilebilir
       * duruma döner; deneme ARTMAZ. Meta'nın kabul ettiği satır ASLA geri
       * dönmez: "iletildi" yazımı düştüyse `gonderiliyor`da kalır ve süpürme
       * onu "sonucu bilinmiyor" diye işaretler.
       */
      const birakilacak = satirlar.map((x) => x.id).filter((id) => !kosu.kabulEdilen.has(id));
      if (birakilacak.length > 0) {
        await this.db.$executeRaw(Prisma.sql`
          UPDATE geri_besleme_olaylari
             SET durum = 'bekliyor', sahiplenme_zamani = NULL,
                 sonraki_deneme = COALESCE(sonraki_deneme, now()), updated_at = now()
           WHERE id = ANY(${birakilacak}::uuid[]) AND durum = 'gonderiliyor'
        `);
      }
    }
  }

  private async sahiplenilenleriGonder(
    kosu: Kosu,
    satirlar: Satir[],
    baglantiId: string,
  ): Promise<{ rows: number; apiCalls: number; note: string }> {
    // ── 2. Partiye girmeden eleme ─────────────────────────────────────────
    const gonderilecek: Satir[] = [];
    for (const s of satirlar) {
      if (!metaPenceredeMi(Math.floor(new Date(s.olay_zamani).getTime() / 1000), kosu.simdi.getTime())) {
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
      kosu.token = await this.kasa.getAccessToken(baglantiId, this.saglayicilar.get('meta'));
    } catch (err) {
      if (err instanceof PlatformApiError && (err.kind === 'invalid_token' || err.kind === 'permission_denied')) {
        await this.ayarHatasiYaz(kosu.clientId, err.message);
        return this.bitir(kosu, `ayar hatası: ${err.message}`);
      }
      throw err;
    }

    // ── 3-6. Partiler ─────────────────────────────────────────────────────
    const sirali = partiSirala(gonderilecek.map((s) => ({ ...s, leadId: s.lead_id })));
    try {
      for (let i = 0; i < sirali.length; i += META_CRM.partiBoyutu) {
        const devam = await this.parti(kosu, sirali.slice(i, i + META_CRM.partiBoyutu), true);
        if (!devam) return this.bitir(kosu, 'kota sınırı: kalan sonuçlar bir sonraki turda');
      }
    } catch (err) {
      if (err instanceof AyarHatasi) return this.bitir(kosu, `ayar hatası: ${err.message}`);
      throw err;
    }
    return this.bitir(kosu);
  }

  /**
   * Bir partiyi gönderir ve sonucunu işler. `false` = kota reddetti, işin
   * kalanı koşmaz (satırlar bırakılıp bir sonraki tura kalır).
   * `ilk`: partinin kendisi (yarı değil); sistematik ret kontrolü yalnız
   * ilk bölmede (Ö-3).
   */
  private async parti(kosu: Kosu, parti: Satir[], ilk: boolean): Promise<boolean> {
    const r = await this.gonder(kosu, parti);
    if (r === null) return false;
    return this.isle(kosu, parti, r, ilk);
  }

  private async gonder(kosu: Kosu, parti: Satir[]): Promise<Gonderim | null> {
    const gate = await this.quota.acquire({ platform: 'meta', adAccountId: kosu.kotaAnahtari, layer: KOTA_KATMANI });
    if (!gate.allowed) {
      this.logger.warn(`Geri besleme kota engeli (${kosu.clientId}): ${gate.reason}`);
      return null;
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
    return { yanit, sinif: metaYanitSinifi(yanit, parti.length) };
  }

  private async isle(kosu: Kosu, parti: Satir[], r: Gonderim, ilk: boolean): Promise<boolean> {
    const { yanit, sinif } = r;
    switch (sinif) {
      case 'kabul':
        // ÖNCE işaret: yazım düşerse bu satırlar bırakılmaz (Ö-1).
        for (const s of parti) kosu.kabulEdilen.add(s.id);
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
        if (!ilk) {
          // Yarılar AYRI istek: kötü olay hangi yarıdaysa yalnız o yarı yeniden bölünür.
          for (const y of yarilar) if (!(await this.parti(kosu, y, false))) return false;
          return true;
        }
        /*
         * ═══ SİSTEMATİK RET (Ajan 4 Ö-3) ═══
         *
         * Yarılama TEK kötü olay için doğru. Ret olaya değil BİÇİME aitse
         * (M-3: Meta `lead_id`i sayı literali olarak kabul etmezse; veri
         * kümesi CRM'e açık değilse) her olay reddediliyor: 50'lik parti 99
         * istek ve satırların TAMAMI kalıcı `reddedildi`. İlk bölmede İKİ
         * YARI DA AYNI hatayla düşerse bu bir ayar/biçim hatası: yarılama
         * durur, satırlar reddedilmez (bırakılır, deneme artmaz), ayara
         * Meta'nın cümlesi yazılır ve uyarı çıkar.
         */
        const r1 = await this.gonder(kosu, yarilar[0]);
        if (r1 === null) return false;
        if (r1.sinif !== 'olay_hatasi' || !ayniHata(r1.yanit, yanit)) {
          if (!(await this.isle(kosu, yarilar[0], r1, false))) return false;
          return this.parti(kosu, yarilar[1], false);
        }
        const r2 = await this.gonder(kosu, yarilar[1]);
        if (r2 === null) return false;
        if (r2.sinif === 'olay_hatasi' && ayniHata(r2.yanit, yanit)) {
          const mesaj = `Meta gönderilen bütün sonuçları aynı hatayla reddetti (biçim ya da veri kümesi ayarı): ${yanit.mesaj ?? `HTTP ${yanit.http}`}`;
          await this.ayarHatasiYaz(kosu.clientId, mesaj);
          throw new AyarHatasi(mesaj);
        }
        if (!(await this.isle(kosu, yarilar[0], r1, false))) return false;
        return this.isle(kosu, yarilar[1], r2, false);
      }
    }
  }

  private async kabulYaz(kosu: Kosu, parti: Satir[], yanit: MetaGonderimSonucu): Promise<void> {
    const yanitJson = JSON.stringify({ events_received: yanit.eventsReceived ?? null, fbtrace_id: yanit.fbtraceId });
    /*
     * YALNIZ SAHİPLENİLMİŞ SATIR: geri alma `gonderiliyor` satırı iptal
     * edemiyor (istek yolda), yani kabul edilen olay "geri alındı" görünemez.
     */
    const n = await this.db.$executeRaw(Prisma.sql`
      UPDATE geri_besleme_olaylari
         SET durum = 'iletildi', gonderildi = ${kosu.simdi}::timestamptz, gonderilen_hedef = ${kosu.datasetId},
             http_durum = ${yanit.http}::int, deneme = deneme + 1, sonraki_deneme = NULL, sahiplenme_zamani = NULL,
             hata = NULL, hata_kodu = NULL, platform_yaniti = ${yanitJson}::jsonb, updated_at = now()
       WHERE id = ANY(${parti.map((s) => s.id)}::uuid[]) AND durum = 'gonderiliyor'
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
             platform_yaniti = COALESCE(${yanitJson}::jsonb, platform_yaniti), sahiplenme_zamani = NULL,
             updated_at = now()
       WHERE id = ${s.id}::uuid AND durum = 'gonderiliyor'
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
