/**
 * ═══ "HER WORKSPACE'E KENDİ ŞİRKETİ" — KARARLAR ═══
 *
 * `workspace-basina-sirket.ts` ne YAPACAĞINA burada karar veriyor. Ayrı
 * dosya olmasının sebebi test edilebilirlik: script modül seviyesinde bir
 * `PrismaClient` kuruyor ve en altta `main()` çağırıyor, yani onu import
 * eden bir test taşımayı BAŞLATIRDI.
 *
 * İkisi de bu işin sessizce yanlış yapabileceği türden kararlar: yanlış
 * şirketi boşaltmak ve yanlış kullanıcıyı taşımak. İkisi de çalıştırılarak
 * sınanıyor.
 */
/**
 * ŞİRKET BOŞALTILSIN MI — saf karar, tek yerde.
 *
 * AJANSIN KENDİ şirketi HER ZAMAN boşalıyor: ajans organizasyonu bir kabuk
 * olmalı ve içinde müşteri verisi tutması bu ayrımın var olma sebebine
 * aykırı. Başka bir şirket ancak BİRDEN ÇOK workspace taşıyorsa boşalıyor —
 * tek workspace'i olan şirket zaten istenen düzende ve ona yeni bir şirket
 * açmak aynı şeyin ikinci kopyasını üretmek olurdu.
 *
 * BİRDEN ÇOK WORKSPACE'TE HEPSİ TAŞINIYOR, biri kalmıyor: "birincisi
 * kalsın" demek keyfî bir seçim ve script keyfî seçim yapmamalı.
 *
 * SAF VE DIŞARI ÇIKARILMIŞ: bu karar scriptin ne yapacağını belirliyor ve
 * bir döngünün içinde gömülü kalırsa sınanacak bir yüzeyi olmuyor.
 */
export function sirketBosaltilsinMi(evMi: boolean, workspaceSayisi: number): boolean {
  if (workspaceSayisi === 0) return false;
  return evMi || workspaceSayisi > 1;
}

/** `kullanicilariAyir` için gereken en küçük kullanıcı şekli. */
export interface KullaniciGirdisi {
  id: string;
  email: string;
  memberships: Array<{ clientId: string | null; role: string }>;
  managerMemberships: Array<{ id: string }>;
}

/**
 * Bu workspace ile birlikte hangi kullanıcılar taşınmalı.
 *
 * ═══ NEDEN TAŞINMAK ZORUNDALAR ═══
 *
 * `users.org_id` bir workspace'e değil ORGANİZASYONA bağlı, o yüzden
 * `workspaceTasi` onu taşımıyor (panelden yapılan tek bir taşımada
 * kullanıcıyı taşımak yanlış olurdu). Ama bu toplu işte taşımamak KİLİTLENME
 * üretiyor: `TenantContextService` aktif şirketi `users.org_id`den çözüyor,
 * üyelikleri o şirkete süzüyor ve hiçbiri kalmazsa 401 atıyor. Yani
 * workspace'i taşıyıp müşterinin kendi giriş hesabını ajansta bırakmak, o
 * hesabı GİRİŞTE kilitliyor.
 *
 * TAŞINIR: üst hesap üyeliği BULUNMAYAN ve BÜTÜN üyelikleri bu workspace'e
 * bağlı olan kullanıcı — pratikte müşterinin kendi giriş hesabı ve yalnızca
 * o workspace'e atanmış danışman.
 *
 * TAŞINMAZ, SESSİZ: org geneli üyeliği (`clientId === null`) olan ya da üst
 * hesaba bağlı kullanıcı — ajans personeli. Erişimleri kaynak şirkette
 * duruyor ve üst hesap üzerinden yeni şirkete zaten geçebiliyorlar.
 *
 * TAŞINMAZ, UYARIR: üyelikleri birden çok workspace'e dağılmış kullanıcı.
 * İki şirkete birden taşınamaz ve kaynakta bırakılırsa oradaki üyelikleri
 * de taşındığı için erişimi kalmaz. Bu GERÇEK bir belirsizlik ve script onu
 * sessizce çözmemeli — yanlış şirkete atanmış bir hesap, kilitlenmiş bir
 * hesaptan daha kötü.
 */
export function kullanicilariAyir(
  kullanicilar: KullaniciGirdisi[],
  clientId: string,
): {
  tasinacak: Array<{ id: string; email: string; rol: string }>;
  kalanRiskli: Array<{ email: string }>;
} {
  const tasinacak: Array<{ id: string; email: string; rol: string }> = [];
  const kalanRiskli: Array<{ email: string }> = [];

  for (const u of kullanicilar) {
    // AJANS PERSONELİ: üst hesaba bağlı ya da org geneli üyeliği var.
    if (u.managerMemberships.length > 0 || u.memberships.some((m) => m.clientId === null)) {
      continue;
    }

    /*
     * `every` KULLANILIYOR, `some` DEĞİL VE FARK BELİRLEYİCİ. `some` ile
     * yazmak, iki workspace'e birden yetkili bir hesabı ilkinin şirketine
     * taşırdı: ikinci workspace'teki erişimi sessizce kaybolurdu.
     */
    const hepsiBurada =
      u.memberships.length > 0 && u.memberships.every((m) => m.clientId === clientId);
    if (hepsiBurada) {
      const rol = u.memberships.find((m) => m.clientId === clientId)?.role ?? 'bilinmiyor';
      tasinacak.push({ id: u.id, email: u.email, rol });
    } else {
      kalanRiskli.push({ email: u.email });
    }
  }

  return { tasinacak, kalanRiskli };
}
