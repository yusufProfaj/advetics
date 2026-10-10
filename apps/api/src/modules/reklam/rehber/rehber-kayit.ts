import { createHash } from 'node:crypto';
import {
  ISTEMCI_YAZAMAZ,
  kanonikJson,
  rehberAlanlariSchema,
  type RehberAlanlari,
  type RehberGuncelle,
} from '@advetics/shared';

/**
 * Rehber kaydının SAF kuralları: içerik özeti ve değişikliklerin
 * birleştirilmesi. Servis yalnız çağırıp yazıyor; karar burada ve
 * çalıştırılarak sınanıyor (`rehber-kayit.spec.ts`).
 */

/** Şemanın tanıdığı alan adları — istemci yalnız bunları yazabilir. */
const ALAN_ADLARI = new Set(Object.keys(rehberAlanlariSchema.shape));

/**
 * İçerik özeti: `{deger, kaynak}` kanonik JSON'unun SHA-256'sı. `kim` ve
 * `zaman` GİRMİYOR — kimin tıkladığı içeriği değiştirmez ve aynı değeri
 * yeniden yazmak provayı sebepsiz bayatlatmamalı. Kural taslak özetinin
 * (`taslakKanonikIcerik`) aynısı; ikinci bir kural doğsaydı aynı içerik iki
 * yerde iki özet verirdi.
 */
export function rehberOzeti(a: RehberAlanlari): string {
  const yalin: Record<string, unknown> = {};
  for (const k of Object.keys(a).sort()) {
    const d = a[k as keyof RehberAlanlari];
    if (d) yalin[k] = { deger: d.deger, kaynak: d.kaynak };
  }
  return createHash('sha256').update(kanonikJson(yalin)).digest('hex');
}

export type UygulamaSonucu = { tur: 'tamam'; alanlar: RehberAlanlari } | { tur: 'ret'; mesaj: string };

/**
 * Değişiklikleri öncekinin üstüne uygular.
 *
 * - `kim` ve `zaman` SUNUCUDAN: istemcinin saati sürüme yazılmaz.
 * - `sil: true` alanı SİLER (platform kapatılınca hesabı boşaltmak).
 *   `deger: null` silmek DEĞİL, değerin kendisi: Instagram'sız sayfa ve
 *   "yaş aralığı yok" null DEĞER taşıyor; ikisi "silindi" ile karışırsa
 *   kullanıcının cevabı kaybolur ve soru yeniden sorulur.
 * - Tanınmayan alan adı ve istemcinin yazamayacağı kaynak (`meta_okumasi`,
 *   `recete`) RET: platformdan okunan değeri istemci taklit edemez.
 * - Birleşik sonuç `rehberAlanlariSchema` ile doğrulanır (strict).
 *
 * İZİNLİ KAYNAK (`REHBER_IZINLI_KAYNAKLAR`) burada REDDEDİLMİYOR: "Metin
 * öner"in metni `ai_onerisi` olarak kaydedilebilmeli ki kullanıcı yarım
 * işini kaybetmesin; kilit eksik listesinde (KAYNAK) ve yayın kapısında.
 */
export function degisiklikleriUygula(
  onceki: unknown,
  degisiklikler: RehberGuncelle['degisiklikler'],
  kim: string,
  zaman: string,
  secenek: { sunucuKonumEslemesi?: boolean } = {},
): UygulamaSonucu {
  const birlesik: Record<string, unknown> = { ...((onceki && typeof onceki === 'object' ? onceki : {}) as object) };
  for (const d of degisiklikler) {
    if (!ALAN_ADLARI.has(d.alan)) return { tur: 'ret', mesaj: `Tanınmayan alan: ${d.alan}` };
    if (ISTEMCI_YAZAMAZ.includes(d.kaynak)) return { tur: 'ret', mesaj: `${d.alan}: bu kaynak istemciden yazılamaz (${d.kaynak})` };
    if (d.sil === true) delete birlesik[d.alan];
    else birlesik[d.alan] = { deger: d.alan === 'konumlar' && !secenek.sunucuKonumEslemesi ? googleKarsiliginiKoru(birlesik.konumlar, d.deger) : d.deger, kaynak: d.kaynak, kim, zaman };
  }
  const r = rehberAlanlariSchema.safeParse(birlesik);
  if (!r.success) return { tur: 'ret', mesaj: r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') };
  return { tur: 'tamam', alanlar: r.data };
}

/**
 * KONUMUN GOOGLE KARŞILIĞINI İSTEMCİ YAZAMAZ (Ajan 4, BULGU-4). Etiket "İzmir"
 * iken karşılık olarak ABD gönderen bir PUT kabul ediliyor ve "Google'da
 * eşlenmedi" eksiği kapanıyordu: sunucunun "yalnız tam ad eşleşmesi" kuralı
 * hiç koşmuyordu. Karşılığı yalnız `konumlariEsle` yazar; burada istemcinin
 * gönderdiği atılır ve AYNI konum (tür + anahtar) için daha önce sunucunun
 * yazdığı karşılık korunur — yoksa her konum eklemesi eşlemeyi sıfırlardı.
 */
export function googleKarsiliginiKoru(onceki: unknown, yeni: unknown): unknown {
  if (!Array.isArray(yeni)) return yeni;
  const eski = (onceki as { deger?: unknown } | undefined)?.deger;
  const harita = new Map<string, unknown>();
  if (Array.isArray(eski)) {
    for (const k of eski as Array<{ tur?: string; key?: string; google?: unknown }>) {
      if (k && k.google) harita.set(`${k.tur}|${k.key}`, k.google);
    }
  }
  return (yeni as Array<Record<string, unknown>>).map((k) => {
    if (!k || typeof k !== 'object') return k;
    const { google: _istemci, ...kalan } = k;
    const korunan = harita.get(`${String(k.tur)}|${String(k.key)}`);
    return korunan ? { ...kalan, google: korunan } : kalan;
  });
}
