import type { ConnectionStatus } from '@prisma/client';

/**
 * ═══ SAHİPLİK BAĞLANTIDAN GELİR — ATAMA ÖDÜNÇ VERİR ═══
 *
 * Bir reklam hesabının ya da sayfanın SAHİBİ, onu keşfeden bağlantının
 * şirketi. Atama o satırı bir workspace'e ödünç veriyor: `org_id` hedef
 * şirkete taşınıyor (kompozit anahtar bunu istiyor) ama sahip değişmiyor.
 *
 * Müşteri kendi Meta'sını bağlayana kadar tek sahip vardı, ajans, ve bu
 * ayrımın bir karşılığı yoktu. İkinci sahip doğunca dört şey sessizce
 * bozuluyordu:
 *
 *   K1  Müşterinin kendi hesabı BAŞKA bir müşteriye atanabiliyordu. RLS
 *       havuzu kapatıyor (`app.havuz_kapsaminda`) ama ATANMIŞ satır
 *       `org_kapsaminda` ile açılıyor ve "tüm şirketler" modunda o bütün
 *       şirketler demek — yani atanmış bir 3A hesabı moddayken Biltaş'a
 *       taşınabiliyordu. Bu kapı nezaket değil, tek kapı.
 *   K2  Atama kaldırılınca satır BULUNDUĞU şirkette kalıyordu. Ajansın
 *       hesabı 3A'dan çözülünce 3A'nın havuzuna düşer ve bir daha hiçbir
 *       kardeş şirketten görünmezdi.
 *   K3  Keşif, atanmış satırın `connection_id`sini yeni bağlantıya
 *       geçiriyordu — bkz. `baglantiKorunsunMu`.
 *   K4  Müşteri admini ajansın yaptığı atamayı kaldırabiliyordu.
 *
 * SAF VE DIŞARIDA: iki atama yolu (hesap ve sayfa) aynı kararı veriyor.
 * İkisinde ayrı yazılsaydı biri bir gün diğerini tutmazdı ve fark yalnızca
 * yanlış şirkete düşen bir satır olarak görünürdü.
 */

export type SahiplikKarari = { ok: true; yeniOrgId: string } | { ok: false; mesaj: string };

export interface SahiplikGirdisi {
  /** Mesajda kullanılıyor: "reklam hesabı" / "sayfa". */
  tur: string;
  ad: string;
  /** Satırın ŞU AN bulunduğu şirket. */
  satirOrgId: string;
  /** Satırı keşfeden bağlantının şirketi — SAHİP. */
  baglantiOrgId: string;
  /** Hedef workspace'in şirketi; `null` = atamayı kaldır. */
  hedefOrgId: string | null;
  /** `ctx.orgId` — politikaların `current_org_id()`si. */
  aktifOrgId: string;
  /** Üst hesap üyeliği var mı (`ctx.managerAccountId !== null`). */
  ustHesapVar: boolean;
  /** Üst hesabın `ajans_org_id`si — yoksa `null`. */
  ajansOrgId: string | null;
}

export function sahiplikKarari(p: SahiplikGirdisi): SahiplikKarari {
  /*
   * AJANS YALNIZCA ÜYELİKLE GÖRÜLÜR. Politika da aynı şeyi yapıyor:
   * `app.ajans_org_id()` üyelik yokken NULL. Burada üyeliksiz bir
   * kullanıcıya ajansı "bilinen" saymak, veritabanının reddedeceği bir
   * yazmayı onaylayıp kullanıcıya ham bir politika hatası göstermek olurdu.
   */
  const ajans = p.ustHesapVar ? p.ajansOrgId : null;

  // K4 — AJANSIN ATAMASINI AJANS DEĞİŞTİRİR.
  if (!p.ustHesapVar && p.baglantiOrgId !== p.aktifOrgId) {
    return {
      ok: false,
      mesaj: `"${p.ad}" ajansın bağlantısından geliyor. Bu atamayı yalnızca ajans değiştirebilir.`,
    };
  }

  if (p.hedefOrgId !== null) {
    // K1 — MÜŞTERİNİN KENDİ HESABI YALNIZCA KENDİ ŞİRKETİNE.
    const ajansinki = ajans !== null && p.baglantiOrgId === ajans;
    if (!ajansinki && p.baglantiOrgId !== p.hedefOrgId) {
      return {
        ok: false,
        mesaj:
          `"${p.ad}" başka bir şirketin kendi bağlantısından gelen bir ${p.tur}. ` +
          `Yalnızca o şirketin workspace'lerine atanabilir.`,
      };
    }
    return { ok: true, yeniOrgId: p.hedefOrgId };
  }

  /*
   * K2 — KALDIRMADA SAHİBİNE DÖN.
   *
   * Dönülen satır havuz satırı olacak ve YENİ satır tablonun SELECT
   * politikasından da geçmek zorunda (CLAUDE.md). Havuz ancak kendi
   * şirketinde ya da ajansta görünüyor; başka bir müşterinin satırını "tüm
   * şirketler" modundan çözmeye kalkmak veritabanında "new row violates
   * row-level security policy" ile düşerdi. Sebep önceden söyleniyor.
   */
  const donus = p.baglantiOrgId;
  if (donus !== p.aktifOrgId && donus !== ajans) {
    return {
      ok: false,
      mesaj:
        `"${p.ad}" başka bir şirketin kendi bağlantısından geliyor. ` +
        `Atamayı kaldırmak için o şirkete geç.`,
    };
  }
  return { ok: true, yeniOrgId: donus };
}

/**
 * HEDEF ŞİRKETTE AYNI HESABIN BAŞKA BİR SATIRI VAR MI — sonra ne olur.
 *
 * Tekil anahtar `(platform, external_id, org_id)`: aynı hesap iki şirkette
 * iki satır olabiliyor ve müşteri kendi Meta'sını bağlayınca bu SIRADAN bir
 * hâl oluyor (ajansın havuzunda da, müşterinin havuzunda da `act_123`).
 * `org_id`yi o şirkete çekmek tekil anahtarı patlatır ve kullanıcı yalnızca
 * "kayıt zaten var" görür.
 *
 *   · ATAMADA reddediliyor ve hangi kaydın atanacağı söyleniyor. Satırları
 *     birleştirmek geçmişi taşımak demek; bu kapı bunu sessizce yapmamalı.
 *   · KALDIRMADA satır olduğu yerde kalıyor ve bu SÖYLENİYOR. Reddetmek,
 *     kullanıcının bir atamayı hiç kaldıramaması demekti.
 */
export type CakismaKarari =
  | { ok: true; orgId: string; not: string | null }
  | { ok: false; mesaj: string };

export function cakismaKarari(p: {
  atama: boolean;
  ad: string;
  satirOrgId: string;
  yeniOrgId: string;
  cakisanVar: boolean;
}): CakismaKarari {
  if (p.yeniOrgId === p.satirOrgId || !p.cakisanVar) {
    return { ok: true, orgId: p.yeniOrgId, not: null };
  }
  if (p.atama) {
    return {
      ok: false,
      mesaj:
        `"${p.ad}" bu şirkette zaten ayrı bir kayıt olarak duruyor (şirketin kendi ` +
        `bağlantısından). Listeden o kaydı ata.`,
    };
  }
  return {
    ok: true,
    orgId: p.satirOrgId,
    not:
      `"${p.ad}" ajans havuzunda ayrı bir kayıt olarak da duruyor; bu kayıt ` +
      `şirketin havuzunda kaldı.`,
  };
}

/**
 * K3 — ATANMIŞ SATIRIN BAĞLANTISI KEŞİFLE DEĞİŞMEZ, ÖLMEDİKÇE.
 *
 * Keşif upsert'i `connection_id`yi her yenilemede yazıyordu. Sıra:
 *   1. Profaj `act_123`'ü 3A'ya atıyor; satır 3A'nın şirketine taşınıyor.
 *   2. 3A kendi Meta'sını bağlıyor; aynı hesap keşfediliyor, anahtar aynı
 *      satırı buluyor ve `connection_id` 3A'nın bağlantısına geçiyor.
 *   3. 3A bir gün bağlantısını kaldırıyor; `disconnect` o bağlantıdaki her
 *      hesapta izlemeyi kapatıyor.
 *   4. Profaj'ın atadığı hesabın verisi DURUYOR — Profaj'ın bağlantısı o
 *      hesaba hâlâ erişebildiği hâlde. Hata yok, ekran "bağlı" diyordu.
 *
 * Mevcut bağlantı ÖLÜYSE devralmaya izin var: aksi hâlde yenilenmesi
 * gereken bir token, çalışan bir yedeği olan hesabı kalıcı olarak
 * susturur. `error` ölü SAYILMIYOR — geçici bir kota ya da ağ hatası
 * sahipliği el değiştirmemeli; sayılsaydı iki bağlantı arasında gidip
 * gelen bir `connection_id` olurdu.
 *
 * ATANMAMIŞ SATIRDA KORUMA YOK: havuz satırının bağlantısı keşfedenle
 * birlikte değişiyor (bugünkü davranış) ve workspace bağlantısının
 * sahipsiz satırları sahiplenmesi buna dayanıyor.
 */
export function baglantiKorunsunMu(p: {
  mevcutClientId: string | null;
  mevcutConnectionId: string;
  mevcutBaglantiDurumu: ConnectionStatus;
  yeniConnectionId: string;
}): boolean {
  if (p.mevcutClientId === null) return false;
  if (p.mevcutConnectionId === p.yeniConnectionId) return false;
  return p.mevcutBaglantiDurumu !== 'revoked' && p.mevcutBaglantiDurumu !== 'needs_reauth';
}
