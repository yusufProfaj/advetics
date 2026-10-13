import {
  siteYokRehberKapisi,
  yayinaEngelVarMi,
  type RehberAmacKodu,
  type RehberEksigi,
  type RehberPlatformu,
  type UyumSonucu,
} from '@advetics/shared';

/**
 * ═══ REHBER YAYIN KAPILARI — SIRAYLA ve SIFIR PLATFORM ÇAĞRISIYLA ═══
 *
 * MIMARI-REHBER § 3: özet eşleşmesi (409) → eksik yok → prova taze ve aynı
 * özet → yazma kapıları → uyum denetçisi. Burada geçmeyen bir istek Meta ya
 * da Google kotasından tek puan yemez ve hiçbir nesne açmaz.
 *
 * SIRA UCUZDAN PAHALIYA ve TEMBEL: her kapının okuması ancak önceki kapı
 * geçince yapılıyor. Özet eşleşmiyorsa prova kaydı okunmuyor bile — kullanıcı
 * başka bir hâli onaylamış, gerisini sormanın anlamı yok.
 *
 * Kapılar YALNIZ veritabanı okur (`oku` geri çağırımları); platform portu bu
 * fonksiyona hiç verilmiyor. Sıfır çağrı kuralı böylece tipte duruyor.
 */

export type KapiAdi = 'OZET' | 'SITE' | 'EKSIK' | 'PROVA' | 'YAZMA' | 'UYUM';

export type PlatformProvaHali = { tur: 'gecti' } | { tur: 'yok' | 'bekliyor' | 'reddedildi' | 'dogrulanamadi' | 'bayat'; metin: string };
export type YazmaHali = { acik: true } | { acik: false; sebep: string };

export interface KapiGirdisi {
  /** Kullanıcının onay penceresinde gördüğü içeriğin özeti. */
  istenenOzet: string;
  /** Rehberin şu anki içerik özeti. */
  guncelOzet: string;
  /** Son provanın yapıldığı rehber özeti (`reklam_rehberi.prova_ozeti`). */
  provaOzeti: string | null;
  eksikler: readonly RehberEksigi[];
  acik: Record<RehberPlatformu, boolean>;
  /**
   * "Web sitemiz yok" beyanının engelleri (`siteYokEngelleri`). ZORUNLU alan:
   * isteğe bağlı olsaydı yeni bir çağıran onu vermeyi unutur ve kapı sessizce
   * açık kalırdı — panel süzgeci tek başına koruma değil.
   */
  siteYokEngelleri: readonly string[];
}

/**
 * ═══ "WEB SİTEMİZ YOK" — SUNUCU AYNASI (docs/kurulum-sihirbazi/MIMARI.md § 0/2) ═══
 *
 * Panel site isteyen amaç kartlarını üstü çizili gösteriyor; sunucu da aynı
 * yardımcıyla (`siteYokRehberKapisi`, kural İKİNCİ KEZ yazılmıyor) reddediyor.
 * Eski bir sekme ya da doğrudan API çağrısı panel süzgecini atlayabilir.
 * `siteYok` ÜÇ HÂLLİ: `null` (beyan okunamadı) KAPATMAZ — rehberin kendi
 * adres kuralı site yoksa eksik listesinde zaten durduruyor.
 */
export function siteYokEngelleri(amac: RehberAmacKodu | null | undefined, platformlar: Record<RehberPlatformu, boolean>, siteYok: boolean | null): string[] {
  if (!amac || siteYok !== true) return [];
  const engeller: string[] = [];
  for (const p of ['meta', 'google'] as const) {
    if (!platformlar[p]) continue;
    const k = siteYokRehberKapisi(amac, p, siteYok);
    if (!k.acik) engeller.push(`${PLATFORM_ADI[p]}: ${k.sebep}`);
  }
  return engeller;
}

export interface KapiOkuyuculari {
  /** Açık platformun türetilmiş taslağına bağlı prova (30 dk tazelik dahil). */
  prova(platform: RehberPlatformu): Promise<PlatformProvaHali>;
  /** "Meta'ya / Google'a yazmayı durdur" — okunamazsa KAPALI. */
  yazma(platform: RehberPlatformu): Promise<YazmaHali>;
  uyum(): UyumSonucu;
}

export type KapiSonucu =
  | { tur: 'gecti'; uyum: Extract<UyumSonucu, { tur: 'gecti' }> }
  | { tur: 'ret'; kapi: Exclude<KapiAdi, 'UYUM'>; mesajlar: string[] }
  | { tur: 'ret'; kapi: 'UYUM'; mesajlar: string[]; uyum: Extract<UyumSonucu, { tur: 'durdu' }> };

const PLATFORM_ADI: Record<RehberPlatformu, string> = { meta: 'Meta', google: 'Google' };

export async function rehberYayinKapilari(g: KapiGirdisi, oku: KapiOkuyuculari): Promise<KapiSonucu> {
  // 1 — Özet: kullanıcı baktığı hâli mi yayınlıyor.
  if (g.istenenOzet !== g.guncelOzet) {
    return { tur: 'ret', kapi: 'OZET', mesajlar: ['Sen bakarken rehber değişti; sayfayı yenileyip yeniden gözden geçir.'] };
  }
  // 1b — Site yok: beyanlı workspace'te site isteyen amaç (veritabanı okuması, sıfır çağrı).
  if (g.siteYokEngelleri.length > 0) return { tur: 'ret', kapi: 'SITE', mesajlar: [...g.siteYokEngelleri] };
  // 2 — Eksik: engel seviyesinde tek bir eksik bile yayını durdurur.
  if (yayinaEngelVarMi(g.eksikler)) {
    return { tur: 'ret', kapi: 'EKSIK', mesajlar: g.eksikler.filter((e) => e.seviye === 'engel').map((e) => e.metin) };
  }
  const platformlar = (['meta', 'google'] as const).filter((p) => g.acik[p]);
  if (platformlar.length === 0) return { tur: 'ret', kapi: 'EKSIK', mesajlar: ['En az bir platform açık olmalı'] };

  // 3 — Prova: AYNI içeriğe yapılmış ve taze. Özet ayrıysa platform kaydına
  // bakmaya gerek yok: prova başka bir hâlin kanıtı.
  if (g.provaOzeti !== g.guncelOzet) {
    return { tur: 'ret', kapi: 'PROVA', mesajlar: ['Rehber son kontrolden sonra değişti; yeniden "Prova et".'] };
  }
  const provaRet: string[] = [];
  for (const p of platformlar) {
    const h = await oku.prova(p);
    if (h.tur !== 'gecti') provaRet.push(`${PLATFORM_ADI[p]}: ${h.metin}`);
  }
  if (provaRet.length) return { tur: 'ret', kapi: 'PROVA', mesajlar: provaRet };

  // 4 — Yazma kapıları: ajans şalteri.
  const yazmaRet: string[] = [];
  for (const p of platformlar) {
    const k = await oku.yazma(p);
    if (!k.acik) yazmaRet.push(k.sebep);
  }
  if (yazmaRet.length) return { tur: 'ret', kapi: 'YAZMA', mesajlar: yazmaRet };

  // 5 — Uyum denetçisi: son kapı.
  const u = oku.uyum();
  if (u.tur === 'durdu') return { tur: 'ret', kapi: 'UYUM', mesajlar: u.bulgular.map((b) => b.metin), uyum: u };
  return { tur: 'gecti', uyum: u };
}
