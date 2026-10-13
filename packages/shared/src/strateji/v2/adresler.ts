import type { Permission } from '../../auth/roles';

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
 * Üç görünüm, TEK SAYFA (`?gorunum=`), taslakta onaylanan üç ekran:
 * `duzenle` (ajansın planlayıcısı), `belge` (müşterinin gördüğü rapor),
 * `aktar` (AdvCampaign'e aktarım). Ayrı sayfaya bölmek bu projede iki kez
 * hata üretti (rapor şablonu dersi).
 */
export const STRATEJI_GORUNUMLERI = ['duzenle', 'belge', 'aktar'] as const;
export type StratejiGorunumu = (typeof STRATEJI_GORUNUMLERI)[number];

export function stratejiGorunumu(ham: string | null | undefined): StratejiGorunumu | null {
  return (STRATEJI_GORUNUMLERI as readonly string[]).includes(ham ?? '') ? (ham as StratejiGorunumu) : null;
}

export function stratejiPanelAdresi(o: { musteri: string; plan?: string | null; gorunum?: StratejiGorunumu | null }): string {
  return `${STRATEJI_SAYFA_YOLU}${sorgu([['musteri', o.musteri], ['plan', o.plan], ['gorunum', o.gorunum]])}`;
}

/** Görünümün izinleri. Müşteri hesabı (`strategy.read` + `approve`) YALNIZ belgeyi görür. */
export const STRATEJI_GORUNUM_IZINLERI: Record<StratejiGorunumu, readonly Permission[]> = {
  duzenle: ['strategy.write'],
  belge: ['strategy.read'],
  // Aktarım reklam kurma izni de ister (AdvCampaign'in kendi kapısı).
  aktar: ['strategy.write', 'bulk.write'],
};

/**
 * Kullanıcının açacağı görünüm: istenen görünüm izinliyse o, değilse
 * izinli İLK görünüm (sıra: düzenle → belge). Müşteri `?gorunum=duzenle`
 * yazsa da belgeyi görür; düzenleyici bileşeni hiç monte edilmez. `null`
 * = hiçbiri (sayfa yetki mesajı).
 */
export function stratejiGorunumKapisi(izinler: readonly Permission[], istenen: StratejiGorunumu | null): StratejiGorunumu | null {
  const izinli = (g: StratejiGorunumu) => STRATEJI_GORUNUM_IZINLERI[g].every((i) => izinler.includes(i));
  if (istenen && izinli(istenen)) return istenen;
  return (['duzenle', 'belge'] as const).find(izinli) ?? null;
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
  { yontem: 'POST', yol: '/strateji/v2/planlar', izin: 'strategy.write', ne: 'Yeni taslak (stratejiOlusturSchema)' },
  { yontem: 'GET', yol: '/strateji/v2/planlar/:id', izin: 'strategy.read', ne: 'Plan + kalemler + bölümler + riskler + kalem durumları' },
  { yontem: 'GET', yol: '/strateji/v2/planlar/:id/girdiler', izin: 'strategy.write', ne: 'Önerinin dayandığı bilgiler (tetiklemeden okur)' },
  { yontem: 'POST', yol: '/strateji/v2/planlar/:id/oner', izin: 'strategy.write', ne: 'Motor + yapay zekâ metni; YAZMAZ' },
  { yontem: 'PUT', yol: '/strateji/v2/planlar/:id/kalemler', izin: 'strategy.write', ne: 'Kalemler tek seferde (sürüm, 409)' },
  { yontem: 'PUT', yol: '/strateji/v2/planlar/:id/bolumler', izin: 'strategy.write', ne: 'Belge metinleri' },
  { yontem: 'POST', yol: '/strateji/v2/planlar/:id/kalemler/:kalemId/metin-oner', izin: 'strategy.write', ne: 'Rehberin metin motoru' },
  { yontem: 'POST', yol: '/strateji/v2/planlar/:id/eylem', izin: 'strategy.write', ne: 'onaya_gonder | geri_cek | kapat | iptal' },
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
