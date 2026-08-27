import { Prisma } from '@prisma/client';

/**
 * REKLAM HESABI EL DEĞİŞTİRİNCE VERİSİ DE TAŞINIR.
 *
 * `client_id` bu kod tabanında BİLEREK denormalize: RLS politikaları
 * (`app.can_access_client(client_id)`) join'siz yazılabilsin diye her çocuk
 * satır kendi müşterisini taşıyor — 47 milyon satırlı bir tabloda politika
 * içindeki join sorgu planını mahvediyor (bkz. `prisma/sql/02_rls.sql`).
 *
 * Bedeli şuydu: `assignAdAccount` YALNIZCA `ad_accounts.client_id`'yi
 * güncelliyordu. Hesap A müşterisinden B'ye alınınca ortaya çıkan tablo:
 *
 *   · A'nın raporunda ARTIK ONA AİT OLMAYAN harcama görünmeye devam ediyor —
 *     başka bir markanın parası, A'nın PDF'inde. Bu bir gösterim hatası değil,
 *     yanlış müşteriye gönderilmiş bir finansal belge.
 *   · B hiçbir geçmiş göremiyor: veri duruyor ama RLS onu B'ye açmıyor.
 *   · Bir sonraki senkronizasyon YENİ satırları B'ye yazıyor, eskiler A'da
 *     kalıyor — aynı hesabın geçmişi iki müşteriye BÖLÜNÜYOR.
 *
 * Hiçbiri hata üretmiyor. Belirti yalnızca "rakamlar tutmuyor".
 *
 * KENDİLİĞİNDEN DÜZELMİYOR — ölçüldü. Yapı ve metrik yazan yedi `ON CONFLICT
 * DO UPDATE` bloğunun hiçbiri `client_id`'yi güncellemiyordu; `creatives`
 * upsert'i `ad_account_id = EXCLUDED.ad_account_id` yazıp `client_id`'yi
 * atlıyordu. Yani "yeniden senkronize et" tavsiyesi de işe yaramıyordu.
 * Upsert'ler artık `client_id`'yi de taşıyor (ikinci savunma hattı), ama
 * yalnızca ona güvenmek arşivlenmiş kampanyaların satırlarını sonsuza kadar
 * eski müşteride bırakırdı: platform onları bir daha döndürmüyor.
 */

/**
 * Satırları HESABA ait olan tablolar — hesap nereye giderse oraya giderler.
 *
 * Ortak özellikleri: hepsi platformun aynası ya da ölçülmüş performans. Hiçbiri
 * bir kullanıcının kararı değil. Bir kampanyanın hangi müşteriye ait olduğu
 * sorusunun tek cevabı, o kampanyanın koştuğu reklam hesabının kime atandığı.
 *
 * TEKİL KISIT ÇAKIŞMASI YOK — kontrol edildi: `campaigns`, `ad_groups`, `ads`
 * ve `creatives` `(platform, external_id)` ile tekil; `insights_daily`
 * `(date, entity_level, entity_id, breakdown_key)`; `keyword_insights`
 * `(date, ad_account_id, external_criterion_id)`; `search_term_insights`
 * `(date, ad_account_id, term_hash)`. HİÇBİRİNDE `client_id` yok, dolayısıyla
 * taşıma bir tekil kısıt ihlali üretemez. Bu liste büyütülürken aynı kontrol
 * tekrarlanmalı: `client_id` içeren bir tekil indeks, hedef müşteride aynı
 * anahtar zaten varsa taşımanın ORTASINDA patlar.
 */
export const HESABIN_KENDI_VERISI = [
  { tablo: 'campaigns', etiket: 'kampanya' },
  { tablo: 'ad_groups', etiket: 'reklam grubu' },
  { tablo: 'ads', etiket: 'reklam' },
  { tablo: 'creatives', etiket: 'kreatif' },
  { tablo: 'insights_daily', etiket: 'günlük metrik' },
  { tablo: 'keyword_insights', etiket: 'anahtar kelime metriği' },
  { tablo: 'search_term_insights', etiket: 'arama terimi' },
  /*
   * KIRILIM VERİSİ DE HESABIN KENDİ VERİSİ. Taşınmazsa eski müşterinin
   * raporunda artık ona ait olmayan kitle kırılımı (yaş, cinsiyet, şehir)
   * görünmeye devam eder ve yeni müşteri hiçbir geçmiş göremez — metrikte
   * düzeltilen hatanın birebir aynısı.
   */
  { tablo: 'insight_breakdowns', etiket: 'kitle kırılımı' },
  /*
   * `sync_jobs` DA TAŞINIYOR ve bu bir tercih değil, teşhisin koşulu.
   *
   * Senkronizasyon durumu ekranı işleri müşteriye göre süzüyor. Taşınmazsa
   * hesabı yeni alan müşteride ekran "Yapı: hiç · Metrik: hiç" diyor — tam
   * olarak Mirnas'ta günler harcatan belirti. İş kaydı "kim ne yaptı"nın değil
   * "bu hesap ne zaman tarandı"nın kaydı; denetim izi `audit_logs`'ta ve o
   * TAŞINMIYOR.
   */
  { tablo: 'sync_jobs', etiket: 'senkronizasyon işi' },
] as const;

/**
 * Satırları MÜŞTERİYE ait olan tablolar — hesap gitse de yerlerinde kalırlar.
 *
 * Hepsi bir kullanıcının kararı: birinin yazdığı taslak, kurduğu kural,
 * girdiği bütçe. Bunları taşımak, B müşterisinin hesabına A'nın hiç
 * görmediği bir kural ya da hiç onaylamadığı bir bütçe koymak olurdu.
 *
 * `monthly_budgets` ayrıca teknik olarak da taşınamaz: `monthly_budgets_
 * account_uniq` kısmi tekil indeksi `(client_id, ad_account_id, month)`
 * üzerinde ve hedef müşteride aynı ay için bir satır varsa taşıma patlar —
 * yani işlemin YARISI yapılmış olurdu.
 *
 * Sessiz bırakılmıyorlar: sayıları atama yanıtında dönüyor ve panelde
 * yazılıyor. `assignSocialProfile`'daki `leftBehindForms` deseninin aynısı;
 * oradaki gerekçe de aynıydı — kullanıcı taşıdıktan sonra "formlarım nerede"
 * diye aramasın.
 */
export const MUSTERIDE_KALAN = [
  {
    tablo: 'monthly_budgets',
    etiket: 'aylık bütçe',
    /*
     * `ad_account_id` NULL = MÜŞTERİ GENELİ (şemsiye) bütçe.
     *
     * Bu satır hiçbir hesaba bağlı değil, dolayısıyla `ad_account_id` ile
     * sayan sorguya HİÇ düşmüyordu. Oysa taşımadan en çok o etkileniyor:
     * ay ortasında hesap gidince eski müşterinin harcaması bir anda düşüyor,
     * kural motorunun bütçe bekçisi olmayan bir boşluk görüyor ve kuralların
     * bütçe ARTIRMASINA izin veriyor. Yeni müşteride ise harcama var, bütçe
     * yok.
     *
     * YALNIZCA İÇİNDE BULUNULAN AY: kapanmış ayın bütçesi artık bir eşik
     * değil, geçmiş kayıt. Hepsini bildirmek her taşımada anlamsız bir uyarı
     * üretir ve uyarı körlüğü yaratırdı.
     */
    musteriGeneliEtiket: 'ay geneli (şemsiye) bütçe',
    ayaBagli: true,
  },
  {
    tablo: 'rules',
    etiket: 'kural',
    /*
     * `ad_account_id` NULL = müşterinin TÜM reklam hesapları — ve kuralların
     * EN YAYGIN şekli bu. Hesaba çivilenmiş kural azınlıkta; yani sayım
     * yalnızca `= hesap` deseydi, taşınan hesabı gerçekten yöneten kural
     * hiç raporlanmazdı. Şemsiye bütçedeki boşluğun aynısı.
     */
    musteriGeneliEtiket: 'tüm hesapları kapsayan kural',
    ayaBagli: false,
  },
  { tablo: 'boosts', etiket: 'boost' },
  { tablo: 'ad_drafts', etiket: 'reklam taslağı' },
  /*
   * `draft_campaigns` KALIYOR — ama bu, iki kötü seçenekten daha az kötü
   * olanı ve kullanıcıya söylenmesi gereken bir ÜRÜN kararı.
   *
   * Tabloda iki farklı popülasyon var. (1) Kullanıcının kurduğu ağaç: taşımak
   * mümkün DEĞİL, çünkü yaprakları (`draft_ads.creative_id` → `ad_creatives`)
   * salt müşteriye ait — `ad_creatives` tablosunda `ad_account_id` KOLONU
   * YOK, yani kreatif hesabı takip edemiyor. Kampanyayı taşıyıp kreatifleri
   * bırakmak, o taslak yayınlandığında A'nın kreatifini B'nin hesabında
   * yayına çıkarırdı; üstelik yayın özel reklam kategorilerini kampanyanın
   * müşterisinden okuyor (A emlak, B değilse hedefleme kısıtı sessizce
   * KALKAR). (2) Yayınlanmış ayna satırları: bunların ikizi `campaigns`
   * tablosunda ve o TAŞINIYOR — yani aynı kampanya iki tabloda iki müşteride
   * görünüyor.
   *
   * Bedeli: "Reklamlar" ekranı ağacı `ad_accounts` üzerinden INNER JOIN ile
   * okuyor, dolayısıyla atamadan sonra taslak A'nın ekranından da kayboluyor
   * (hesap artık A'ya görünmüyor) ve B'de zaten görünmüyor. Sayı `kalan`
   * içinde raporlanıyor; kalıcı çözüm `ad_creatives`'e hesap bağı eklemekten
   * geçiyor ve o ayrı bir iş.
   */
  { tablo: 'draft_campaigns', etiket: 'taslak kampanya' },
  { tablo: 'bulk_batches', etiket: 'toplu işlem' },
] as const;

export type TasimaSonucu = {
  /** Tablo başına taşınan satır sayısı — sıfır olanlar da yazılıyor. */
  tasinan: Record<string, number>;
  toplam: number;
  /** Yeni müşteriye GEÇMEYEN kullanıcı kayıtları: etiket → adet (yalnızca > 0). */
  kalan: Record<string, number>;
  /**
   * Hesap havuza geri konurken eski müşteride kalan VERİ satırı sayısı.
   *
   * Atamada her zaman 0 (hepsi taşındı). Yalnızca kaldırmada anlamlı ve
   * orada tek gösterge o: "Kaldır"a basan kullanıcı verinin silinmediğini
   * ve nerede durduğunu görmeli.
   */
  kalanVeri: number;
  /**
   * Eski müşterinin HESABA BAĞLI OLMAYAN kayıtları: etiket → adet.
   *
   * `ad_account_id IS NULL` olan satırlar ("tüm hesaplar" kuralı, ay geneli
   * bütçe) hiçbir hesaba bağlı değil ve `ad_account_id` ile sayan sorguya
   * DÜŞMÜYOR — bu yüzden `kalan` listesinde hiç görünmüyorlardı. Oysa bu
   * hesabı gerçekten yöneten kayıtlar çoğunlukla bunlar. Taşınmıyorlar
   * (müşterinin tamamı için kurulmuşlar), ama SÖYLENİYORLAR.
   */
  musteriGeneli: Record<string, number>;
  /**
   * Faturalandırma bağı koparılan sayfa sayısı.
   *
   * `linkAdAccountForBoost` "hesap ve sayfa AYNI müşteride olmak zorunda"
   * kuralını EŞLEŞTİRME anında zorluyor — ama hesap sonradan el değiştirince
   * kimse bağı koparmıyordu. Sonuç: A'nın sayfasındaki gönderi, B'nin reklam
   * hesabından faturalanıyor. Kuralın var oluş sebebi tam olarak bu ve
   * panelde hiçbir yerde görünmüyor.
   */
  koparilanFaturaBagi: number;
};

/**
 * Tablo adı SABİT LİSTEDEN geliyor ama yine de doğrulanıyor.
 *
 * `Prisma.raw` denetimsiz: buraya bir gün dışarıdan bir dize sızarsa SQL
 * enjeksiyonu olur ve tip sistemi hiçbir şey demez. Kontrolün maliyeti sıfır,
 * yokluğunun bedeli sınırsız.
 */
function tabloAdi(t: string): Prisma.Sql {
  if (!/^[a-z_][a-z0-9_]*$/.test(t)) {
    throw new Error(`Geçersiz tablo adı: ${t}`);
  }
  return Prisma.raw(t);
}

type Yurutucu = {
  $executeRaw(sql: Prisma.Sql): Promise<number>;
  $queryRaw<T = unknown>(sql: Prisma.Sql): Promise<T>;
};

/** Bir tablodaki, hesaba ait ve YENİ müşteride OLMAYAN satırların sayısı. */
async function yabanciSatirSayisi(
  tx: Yurutucu,
  tablo: string,
  adAccountId: string,
  yeniClientId: string | null,
): Promise<number> {
  const rows = await tx.$queryRaw<Array<{ n: bigint | number | string }>>(
    Prisma.sql`
      SELECT count(*) AS n
        FROM ${tabloAdi(tablo)}
       WHERE ad_account_id = ${adAccountId}::uuid
         AND client_id IS DISTINCT FROM ${yeniClientId}::uuid
    `,
  );
  return Number(rows[0]?.n ?? 0);
}

/**
 * Hesabın verisini yeni müşteriye taşır ve taşınmayanları sayar.
 *
 * SÜZGEÇ `ad_account_id`, `client_id` DEĞİL. Sebebi somut: panelde atama iki
 * adımlı yapılabiliyor — önce "Kaldır" (hesap havuza düşüyor), sonra yeni
 * müşteriye "Ata". İkinci adımda `before.clientId` NULL olduğu için "eski
 * müşterinin satırları" diye bir şey kalmıyor; hesabın satırları ise hâlâ
 * A'da duruyor. Satırlar HESABI takip ediyor, bir önceki atamayı değil.
 *
 * `kalan` da aynı sebeple YENİ müşteriye göre süzülüyor. `before.clientId`'ye
 * göre süzülseydi, tam olarak o iki adımlı yolda hiçbir şey raporlanmazdı —
 * yani kullanıcının kullandığı yolda.
 *
 * `yeniClientId` NULL ise (hesap havuza geri konuyor) HİÇBİR ŞEY TAŞINMIYOR:
 * çocuk tabloların `client_id`'si NOT NULL, teknik olarak boşaltılamıyor. Ama
 * doğru davranış da bu — veri o müşteriye aitken toplandı ve onun geçmişi.
 * Çağıran bunu kullanıcıya SÖYLEMEK zorunda; sayı `kalanVeri` ile dönüyor.
 */
export async function hesapVerisiniTasi(
  tx: Yurutucu,
  adAccountId: string,
  yeniClientId: string | null,
): Promise<TasimaSonucu> {
  /*
   * ÖNCEKİ SAHİPLER TAŞIMADAN ÖNCE OKUNUYOR. Taşıma `client_id`'nin üstüne
   * yazıyor; sonra sormak, artık var olmayan bir bilgiyi sormak olurdu.
   */
  const oncekiSahipler = await tx.$queryRaw<Array<{ client_id: string }>>(
    Prisma.sql`
      SELECT DISTINCT client_id FROM campaigns
       WHERE ad_account_id = ${adAccountId}::uuid
         AND client_id IS DISTINCT FROM ${yeniClientId}::uuid
      UNION
      SELECT DISTINCT client_id FROM insights_daily
       WHERE ad_account_id = ${adAccountId}::uuid
         AND client_id IS DISTINCT FROM ${yeniClientId}::uuid
    `,
  );

  const tasinan: Record<string, number> = {};
  let toplam = 0;
  let kalanVeri = 0;

  for (const { tablo } of HESABIN_KENDI_VERISI) {
    if (yeniClientId === null) {
      kalanVeri += await yabanciSatirSayisi(tx, tablo, adAccountId, null);
      continue;
    }
    const n = await tx.$executeRaw(
      Prisma.sql`
        UPDATE ${tabloAdi(tablo)}
           SET client_id = ${yeniClientId}::uuid
         WHERE ad_account_id = ${adAccountId}::uuid
           AND client_id IS DISTINCT FROM ${yeniClientId}::uuid
      `,
    );
    tasinan[tablo] = n;
    toplam += n;
  }

  const kalan: Record<string, number> = {};
  for (const { tablo, etiket } of MUSTERIDE_KALAN) {
    const n = await yabanciSatirSayisi(tx, tablo, adAccountId, yeniClientId);
    if (n > 0) kalan[etiket] = n;
  }

  /*
   * MÜŞTERİ GENELİ KAYITLAR AYRI SORULUYOR — `ad_account_id` ile bulunamıyor.
   *
   * Sorulan müşteriler taşımadan ÖNCE okundu: taşıma `client_id`'nin üstüne
   * yazıyor, sonra sormak artık var olmayan bir bilgiyi sormak olurdu.
   */
  const musteriGeneli: Record<string, number> = {};
  if (oncekiSahipler.length > 0) {
    const sahipler = Prisma.join(oncekiSahipler.map((r) => r.client_id));
    for (const t of MUSTERIDE_KALAN) {
      if (!('musteriGeneliEtiket' in t)) continue;
      const rows = await tx.$queryRaw<Array<{ n: bigint | number | string }>>(
        Prisma.sql`
          SELECT count(*) AS n
            FROM ${tabloAdi(t.tablo)}
           WHERE ad_account_id IS NULL
             AND client_id IN (${sahipler}::uuid)
             ${t.ayaBagli ? Prisma.sql`AND month = date_trunc('month', now())::date` : Prisma.empty}
        `,
      );
      const n = Number(rows[0]?.n ?? 0);
      if (n > 0) musteriGeneli[t.musteriGeneliEtiket] = n;
    }
  }

  /*
   * FATURALANDIRMA BAĞI KOPARILIYOR — yalnızca müşterisi ARTIK EŞLEŞMEYEN
   * sayfalarda.
   *
   * Hesapla birlikte taşınan sayfa yok: sayfa ataması ayrı bir uç
   * (`assignSocialProfile`). Bağı toptan koparmak, hesap ve sayfası aynı
   * müşteride kalan bir kurulumda çalışan Akıllı Boost'u sessizce durdururdu.
   */
  const koparilan = await tx.$executeRaw(
    Prisma.sql`
      UPDATE social_profiles
         SET linked_ad_account_id = NULL
       WHERE linked_ad_account_id = ${adAccountId}::uuid
         AND client_id IS DISTINCT FROM ${yeniClientId}::uuid
    `,
  );

  return { tasinan, toplam, kalan, kalanVeri, musteriGeneli, koparilanFaturaBagi: koparilan };
}
