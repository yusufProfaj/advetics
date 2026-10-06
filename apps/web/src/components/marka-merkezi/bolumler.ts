import type { Permission } from '@advetics/shared';
import { baglanti } from '@/lib/baglanti';

/**
 * ═══ MARKA MERKEZİ'NİN BÖLÜMLERİ — TEK TANIM ═══
 *
 * Kullanıcının sorunu kendi cümlesiyle: *"karmakarışık bir mapping'i var,
 * nereye nereden girdiğimi unutuyorum"* (2026-10-06). Bir workspace'in
 * kurulumu dört adrese dağılmıştı: Marka Merkezi (uzun tek sayfa), Bilgi
 * Bankası (beş sekmeli ayrı sayfa), menüde HİÇ görünmeyen üç varlık sayfası
 * (`/kutuphane/gorseller` …) ve Aylık Bütçe. Hazırlık listesindeki her
 * bağlantı da kullanıcıyı başka bir sayfaya atıyordu.
 *
 * Artık tek sayfa ve onun İÇ MENÜSÜ: menüde "Base › Marka Merkezi", sayfada
 * solda bölüm listesi, üstte "Base › Marka Merkezi › Marka" kırıntısı.
 * Seçim URL'de (`?bolum=`), yani paylaşılabiliyor ve geri tuşu çalışıyor.
 *
 * Liste BURADA: iç menü, sayfa, hazırlık bağlantıları ve eski adreslerin
 * yönlendirmesi aynı kodları okuyor. Bir bölümü yalnızca menüye eklemek
 * (ya da yalnızca sayfaya) tıklanınca boş açılan bir satır demekti.
 */
export const MM_BOLUMLERI = [
  { kod: 'baglantilar', ad: 'Bağlantılar', izin: 'client.write' },
  { kod: 'marka', ad: 'Marka', izin: 'client.read' },
  /*
   * AYLIK BÜTÇE BASE'E GELDİ (2026-10-06, kullanıcının isteği). Reklamlar
   * altında ayrı sayfaydı; Marka bölümü onun ÖZETİNİ gösterip oraya
   * yönlendiriyordu — aynı konu iki kapıdan. `/butce` buraya yönleniyor.
   */
  { kod: 'butce', ad: 'Aylık Bütçe', izin: 'budget.read' },
  { kod: 'kitleler', ad: 'Kitleler', izin: 'client.read' },
  { kod: 'varliklar', ad: 'Varlıklar', izin: 'bulk.read' },
] as const satisfies ReadonlyArray<{ kod: string; ad: string; izin: Permission }>;

export type MmBolumKodu = (typeof MM_BOLUMLERI)[number]['kod'];

/**
 * Varlıklar'ın alt bölümleri. Üçü de eskiden ayrı sayfaydı ve MENÜDE
 * yoktu: Marka Merkezi'ndeki bir karttan gidiliyor, geri dönmenin yolu
 * tarayıcının geri tuşuydu.
 */
export const MM_VARLIKLARI = [
  { kod: 'gorseller', ad: 'Görseller' },
  { kod: 'kreatifler', ad: 'Kreatifler' },
  { kod: 'formlar', ad: 'Formlar' },
] as const;

export type MmVarlikKodu = (typeof MM_VARLIKLARI)[number]['kod'];

/**
 * Adresteki bölüm. Tanınmayan ya da YETKİSİ OLMAYAN bölüm, görülebilen ilk
 * bölüme düşüyor: ekipte paylaşılan bir `?bolum=varliklar` bağlantısı,
 * varlık yetkisi olmayan birine boş bir sayfa açmamalı.
 */
export function bolumCoz(
  raw: string | undefined,
  izinler: readonly Permission[],
): MmBolumKodu | null {
  const gorunen = MM_BOLUMLERI.filter((b) => izinler.includes(b.izin));
  return gorunen.find((b) => b.kod === raw)?.kod ?? gorunen[0]?.kod ?? null;
}

export function varlikCoz(raw: string | undefined): MmVarlikKodu {
  return MM_VARLIKLARI.find((v) => v.kod === raw)?.kod ?? 'gorseller';
}

/**
 * Marka Merkezi içindeki bir yerin adresi. `musteri` TAŞINIYOR: sayfalar
 * aktif workspace'i `params.musteri ?? session.activeClientId` sırasıyla
 * çözüyor ve parametresiz bir bağlantı, başka sekmede başka workspace seçili
 * olan kullanıcıyı sessizce başka bir workspace'e götürürdü.
 */
export function mmAdresi(
  clientId: string | null | undefined,
  bolum: MmBolumKodu,
  ek: Record<string, string | undefined> = {},
  capa?: string,
): string {
  const adres = baglanti('/marka-merkezi', { musteri: clientId ?? undefined, bolum, ...ek });
  return capa ? `${adres}#${capa}` : adres;
}

/**
 * ═══ ESKİ ADRESLER NEREYE GİDİYOR ═══
 *
 * Eski sayfalar SİLİNMİYOR, yönleniyor: kayıtlı yer imleri, ekip içinde
 * paylaşılmış bağlantılar ve mailde duran adresler kırılmamalı.
 *
 * Bilgi Bankası'nın Bütçe sekmesi Aylık Bütçe bölümüne gidiyor; bütçenin
 * tek yeri orası.
 */
export function bilgiBankasiYonu(clientId: string | undefined, sekme: string | undefined): string {
  if (sekme === 'butce') return mmAdresi(clientId, 'butce');
  const capa = sekme === 'logo' ? 'logo' : sekme === 'bilgi-bankasi' || sekme === 'hedef-kitle' ? 'bilgi' : undefined;
  return mmAdresi(clientId, 'marka', {}, capa);
}

export function varlikYonu(
  clientId: string | undefined,
  varlik: MmVarlikKodu,
  ek: Record<string, string | undefined> = {},
): string {
  return mmAdresi(clientId, 'varliklar', { varlik, ...ek });
}
