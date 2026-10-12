import { Inject, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  SINYAL_OZET_SAATI,
  TESLIM_BEKLEME_DK,
  TESLIM_SON_DURUMLARI,
  teamsAilesi,
  teslimSonrakiDurum,
  teslimSonucu,
  type BildirimGonderimi,
  type TeslimDurumu,
  type TeslimSonucu,
} from '@advetics/shared';
import { CONFIG, type AppConfig } from '../../config/configuration';
import { CryptoService } from '../../crypto/crypto.service';
import { PrismaAdminService } from '../../prisma/prisma-admin.service';
import { mailGonder } from '../email/mail-gonderici';
import { epostaHtml, govdeCoz, govdeKur, slackGovdesi, teamsGovdesi, type SaklananGovde } from './bildirim-icerik';
import { EPOSTA_GONDEREN_YOK, epostaGonderen } from './eposta-gonderen';
import { sinyalBasligi, gunMetni } from './sinyal-metni';
import type { TxLike } from './sinyal-hesap';
import { webhookGonder } from './webhook-gonder';

/**
 * ═══ BİLDİRİM TESLİMİ — TEK GÖNDERİM YOLU (MIMARI § 5.5, § 7, § 8) ═══
 *
 * Sinyal özeti, kural bildirimi ve deneme mesajı AYNI fonksiyondan
 * (`gonder`) geçiyor. İkinci bir gönderim yolu doğduğu anda ayrışır:
 * "özet geliyor ama kural bildirimi gelmiyor" hâli hiçbir hata üretmezdi
 * (OdemeMailiGonderici dersi).
 *
 * BYPASSRLS İSTEMCİSİYLE koşuyor: şifreli webhook adresini çözen ve teslim
 * sonucunu yazan TEK yer burası; API'nin deneme ucu da kanala erişimi RLS
 * altında doğrulayıp gönderimi buraya bırakıyor.
 *
 * KİLİT: satır göndermeden önce SAHİPLENİLİYOR (`sonraki_deneme` ileri
 * itiliyor, koşullu UPDATE). Kural bildirimi tur biter bitmez gönderilirken
 * aynı anda 5 dakikalık süpürme de onu görebilir; sahiplenme olmasaydı Slack
 * kanalına aynı mesaj iki kez düşerdi.
 */

/** Sahiplenme süresi: gönderim en çok bu kadar sürer (webhook 10 sn, SMTP daha uzun olabilir). */
const KILIT_DK = 10;
/** Süpürme başına en çok bu kadar gönderim; kalanı sonraki turda, sayısı notta. */
const SUPURME_SINIRI = 100;

interface TeslimSatiri {
  id: string;
  org_id: string;
  client_id: string;
  kanal_id: string | null;
  olay: 'sinyal' | 'kural' | 'deneme';
  govde: SaklananGovde;
  durum: TeslimDurumu;
  deneme: number;
  tur: 'eposta' | 'slack' | 'teams' | null;
  hedef_enc: Buffer | Uint8Array | null;
  alicilar: string[] | null;
  etkin: boolean | null;
}

/** Bir denemenin ham sonucu. */
interface DenemeSonucu {
  sonuc: TeslimSonucu;
  httpDurum: number | null;
  hata: string | null;
  reddedilen: string[] | null;
}

export type MailGonderici = typeof mailGonder;
export type WebhookGonderici = typeof webhookGonder;

@Injectable()
export class BildirimTeslimService {
  private readonly logger = new Logger(BildirimTeslimService.name);
  /** Testler gerçek ağa çıkmasın diye değiştirilebilir. */
  mail: MailGonderici = mailGonder;
  webhook: WebhookGonderici = webhookGonder;

  constructor(
    private readonly admin: PrismaAdminService,
    private readonly crypto: CryptoService,
    @Inject(CONFIG) private readonly config: AppConfig,
  ) {}

  private get db(): TxLike {
    return this.admin as unknown as TxLike;
  }

  /**
   * Tek satırı gönderir ve sonucu yazar. Son durumdaki satıra dokunmaz;
   * başka bir süreç sahiplendiyse `null`.
   */
  async gonder(id: string, simdi = new Date()): Promise<BildirimGonderimi | null> {
    const zaman = simdi.toISOString();
    const kilit = new Date(simdi.getTime() + KILIT_DK * 60_000).toISOString();
    const sahip = await this.db.$executeRaw(Prisma.sql`
      UPDATE bildirim_gonderimleri SET sonraki_deneme = ${kilit}::timestamptz
       WHERE id = ${id}::uuid AND durum IN ('bekliyor', 'basarisiz') AND sonraki_deneme <= ${zaman}::timestamptz`);
    if (sahip === 0) return null;

    const [r] = await this.db.$queryRaw<TeslimSatiri[]>(Prisma.sql`
      SELECT g.id::text AS id, g.org_id::text AS org_id, g.client_id::text AS client_id,
             g.kanal_id::text AS kanal_id, g.olay, g.govde, g.durum, g.deneme,
             k.tur, k.hedef_enc, k.alicilar, k.etkin
        FROM bildirim_gonderimleri g
        LEFT JOIN bildirim_kanallari k ON k.id = g.kanal_id
       WHERE g.id = ${id}::uuid`);
    if (!r) return null;

    let d: DenemeSonucu;
    try {
      d = await this.dene(r);
    } catch (e) {
      // Beklenmeyen hata (şifre çözme, biçimleyici): GEÇİCİ sayılıyor ve
      // cümlesi satırda. Yutulsaydı satır kilit süresi kadar sessizce beklerdi.
      d = { sonuc: 'gecici_hata', httpDurum: null, hata: `Gönderim düştü: ${mesaj(e)}`, reddedilen: null };
    }

    const deneme = Number(r.deneme) + 1;
    // DENEME MESAJI TEK ATIŞ: sonradan sessizce başaran bir deneme
    // kullanıcının "geldi mi" cevabını anlamsız kılar.
    const durum: TeslimDurumu =
      r.olay === 'deneme' ? (d.sonuc === 'basarili' ? 'gonderildi' : 'vazgecildi') : teslimSonrakiDurum(d.sonuc, deneme);
    const bekleme = TESLIM_BEKLEME_DK[Math.min(deneme - 1, TESLIM_BEKLEME_DK.length - 1)] ?? 120;
    const sonraki = durum === 'basarisiz' ? new Date(simdi.getTime() + bekleme * 60_000).toISOString() : zaman;

    const [yazilan] = await this.db.$queryRaw<GonderimSatiri[]>(Prisma.sql`
      UPDATE bildirim_gonderimleri g SET
        durum = ${durum}, deneme = ${deneme}::smallint, sonraki_deneme = ${sonraki}::timestamptz,
        http_durum = ${d.httpDurum}::int, hata = ${d.hata}, reddedilen = ${d.reddedilen}::text[],
        gonderildi = CASE WHEN ${durum}::text = 'gonderildi' THEN ${zaman}::timestamptz ELSE NULL END
       WHERE g.id = ${id}::uuid
      RETURNING ${GONDERIM_KOLONLARI}`);
    if (d.sonuc !== 'basarili') {
      this.logger.warn(`Bildirim ${id} (${r.olay}) gönderilemedi [${durum}]: ${d.hata ?? '-'}`);
    }
    return yazilan ? gonderimSatirindan({ ...yazilan, kanal_adi: null }) : null;
  }

  private async dene(r: TeslimSatiri): Promise<DenemeSonucu> {
    const kalici = (hata: string): DenemeSonucu => ({ sonuc: 'kalici_hata', httpDurum: null, hata, reddedilen: null });
    if (!r.tur) return kalici('Kanal silindi; gönderilmedi.');
    if (r.olay !== 'deneme' && !r.etkin) return kalici('Kanal kapatıldı; gönderilmedi.');
    if (r.olay === 'sinyal' && this.config.sinyal.sessizKosum) {
      return kalici('Sessiz koşum açık (SINYAL_SESSIZ_KOSUM=1); sinyal kanala gönderilmedi.');
    }
    const govde = govdeCoz(r.govde, this.config.mail.appUrl, r.client_id);

    if (r.tur === 'eposta') {
      const kimlik = await epostaGonderen(this.db, r.org_id);
      if (!kimlik) return kalici(EPOSTA_GONDEREN_YOK);
      try {
        const sonuc = await this.mail(
          {
            fromName: kimlik.fromName,
            fromEmail: kimlik.fromEmail,
            host: kimlik.smtpHost,
            port: kimlik.smtpPort,
            secure: kimlik.smtpSecure,
            user: kimlik.smtpUser,
            pass: this.crypto.decrypt(kimlik.smtpPassEnc),
          },
          { to: r.alicilar ?? [], subject: govde.konu, html: epostaHtml(govde) },
        );
        /*
         * KISMİ RET SESSİZ BAŞARI DÖNÜYOR (mail-gonderici.ts): gönderim
         * "gönderildi" sayılıyor ama reddedilenler satırda ve cümlesi
         * `hata`da; ekran "2 alıcı reddetti" yazabilsin.
         */
        const ret = sonuc.ret;
        return {
          sonuc: 'basarili',
          httpDurum: null,
          hata: ret.length > 0 ? `${ret.length} alıcı reddetti: ${ret.map((x) => `${x.adres} (${x.sebep})`).join('; ')}` : null,
          reddedilen: ret.length > 0 ? ret.map((x) => x.adres) : null,
        };
      } catch (e) {
        return { sonuc: 'gecici_hata', httpDurum: null, hata: mesaj(e), reddedilen: null };
      }
    }

    if (!r.hedef_enc) return kalici('Kanalın adresi kayıtlı değil.');
    const adres = this.crypto.decrypt(Buffer.from(r.hedef_enc));
    const icerik = r.tur === 'slack' ? slackGovdesi(govde) : teamsGovdesi(govde, teamsAilesi(adres) ?? 'workflows');
    const w = await this.webhook(r.tur, adres, icerik);
    return {
      sonuc: w.reddedildi ? 'kalici_hata' : teslimSonucu(w.httpDurum),
      httpDurum: w.httpDurum,
      hata: w.hata,
      reddedilen: null,
    };
  }

  /** Kuralın turu bitince: aynı anahtarlı bekleyen satırlar HEMEN gönderilsin. */
  async anahtarlaGonder(anahtar: string, simdi = new Date()): Promise<number> {
    const satirlar = await this.db.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT id::text AS id FROM bildirim_gonderimleri WHERE anahtar = ${anahtar} AND durum = 'bekliyor'`);
    let n = 0;
    for (const s of satirlar) if (await this.gonder(s.id, simdi)) n++;
    return n;
  }

  /**
   * `sweep:notifications` (5 dakikada bir): önce sabah özeti, sonra zamanı
   * gelmiş bekleyen satırlar. Deneme mesajları süpürmeye GİRMİYOR (tek atış).
   */
  async supur(simdi = new Date()): Promise<{ rows: number; note: string }> {
    const ozet = await this.ozetleriUret(simdi);
    const bekleyen = await this.db.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT id::text AS id FROM bildirim_gonderimleri
       WHERE durum IN ('bekliyor', 'basarisiz') AND sonraki_deneme <= ${simdi.toISOString()}::timestamptz
         AND olay <> 'deneme'
       ORDER BY sonraki_deneme
       LIMIT ${SUPURME_SINIRI + 1}::int`);
    const sayac: Record<TeslimDurumu, number> = { bekliyor: 0, gonderildi: 0, basarisiz: 0, vazgecildi: 0 };
    let dusen = 0;
    for (const b of bekleyen.slice(0, SUPURME_SINIRI)) {
      try {
        const g = await this.gonder(b.id, simdi);
        if (g) sayac[g.durum]++;
      } catch (e) {
        dusen++;
        this.logger.error(`Bildirim ${b.id} işlenemedi: ${mesaj(e)}`);
      }
    }
    const note = [
      ozet.not,
      `${Math.min(bekleyen.length, SUPURME_SINIRI)} gönderim denendi: ${sayac.gonderildi} gönderildi, ${sayac.basarisiz} yeniden denenecek, ${sayac.vazgecildi} vazgeçildi`,
      dusen > 0 ? `${dusen} satır işlenemedi` : null,
      bekleyen.length > SUPURME_SINIRI ? `sınır aşıldı, kalanı sonraki turda` : null,
    ]
      .filter(Boolean)
      .join(' · ');
    return { rows: sayac.gonderildi, note };
  }

  /**
   * 09:00 İSTANBUL SİNYAL ÖZETİ. Saat AJANSIN saati (insanın okuduğu iş,
   * `sweep:account-status` istisnası). Süpürme her 5 dakikada koşuyor;
   * günde bir satır `(kanal_id, 'ozet:<gün>')` tekilliğiyle garanti.
   *
   * KAPSAM DAMGASI SATIRLA AYNI DEYİMDE: satır yazıldıysa damga ilerliyor,
   * çakıştıysa (bugünün özeti zaten var) ilerlemiyor ve 09:00'dan sonra
   * açılan sinyal YARININ özetine kalıyor. İki ayrı deyim olsaydı arada düşen
   * süreç ya aynı sinyali iki kez ya da hiç göndermezdi. BOŞ ÖZET GİTMEZ.
   */
  async ozetleriUret(simdi = new Date()): Promise<{ uretilen: number; not: string }> {
    if (this.config.sinyal.sessizKosum) return { uretilen: 0, not: 'özet: sessiz koşum açık, üretilmedi' };
    const yerel = istanbulZamani(simdi);
    if (yerel.saat * 60 + yerel.dakika < SINYAL_OZET_SAATI.saat * 60 + SINYAL_OZET_SAATI.dakika) {
      return { uretilen: 0, not: 'özet: saati gelmedi' };
    }
    const kanallar = await this.db.$queryRaw<
      Array<{ id: string; org_id: string; client_id: string; client_adi: string | null; kapsam: Date | string }>
    >(Prisma.sql`
      SELECT k.id::text AS id, k.org_id::text AS org_id, k.client_id::text AS client_id, c.name AS client_adi,
             coalesce(k.son_ozet_kapsami, k.created_at) AS kapsam
        FROM bildirim_kanallari k
        LEFT JOIN clients c ON c.id = k.client_id
       WHERE k.etkin AND 'sinyal' = ANY(k.olaylar)
         AND NOT EXISTS (SELECT 1 FROM bildirim_gonderimleri g
                          WHERE g.kanal_id = k.id AND g.anahtar = ${`ozet:${yerel.gun}`})`);
    let uretilen = 0;
    for (const k of kanallar) {
      const sinyaller = await this.db.$queryRaw<
        Array<{
          id: string;
          tur: 'anomali' | 'saglik';
          kod: string;
          yon: 'artis' | 'dusus' | null;
          gun: string;
          gozlenen: number | null;
          beklenen_orta: number | null;
          beklenen_alt: number | null;
          beklenen_ust: number | null;
          nokta: number | null;
          para_birimi: string;
          kanit: Record<string, unknown>;
          varlik_adi: string;
          son_acilma: Date | string;
        }>
      >(Prisma.sql`
        SELECT id::text AS id, tur, kod, yon, gun::text AS gun, gozlenen::float8 AS gozlenen,
               beklenen_orta::float8 AS beklenen_orta, beklenen_alt::float8 AS beklenen_alt,
               beklenen_ust::float8 AS beklenen_ust, nokta::int AS nokta, para_birimi, kanit,
               varlik_adi, son_acilma
          FROM sinyaller
         WHERE client_id = ${k.client_id}::uuid AND durum = 'acik'
           AND son_acilma > ${new Date(k.kapsam).toISOString()}::timestamptz
         ORDER BY (onem = 'yuksek') DESC, son_acilma DESC`);
      if (sinyaller.length === 0) continue;
      const enYeni = sinyaller.reduce((m, s) => Math.max(m, new Date(s.son_acilma).getTime()), 0);
      const n = sinyaller.length;
      const workspace = k.client_adi ?? 'Workspace';
      const govde = govdeKur({
        baslik: `${workspace}: ${n} yeni sinyal · ${gunMetni(yerel.gun)}`,
        konu: `Advetics · ${n} yeni sinyal · ${gunMetni(yerel.gun)}`,
        satirlar: sinyaller.map((s) => ({
          etiket: s.varlik_adi,
          metin: sinyalBasligi({
            tur: s.tur,
            kod: s.kod as never,
            yon: s.yon,
            gun: s.gun,
            gozlenen: s.gozlenen === null ? null : Number(s.gozlenen),
            orta: s.beklenen_orta === null ? null : Number(s.beklenen_orta),
            alt: s.beklenen_alt === null ? null : Number(s.beklenen_alt),
            ust: s.beklenen_ust === null ? null : Number(s.beklenen_ust),
            nokta: s.nokta,
            paraBirimi: s.para_birimi,
            kanit: s.kanit ?? {},
          }),
        })),
        fazlaBirimi: 'sinyal',
        baglanti: { metin: "Sinyalleri Advetics'te aç", yol: 'sinyaller' },
      });
      const yazilan = await this.db.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        WITH ekle AS (
          INSERT INTO bildirim_gonderimleri (org_id, client_id, kanal_id, olay, anahtar, ozet, govde, kaynaklar,
                                             durum, sonraki_deneme)
          VALUES (${k.org_id}::uuid, ${k.client_id}::uuid, ${k.id}::uuid, 'sinyal', ${`ozet:${yerel.gun}`},
                  ${`${n} yeni sinyal`}, ${JSON.stringify(govde)}::jsonb, ${JSON.stringify(sinyaller.map((s) => s.id))}::jsonb,
                  'bekliyor', ${simdi.toISOString()}::timestamptz)
          ON CONFLICT (kanal_id, anahtar) DO NOTHING
          RETURNING id
        )
        UPDATE bildirim_kanallari SET son_ozet_kapsami = ${new Date(enYeni).toISOString()}::timestamptz
         WHERE id = ${k.id}::uuid AND EXISTS (SELECT 1 FROM ekle)
        RETURNING id::text AS id`);
      if (yazilan.length > 0) uretilen++;
    }
    return { uretilen, not: `özet: ${uretilen} kanal için üretildi (${kanallar.length} kanal bakıldı)` };
  }
}

/** Teslim geçmişi satırı (liste ve gönderim sonucu aynı biçimde). */
export interface GonderimSatiri {
  id: string;
  kanal_id: string | null;
  kanal_adi: string | null;
  olay: BildirimGonderimi['olay'];
  ozet: string;
  durum: TeslimDurumu;
  deneme: number;
  http_durum: number | null;
  hata: string | null;
  created_at: Date | string;
  gonderildi: Date | string | null;
}

export const GONDERIM_KOLONLARI = Prisma.raw(
  'g.id::text AS id, g.kanal_id::text AS kanal_id, g.olay, g.ozet, g.durum, g.deneme::int AS deneme, ' +
    'g.http_durum, g.hata, g.created_at, g.gonderildi',
);

export function gonderimSatirindan(r: GonderimSatiri): BildirimGonderimi {
  return {
    id: r.id,
    kanalId: r.kanal_id,
    kanalAdi: r.kanal_adi,
    olay: r.olay,
    ozet: r.ozet,
    durum: r.durum,
    deneme: Number(r.deneme),
    httpDurum: r.http_durum === null ? null : Number(r.http_durum),
    hata: r.hata,
    olusturuldu: new Date(r.created_at).toISOString(),
    gonderildi: r.gonderildi ? new Date(r.gonderildi).toISOString() : null,
  };
}

export function sonDurumMu(d: TeslimDurumu): boolean {
  return TESLIM_SON_DURUMLARI.includes(d);
}

/** Verilen anın İstanbul'daki günü ve saati. */
export function istanbulZamani(an: Date): { gun: string; saat: number; dakika: number } {
  const p = new Intl.DateTimeFormat('en-CA', {
    timeZone: SINYAL_OZET_SAATI.tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(an);
  const al = (t: string) => p.find((x) => x.type === t)?.value ?? '00';
  return { gun: `${al('year')}-${al('month')}-${al('day')}`, saat: Number(al('hour')), dakika: Number(al('minute')) };
}

function mesaj(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
