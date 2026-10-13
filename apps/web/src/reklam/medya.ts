'use client';

import { medyaKontrol, type MedyaKarari, type MedyaKontrolBaglami } from '@advetics/shared';
import { API_URL } from '@/lib/api';
import { ONERI_KARESI_UZUN_KENAR, kapakAdayZamanlari, kucukOlcu, oneriKareZamanlari, ortalamaParlaklik, siyahlariAyikla } from './video-kare';

/**
 * Medya yükleme — AdvCampaign'in yazma alanı ve panel aynı yolu kullanıyor.
 *
 * GİRİŞ ANINDA KONTROL: dosya bırakıldığı an ölçülüyor ve sunucuyla AYNI
 * fonksiyondan (`medyaKontrol`) geçiyor. Kullanıcı kullanılamayacak bir
 * dosyayı onay kartında değil bıraktığında öğrenmeli; 200 MB'lık bir video
 * da reddedilecekse yüklenmeden reddedilmeli.
 */

export interface YuklenenMedya {
  id: string;
  ad: string;
  onizlemeAdresi: string;
  /** Video: `id` videonun, `kapakId` seçili kapak karesinin kimliği (ilk aday). */
  kapakId?: string;
  /** Video: kapak adayları (kimlik + önizleme), sırayla; ilki `kapakId` (B10). */
  kapakAdaylari?: Array<{ id: string; onizlemeAdresi: string }>;
  /** Video: metin önerisinin küçük kareleri (B11). Alınamadıysa boş; kapak gider. */
  oneriKareleri?: string[];
  /** Video süresi, saniye; ölçülemediyse `null`. */
  sure?: number | null;
  oran: string;
  uyari: string | null;
}

/** Dosyanın boyutlarını (ve videoda süresini) tarayıcıda okur; okunamazsa `null` (kontrol reddeder). */
export async function medyaOlc(d: File): Promise<{ en: number | null; boy: number | null; sure?: number | null }> {
  const adres = URL.createObjectURL(d);
  try {
    if (d.type.startsWith('video/')) {
      const v = document.createElement('video');
      v.preload = 'metadata';
      v.src = adres;
      await new Promise<void>((ok, hata) => {
        v.onloadedmetadata = () => ok();
        v.onerror = () => hata(new Error('okunamadı'));
      });
      // B8: süre GİRİŞTE ölçülüyor. `Infinity`/NaN (akış videosu, bozuk
      // başlık) "ölçülemedi" = null; sıfır saymak videoyu yanlışlıkla reddederdi.
      const sure = Number.isFinite(v.duration) && v.duration > 0 ? v.duration : null;
      return { en: v.videoWidth || null, boy: v.videoHeight || null, sure };
    }
    const g = new Image();
    g.src = adres;
    await g.decode();
    return { en: g.naturalWidth || null, boy: g.naturalHeight || null };
  } catch {
    return { en: null, boy: null, ...(d.type.startsWith('video/') ? { sure: null } : {}) };
  } finally {
    URL.revokeObjectURL(adres);
  }
}

export async function medyaKarari(d: File, baglam: MedyaKontrolBaglami = {}): Promise<MedyaKarari> {
  return medyaKontrol({ mime: d.type, bayt: d.size, ...(await medyaOlc(d)) }, baglam);
}

interface Kare {
  blob: Blob;
  parlaklik: number;
  zaman: number;
}

/**
 * Videodan KARELER — tarayıcıda (sunucuda video işleme programı yok ve
 * paylaşımlı sunucuya kurulmuyor). Verilen saniyelerde, sırayla; `uzunKenar`
 * verilirse küçültülerek. Kapak TAM çözünürlükte (Meta'nın kapak görseli ve
 * panelin ölçü kaynağı, `videoBilgisiKapaktan`).
 */
async function videoKareleri(d: File, zamanlar: readonly number[], uzunKenar?: number): Promise<Kare[]> {
  const adres = URL.createObjectURL(d);
  try {
    const v = document.createElement('video');
    v.muted = true;
    v.preload = 'auto';
    v.src = adres;
    await new Promise<void>((ok, hata) => {
      v.onloadeddata = () => ok();
      v.onerror = () => hata(new Error('Video tarayıcıda açılamadı'));
    });
    const kareler: Kare[] = [];
    for (const z of zamanlar) {
      v.currentTime = Math.min(z, Math.max(0, (v.duration || z) - 0.05));
      await new Promise<void>((ok) => (v.onseeked = () => ok()));
      const o = uzunKenar ? kucukOlcu(v.videoWidth, v.videoHeight, uzunKenar) : { en: v.videoWidth, boy: v.videoHeight };
      const c = document.createElement('canvas');
      c.width = o.en;
      c.height = o.boy;
      const ctx = c.getContext('2d')!;
      ctx.drawImage(v, 0, 0, o.en, o.boy);
      const parlaklik = ortalamaParlaklik(ctx.getImageData(0, 0, o.en, o.boy).data);
      const blob = await new Promise<Blob>((ok, hata) => c.toBlob((b) => (b ? ok(b) : hata(new Error('Kare alınamadı'))), 'image/jpeg', uzunKenar ? 0.75 : 0.9));
      kareler.push({ blob, parlaklik, zaman: z });
    }
    return kareler;
  } finally {
    URL.revokeObjectURL(adres);
  }
}

async function dosyaGonder(clientId: string, d: Blob, ad: string): Promise<{ id: string; ad: string; onizlemeAdresi: string }> {
  const form = new FormData();
  form.append('dosya', d, ad);
  const res = await fetch(`${API_URL}/reklam/gorseller?clientId=${clientId}`, { method: 'POST', body: form, credentials: 'include' });
  const govde = (await res.json().catch(() => null)) as { id: string; ad: string; onizlemeAdresi: string; message?: string } | null;
  if (!res.ok || !govde) throw new Error(govde?.message ?? `Yükleme düştü (HTTP ${res.status})`);
  return govde;
}

/**
 * Bir dosyayı yükler. Kontrol ÖNCE (ret ise hiç yüklenmez); video için
 * kareler de yüklemeden önce alınır: tarayıcı videoyu açamıyorsa 200 MB
 * boşuna gitmez.
 *
 * VİDEO (VIDEO denetimi B10/B11): üç kapak adayı (siyahlar atılır, ilki
 * varsayılan kapak) ve metin önerisi için üç küçük kare. Öneri kareleri
 * alınamazsa video YİNE yüklenir ve öneri kapağa düşer; uyarıda yazar.
 */
export async function medyaYukle(clientId: string, d: File, baglam: MedyaKontrolBaglami = {}): Promise<YuklenenMedya> {
  const olcu = await medyaOlc(d);
  const k = medyaKontrol({ mime: d.type, bayt: d.size, ...olcu }, baglam);
  if (k.sonuc === 'ret') throw new Error(k.sebep);
  const uyarilar = k.sonuc === 'uyari' ? [k.sebep] : [];
  if (d.type.startsWith('video/')) {
    const sure = olcu.sure ?? null;
    const adaylar = siyahlariAyikla(await videoKareleri(d, kapakAdayZamanlari(sure)));
    let oneri: Kare[] = [];
    try {
      oneri = await videoKareleri(d, oneriKareZamanlari(sure), ONERI_KARESI_UZUN_KENAR);
    } catch (e) {
      uyarilar.push(`Metin önerisi için kareler alınamadı (${e instanceof Error ? e.message : 'bilinmeyen hata'}); öneri kapağa bakarak yazılacak.`);
    }
    const video = await dosyaGonder(clientId, d, d.name);
    const kok = d.name.replace(/\.[a-z0-9]+$/i, '');
    const yuklenen: Array<{ id: string; onizlemeAdresi: string }> = [];
    for (const [i, a] of adaylar.entries()) {
      // İlk adayın adı eski kapağınkiyle aynı (`-kapak.jpg`): sayfa
      // yenilenince video bilgisi kapaktan türetiliyor (`videoBilgisiKapaktan`).
      const g = await dosyaGonder(clientId, a.blob, i === 0 ? `${d.name}-kapak.jpg` : `${d.name}-kapak-${i + 1}.jpg`);
      yuklenen.push({ id: g.id, onizlemeAdresi: g.onizlemeAdresi });
    }
    const oneriIdleri: string[] = [];
    for (const [i, o] of oneri.entries()) oneriIdleri.push((await dosyaGonder(clientId, o.blob, `${kok}-oneri-${i + 1}.jpg`)).id);
    return {
      id: video.id,
      ad: video.ad,
      onizlemeAdresi: yuklenen[0]!.onizlemeAdresi,
      kapakId: yuklenen[0]!.id,
      kapakAdaylari: yuklenen,
      oneriKareleri: oneriIdleri,
      sure,
      oran: k.oran,
      uyari: uyarilar.length ? uyarilar.join(' ') : null,
    };
  }
  const g = await dosyaGonder(clientId, d, d.name);
  return { ...g, oran: k.oran, uyari: uyarilar.length ? uyarilar.join(' ') : null };
}
