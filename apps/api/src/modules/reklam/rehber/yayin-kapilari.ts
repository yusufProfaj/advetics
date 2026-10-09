import { yayinaEngelVarMi, type RehberEksigi, type RehberPlatformu, type UyumSonucu } from '@advetics/shared';

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

export type KapiAdi = 'OZET' | 'EKSIK' | 'PROVA' | 'YAZMA' | 'UYUM';

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
