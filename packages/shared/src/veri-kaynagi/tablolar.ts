import type { KaynakPaketi } from './kaynak';

/**
 * ═══ YENİ TABLOLAR VE ÜÇ DURAK KARARI ═══
 *
 * CLAUDE.md: yeni tablo (1) `test/pglite-harness.ts` TRUNCATE listesine,
 * (2) `prisma/sql/02_rls.sql` tablo listesine ve politikalarına, (3)
 * `client_id` taşıyorsa `workspace-tasima.ts#WORKSPACE_TABLOLARI`ya bir
 * KARAR olarak girer. Dördüncüsü bu modüle özgü: reklam hesabı başka
 * workspace'e geçince (`hesap-verisi-tasima.ts#HESABIN_KENDI_VERISI`) ne olur.
 *
 * Kararlar burada TEK yerde; Ajan 2 migration'ı ve dört listeyi buna göre
 * yazar, Ajan 4 dört listeyi bu sabitle karşılaştıran testi yazar.
 * Hepsi `client_id NOT NULL`: kaynak bağlantısı HAVUZDA DURMAZ (aşağıda
 * `veri_kaynaklari` notu).
 */
export interface KaynakTablosu {
  tablo: string;
  paket: KaynakPaketi;
  ne: string;
  truncate: true;
  rls: 'workspace';
  /** Workspace başka şirkete taşınınca. */
  workspaceTasima: 'tasinir';
  /** Reklam hesabı başka workspace'e atanınca. */
  hesapTasima: 'tasinir' | 'dokunulmaz';
  /** Bu tabloya YAZAN tek yer (sessiz ayrışmayı önlemek için). */
  yazan: string;
}

export const KAYNAK_TABLOLARI: readonly KaynakTablosu[] = [
  {
    tablo: 'veri_kaynaklari',
    paket: 'F1',
    ne: 'Workspace ↔ dış kaynak bağı (GA4 mülkü, Search Console mülkü, Merchant hesabı, katalog, mağaza). Mağaza kimliği şifreli (`kimlik_enc`).',
    truncate: true,
    rls: 'workspace',
    workspaceTasima: 'tasinir',
    hesapTasima: 'dokunulmaz',
    yazan: 'veri-kaynagi.service (bağla/kaldır) + kaynak işleri (durum, son hata)',
  },
  {
    tablo: 'ga4_gunluk',
    paket: 'F1',
    ne: 'GA4 trafik raporu: gün × kaynak/ortam × kampanya; oturum, etkileşimli oturum, kullanıcı (TOPLANAMAZ), anahtar etkinlik, gelir.',
    truncate: true,
    rls: 'workspace',
    workspaceTasima: 'tasinir',
    hesapTasima: 'dokunulmaz',
    yazan: 'kaynak_gunluk / kaynak_gecmis (tur=ga4)',
  },
  {
    tablo: 'ga4_anahtar_etkinlik_gunluk',
    paket: 'F1',
    ne: 'Aynı kırılım + etkinlik adı; YALNIZ anahtar etkinlik sayısı. ga4_gunluk ile JOIN edilip toplanmaz (satır çoğaltır).',
    truncate: true,
    rls: 'workspace',
    workspaceTasima: 'tasinir',
    hesapTasima: 'dokunulmaz',
    yazan: 'kaynak_gunluk / kaynak_gecmis (tur=ga4)',
  },
  {
    tablo: 'sc_gunluk',
    paket: 'F2',
    ne: 'Search Console mülk toplamı (boyutsuz): gün, tıklama, gösterim, konum×gösterim. Sorgu satırlarının toplamı bunu TUTMAZ (anonim sorgular).',
    truncate: true,
    rls: 'workspace',
    workspaceTasima: 'tasinir',
    hesapTasima: 'dokunulmaz',
    yazan: 'kaynak_gunluk (tur=search_console)',
  },
  {
    tablo: 'sc_sorgu_gunluk',
    paket: 'F2',
    ne: 'Gün × sorgu (hash + metin): tıklama, gösterim, konum×gösterim. Ücretli arama terimleriyle örtüşme bunun üstünden.',
    truncate: true,
    rls: 'workspace',
    workspaceTasima: 'tasinir',
    hesapTasima: 'dokunulmaz',
    yazan: 'kaynak_gunluk (tur=search_console)',
  },
  {
    tablo: 'urun_katalogu',
    paket: 'F3',
    ne: 'Kaynak başına ürün anlık görüntüsü (Merchant, Meta katalog, mağaza): kimlik, ad, fiyat, stok, onay durumu, sorunlar.',
    truncate: true,
    rls: 'workspace',
    workspaceTasima: 'tasinir',
    hesapTasima: 'dokunulmaz',
    yazan: 'kaynak_yapi',
  },
  {
    tablo: 'urun_performansi_gunluk',
    paket: 'F3',
    ne: 'REKLAM HESABININ ürün bazında verisi (Google shopping_performance_view, Meta product_id kırılımı): gün × ürün × kampanya.',
    truncate: true,
    rls: 'workspace',
    workspaceTasima: 'tasinir',
    // Platform aynasından gelen ölçülmüş metrik: hesapla gider (kampanya ve
    // insights_daily gibi). Kalırsa B'nin ürün raporu boş, A'nınki yanlış.
    hesapTasima: 'tasinir',
    yazan: 'urun_performansi (platform işi, ad_account_id taşır)',
  },
  {
    tablo: 'magaza_siparisleri',
    paket: 'F3',
    ne: 'Sipariş başlığı: kimlik, tarih, durum, brüt, iade, net, para birimi, kampanya ipuçları. KİŞİSEL VERİ YOK (eticaret.ts#SIPARIS_SAKLANAN_ALANLAR).',
    truncate: true,
    rls: 'workspace',
    workspaceTasima: 'tasinir',
    hesapTasima: 'dokunulmaz',
    yazan: 'kaynak_gunluk / kaynak_gecmis (mağaza türleri)',
  },
  {
    tablo: 'magaza_siparis_kalemleri',
    paket: 'F3',
    ne: 'Sipariş kalemi: ürün kimliği, adet, tutar, iade edilen adet/tutar.',
    truncate: true,
    rls: 'workspace',
    workspaceTasima: 'tasinir',
    hesapTasima: 'dokunulmaz',
    yazan: 'kaynak_gunluk / kaynak_gecmis (mağaza türleri)',
  },
];

/**
 * ═══ KUYRUK İŞ TÜRLERİ ═══
 *
 * Prisma `SyncJobType`a eklenir — AYRI migration (`ALTER TYPE ... ADD VALUE`
 * aynı transaction'da kullanılamaz). `sync_jobs`a `veri_kaynagi_id uuid NULL`
 * kolonu eklenir (FK ON DELETE SET NULL); kaynak işlerinde `ad_account_id`
 * NULL, `client_id` DOLU (NULL client_id'li satırı RLS kimseye göstermez).
 *
 * `sync_jobs` YENİDEN KULLANILIYOR, ayrı tablo yok: takılan iş, kuyruk
 * vazgeçti, nihai başarısızlık ve teşhis ekranı o tabloya bakıyor; ayrı
 * tablo bu dört korumanın hepsini yeniden yazmak demekti.
 */
export const KAYNAK_IS_TURLERI = [
  /** Kaynağın kendisi: GA4 anahtar etkinlik listesi + mülk saat dilimi/para birimi, SC izin düzeyi, katalog ürünleri. Günde bir. */
  'kaynak_yapi',
  /** Günlük pencere (`kaynakGunlukPencere`). Yapı başarıyla koşmadıysa ÇAĞRI YAPMADAN biter (ön koşul önce). */
  'kaynak_gunluk',
  /** İlk bağlantıda geçmiş (`kaynakGecmisParcalari`), parça parça yazılır. Yapı bitince zincirle kuyruğa girer. */
  'kaynak_gecmis',
  /** Platform işi (reklam hesabı): ürün bazında reklam verisi. `PLATFORMUN_YAPAMADIGI_ISLER.linkedin`e eklenir. */
  'urun_performansi',
] as const;
export type KaynakIsTuru = (typeof KAYNAK_IS_TURLERI)[number];

/**
 * Zamanlayıcı satırları. `sweep-dates.spec.ts` her `jobType`ın `datesForJob`
 * karşılığı olduğunu tarıyor: kaynak işlerinin tarihi kaynağın dilimiyle
 * `kaynakGunlukPencere`den gelir; Ajan 2 `datesForJob`a bu dalı EKLER
 * (eklenmezse `[missing_dates]` ile her gece düşer — `keyword_insights` dersi).
 */
export const KAYNAK_SUPURMELERI = [
  // Yapı önce, günlük sonra; ama sıra BARİYER DEĞİL: günlük iş yapının
  // bugün başarıyla koştuğunu kendisi kontrol eder, koşmadıysa çağrısız biter
  // ve yapı bitince ZİNCİRLE yeniden kuyruğa girer.
  { ad: 'sweep:kaynak-yapi', desen: '41 2 * * *', is: 'kaynak_yapi' },
  { ad: 'sweep:kaynak-gunluk', desen: '19 6 * * *', is: 'kaynak_gunluk' },
  { ad: 'sweep:urun-performansi', desen: '52 5 * * *', is: 'urun_performansi' },
] as const satisfies ReadonlyArray<{ ad: string; desen: string; is: KaynakIsTuru }>;
