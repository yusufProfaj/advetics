import type { Permission } from '../../auth/roles';
import { STRATEJI_OLUSTURMA_ADIMLARI, type StratejiOlusturmaAdimi } from './sihirbaz';

/**
 * ═══ ADVSTRATEGY v2 — ADRESLER, UÇLAR, GÖRÜNÜM KAPILARI (TEK ÜRETİCİ) ═══
 *
 * Panel adresi, API yolu, PDF yolu ve girişsiz onay yolu YALNIZ buradan.
 * Rapor ekranındaki "üç tüketici" hatası (CLAUDE.md "AYNI BELGEYİ İSTEYEN HER
 * YOL AYNI SORGUYU KURMALI") ve "bağlantıyı elle birleştirme" dersi: elle
 * kurulan bir adres bir gün `musteri`yi ya da `surum`u düşürür.
 */

const kodla = (v: string) => encodeURIComponent(v);
function sorgu(cift: Array<[string, string | number | null | undefined]>): string {
  const p = cift.filter(([, v]) => v !== undefined && v !== null && v !== '').map(([k, v]) => `${kodla(k)}=${kodla(String(v))}`);
  return p.length > 0 ? `?${p.join('&')}` : '';
}

// ─── Panel ───────────────────────────────────────────────────────────────

export const STRATEJI_SAYFA_YOLU = '/strateji';

/**
 * EKRANLAR (`?adim=`), kullanıcı onaylı taslak `docs/advstrategy/simulasyon.html`:
 *
 * - `giris` (parametresiz): iki büyük kart, "Raporu incele" / "Strateji oluştur".
 * - Yedi oluşturma adımı (`STRATEJI_OLUSTURMA_ADIMLARI`), her ekranda tek soru.
 * - `raporlar` (strateji listesi), `rapor` (kurumsal belge + onay),
 *   `kur` (onaylı planın kampanyalarını TEK TEK AdvCampaign taslağına açmak).
 *
 * Eski üç görünüm (`?gorunum=duzenle|belge|aktar`) KALDIRILDI: kullanıcı
 * sekmeli ekranı *"çok karışık"* buldu. Sayfa eski adresleri
 * `eskiGorunumEkrani` ile yeni ekrana yönlendirir; maillerdeki ve rehberin
 * "Stratejiden" kutusundaki eski bağlantılar ölmesin.
 */
export const STRATEJI_EKRANLARI = ['giris', ...STRATEJI_OLUSTURMA_ADIMLARI, 'raporlar', 'rapor', 'kur'] as const;
export type StratejiEkrani = (typeof STRATEJI_EKRANLARI)[number];

export function stratejiEkrani(ham: string | null | undefined): StratejiEkrani | null {
  return (STRATEJI_EKRANLARI as readonly string[]).includes(ham ?? '') ? (ham as StratejiEkrani) : null;
}

export function olusturmaAdimiMi(e: StratejiEkrani): e is StratejiOlusturmaAdimi {
  return (STRATEJI_OLUSTURMA_ADIMLARI as readonly string[]).includes(e);
}

/** Eski `?gorunum=` adresinin yeni ekranı. Düzenleyici yok: girişe (orada "Taslağa devam et"). */
export function eskiGorunumEkrani(ham: string | null | undefined): StratejiEkrani | null {
  if (ham === 'belge') return 'rapor';
  if (ham === 'aktar') return 'kur';
  if (ham === 'duzenle') return 'giris';
  return null;
}

/**
 * Panel adresi — TEK üretici. `giris` adrese yazılmaz. `amaclar` yalnız
 * plan doğmadan (hedef → bütçe arası) taşınır: plan bütçe adımında doğuyor;
 * o ana kadar seçim adreste, sonra planın sihirbaz durumunda.
 */
export function stratejiPanelAdresi(o: {
  musteri: string;
  plan?: string | null;
  adim?: StratejiEkrani | null;
  kalem?: string | null;
  amaclar?: readonly string[] | null;
}): string {
  return `${STRATEJI_SAYFA_YOLU}${sorgu([
    ['musteri', o.musteri],
    ['plan', o.plan],
    ['adim', o.adim === 'giris' ? null : o.adim],
    ['kalem', o.kalem],
    ['amaclar', o.amaclar && o.amaclar.length > 0 ? o.amaclar.join(',') : null],
  ])}`;
}

/**
 * Ekranın izinleri. Giriş ve oluşturma ajansın (`strategy.write`); rapor
 * okuma herkesin (`strategy.read`); kurma reklam kurma izni de ister
 * (AdvCampaign'in kendi kapısı, `bulk.write`).
 */
export const STRATEJI_EKRAN_IZINLERI: Record<StratejiEkrani, readonly Permission[]> = {
  giris: ['strategy.write'],
  hedef: ['strategy.write'],
  butce: ['strategy.write'],
  bolge: ['strategy.write'],
  kime: ['strategy.write'],
  inceleme: ['strategy.write'],
  plan: ['strategy.write'],
  gonder: ['strategy.write'],
  raporlar: ['strategy.read'],
  rapor: ['strategy.read'],
  kur: ['strategy.write', 'bulk.write'],
};

/**
 * Kullanıcının açacağı ekran. MÜŞTERİ HESABI (`strategy.read` + `approve`)
 * YALNIZ "Raporu incele" yolunu görür: giriş ve oluşturma adımları ona
 * `raporlar`a düşer ve oluşturma bileşenleri hiç monte edilmez. Kurma izni
 * olmayan `kur` isteği `rapor`a düşer. `null` = hiçbiri (yetki mesajı).
 */
export function stratejiEkranKapisi(izinler: readonly Permission[], istenen: StratejiEkrani | null): StratejiEkrani | null {
  const izinli = (e: StratejiEkrani) => STRATEJI_EKRAN_IZINLERI[e].every((i) => izinler.includes(i));
  const e = istenen ?? 'giris';
  if (izinli(e)) return e;
  if ((e === 'kur' || e === 'rapor') && izinli('rapor')) return 'rapor';
  return izinli('raporlar') ? 'raporlar' : null;
}

// ─── Girişsiz onay sayfası ───────────────────────────────────────────────

/**
 * Oturumsuz sayfa. Ajan 3 bu öneki middleware'in genel erişim listesine
 * ekler (`/r` gibi). Token YOLDA, sorgu dizesinde değil: sunucu loglarında
 * sorgu dizeleri ayrıca tutuluyor ve `Referrer-Policy: no-referrer` yolu da
 * dışarı sızdırmıyor.
 */
export const ONAY_SAYFASI_ONEKI = '/strateji-onay';

export function onayBaglantisiYolu(token: string): string {
  return `${ONAY_SAYFASI_ONEKI}/${kodla(token)}`;
}

// ─── API uçları ──────────────────────────────────────────────────────────

/**
 * v2 uç listesi. `izin: null` = OTURUMSUZ uç (token yolda); başka hiçbir uç
 * oturumsuz olamaz ve Ajan 4 controller'ı bu listeyle kaynak taramasıyla
 * eşler. v1 listesi (`../uclar.ts`) v1 ekranı kalkana kadar duruyor.
 */
export const STRATEJI_V2_UCLARI = [
  { yontem: 'GET', yol: '/strateji/v2/planlar', izin: 'strategy.read', ne: 'Liste (v1 + v2, bicim ile)' },
  { yontem: 'POST', yol: '/strateji/v2/planlar', izin: 'strategy.write', ne: 'Yeni taslak (stratejiSihirbazOlusturSchema: + ilk sihirbaz durumu)' },
  { yontem: 'GET', yol: '/strateji/v2/sihirbaz-girdileri', izin: 'strategy.write', ne: 'Hedef ve bütçe adımının girdileri, plan doğmadan (?clientId=)' },
  { yontem: 'PUT', yol: '/strateji/v2/planlar/:id/sihirbaz', izin: 'strategy.write', ne: 'Adım adım ilerleme + dönem/toplam (sürüm, 409)' },
  { yontem: 'POST', yol: '/strateji/v2/planlar/:id/kitle-oner', izin: 'strategy.write', ne: '"Kime anlatıyoruz" yapay zekâ tarifi; YAZMAZ' },
  { yontem: 'GET', yol: '/strateji/v2/planlar/:id/inceleme/:parca', izin: 'strategy.write', ne: 'İnceleme adımının TEK satırı (gerçek okuma)' },
  { yontem: 'GET', yol: '/strateji/v2/planlar/:id', izin: 'strategy.read', ne: 'Plan + kalemler + bölümler + riskler + kalem durumları' },
  { yontem: 'GET', yol: '/strateji/v2/planlar/:id/girdiler', izin: 'strategy.write', ne: 'Önerinin dayandığı bilgiler (tetiklemeden okur)' },
  { yontem: 'POST', yol: '/strateji/v2/planlar/:id/oner', izin: 'strategy.write', ne: 'Motor + yapay zekâ metni; YAZMAZ' },
  { yontem: 'PUT', yol: '/strateji/v2/planlar/:id/kalemler', izin: 'strategy.write', ne: 'Kalemler tek seferde (sürüm, 409)' },
  { yontem: 'PUT', yol: '/strateji/v2/planlar/:id/bolumler', izin: 'strategy.write', ne: 'Belge metinleri' },
  { yontem: 'POST', yol: '/strateji/v2/planlar/:id/kalemler/:kalemId/metin-oner', izin: 'strategy.write', ne: 'Rehberin metin motoru' },
  // AJAN 2 SAPMASI (§ 9.7): § 6.3 kelime uçlarını "v1 aynen" diyordu ama
  // v1 uçları v1 detayını döndürüyor; v2 planı v2 detayıyla dönmeli.
  { yontem: 'POST', yol: '/strateji/v2/planlar/:id/kelime-ara', izin: 'strategy.write', ne: 'Keyword Planner araması (v1 ile aynı kuyruk)' },
  { yontem: 'PATCH', yol: '/strateji/v2/planlar/:id/kelimeler', izin: 'strategy.write', ne: 'Kelime seçimi ve grubu (sürüm, 409)' },
  { yontem: 'POST', yol: '/strateji/v2/planlar/:id/eylem', izin: 'strategy.write', ne: 'onaya_gonder | geri_cek | kapat | iptal' },
  { yontem: 'DELETE', yol: '/strateji/v2/planlar/:id', izin: 'strategy.write', ne: 'Stratejiyi sil (2026-10-14; iz denetim kaydında)' },
  { yontem: 'POST', yol: '/strateji/v2/planlar/:id/onayla', izin: 'strategy.approve', ne: 'Panel içi onay (rol kaydı)' },
  { yontem: 'POST', yol: '/strateji/v2/planlar/:id/revizyon', izin: 'strategy.approve', ne: 'Revizyon iste (yorum zorunlu)' },
  { yontem: 'GET', yol: '/strateji/v2/planlar/:id/yorumlar', izin: 'strategy.read', ne: 'Yorumlar' },
  { yontem: 'POST', yol: '/strateji/v2/planlar/:id/yorumlar', izin: 'strategy.read', ne: 'Yorum yaz (müşteri hesabı da yazar; servis approve ∨ write ister)' },
  { yontem: 'POST', yol: '/strateji/v2/planlar/:id/onay-baglantisi', izin: 'strategy.write', ne: 'Girişsiz onay bağlantısı (ham token yalnız yanıtta)' },
  { yontem: 'GET', yol: '/strateji/v2/planlar/:id/onay-baglantilari', izin: 'strategy.write', ne: 'Bağlantı listesi (token yok)' },
  { yontem: 'POST', yol: '/strateji/v2/onay-baglantilari/:baglantiId/iptal', izin: 'strategy.write', ne: 'Bağlantıyı iptal et' },
  { yontem: 'GET', yol: '/strateji/v2/onay/:token', izin: null, ne: 'OTURUMSUZ: belge (bağlantı hâliyle)' },
  { yontem: 'POST', yol: '/strateji/v2/onay/:token/karar', izin: null, ne: 'OTURUMSUZ: onayla | revizyon_iste (tek kullanımlık)' },
  { yontem: 'GET', yol: '/strateji/v2/planlar/:id/aktarim-onizleme', izin: 'strategy.read', ne: 'Kalem başına engel, düşecek platform, rehberde kalacak eksik' },
  { yontem: 'POST', yol: '/strateji/v2/planlar/:id/aktar', izin: 'strategy.write', ne: 'Kalem → rehber taslağı (servis bulk.write da ister)' },
  { yontem: 'GET', yol: '/strateji/v2/planlar/:id/gerceklesen', izin: 'strategy.read', ne: 'Kalem × platform harcanan / sonuç' },
  { yontem: 'GET', yol: '/strateji/v2/planlar/:id/pdf', izin: 'strategy.read', ne: 'Strateji PDF (Advetics logosu, kılavuz renkleri)' },
  { yontem: 'POST', yol: '/strateji/v2/planlar/:id/gonder', izin: 'strategy.write', ne: 'Mail: PDF eki + onay bağlantısı (servis report.share da ister)' },
  { yontem: 'GET', yol: '/reklam/rehberler/:id/strateji', izin: 'bulk.read', ne: 'Rehberin bağlı olduğu kalem ("Stratejiden" kutusu)' },
] as const satisfies ReadonlyArray<{ yontem: string; yol: string; izin: Permission | null; ne: string }>;

export type StratejiV2Yolu = (typeof STRATEJI_V2_UCLARI)[number]['yol'];

/** `:id`, `:kalemId`, `:baglantiId`, `:token` parametrelerini doldurur; eksik parametre HATA (sessiz `:id` kalmasın). */
export function stratejiUcYolu(yol: StratejiV2Yolu, p: Record<string, string> = {}): string {
  return yol.replace(/:([a-zA-Z]+)/g, (_, ad: string) => {
    const v = p[ad];
    if (!v) throw new Error(`Uç parametresi eksik: ${ad} (${yol})`);
    return kodla(v);
  });
}

/** PDF yolu: SÜRÜM ZORUNLU. Ekrandaki sürüm değiştiyse sunucu 409 der; eski sürümün PDF'i sessizce yeni belge diye inmez. */
export function stratejiPdfYolu(planId: string, surum: number): string {
  return `${stratejiUcYolu('/strateji/v2/planlar/:id/pdf', { id: planId })}${sorgu([['surum', surum]])}`;
}
