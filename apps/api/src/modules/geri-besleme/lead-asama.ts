import { Prisma } from '@prisma/client';
import {
  asamaOlayZamani,
  asamaPlani,
  GERI_BESLEME_BEKLEME_DK,
  geriBeslemeGecisi,
  geriBeslemeOlayKimligi,
  metaPenceredeMi,
  type GeriBeslemeAsamasi,
  type GeriBeslemeOlayDurumu,
  type LeadStatus,
  type MevcutAsama,
} from '@advetics/shared';

/**
 * ═══ LEAD DURUMU → GERİ BESLEME SATIRLARI (Paket E, MIMARI § 3, § 5) ═══
 *
 * Üç yol aşama satırı açıyor ve ÜÇÜ DE BU DOSYADAN geçiyor:
 *
 *   · lead durumu panelde değişince (`leads.service.update`, kullanıcı tx'i),
 *   · gönderim AÇILINCA son 7 günün geri doldurması (`geri-besleme.service`),
 *   · yeni lead geldiğinde ham lead (`lead-sync.service`, tek deyim).
 *
 * İkinci bir "aşama satırı açan" kod doğduğu anda ayrışır (CLAUDE.md: aynı
 * şeyi üreten ikinci fonksiyon); en sinsisi 7 gün kuralı olurdu: bir yol
 * eski olayı satıra yazar, gönderim işi onu `suresi_doldu` yapar ve her eski
 * lead ekranda kırmızı rozetle görünür.
 *
 * PLATFORM ÇAĞRISI YOK. Hepsi çağıranın transaction'ında koşan SQL.
 * Fonksiyonlar `Prisma.sql` ile çalışan herhangi bir yürütücüyü alıyor
 * (kullanıcı tx'i, worker istemcisi ya da PGlite koşum ortamı).
 */
export interface Yurutucu {
  $queryRaw<T = unknown>(q: Prisma.Sql): Promise<T>;
  $executeRaw(q: Prisma.Sql): Promise<number>;
}

/** v1 yalnız Meta (MIMARI Ç-2). Sabit tek yerde: sorgulara dize olarak gidiyor. */
export const GB_PLATFORM = 'meta' as const;

/** Bir yolun ne yaptığının sayımı; çağıran cevaba ve notlara taşıyor. */
export interface AsamaSayaci {
  olusturulan: number;
  yenidenAcilan: number;
  iptal: number;
  /** 7 günü geçtiği ya da zamanı bilinmediği için HİÇ satırı açılmayan aşama. */
  eskiAtlanan: number;
}

const bosSayac = (): AsamaSayaci => ({ olusturulan: 0, yenidenAcilan: 0, iptal: 0, eskiAtlanan: 0 });

export async function ayarEtkinMi(tx: Yurutucu, clientId: string): Promise<boolean> {
  const [r] = await tx.$queryRaw<Array<{ etkin: boolean }>>(Prisma.sql`
    SELECT etkin FROM geri_besleme_ayarlari
     WHERE client_id = ${clientId}::uuid AND platform = ${GB_PLATFORM}
  `);
  return r?.etkin === true;
}

interface PlanGirdisi {
  leadId: string;
  clientId: string;
  orgId: string;
  durum: LeadStatus;
  submittedAt: Date;
  /**
   * Lead'in BUGÜNKÜ durumuna geçtiği an. `null` = bilinmiyor (geçmiş tablosu
   * yokken değişmiş): o zaman ileri aşamanın Meta'ya gidecek bir zamanı yok
   * ve uydurulmaz; aşama atlanır ve sayılır.
   */
  degisim: Date | null;
  /** Kullanıcı işaretinin en erken gönderim anı (geri alma penceresinin sonu). */
  bekleme: Date;
  simdi: Date;
}

/**
 * `asamaPlani`nın kararını satırlara uygular. PLAN SAF FONKSİYONDA
 * (`shared/geri-besleme/asama.ts`) ve burada yeniden yazılmıyor: bu fonksiyon
 * yalnız "hangi satıra hangi deyim" kısmını yapıyor.
 */
async function planiUygula(tx: Yurutucu, g: PlanGirdisi, mevcut: MevcutAsama[]): Promise<AsamaSayaci> {
  const sayac = bosSayac();
  const plan = asamaPlani(g.durum, mevcut);
  const simdiMs = g.simdi.getTime();

  const zamani = (asama: GeriBeslemeAsamasi): number | null => {
    if (asama !== 'ham_lead' && g.degisim === null) return null;
    return asamaOlayZamani(asama, {
      leadZamaniMs: g.submittedAt.getTime(),
      degisimZamaniMs: (g.degisim ?? g.submittedAt).getTime(),
    });
  };

  for (const asama of plan.olustur) {
    const sn = zamani(asama);
    /*
     * 7 GÜNÜ GEÇEN AŞAMANIN SATIRI AÇILMAZ (MIMARI Ç-13). Açılsaydı gönderim
     * işi onu ilk turda `suresi_doldu` yapar ve 7 günden eski HER lead
     * işaretlendiğinde kırmızı "gönderilemedi" rozeti taşırdı: yapılacak bir
     * iş olmayan kalıcı bir alarm, gerçek sorunları gürültüde boğardı.
     * Sayısı çağırana dönüyor (açılış cevabı, tarama notu).
     */
    if (sn === null || !metaPenceredeMi(sn, simdiMs)) {
      sayac.eskiAtlanan++;
      continue;
    }
    // Ham lead BEKLEMEZ: geri alınacak bir kullanıcı kararı yok.
    const sonraki = asama === 'ham_lead' ? g.simdi : g.bekleme;
    sayac.olusturulan += await tx.$executeRaw(Prisma.sql`
      INSERT INTO geri_besleme_olaylari
        (org_id, client_id, lead_id, platform, asama, olay_kimligi, olay_zamani, durum, sonraki_deneme)
      VALUES (${g.orgId}::uuid, ${g.clientId}::uuid, ${g.leadId}::uuid, ${GB_PLATFORM}, ${asama},
              ${geriBeslemeOlayKimligi(g.leadId, asama)}, ${new Date(sn * 1000)}::timestamptz,
              'bekliyor', ${sonraki}::timestamptz)
      ON CONFLICT (lead_id, platform, asama) DO NOTHING
    `);
  }

  const mevcutDurum = new Map(mevcut.map((m) => [m.asama, m.durum as GeriBeslemeOlayDurumu]));

  for (const asama of plan.iptal) {
    const once = mevcutDurum.get(asama)!;
    const sonra = geriBeslemeGecisi(once, 'geri_alindi');
    if (sonra === null) continue;
    // İYİMSER KİLİT: satır bu arada gönderildiyse (worker) dokunulmaz;
    // platforma ulaşmış bir olayı "geri alındı" diye göstermek yalan olurdu.
    sayac.iptal += await tx.$executeRaw(Prisma.sql`
      UPDATE geri_besleme_olaylari
         SET durum = ${sonra}, sonraki_deneme = NULL, updated_at = now()
       WHERE lead_id = ${g.leadId}::uuid AND platform = ${GB_PLATFORM} AND asama = ${asama} AND durum = ${once}
    `);
  }

  for (const asama of plan.yenidenAc) {
    const sonra = geriBeslemeGecisi('iptal', 'yeniden_istendi');
    const sn = zamani(asama);
    if (sonra === null || sn === null || !metaPenceredeMi(sn, simdiMs)) {
      sayac.eskiAtlanan++;
      continue;
    }
    const sonraki = asama === 'ham_lead' ? g.simdi : g.bekleme;
    // Yeniden açılan aşamanın zamanı YENİ değişim anı: kullanıcı aşamaya
    // şimdi (yeniden) ulaştığını söylüyor; iptal edilen eski an değil.
    sayac.yenidenAcilan += await tx.$executeRaw(Prisma.sql`
      UPDATE geri_besleme_olaylari
         SET durum = ${sonra}, deneme = 0, hata = NULL, hata_kodu = NULL,
             olay_zamani = ${new Date(sn * 1000)}::timestamptz,
             sonraki_deneme = ${sonraki}::timestamptz, updated_at = now()
       WHERE lead_id = ${g.leadId}::uuid AND platform = ${GB_PLATFORM} AND asama = ${asama} AND durum = 'iptal'
    `);
  }
  return sayac;
}

async function mevcutAsamalar(tx: Yurutucu, leadId: string): Promise<MevcutAsama[]> {
  return tx.$queryRaw<MevcutAsama[]>(Prisma.sql`
    SELECT asama, durum FROM geri_besleme_olaylari
     WHERE lead_id = ${leadId}::uuid AND platform = ${GB_PLATFORM}
  `);
}

export interface DurumDegisimi {
  leadId: string;
  clientId: string;
  orgId: string;
  onceki: LeadStatus;
  yeni: LeadStatus;
  submittedAt: Date;
  userId: string | null;
  kaynak: 'panel' | 'sistem';
  simdi: Date;
}

/**
 * ═══ DURUM DEĞİŞTİ: GEÇMİŞ + AŞAMA PLANI, AYNI TRANSACTION ═══
 *
 * Geçmiş satırı AYAR KAPALIYKEN DE yazılıyor: gönderim açıldığında son 7
 * günün işaretleri buradan kuyruğa giriyor (Ç-13) ve değişim anı başka hiçbir
 * yerde saklanmıyor. Aynı duruma "değişim" yazılmaz (not güncellemesi).
 */
export async function durumDegisti(tx: Yurutucu, d: DurumDegisimi): Promise<AsamaSayaci & { ayarEtkin: boolean }> {
  if (d.onceki === d.yeni) return { ...bosSayac(), ayarEtkin: false };

  await tx.$executeRaw(Prisma.sql`
    INSERT INTO lead_durum_gecmisi (org_id, client_id, lead_id, onceki_durum, yeni_durum, degistiren_user_id, kaynak, created_at)
    VALUES (${d.orgId}::uuid, ${d.clientId}::uuid, ${d.leadId}::uuid, ${d.onceki}, ${d.yeni},
            ${d.userId}::uuid, ${d.kaynak}, ${d.simdi}::timestamptz)
  `);

  if (!(await ayarEtkinMi(tx, d.clientId))) return { ...bosSayac(), ayarEtkin: false };

  const sayac = await planiUygula(
    tx,
    {
      leadId: d.leadId,
      clientId: d.clientId,
      orgId: d.orgId,
      durum: d.yeni,
      submittedAt: d.submittedAt,
      degisim: d.simdi,
      // GERİ ALMA PENCERESİ (Ç-6): CAPI'de olay silme yok; yanlış tıklama
      // ancak gönderilmeden önce geri alınabilir.
      bekleme: new Date(d.simdi.getTime() + GERI_BESLEME_BEKLEME_DK * 60_000),
      simdi: d.simdi,
    },
    await mevcutAsamalar(tx, d.leadId),
  );
  return { ...sayac, ayarEtkin: true };
}

/**
 * ═══ GÖNDERİM AÇILDI: SON 7 GÜNÜN GERİ DOLDURMASI (MIMARI Ç-13) ═══
 *
 * Yalnız 7 gün içinde doğan lead'lerin ham lead'i ve 7 gün içinde yapılmış
 * işaretler kuyruğa giriyor. Daha eskiler için satır ÜRETİLMİYOR ve SAYISI
 * dönüyor: tek bir eski olay bütün partiyi düşürür ("the whole batch will be
 * discarded") ve sessizce atlamak, kullanıcının neden 412 kaydın gitmediğini
 * hiç öğrenmemesi demek.
 *
 * `eskiOlduguIcinAtlanan` LEAD sayısı: hiçbir aşaması gönderilemeyen kayıt.
 * Ham lead'i eski ama bu hafta işaretlenmiş bir lead kısmen gider ve
 * sayılmaz (ekranda rozetinden görünür).
 */
export async function acilisGeriDoldurma(
  tx: Yurutucu,
  p: { clientId: string; orgId: string; simdi: Date },
): Promise<{ kuyruga: number; eskiOlduguIcinAtlanan: number }> {
  const esik = new Date(p.simdi.getTime() - 7 * 86_400_000);
  const leadler = await tx.$queryRaw<
    Array<{ id: string; status: LeadStatus; submitted_at: Date; degisim: Date | null }>
  >(Prisma.sql`
    SELECT l.id::text AS id, l.status, l.submitted_at,
           (SELECT g.created_at FROM lead_durum_gecmisi g
             WHERE g.lead_id = l.id AND g.yeni_durum = l.status
             ORDER BY g.created_at DESC LIMIT 1) AS degisim
      FROM leads l
     WHERE l.client_id = ${p.clientId}::uuid
  `);

  let kuyruga = 0;
  let eski = 0;
  for (const l of leadler) {
    const degisim = l.degisim ? new Date(l.degisim) : null;
    const submittedAt = new Date(l.submitted_at);
    // Hiçbir aşaması pencereye düşmeyecek lead'e sorgu atılmıyor.
    if (submittedAt < esik && (degisim === null || degisim < esik || l.status === 'new')) {
      eski++;
      continue;
    }
    const s = await planiUygula(
      tx,
      {
        leadId: l.id,
        clientId: p.clientId,
        orgId: p.orgId,
        durum: l.status,
        submittedAt,
        degisim,
        // İşaret 15 dakikadan yeniyse pencere hâlâ açık: kullanıcı geri
        // alabilsin diye kalan süre kadar bekler.
        bekleme: new Date(Math.max(p.simdi.getTime(), (degisim ?? p.simdi).getTime() + GERI_BESLEME_BEKLEME_DK * 60_000)),
        simdi: p.simdi,
      },
      await mevcutAsamalar(tx, l.id),
    );
    kuyruga += s.olusturulan + s.yenidenAcilan;
    if (s.olusturulan + s.yenidenAcilan === 0 && s.eskiAtlanan > 0) eski++;
  }
  return { kuyruga, eskiOlduguIcinAtlanan: eski };
}

/**
 * ═══ GÖNDERİM KAPANDI: BEKLEYENLER İPTAL ═══
 *
 * Kapalı ayarla bekleyen satır kalırsa ayar yeniden açıldığında haftalar
 * önceki işaretler bir anda gider (ve 7 günü geçtiği için düşer).
 */
export async function kapanisIptal(tx: Yurutucu, clientId: string): Promise<number> {
  return tx.$executeRaw(Prisma.sql`
    UPDATE geri_besleme_olaylari
       SET durum = 'iptal', sonraki_deneme = NULL, hata = 'Meta’ya bildirim kapatıldı', updated_at = now()
     WHERE client_id = ${clientId}::uuid AND platform = ${GB_PLATFORM}
       AND durum IN ('bekliyor', 'basarisiz')
  `);
}

/**
 * Yeni lead'in ham lead olayı: kimlik, zaman ve 7 gün kararı. Satırı
 * `lead-sync` TEK DEYİMDE yazıyor (lead INSERT'ü ile aynı CTE); karar burada
 * ki kural iki yerde yazılmasın.
 */
export function hamLeadOlayi(leadId: string, submittedAt: Date, simdi: Date): { olayKimligi: string; olayZamani: Date; pencerede: boolean } {
  const sn = asamaOlayZamani('ham_lead', { leadZamaniMs: submittedAt.getTime(), degisimZamaniMs: submittedAt.getTime() });
  return {
    olayKimligi: geriBeslemeOlayKimligi(leadId, 'ham_lead'),
    olayZamani: new Date(sn * 1000),
    pencerede: metaPenceredeMi(sn, simdi.getTime()),
  };
}
