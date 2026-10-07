'use client';

import { medyaKontrol, type MedyaKarari } from '@advetics/shared';
import { API_URL } from '@/lib/api';

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
  /** Video: `id` videonun, `kapakId` tarayıcıda alınan karenin kimliği. */
  kapakId?: string;
  oran: string;
  uyari: string | null;
}

/** Dosyanın boyutlarını tarayıcıda okur; okunamazsa `null` (kontrol reddeder). */
export async function medyaOlc(d: File): Promise<{ en: number | null; boy: number | null }> {
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
      return { en: v.videoWidth || null, boy: v.videoHeight || null };
    }
    const g = new Image();
    g.src = adres;
    await g.decode();
    return { en: g.naturalWidth || null, boy: g.naturalHeight || null };
  } catch {
    return { en: null, boy: null };
  } finally {
    URL.revokeObjectURL(adres);
  }
}

export async function medyaKarari(d: File): Promise<MedyaKarari> {
  return medyaKontrol({ mime: d.type, bayt: d.size, ...(await medyaOlc(d)) });
}

/**
 * Videodan KAPAK KARESİ — tarayıcıda (sunucuda video işleme programı yok ve
 * paylaşımlı sunucuya kurulmuyor). Yaklaşık 1. saniye ya da kısa videoda
 * %10'u; tam çözünürlükte JPEG. Kare hem asistanın gördüğü görsel hem
 * Meta'nın kapak görseli.
 */
export async function kapakKaresi(d: File): Promise<Blob> {
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
    v.currentTime = Math.min(1, (v.duration || 1) * 0.1);
    await new Promise<void>((ok) => (v.onseeked = () => ok()));
    const c = document.createElement('canvas');
    c.width = v.videoWidth;
    c.height = v.videoHeight;
    c.getContext('2d')!.drawImage(v, 0, 0);
    return await new Promise<Blob>((ok, hata) => c.toBlob((b) => (b ? ok(b) : hata(new Error('Kapak karesi alınamadı'))), 'image/jpeg', 0.9));
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
 * Bir dosyayı yükler. Kontrol ÖNCE (ret ise hiç yüklenmez); video için kare
 * de yüklemeden önce alınır: tarayıcı videoyu açamıyorsa 200 MB boşuna gitmez.
 */
export async function medyaYukle(clientId: string, d: File): Promise<YuklenenMedya> {
  const k = await medyaKarari(d);
  if (k.sonuc === 'ret') throw new Error(k.sebep);
  const uyari = k.sonuc === 'uyari' ? k.sebep : null;
  if (d.type.startsWith('video/')) {
    const kare = await kapakKaresi(d);
    const video = await dosyaGonder(clientId, d, d.name);
    const kapak = await dosyaGonder(clientId, kare, `${d.name}-kapak.jpg`);
    return { id: video.id, ad: video.ad, onizlemeAdresi: kapak.onizlemeAdresi, kapakId: kapak.id, oran: k.oran, uyari };
  }
  const g = await dosyaGonder(clientId, d, d.name);
  return { ...g, oran: k.oran, uyari };
}
