/**
 * Nesne adları ve `adlabels` (TASARIM.md § 06.3).
 *
 * Adlar kullanıcıya SORULMAZ, tek fonksiyondan üretilir. Kısa kimlik yayın
 * kimliğinden türüyor: Meta'da ad hesapta tekil olmak zorunda değil ama Ads
 * Manager'da aramada bulunabilmek ve aynı gün aynı niyetle kurulan iki
 * kampanyayı ayırt etmek için gerekli.
 *
 * Saf: tarih ve kimlik GİRDİDEN gelir. Derleyici aynı sürümü iki kez
 * derlediğinde aynı baytları üretmeli; `new Date()` okuyan bir ad, gece
 * yarısını geçen bir provada onay kartını sebepsiz bayatlatırdı.
 */
import { NIYET_KATALOGU, type NiyetKodu } from './niyetler';

/**
 * Zincir yarıda kalırsa Ads Manager'a bakan kişi bu ağacın elle AÇILMAMASI
 * gerektiğini görsün. Açma adımı öneki kaldırır.
 */
export const ACILMADI_ONEKI = '[Advetics: açılmadı] ';

export function kisaKimlik(yayinKimligi: string): string {
  const temiz = yayinKimligi.replace(/[^0-9a-zA-Z]/g, '').toUpperCase();
  // Dörtten kısa bir kimlik bir programlama hatasıdır (UUID bekleniyor);
  // sessizce kısa ad üretmek tekilliği bozar.
  if (temiz.length < 4) throw new Error(`Yayın kimliği çok kısa: "${yayinKimligi}"`);
  return temiz.slice(0, 4);
}

export interface AdGirdisi {
  workspaceKisaAdi: string;
  niyet: NiyetKodu;
  /** `YYYY-MM-DD`, hesabın saat diliminde. Date DEĞİL (saat dilimi kayması). */
  tarih: string;
  yayinKimligi: string;
}

export function kampanyaAdi(g: AdGirdisi): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(g.tarih)) throw new Error(`Tarih YYYY-MM-DD değil: "${g.tarih}"`);
  return [
    g.workspaceKisaAdi.trim(),
    NIYET_KATALOGU[g.niyet].ekranAdi,
    g.tarih,
    kisaKimlik(g.yayinKimligi),
  ].join(' · ');
}

export function reklamSetiAdi(g: AdGirdisi, projeEtiketi?: string): string {
  return `${kampanyaAdi(g)} · ${projeEtiketi ?? 'Kitle'}`;
}

/** `n` 1'den başlar: ekranda "Fikir 1", dizinde 0. */
export function reklamAdi(g: AdGirdisi, n: number): string {
  if (!Number.isInteger(n) || n < 1) throw new Error(`Fikir numarası 1'den başlar: ${n}`);
  return `${kampanyaAdi(g)} · Fikir ${n}`;
}

/**
 * KREATİF ADI EN ÇOK 100 KARAKTER — ölçüldü (2026-10-11, v25.0, satış canlı
 * turu). Meta kreatif adını 100. karakterde KESİP sonuna kendi damgasını
 * ekliyor (N-15): "[Advetics: açılmadı] … · Sitemden satış ya da kayıt
 * gelsin · … · Fikir 1" (101) "… · Fiki 2026-10-11-<hex>" döndü ve geri okuma
 * "fark" ile durdu. Ad bizde sığdırılıyor: taşan kısım AMAÇ ADINDAN "…" ile
 * kesiliyor; kısa kimlik, tarih ve "Fikir N" (Ads Manager'da aranan yerler)
 * korunuyor. Reklam ve set adlarında aynı kesim gözlenmedi.
 */
export const META_KREATIF_AD_SINIRI = 100;

export function kreatifAdi(g: AdGirdisi, n: number, onek: string): string {
  const tam = onek + reklamAdi(g, n);
  const tasan = [...tam].length - META_KREATIF_AD_SINIRI;
  if (tasan <= 0) return tam;
  const ekranAdi = [...NIYET_KATALOGU[g.niyet].ekranAdi];
  // Amaç adı tek başına taşmayı karşılayamıyorsa (çok uzun workspace adı)
  // sondan kesilir: ad yine sınırda kalır, "Fikir N" kaybolabilir.
  if (ekranAdi.length - tasan - 1 < 1) return [...tam].slice(0, META_KREATIF_AD_SINIRI).join('');
  const kisa = ekranAdi.slice(0, ekranAdi.length - tasan - 1).join('').trimEnd() + '…';
  const sonuc = onek + reklamAdi({ ...g }, n).replace(NIYET_KATALOGU[g.niyet].ekranAdi, kisa);
  return [...sonuc].length <= META_KREATIF_AD_SINIRI ? sonuc : [...sonuc].slice(0, META_KREATIF_AD_SINIRI).join('');
}

export function formAdi(workspaceKisaAdi: string, sablonSurumu: number): string {
  return `${workspaceKisaAdi.trim()} · Form · ş${sablonSurumu}`;
}

/**
 * Her nesneye iki etiket: belirsiz POST sonrası `{tür}bylabels` araması,
 * açmadan önce tekillik kapısı ve "bunu biz mi kurduk" ayrımı bunlara
 * dayanıyor. Etiket yoksa Meta onu yaratıp bağlıyor, ayrı çağrı gerekmez.
 */
/** Yayın etiketinin öneki: geri okuma başka bir Advetics kurulumunu bununla tanıyor. */
export const YAYIN_ETIKETI_ONEKI = 'adv-yayin-';

export function adlabels(yayinKimligi: string): Array<{ name: string }> {
  return [{ name: 'advetics' }, { name: `${YAYIN_ETIKETI_ONEKI}${yayinKimligi}` }];
}
