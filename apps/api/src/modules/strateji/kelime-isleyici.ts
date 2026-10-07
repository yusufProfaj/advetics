import { Prisma } from '@prisma/client';
import { AYRI_GRUP_HACIM_ESIGI, KELIME_VARSAYILAN_HEDEF } from '@advetics/shared';
import { PlatformApiError } from '../connections/provider.types';
import { kelimeGrubu, kelimeSonucunuHazirla, type HamKelimeFikri } from './kelime-tekil';
import type { KelimeAramaIsi } from './kelime-kuyrugu';

/**
 * ═══ KELİME ARAMASI İŞLEYİCİSİ (worker) ═══
 *
 * ÜÇ ADIM, İKİ KISA TRANSACTION, ARADA PLATFORM ÇAĞRISI. Google 1 QPS ve
 * yavaş; çağrı bir transaction'ın içinde olsaydı Prisma'nın 5 saniyelik
 * sınırına takılır ve hata bile yazılamazdı (CLAUDE.md "platform çağrısı
 * transaction'ın İÇİNDE olamaz"). Bu yüzden işleyiciye hazır bir `tx` değil
 * bir ÇALIŞTIRICI veriliyor.
 *
 * HER SONUÇ PLAN SATIRINA YAZILIYOR — dört ayrı hâl, dört ayrı kayıt:
 *   · fikir geldi            → `bitti`, toplam, erişim `var`
 *   · Google yetki reddetti  → `hata`, erişim `yok`, Google'ın mesajı
 *   · başka platform hatası  → `hata`, Google'ın mesajı, erişim değişmez
 *   · SIFIR fikir            → `hata` (erişim `var`). "succeeded + 0 satır"
 *     bu projede bir HATA TÜRÜ: başarılı sayılsaydı ekran boş bir tabloyu
 *     "sonuç" diye gösterir ve kullanıcı nedenini hiç öğrenmezdi.
 */

type Tx = { $queryRaw<T = unknown>(q: Prisma.Sql): Promise<T>; $executeRaw(q: Prisma.Sql): Promise<number> };
export type TxRunner = <T>(fn: (tx: Tx) => Promise<T>) => Promise<T>;

export interface KelimeIsleyiciBagimliliklari {
  tx: TxRunner;
  /** Bağlantının erişim token'ı (kasa çözüyor ve gerekiyorsa tazeliyor). */
  tokenAl(connectionId: string): Promise<string>;
  /** `GoogleProvider.kelimeFikirleri`. */
  fikirler(
    token: string,
    musteriId: string,
    girdi: { tohumlar: readonly string[]; dilKaynagi: string; konumKaynaklari: readonly string[] },
    yoneticiId?: string,
  ): Promise<HamKelimeFikri[]>;
  simdi?: () => Date;
  /** Beklenmeyen hatanın ayrıntısı buraya (plana değil). */
  log?: (mesaj: string) => void;
}

export type KelimeIsSonucu =
  | { durum: 'bitti'; yazilan: number; toplam: number }
  | { durum: 'hata'; sebep: string }
  | { durum: 'atlandi'; sebep: string };

export interface GoogleHesabi {
  id: string;
  connection_id: string;
  external_id: string;
  manager_external_id: string | null;
}

/**
 * Planın kelime aramasında kullanılacak Google hesabı. HEM API'deki ön
 * koşul kontrolü HEM işleyici BUNU çağırıyor: süzgeç iki yerde ayrı
 * yazılsaydı biri "hesap var" deyip diğeri "yok" derdi (CLAUDE.md "aynı
 * süzgeci iki yerde yazma").
 *
 * Yalnız workspace'e ATANMIŞ hesap (`client_id`); havuz hesabı başka bir
 * müşterinin hesabı olabilir. İzlenen hesap önce: izleme kapalı bir hesap
 * çoğu zaman kullanılmayan hesaptır. Hangi hesapla sorulduğu Google'ın
 * hacim cevabını değiştirmiyor (ölçüm geliştirici token'ının seviyesine
 * ait), ama yetki hesabın bağlantısından geliyor.
 */
export async function kelimeHesabi(tx: Tx, clientId: string): Promise<GoogleHesabi | null> {
  const [h] = await tx.$queryRaw<GoogleHesabi[]>(Prisma.sql`
    SELECT id::text, connection_id::text, external_id, manager_external_id
      FROM ad_accounts
     WHERE client_id = ${clientId}::uuid AND platform = 'google'::"Platform"
     ORDER BY sync_enabled DESC, created_at, id
     LIMIT 1`);
  return h ?? null;
}

/**
 * Beklenmeyen hatada plana yazılan SABİT cümle. Ham `err.message` (Prisma,
 * veritabanı, ağ kütüphanesi metni) müşterinin de gördüğü plan ekranına
 * çıkardı: hem anlamsız hem iç yapıyı sızdıran bir metin. Ayrıntı log'a.
 * Yalnız `PlatformApiError` mesajı olduğu gibi gösteriliyor: o Google'ın
 * kendi açıklaması ve kullanıcının yapacağı iş ondan anlaşılıyor.
 */
export const BEKLENMEYEN_HATA = 'Kelime araması beklenmeyen bir hatayla durdu. Biraz sonra yeniden deneyin.';

/** Plana yazılacak hata cümlesi: platform mesajı ya da sabit cümle. */
export function gosterilecekHata(e: unknown): string {
  return e instanceof PlatformApiError ? e.message : BEKLENMEYEN_HATA;
}

/*
 * Her durum yazımı AKTİF ARAMA KİMLİĞİNE bağlı (`kelime_arama_id`). Bayat
 * bir iş (15 dakikadan uzun kuyrukta kalmış, kullanıcı o arada yeniden
 * aramış) planın durumunu ve kelimelerini EZMEMELİ; etkilenen satır sıfır
 * olur ve iş sessizce değil `atlandi` sonucuyla biter.
 */
async function hataYaz(d: KelimeIsleyiciBagimliliklari, is: KelimeAramaIsi, sebep: string, erisimYok: boolean): Promise<void> {
  await d.tx((t) =>
    t.$executeRaw(Prisma.sql`
      UPDATE strateji_planlari
         SET kelime_arama = 'hata',
             kelime_son_hata = ${sebep.slice(0, 2000)},
             kelime_erisim = CASE WHEN ${erisimYok}::boolean THEN 'yok' ELSE kelime_erisim END
       WHERE id = ${is.planId}::uuid AND kelime_arama_id = ${is.aramaId}::uuid`),
  );
}

const BAYAT = 'Daha yeni bir arama başlatılmış; bu işin sonucu yazılmadı.';

export async function kelimeIsiniIsle(d: KelimeIsleyiciBagimliliklari, is: KelimeAramaIsi): Promise<KelimeIsSonucu> {
  // ── 1. Ön koşullar (kısa transaction) ─────────────────────────────────
  const hazirlik = await d.tx(async (t) => {
    const [p] = await t.$queryRaw<Array<{ client_id: string; org_id: string; durum: string; kelime_arama_id: string | null }>>(Prisma.sql`
      SELECT client_id::text, org_id::text, durum, kelime_arama_id::text
        FROM strateji_planlari WHERE id = ${is.planId}::uuid FOR UPDATE`);
    if (!p) return { tur: 'yok' as const };
    if (p.kelime_arama_id !== is.aramaId) return { tur: 'bayat' as const };
    // Kuyrukta beklerken plan onaya gönderilmiş olabilir: onaydaki plan
    // değişmez, sonuç yazılmaz ve bunun nedeni plana yazılır.
    if (p.durum !== 'taslak') return { tur: 'taslak_degil' as const };
    const hesap = await kelimeHesabi(t, p.client_id);
    if (!hesap) return { tur: 'hesap_yok' as const };
    await t.$executeRaw(Prisma.sql`
      UPDATE strateji_planlari SET kelime_arama = 'calisiyor' WHERE id = ${is.planId}::uuid`);
    return { tur: 'tamam' as const, plan: p, hesap };
  });
  if (hazirlik.tur === 'yok') return { durum: 'atlandi', sebep: 'Plan bulunamadı' };
  if (hazirlik.tur === 'bayat') return { durum: 'atlandi', sebep: BAYAT };
  if (hazirlik.tur === 'taslak_degil') {
    const sebep = 'Plan arama sürerken taslaktan çıktı; sonuçlar yazılmadı.';
    await hataYaz(d, is, sebep, false);
    return { durum: 'hata', sebep };
  }
  if (hazirlik.tur === 'hesap_yok') {
    // API ön koşulu kontrol etmişti; arada hesap kaldırılmış.
    const sebep = 'Bu workspace’e atanmış Google Ads hesabı kalmadı; arama yapılmadı.';
    await hataYaz(d, is, sebep, false);
    return { durum: 'hata', sebep };
  }
  const { plan, hesap } = hazirlik;

  // ── 2. Platform çağrısı (TRANSACTION DIŞINDA) ─────────────────────────
  let ham: HamKelimeFikri[];
  try {
    const token = await d.tokenAl(hesap.connection_id);
    ham = await d.fikirler(
      token,
      hesap.external_id,
      { tohumlar: is.tohumlar, ...KELIME_VARSAYILAN_HEDEF },
      hesap.manager_external_id ?? undefined,
    );
  } catch (e) {
    const sebep = gosterilecekHata(e);
    if (!(e instanceof PlatformApiError)) d.log?.(`strateji-kelime ${is.planId}: ${e instanceof Error ? e.stack ?? e.message : String(e)}`);
    // YETKİ REDDİ = erişim yok. Ö-1 erişimi ölçtü (VAR) ama geliştirici
    // token'ının seviyesi değişebilir; o gün ekran "yok" demeli, uydurma bir
    // "sonuç yok" değil. Token geçersizliği (`invalid_token`) erişim
    // sorunu DEĞİL, bağlantı sorunu: erişim durumu değişmez.
    const erisimYok = e instanceof PlatformApiError && e.kind === 'permission_denied';
    await hataYaz(d, is, sebep, erisimYok);
    return { durum: 'hata', sebep };
  }

  const { satirlar, toplam } = kelimeSonucunuHazirla(ham);
  if (satirlar.length === 0) {
    const sebep = 'Google bu kelimeler için fikir döndürmedi. Daha genel kelimelerle yeniden deneyin.';
    await d.tx((t) =>
      t.$executeRaw(Prisma.sql`
        UPDATE strateji_planlari
           SET kelime_arama = 'hata', kelime_son_hata = ${sebep}, kelime_erisim = 'var', kelime_toplam = 0
         WHERE id = ${is.planId}::uuid AND kelime_arama_id = ${is.aramaId}::uuid`),
    );
    return { durum: 'hata', sebep };
  }

  // ── 3. Yazım (kısa transaction) ───────────────────────────────────────
  const cekim = (d.simdi ?? (() => new Date()))();
  const kaynakIstek = JSON.stringify({
    tohumlar: is.tohumlar,
    dil: KELIME_VARSAYILAN_HEDEF.dilKaynagi,
    konumlar: KELIME_VARSAYILAN_HEDEF.konumKaynaklari,
    hesap: hesap.external_id,
  });
  /*
   * KİLİT VE KONTROL AYNI TRANSACTION'DA. Durum ve arama kimliği `FOR
   * UPDATE` ile okunuyor ve DELETE + INSERT + plan UPDATE aynı transaction
   * içinde: (a) plan arada onaya gönderilemez (onaya gönderme aynı satırı
   * kilitlemek zorunda), yani onaydaki planın SEÇİLİ kelimelerinin hacmi
   * sessizce değişmez; (b) INSERT düşerse DELETE de geri alınır ve
   * seçilmemiş fikirler silinmiş, yenileri yazılmamış hâlde kalmaz. Bu ancak
   * çalıştırıcı GERÇEK bir transaction açıyorsa doğru (worker.ts
   * `$transaction`; strateji-guvenlik.spec kilitliyor).
   */
  const yazim = await d.tx(async (t) => {
    const [guncel] = await t.$queryRaw<Array<{ durum: string; kelime_arama_id: string | null }>>(Prisma.sql`
      SELECT durum, kelime_arama_id::text FROM strateji_planlari WHERE id = ${is.planId}::uuid FOR UPDATE`);
    if (guncel?.kelime_arama_id !== is.aramaId) return 'bayat' as const;
    if (guncel.durum !== 'taslak') return 'taslak_degil' as const;
    /*
     * SEÇİLİ ya da GRUBU ELLE YAZILMIŞ SATIRLAR KALIR. İkisi de kullanıcının
     * kararı: yeni arama yalnızca kullanıcının dokunmadığı fikirleri
     * değiştiriyor (elle grup verilmiş bir fikri silmek, o emeği aramayla
     * sessizce yok etmek olurdu). Aynı kelime
     * yeniden gelirse metrikleri tazeleniyor, seçimi korunuyor; grubu bu
     * aramanın tohumlarıyla yeniden hesaplanıyor, ELLE YAZILMIŞSA
     * (`grup_elle`) dokunulmuyor (MIMARI § 6.2).
     */
    await t.$executeRaw(Prisma.sql`
      DELETE FROM strateji_kelimeleri WHERE plan_id = ${is.planId}::uuid AND secili = false AND grup_elle = false`);
    const degerler = satirlar.map(
      (s) => Prisma.sql`(${is.planId}::uuid, ${plan.org_id}::uuid, ${plan.client_id}::uuid, ${s.kelime},
        ${s.varyantlar}::text[], ${s.aylikArama}::bigint, ${s.rekabet}, ${s.teklifAltMicros}::bigint,
        ${s.teklifUstMicros}::bigint, ${cekim}::timestamptz, ${kaynakIstek}::jsonb,
        ${kelimeGrubu(s.kelime, s.aylikArama, is.tohumlar, AYRI_GRUP_HACIM_ESIGI)})`,
    );
    await t.$executeRaw(Prisma.sql`
      INSERT INTO strateji_kelimeleri
        (plan_id, org_id, client_id, kelime, varyantlar, aylik_arama, rekabet,
         teklif_alt_micros, teklif_ust_micros, cekim_zamani, kaynak_istek, grup)
      VALUES ${Prisma.join(degerler)}
      ON CONFLICT (plan_id, lower(kelime)) DO UPDATE SET
        varyantlar = EXCLUDED.varyantlar,
        aylik_arama = EXCLUDED.aylik_arama,
        rekabet = EXCLUDED.rekabet,
        teklif_alt_micros = EXCLUDED.teklif_alt_micros,
        teklif_ust_micros = EXCLUDED.teklif_ust_micros,
        cekim_zamani = EXCLUDED.cekim_zamani,
        kaynak_istek = EXCLUDED.kaynak_istek,
        grup = CASE WHEN strateji_kelimeleri.grup_elle THEN strateji_kelimeleri.grup ELSE EXCLUDED.grup END`);
    /*
     * TOPLAM, ÖNCEKİ ARAMADAN KALAN SEÇİLİ SATIRLARI DA SAYAR. Bu aramada
     * gelmeyen ama kullanıcının seçtiği eski kelimeler tabloda duruyor;
     * yalnız Google'ın sayısını yazmak ekranda "gösterilen > toplam" gibi
     * anlamsız bir oran üretirdi.
     */
    const [kalan] = await t.$queryRaw<Array<{ n: number }>>(Prisma.sql`
      SELECT count(*)::int AS n FROM strateji_kelimeleri
       WHERE plan_id = ${is.planId}::uuid
         AND lower(kelime) <> ALL (SELECT lower(x) FROM unnest(${satirlar.map((x) => x.kelime)}::text[]) AS x)`);
    await t.$executeRaw(Prisma.sql`
      UPDATE strateji_planlari
         SET kelime_arama = 'bitti', kelime_son_hata = NULL, kelime_erisim = 'var',
             kelime_toplam = ${toplam + (kalan?.n ?? 0)}
       WHERE id = ${is.planId}::uuid AND kelime_arama_id = ${is.aramaId}::uuid`);
    return 'yazildi' as const;
  });
  if (yazim === 'bayat') return { durum: 'atlandi', sebep: BAYAT };
  if (yazim === 'taslak_degil') {
    const sebep = 'Plan arama sürerken taslaktan çıktı; sonuçlar yazılmadı.';
    await hataYaz(d, is, sebep, false);
    return { durum: 'hata', sebep };
  }
  return { durum: 'bitti', yazilan: satirlar.length, toplam };
}
