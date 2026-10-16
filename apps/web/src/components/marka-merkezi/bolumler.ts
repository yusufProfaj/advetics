import { markaBolumuAdi, varlikSekmesiAdi, type Dil, type SessionResponse } from '@advetics/shared';
import {
  KURULUM_LISTESI,
  VARLIKLAR_SEKMELERI,
  type MarkaMerkeziBolumKodu,
  type MarkaMerkeziCapasi,
  type VarliklarSekmeKodu,
} from '@/lib/panel-adresleri';

/**
 * ═══ MARKA MERKEZİ'NİN İÇ YAPISI — SAF KARARLAR ═══
 *
 * Adresler ve bölüm listesi sözleşmede (`@advetics/shared` › `panel`,
 * docs/panel-sadelestirme/MIMARI.md); burada YALNIZ panelin ekrana dair
 * kararları: iç menüde her bölümün altında hangi kartların listeleneceği,
 * başlıktaki şirket adı ve Varlıklar'da görülebilen sekmeler. Panelde
 * bileşen render eden test altyapısı yok; karar burada sınanıyor
 * (`bolumler.spec.ts`).
 *
 * ESKİ İÇERİK (`MM_BOLUMLERI`, `mmAdresi`, `varlikYonu`,
 * `bilgiBankasiYonu`, `MM_VARLIKLARI`) SÖZLEŞMEYE TAŞINDI: yedi bölümlük
 * eski yapı burada, adres üreticisi ayrı bir dosyada ve eski adres eşlemesi
 * iki yerde yazılıydı. Biri değişip diğeri unutulduğunda bağlantı sessizce
 * yanlış bölüme açılıyordu.
 */

type AltBaslik<B extends MarkaMerkeziBolumKodu> = { capa: MarkaMerkeziCapasi<B> };

/**
 * İÇ MENÜDE SEÇİLİ BÖLÜMÜN ALTINDAKİ KARTLAR — sayfadaki `id`lere çapa.
 * Tipi sözleşmedeki çapa listesi: listede olmayan bir çapa derlenmiyor ve
 * `bolumler.spec.ts` her çapanın burada da bulunduğunu kilitliyor (çapa
 * sözleşmede var, menüde yok = kullanıcı karta yolu bilmiyor).
 *
 * ADLAR BURADA DEĞİL: iki dilli ekran adı sözlükten (`ic.altBaslik[capa]`,
 * `marka-merkezi.ts`); burada yalnız hangi çapaların hangi sırayla
 * listeleneceği. KURULUM'UN YEDİ ADIMI `KURULUM_LISTESI`NDEN türüyor: adım
 * kodu iki yerde yazılırsa menü ile liste ayrışır.
 */
export const MM_ALT_BASLIKLARI: { [B in MarkaMerkeziBolumKodu]: ReadonlyArray<AltBaslik<B>> } = {
  kurulum: [
    ...KURULUM_LISTESI.map((a) => ({ capa: a.kod })),
    { capa: 'kanallar' },
    { capa: 'veri-kaynaklari' },
  ],
  marka: [{ capa: 'marka-bilgileri' }, { capa: 'markayi-anlat' }, { capa: 'kime-satiyoruz' }, { capa: 'logo' }],
  workspace: [{ capa: 'firma' }, { capa: 'erisim' }, { capa: 'bildirimler' }, { capa: 'veri-durumu' }],
};

/** Bölümün görünen adı (kırıntı ve iç menü aynı yerden). */
export function bolumAdi(kod: MarkaMerkeziBolumKodu, dil: Dil = 'tr'): string {
  return markaBolumuAdi(kod, dil);
}

/**
 * BAŞLIKTAKİ ŞİRKET ADI ("Şirket › Workspace", MIMARI Ç-24).
 *
 * Workspace'in şirketi oturumdaki aktif şirketle AYNI olmayabilir: "tüm
 * şirketler" modunda kullanıcı kardeş bir şirketin workspace'ini açabiliyor
 * ve başlığa oturumun şirket adını yazmak, ekranda yanlış şirketi gösterirdi.
 * Önce workspace'in kendi `orgId`si üst hesabın şirket listesinde aranıyor;
 * bulunamazsa ve oturumun şirketiyle aynıysa onun adı; ikisi de değilse
 * `null` — ad UYDURULMUYOR, başlık yalnız workspace adını yazar.
 */
export function sirketAdi(
  session: Pick<SessionResponse, 'organization' | 'managerAccount'>,
  orgId: string | null | undefined,
): string | null {
  if (!orgId) return null;
  const ust = session.managerAccount?.organizations.find((o) => o.id === orgId);
  if (ust) return ust.name;
  return session.organization.id === orgId ? session.organization.name : null;
}

/**
 * VARLIKLAR'DA GÖRÜLEBİLEN SEKMELER — her sekmenin kapısı o sekmenin okuma
 * ucunun kapısı (sözleşme). Adresteki sekme yetkisizse görülebilen ilkine
 * düşülür: ekipte paylaşılan bir `?sekme=kitleler` bağlantısı, yetkisi
 * olmayana boş bir sayfa açmamalı.
 */
export function gorunurVarlikSekmeleri(izinler: readonly string[]): VarliklarSekmeKodu[] {
  return VARLIKLAR_SEKMELERI.filter((s) => izinler.includes(s.izin)).map((s) => s.kod);
}

export function varlikSekmesiCoz(
  istenen: VarliklarSekmeKodu,
  izinler: readonly string[],
): VarliklarSekmeKodu | null {
  const gorunen = gorunurVarlikSekmeleri(izinler);
  return gorunen.includes(istenen) ? istenen : (gorunen[0] ?? null);
}

/** Varlıklar sekmesinin görünen adı. */
export function varlikSekmeAdi(kod: VarliklarSekmeKodu, dil: Dil = 'tr'): string {
  return varlikSekmesiAdi(kod, dil);
}
