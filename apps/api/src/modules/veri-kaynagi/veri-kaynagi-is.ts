import { Prisma } from '@prisma/client';
import {
  PANEL_YERLERI,
  GA4_KOTA,
  eksikKaynakIzni,
  ga4KotaIzni,
  kaynakGecmisParcalari,
  kaynakGunlukPencere,
  type Ga4Kalite,
  type KaynakTuru,
  type KotaKatmani,
} from '@advetics/shared';
import { PlatformApiError } from '../connections/provider.types';
import type { Ga4Istemcisi, Ga4MulkKotasi } from '../connections/providers/ga4';
import { etkinlikSatirlari, ga4PencereYaz, trafikSatirlari, type IslemYapabilen } from './ga4-veri';

/**
 * ═══ VERİ KAYNAĞI İŞLERİ — kaynak_yapi, kaynak_gunluk, kaynak_gecmis ═══
 *
 * docs/veri-kaynagi/MIMARI.md § 2.3, § 3.2. Servisten AYRI, bağımlılıklar
 * parametreyle: PGlite testleri GERÇEK sorguyu koşsun ve GA4 istemcisi
 * fixture'la değişsin (sinyal-hesap deseni).
 *
 * SIRA BARİYER DEĞİL, ZİNCİR + ÖN KOŞUL:
 *   - Günlük ve geçmiş işi, yapı işinin son 36 saatte BAŞARIYLA koştuğunu
 *     PLATFORMA GİTMEDEN kontrol ediyor. Koşmadıysa `rows=0` + "hesaplanmadı:"
 *     notuyla biter ve TEKRAR DENENMEZ: tekrar denemek, yavaş bir ön koşulun
 *     bağımlı işin beş denemesini tüketmesi demekti (CLAUDE.md "YAVAŞ BİR ÖN
 *     KOŞUL...").
 *   - Yapı BAŞARIYLA bitince işin SONUNDA: geçmiş bitmediyse geçmiş, son
 *     günlük iş ön koşul yüzünden reddedildiyse günlük yeniden kuyruğa girer.
 */

export const YAPI_TAZELIK_SAAT = 36;
/** Ön koşul reddinin not öneki. Zincir bu öneki arıyor; ekran "hiç çekilmedi" okuyor. */
export const ON_KOSUL_NOTU = 'hesaplanmadı:';

export type Ga4Okuyucu = Pick<Ga4Istemcisi, 'anahtarEtkinlikler' | 'mulkAyari' | 'raporTamami'>;

export interface KaynakIsBagimliliklari {
  db: IslemYapabilen;
  /** Bağlantının token'ıyla GA4 istemcisi. Testte fixture. */
  ga4: (connectionId: string) => Promise<Ga4Okuyucu>;
  kota: {
    izin(anahtar: string, katman: 'kaynak_gunluk' | 'kaynak_gecmis' | 'interactive'): Promise<{ allowed: boolean; retryAfterMs?: number; reason?: string }>;
    kaydet(anahtar: string, kota: Ga4MulkKotasi | null): Promise<void>;
  };
  kuyruk: {
    enqueue(p: {
      clientId: string;
      platform: 'google';
      jobType: 'kaynak_yapi' | 'kaynak_gunluk' | 'kaynak_gecmis';
      veriKaynagiId: string;
      dateFrom?: string;
      dateTo?: string;
      interactive?: boolean;
    }): Promise<{ enqueued: boolean }>;
  };
  simdi: Date;
}

export interface IsSonucu {
  rows: number;
  note: string;
  apiCalls: number;
}

/**
 * GA4 bildirdiğinden AZ satır döndürdü (Ö-4): pencere YAZILMADI, iş geçici
 * başarısız ve TEKRAR DENENİR (BullMQ geri çekilmesi). Kota reddinden farkı:
 * kota yarına kadar düzelmez, eksik sayfa birkaç dakika sonra düzelir.
 */
export class KaynakEksikVeri extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'KaynakEksikVeri';
  }
}

/** Kota reddi: iş tekrar denenebilir ama deneme hakkı YAKMADAN (worker → moveToDelayed). */
export class KaynakKotaReddi extends Error {
  constructor(
    message: string,
    readonly retryAfterMs: number,
  ) {
    super(message);
    this.name = 'KaynakKotaReddi';
  }
}

interface KaynakSatiri {
  id: string;
  client_id: string;
  org_id: string;
  tur: KaynakTuru;
  dis_kimlik: string;
  connection_id: string | null;
  saat_dilimi: string | null;
  para_birimi: string | null;
  durum: string;
  yapi: Record<string, unknown> | null;
  yapi_zamani: Date | string | null;
  granted_scopes: string[] | null;
  baglanti_durumu: string | null;
}

export function kotaAnahtari(k: { tur: string; dis_kimlik: string }): string {
  return `kaynak:${k.tur}:${k.dis_kimlik}`;
}

async function kaynakOku(db: IslemYapabilen, id: string): Promise<KaynakSatiri | null> {
  const [k] = await db.$queryRaw<KaynakSatiri[]>(Prisma.sql`
    SELECT v.id::text AS id, v.client_id::text AS client_id, v.org_id::text AS org_id, v.tur, v.dis_kimlik,
           v.connection_id::text AS connection_id, v.saat_dilimi, v.para_birimi, v.durum, v.yapi, v.yapi_zamani,
           c.granted_scopes, c.status::text AS baglanti_durumu
      FROM veri_kaynaklari v
      LEFT JOIN platform_connections c ON c.id = v.connection_id AND c.revoked_at IS NULL
     WHERE v.id = ${id}::uuid`);
  return k ?? null;
}

async function durumYaz(db: IslemYapabilen, id: string, durum: string, sonHata: string | null): Promise<void> {
  // Kullanıcının kararı (duraklat, kaldır) işin sonucuyla EZİLMEZ: koşul UPDATE'in içinde.
  await db.$executeRaw(Prisma.sql`
    UPDATE veri_kaynaklari SET durum = ${durum}, son_hata = ${sonHata}, updated_at = now()
     WHERE id = ${id}::uuid AND durum NOT IN ('duraklatildi', 'kaldirildi')`);
}

/** Kaynağın saat diliminde bugün. Bilinmiyorsa İstanbul (mülk ayarı henüz okunmadı). */
export function kaynakBugun(saatDilimi: string | null, simdi: Date): string {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: saatDilimi ?? 'Europe/Istanbul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(simdi);
  } catch {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(simdi);
  }
}

/**
 * Bağlantı ön koşulu — PLATFORMA GİTMEDEN. İzin yoksa çağrı aynı 403'ü
 * alır ve kotadan yer; cevap zaten belli.
 */
function baglantiEngeli(k: KaynakSatiri): { durum: 'izin_eksik'; neden: string } | null {
  if (!k.connection_id || k.granted_scopes === null) return { durum: 'izin_eksik', neden: `Google bağlantısı yok ya da kaldırılmış. ${PANEL_YERLERI.platformBaglantilari}’ndan Google’ı yeniden bağla.` };
  if (k.baglanti_durumu !== 'active') return { durum: 'izin_eksik', neden: 'Google bağlantısının yeniden yetkilendirilmesi gerekiyor.' };
  const eksik = eksikKaynakIzni(k.tur, k.granted_scopes);
  if (eksik) return { durum: 'izin_eksik', neden: 'Google bağlantısında Analytics okuma izni yok. "İzni ver" ile ekle; Google Ads bağlantısı kopmaz.' };
  return null;
}

/**
 * Platform hatası → kaynak durumu. Kalıcı olanlar (izin/erişim) işi
 * BAŞARILI bitirir ve durumu yazar: tekrar denemek aynı reddi beş kez alıp
 * kotayı yakar. Geçici olanlar fırlatılır (BullMQ tekrar dener).
 */
function kaliciHata(e: unknown): { durum: 'izin_eksik' | 'erisim_yok' | 'hata'; neden: string } | null {
  if (!(e instanceof PlatformApiError)) return null;
  if (e.kind === 'invalid_token') return { durum: 'izin_eksik', neden: e.message };
  if (e.kind === 'permission_denied') return { durum: 'erisim_yok', neden: e.message };
  if (e.kind === 'permanent') return { durum: 'hata', neden: e.message };
  return null;
}

function kaliteNotu(k: Ga4Kalite): string[] {
  const n: string[] = [];
  if (k.digerSatiri) n.push('"(other)" satırı var');
  if (k.esiklendi) n.push('Analytics eşiklemesi');
  if (k.ornekleme !== null) n.push(`örnekleme %${Math.round(k.ornekleme * 100)}`);
  return n;
}

// ─── kaynak_yapi ────────────────────────────────────────────────────────────

export async function kaynakYapi(b: KaynakIsBagimliliklari, kaynakId: string): Promise<IsSonucu> {
  const k = await kaynakOku(b.db, kaynakId);
  if (!k) return { rows: 0, note: `${ON_KOSUL_NOTU} kaynak bulunamadı`, apiCalls: 0 };
  if (k.durum === 'kaldirildi' || k.durum === 'duraklatildi') return { rows: 0, note: `${ON_KOSUL_NOTU} kaynak ${k.durum}`, apiCalls: 0 };
  if (k.tur !== 'ga4') return { rows: 0, note: `${ON_KOSUL_NOTU} ${k.tur} F1'de okunmuyor`, apiCalls: 0 };
  const engel = baglantiEngeli(k);
  if (engel) {
    await durumYaz(b.db, k.id, engel.durum, engel.neden);
    return { rows: 0, note: `${ON_KOSUL_NOTU} ${engel.neden}`, apiCalls: 0 };
  }

  let ayar: Awaited<ReturnType<Ga4Okuyucu['mulkAyari']>>;
  let etkinlikler: string[];
  try {
    const ga4 = await b.ga4(k.connection_id!);
    ayar = await ga4.mulkAyari(k.dis_kimlik);
    etkinlikler = await ga4.anahtarEtkinlikler(k.dis_kimlik);
  } catch (e) {
    const h = kaliciHata(e);
    if (!h) throw e;
    await durumYaz(b.db, k.id, h.durum, h.neden);
    return { rows: 0, note: `Analytics reddetti (${h.durum}): ${h.neden}`.slice(0, 480), apiCalls: 1 };
  }

  const yapi = { ...(k.yapi ?? {}), anahtarEtkinlikler: etkinlikler };
  await b.db.$executeRaw(Prisma.sql`
    UPDATE veri_kaynaklari SET
      yapi = ${JSON.stringify(yapi)}::jsonb, yapi_zamani = ${b.simdi.toISOString()}::timestamptz,
      saat_dilimi = ${ayar.saatDilimi}, para_birimi = ${ayar.paraBirimi}, ad = ${ayar.ad.slice(0, 200)},
      durum = CASE WHEN durum IN ('duraklatildi', 'kaldirildi') THEN durum ELSE 'etkin' END,
      son_hata = CASE WHEN durum IN ('duraklatildi', 'kaldirildi') THEN son_hata ELSE NULL END,
      updated_at = now()
     WHERE id = ${k.id}::uuid`);

  const zincir = await yapiSonrasiZincir(b, k, yapi);
  return {
    rows: 1,
    note: `yapı: ${etkinlikler.length} anahtar etkinlik, ${ayar.saatDilimi ?? 'saat dilimi yok'}, ${ayar.paraBirimi ?? 'para birimi yok'}${zincir ? ` · ${zincir}` : ''}`,
    apiCalls: 2,
  };
}

/**
 * YAPI BİTTİ — BEKLEYEN İŞ VARSA ŞİMDİ KUYRUĞA GİRSİN.
 *
 * Koşul DAR (yapi-sonrasi-gecmis dersi): geçmiş yalnız BİTMEDİYSE (her gün
 * 90 günlük çekim tetiklenmesin), günlük yalnız son günlük iş ön koşul
 * yüzünden reddedildiyse (zamanlanmış günlük iş zaten koşuyor; ikinci kez
 * koşmak kota yakmak).
 */
async function yapiSonrasiZincir(b: KaynakIsBagimliliklari, k: KaynakSatiri, yapi: Record<string, unknown>): Promise<string | null> {
  if (yapi.gecmisBitti !== true) {
    const r = await b.kuyruk.enqueue({ clientId: k.client_id, platform: 'google', jobType: 'kaynak_gecmis', veriKaynagiId: k.id });
    return r.enqueued ? 'geçmiş kuyruğa alındı' : null;
  }
  const [son] = await b.db.$queryRaw<Array<{ note: string | null }>>(Prisma.sql`
    SELECT note FROM sync_jobs
     WHERE veri_kaynagi_id = ${k.id}::uuid AND job_type = 'kaynak_gunluk'::"SyncJobType"
     ORDER BY created_at DESC LIMIT 1`);
  if (son?.note?.startsWith(ON_KOSUL_NOTU)) {
    const p = kaynakGunlukPencere('ga4', kaynakBugun(k.saat_dilimi, b.simdi));
    if (!p) return null;
    const r = await b.kuyruk.enqueue({ clientId: k.client_id, platform: 'google', jobType: 'kaynak_gunluk', veriKaynagiId: k.id, dateFrom: p.from, dateTo: p.to });
    return r.enqueued ? 'reddedilmiş günlük çekim yeniden kuyruğa alındı' : null;
  }
  return null;
}

// ─── Ortak ön koşul ─────────────────────────────────────────────────────────

/**
 * ÖN KOŞUL — ÇAĞRIDAN ÖNCE (MIMARI § 2.3). Sıfır maliyetli ret,
 * bağımlılığına nefes alacak yer bırakıyor. Etkileşimli istek de bu kapıdan
 * geçiyor: yapı bilinmeden saat dilimi bilinmiyor ve günler kayardı.
 */
function onKosul(k: KaynakSatiri | null, simdi: Date): string | null {
  if (!k) return 'kaynak bulunamadı';
  if (k.durum === 'kaldirildi' || k.durum === 'duraklatildi') return `kaynak ${k.durum}`;
  if (k.tur !== 'ga4') return `${k.tur} F1'de okunmuyor`;
  const engel = baglantiEngeli(k);
  if (engel) return engel.neden;
  const yz = k.yapi_zamani ? new Date(k.yapi_zamani) : null;
  if (!yz || simdi.getTime() - yz.getTime() > YAPI_TAZELIK_SAAT * 3_600_000) return 'yapı taraması henüz koşmadı (son 36 saatte başarılı yapı yok)';
  return null;
}

async function pencereCek(
  b: KaynakIsBagimliliklari,
  k: KaynakSatiri,
  aralik: { from: string; to: string },
  katman: KotaKatmani,
): Promise<{ yazildi: boolean; trafik: number; etkinlik: number; istek: number; notlar: string[]; kota: Ga4MulkKotasi | null; kalite: Ga4Kalite | null }> {
  const ga4 = await b.ga4(k.connection_id!);
  const anahtar = kotaAnahtari(k);
  const devam = (q: Ga4MulkKotasi | null) => ga4KotaIzni(katman, q ?? null).neden;
  const tr = await ga4.raporTamami(k.dis_kimlik, 'trafik', aralik, devam);
  await b.kota.kaydet(anahtar, tr.kota);
  // EKSİK SATIR (Ö-4) kota değil: pencere yazılmaz ve iş TEKRAR DENENİR.
  if (tr.eksik || (!tr.durdu && tr.satirlar.length < tr.satirSayisi)) throw new KaynakEksikVeri(`trafik raporu kısmi: ${tr.durdu ?? `${tr.satirlar.length}/${tr.satirSayisi} satır`}`);
  if (tr.durdu) return { yazildi: false, trafik: 0, etkinlik: 0, istek: tr.istek, notlar: [`trafik raporu yarıda: ${tr.durdu}`], kota: tr.kota, kalite: tr.kalite };
  // İkinci rapordan ÖNCE kota yeniden: ilk rapor kotayı eşiğin altına indirmiş olabilir.
  const once = ga4KotaIzni(katman, tr.kota);
  if (!once.izin) return { yazildi: false, trafik: 0, etkinlik: 0, istek: tr.istek, notlar: [`kota: ${once.neden}`], kota: tr.kota, kalite: tr.kalite };
  const et = await ga4.raporTamami(k.dis_kimlik, 'anahtarEtkinlik', aralik, devam);
  await b.kota.kaydet(anahtar, et.kota ?? tr.kota);
  if (et.eksik || (!et.durdu && et.satirlar.length < et.satirSayisi)) throw new KaynakEksikVeri(`etkinlik raporu kısmi: ${et.durdu ?? `${et.satirlar.length}/${et.satirSayisi} satır`}`);
  if (et.durdu) return { yazildi: false, trafik: 0, etkinlik: 0, istek: tr.istek + et.istek, notlar: [`etkinlik raporu yarıda: ${et.durdu}`], kota: et.kota, kalite: tr.kalite };

  const notlar: string[] = [];
  const kalite: Ga4Kalite = {
    digerSatiri: tr.kalite.digerSatiri || et.kalite.digerSatiri,
    esiklendi: tr.kalite.esiklendi || et.kalite.esiklendi,
    ornekleme: tr.kalite.ornekleme ?? et.kalite.ornekleme,
  };
  notlar.push(...kaliteNotu(kalite));
  if (!tr.kota && !et.kota) notlar.push('kota bilinmiyor (Google döndürmedi)');

  const yaz = await ga4PencereYaz(
    b.db,
    { id: k.id, clientId: k.client_id, orgId: k.org_id, paraBirimi: k.para_birimi },
    aralik,
    trafikSatirlari(tr.satirlar),
    etkinlikSatirlari(et.satirlar),
  );
  if (yaz.not) notlar.push(yaz.not);
  return { yazildi: true, trafik: yaz.trafik, etkinlik: yaz.etkinlik, istek: tr.istek + et.istek, notlar, kota: et.kota ?? tr.kota, kalite };
}

async function basariYaz(b: KaynakIsBagimliliklari, k: KaynakSatiri, kalite: Ga4Kalite | null, yapiEk: Record<string, unknown> = {}): Promise<void> {
  // Son görülen kalite bayrakları: takip açığı ekranı "Analytics bu dönemde
  // bazı satırları gizledi" cümlesini buradan kuruyor.
  const ek = kalite ? { ...yapiEk, sonKalite: { ...kalite, zaman: b.simdi.toISOString() } } : yapiEk;
  await b.db.$executeRaw(Prisma.sql`
    UPDATE veri_kaynaklari SET
      son_basarili_cekim = ${b.simdi.toISOString()}::timestamptz,
      yapi = yapi || ${JSON.stringify(ek)}::jsonb,
      durum = CASE WHEN durum IN ('duraklatildi', 'kaldirildi') THEN durum ELSE 'etkin' END,
      son_hata = CASE WHEN durum IN ('duraklatildi', 'kaldirildi') THEN son_hata ELSE NULL END,
      updated_at = now()
     WHERE id = ${k.id}::uuid`);
}

async function kotaKapisi(b: KaynakIsBagimliliklari, k: KaynakSatiri, katman: 'kaynak_gunluk' | 'kaynak_gecmis' | 'interactive'): Promise<void> {
  const g = await b.kota.izin(kotaAnahtari(k), katman);
  if (!g.allowed) throw new KaynakKotaReddi(g.reason ?? 'kaynak kotası', g.retryAfterMs ?? 3_600_000);
}

// ─── kaynak_gunluk ──────────────────────────────────────────────────────────

export async function kaynakGunluk(
  b: KaynakIsBagimliliklari,
  kaynakId: string,
  aralik: { from: string; to: string },
  etkilesimli: boolean,
): Promise<IsSonucu> {
  const k = await kaynakOku(b.db, kaynakId);
  const red = onKosul(k, b.simdi);
  if (red) return { rows: 0, note: `${ON_KOSUL_NOTU} ${red}`, apiCalls: 0 };
  await kotaKapisi(b, k!, etkilesimli ? 'interactive' : 'kaynak_gunluk');

  try {
    const r = await pencereCek(b, k!, aralik, etkilesimli ? 'etkilesimli' : 'gunluk');
    if (!r.yazildi) {
      // KOTA YETMEDİ: pencere YAZILMADI (yarım pencere tam pencereyi silerdi).
      // Tekrar denenmiyor: GA4 günü Pasifik gece yarısı sıfırlanıyor ve
      // yarınki günlük pencere bugünü de kapsıyor (son 3 gün yeniden).
      return { rows: 0, note: `${aralik.from}…${aralik.to} YAZILMADI · ${r.notlar.join(' · ')}`.slice(0, 480), apiCalls: r.istek };
    }
    await basariYaz(b, k!, r.kalite);
    return {
      rows: r.trafik + r.etkinlik,
      note: `${aralik.from}…${aralik.to}: ${r.trafik} trafik, ${r.etkinlik} etkinlik satırı${r.notlar.length ? ` · ${r.notlar.join(' · ')}` : ''}`.slice(0, 480),
      apiCalls: r.istek,
    };
  } catch (e) {
    const h = kaliciHata(e);
    if (!h) throw e;
    await durumYaz(b.db, k!.id, h.durum, h.neden);
    return { rows: 0, note: `Analytics reddetti (${h.durum}): ${h.neden}`.slice(0, 480), apiCalls: 1 };
  }
}

// ─── kaynak_gecmis ──────────────────────────────────────────────────────────

/**
 * İLK BAĞLANTIDA 90 GÜN, 30 GÜNLÜK PARÇALAR, YENİDEN ESKİYE. Her parça hemen
 * yazılıyor (sonda toplu yazmak, son parçadaki bir hatayla 90 günü boşa
 * harcamak demekti). Kota eşiğin altına inerse kalan parçalar BIRAKILIR ve
 * ilerleme `yapi.gecmisEnEski`ye yazılır: ertesi günün yapı işi geçmişi
 * yeniden kuyruğa alır (`gecmisBitti` değil) ve iş kaldığı yerden sürer.
 * Kotayı bitirip müşterinin Looker panosunu kırmak, sebebi onun ekranında
 * hiç görünmeyen bir arıza (MIMARI Ç-10).
 */
export async function kaynakGecmis(b: KaynakIsBagimliliklari, kaynakId: string): Promise<IsSonucu> {
  const k = await kaynakOku(b.db, kaynakId);
  const red = onKosul(k, b.simdi);
  if (red) return { rows: 0, note: `${ON_KOSUL_NOTU} ${red}`, apiCalls: 0 };
  if (k!.yapi?.gecmisBitti === true) return { rows: 0, note: 'geçmiş zaten çekilmiş', apiCalls: 0 };
  await kotaKapisi(b, k!, 'kaynak_gecmis');

  const parcalar = kaynakGecmisParcalari('ga4', kaynakBugun(k!.saat_dilimi, b.simdi));
  const enEski = typeof k!.yapi?.gecmisEnEski === 'string' ? (k!.yapi.gecmisEnEski as string) : null;
  // Daha önce yazılmış parçalar atlanıyor (kaldığı yerden). Yeni günler
  // günlük işin penceresinde; bunları geçmiş yeniden çekmez.
  const kalan = enEski ? parcalar.filter((p) => p.from < enEski) : parcalar;

  let satir = 0;
  let istek = 0;
  let yazilan = 0;
  let sonKota: Ga4MulkKotasi | null = null;
  let kalite: Ga4Kalite | null = null;
  const notlar: string[] = [];
  for (const p of kalan) {
    // HER PARÇADAN ÖNCE KOTA: önceki parçanın yanıtı kotayı eşiğin altına indirdiyse dur.
    const izin = ga4KotaIzni('gecmis', sonKota);
    if (!izin.izin) {
      notlar.push(`kota: ${izin.neden}; ${kalan.length - yazilan} parça yarına kaldı`);
      break;
    }
    let r: Awaited<ReturnType<typeof pencereCek>>;
    try {
      r = await pencereCek(b, k!, p, 'gecmis');
    } catch (e) {
      const h = kaliciHata(e);
      if (!h) {
        // Geçici hata: yazılan parçalar KALIYOR (ilerleme kaydedildi), iş tekrar denenir.
        if (yazilan > 0) await basariYaz(b, k!, kalite, { gecmisEnEski: kalan[yazilan - 1]!.from });
        throw e;
      }
      await durumYaz(b.db, k!.id, h.durum, h.neden);
      notlar.push(`Analytics reddetti (${h.durum}): ${h.neden}`);
      break;
    }
    istek += r.istek;
    sonKota = r.kota;
    if (!r.yazildi) {
      notlar.push(...r.notlar, `${kalan.length - yazilan} parça yarına kaldı`);
      break;
    }
    kalite = r.kalite;
    satir += r.trafik + r.etkinlik;
    yazilan++;
    // İlerleme HER PARÇADA: süreç ölürse kaldığı yer kaybolmasın.
    await b.db.$executeRaw(Prisma.sql`
      UPDATE veri_kaynaklari SET yapi = yapi || ${JSON.stringify({ gecmisEnEski: p.from })}::jsonb, updated_at = now()
       WHERE id = ${k!.id}::uuid`);
  }
  const bitti = yazilan === kalan.length;
  if (yazilan > 0 || bitti) await basariYaz(b, k!, kalite, bitti ? { gecmisBitti: true } : {});
  return {
    rows: satir,
    note: `geçmiş: ${yazilan}/${kalan.length} parça yazıldı (${satir} satır)${bitti ? ', tamamlandı' : ''}${notlar.length ? ` · ${notlar.join(' · ')}` : ''}`.slice(0, 480),
    apiCalls: istek,
  };
}

/** Eşzamanlı istek sınırı sözleşmede; burada tek iş tek seferde bir istek atıyor (sıralı sayfalama). */
export const KAYNAK_ESZAMANLI = GA4_KOTA.eszamanliEnFazla;
