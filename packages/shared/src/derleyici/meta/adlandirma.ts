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

export function formAdi(workspaceKisaAdi: string, sablonSurumu: number): string {
  return `${workspaceKisaAdi.trim()} · Form · ş${sablonSurumu}`;
}

/**
 * Her nesneye iki etiket: belirsiz POST sonrası `{tür}bylabels` araması,
 * açmadan önce tekillik kapısı ve "bunu biz mi kurduk" ayrımı bunlara
 * dayanıyor. Etiket yoksa Meta onu yaratıp bağlıyor, ayrı çağrı gerekmez.
 */
export function adlabels(yayinKimligi: string): Array<{ name: string }> {
  return [{ name: 'advetics' }, { name: `adv-yayin-${yayinKimligi}` }];
}
