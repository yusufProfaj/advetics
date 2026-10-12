import {
  GERI_BESLEME_ASAMA_ADI,
  GERI_BESLEME_BEKLEME_DK,
  imaEdilenAsamalar,
  GERI_BESLEME_BOS_NEDEN_ADI,
  GERI_BESLEME_OLAY_DURUM_ADI,
  type GeriBeslemeAyari,
  type GeriBeslemeOlayDurumu,
  type GeriBeslemeOlayi,
  type LeadGeriBeslemeRozeti,
  type LeadStatus,
} from '@advetics/shared';
import { baglanti } from '@/lib/baglanti';

/**
 * ═══ POTANSİYEL MÜŞTERİLER › META'YA GERİ BESLEME: SAF KARARLAR ═══
 *
 * Sözleşme `packages/shared/src/geri-besleme`, kararlar
 * `docs/geri-besleme/MIMARI.md` § 9 ve taslak `docs/geri-besleme/taslak.html`.
 * Panelde bileşen render eden test altyapısı yok (bilinçli); hangi rozetin,
 * hangi cümlenin, hangi düğmenin çizileceği burada ve `geri-besleme.spec.ts`
 * onları ÇALIŞTIRARAK sınıyor (CLAUDE.md, `domaYazilmali` dersi).
 */

/**
 * "Bu kişi müşteri oldu mu?" seçenekleri. YENİ BİR ALAN DEĞİL: her seçenek
 * var olan lead durumunu yazıyor (MIMARI Ç-1) ve sunucu aşamayı oradan
 * türetiyor. Kullanıcı reklam bilmiyor (Ç-14): "Nitelikli", "Kazanıldı"
 * yerine kendi işinin dili.
 *
 * Sıra ekranda soldan sağa: olumsuzdan olumluya. "Yeni" seçenek değil:
 * soru zaten "henüz bilmiyorum" hâlinde soruluyor; geri dönmek "Geri al".
 */
export const KALITE_SECENEKLERI: ReadonlyArray<{ durum: LeadStatus; etiket: string; ipucu: string }> = [
  { durum: 'lost', etiket: 'Ulaşamadım / uygun değil', ipucu: 'Yanlış numara, ilgisiz' },
  { durum: 'contacted', etiket: 'Görüştük', ipucu: 'Ulaşıldı, sonuç belli değil' },
  { durum: 'qualified', etiket: 'İlgileniyor', ipucu: 'Gerçekten ilgili' },
  { durum: 'won', etiket: 'Müşteri oldu', ipucu: 'Satışa döndü' },
];

/** Durum hattındaki kısa adlar: soru ve süzgeç AYNI dili konuşsun. */
export const DURUM_KISA_ADI: Record<LeadStatus, string> = {
  new: 'Yeni',
  contacted: 'Görüştük',
  qualified: 'İlgileniyor',
  won: 'Müşteri oldu',
  lost: 'Uygun değil',
};

/** Sekme adresi: süzgeç ve workspace taşınıyor, elle birleştirilmiyor. */
export function potansiyelAdresi(clientId: string, sekme: 'kayitlar' | 'gonderimler'): string {
  return baglanti('/potansiyel-musteriler', { musteri: clientId, sekme: sekme === 'gonderimler' ? 'gonderimler' : undefined });
}

/** Bekleyen iş ve uyarı satırının ekranı: Gönderimler sekmesi. */
export function gonderimlerAdresi(clientId: string): string {
  return potansiyelAdresi(clientId, 'gonderimler');
}

/**
 * ═══ GERİ ALMA PENCERESİ ═══
 *
 * CAPI'de silme yok; işaret 15 dakika bekletiliyor ve o pencerede geri
 * alınan aşama hiç gitmiyor (Ç-6). "Geri al" bağlantısı YALNIZ pencere
 * açıkken: kapandıktan sonra göstermek, platforma gitmiş bir olayı
 * "geri alındı" sandırırdı.
 */
export function geriAlmaBitisMs(degisimMs: number): number {
  return degisimMs + GERI_BESLEME_BEKLEME_DK * 60_000;
}

/**
 * Geri almadan SONRA sunucunun döndürdüğü rozette, yeni durumun ima ETMEDİĞİ
 * ama Meta'ya gitmiş (ya da yolda) aşamalar: geri alma geç kaldı demek.
 * CAPI'de silme yok; ekran bunu söylemezse kullanıcı olayı geri aldığını sanır.
 */
export function geriAlinamayanlar(r: LeadGeriBeslemeRozeti | undefined, yeniDurum: LeadStatus): string[] {
  const ima = new Set(imaEdilenAsamalar(yeniDurum));
  return (r?.asamalar ?? [])
    .filter((a) => !ima.has(a.asama) && (a.durum === 'iletildi' || a.durum === 'eslesmedi' || a.durum === 'gonderiliyor'))
    .map((a) => GERI_BESLEME_ASAMA_ADI[a.asama]);
}

export function geriAlmaKalanDk(degisimMs: number, simdiMs: number): number | null {
  const kalan = degisimMs + GERI_BESLEME_BEKLEME_DK * 60_000 - simdiMs;
  return kalan > 0 ? Math.ceil(kalan / 60_000) : null;
}

/**
 * Satır rozeti. `kapali` ROZETSİZ (ayar kapalıyken her satırda "kapalı"
 * yazmak gürültü); `iletildi` SESSİZ gri onay; yalnız `sorun` kırmızı.
 * Rozet yalnız sorun ya da bekleme varken dikkat çeker (MIMARI Ç-14).
 */
export function rozetGorunumu(r: LeadGeriBeslemeRozeti | undefined): { metin: string; ton: 'sessiz' | 'notr' | 'sorun' } | null {
  if (!r || r.tur === 'kapali' || r.tur === 'yok') return null;
  if (r.tur === 'sorun') return { metin: r.metin, ton: 'sorun' };
  if (r.tur === 'iletildi') return { metin: r.metin, ton: 'sessiz' };
  return { metin: r.metin, ton: 'notr' };
}

/** Aşama listesi (açılan kartta): "Form dolduruldu · iletildi". */
export function asamaSatirlari(r: LeadGeriBeslemeRozeti | undefined): Array<{ ad: string; durum: string; hata: string | null; sorun: boolean }> {
  return (r?.asamalar ?? []).map((a) => ({
    ad: GERI_BESLEME_ASAMA_ADI[a.asama],
    durum: GERI_BESLEME_OLAY_DURUM_ADI[a.durum],
    hata: a.hata,
    sorun: a.durum === 'reddedildi' || a.durum === 'vazgecildi' || a.durum === 'suresi_doldu',
  }));
}

/**
 * Liste üstündeki şerit. AYAR OKUNAMADIYSA "kapalı" DEMİYOR: çağrı düştüğünde
 * şeridi kapalı göstermek, açık ve çalışan bir gönderimi kapalı sandırırdı.
 */
export type AyarSonucu = { durum: 'tamam'; ayar: GeriBeslemeAyari } | { durum: 'hata'; mesaj: string };

export function seritGorunumu(s: AyarSonucu): { baslik: string; alt: string; ton: 'notr' | 'sorun'; eylem: 'ac' | 'ayarlar' | null } {
  if (s.durum === 'hata') return { baslik: 'Meta’ya bildirim durumu okunamadı', alt: s.mesaj, ton: 'sorun', eylem: null };
  const a = s.ayar;
  const kume = a.datasetAdi ?? (a.datasetId ? `Piksel ${a.datasetId}` : null);
  switch (a.durum) {
    case 'kapali':
      return {
        baslik: 'Sonuçlar Meta’ya bildirilmiyor',
        alt: 'Hangi kişinin müşteri olduğunu Meta’ya söylersen reklam benzer kişilere gösterilir.',
        ton: 'notr',
        eylem: 'ac',
      };
    case 'calisiyor':
    case 'bekliyor':
      return { baslik: 'Sonuçlar Meta’ya bildiriliyor', alt: [kume, a.neden].filter(Boolean).join(' · '), ton: 'notr', eylem: 'ayarlar' };
    case 'kurulum_eksik':
    case 'hata': {
      const bekleyen = a.sayilar.bekliyor + a.sayilar.basarisiz;
      return {
        baslik: 'Sonuçlar Meta’ya gitmiyor',
        // PLATFORMUN CÜMLESİ AYNEN (sunucu `neden`e yazıyor).
        alt: `${bekleyen > 0 ? `${bekleyen} sonuç bekliyor. ` : ''}${a.neden}`,
        ton: 'sorun',
        eylem: 'ayarlar',
      };
    }
  }
}

/** Gönderimler sekmesindeki durum çipinin tonu. */
export function durumTonu(d: GeriBeslemeOlayDurumu): 'sessiz' | 'notr' | 'sorun' {
  if (d === 'reddedildi' || d === 'vazgecildi' || d === 'suresi_doldu') return 'sorun';
  if (d === 'iletildi' || d === 'eslesmedi' || d === 'iptal') return 'sessiz';
  return 'notr';
}

/**
 * Tablo satırının alt notu: NEDEN ve NE OLACAK. "Gönderilemedi" tek başına
 * eyleme dönüşmüyor; kaç deneme yapıldığı ve Meta'nın cümlesi yanında.
 */
export function olayNotu(o: GeriBeslemeOlayi, simdiMs: number): string | null {
  switch (o.durum) {
    case 'bekliyor': {
      if (!o.sonrakiDeneme) return null;
      const t = Date.parse(o.sonrakiDeneme);
      return t > simdiMs ? `${saat(o.sonrakiDeneme)}’de gönderilecek, o zamana kadar geri alınabilir` : 'Sıradaki turda gönderilecek';
    }
    case 'basarisiz':
      return `${o.deneme} deneme${o.hata ? ` · Meta: “${o.hata}”` : ''}${o.sonrakiDeneme ? ` · sonraki deneme ${saat(o.sonrakiDeneme)}` : ''}`;
    case 'vazgecildi':
    case 'reddedildi':
      return `${o.deneme} deneme${o.hata ? ` · Meta: “${o.hata}”` : ''}`;
    case 'suresi_doldu':
      return 'Meta 7 günden eski sonucu kabul etmiyor';
    case 'eslesmedi':
      return 'Meta bu kişiyi reklamla eşleştiremedi; yapılacak bir şey yok';
    case 'iptal':
      return o.hata ?? 'Gönderilmeden geri alındı';
    case 'gonderiliyor':
      // Yaşlanıp "sonucu bilinmiyor" işaretlenmişse sunucunun cümlesi; değilse istek yolda.
      return o.hata ?? 'İstek Meta’ya gidiyor';
    case 'iletildi':
      return null;
  }
}

/** "Tekrar dene" düğmesi: yalnız platforma ULAŞMAMIŞ ve tekrar denenebilir satır varsa. */
export function yenidenDenenebilir(sayilar: Record<GeriBeslemeOlayDurumu, number>): number {
  return sayilar.vazgecildi + sayilar.reddedildi;
}

export function bosNedenMetni(n: keyof typeof GERI_BESLEME_BOS_NEDEN_ADI): string {
  return GERI_BESLEME_BOS_NEDEN_ADI[n];
}

/** Ayar kaydının cevabındaki sayılar: SESSİZ DEĞİL, eskiler ekranda yazıyor (Ç-13). */
export function degisimMetni(d: { kuyruga: number; eskiOlduguIcinAtlanan: number; iptalEdilen: number } | null | undefined): string | null {
  if (!d) return null;
  if (d.iptalEdilen > 0) return `Kapatıldı. Gönderilmeyi bekleyen ${d.iptalEdilen} sonuç iptal edildi.`;
  const p: string[] = [];
  p.push(d.kuyruga > 0 ? `Son 7 günün ${d.kuyruga} bildirimi sıraya alındı.` : 'Son 7 günde gönderilecek bildirim yok.');
  if (d.eskiOlduguIcinAtlanan > 0) p.push(`${d.eskiOlduguIcinAtlanan} kayıt 7 günden eski olduğu için gönderilemez (Meta kuralı).`);
  return p.join(' ');
}

function saat(iso: string): string {
  return new Intl.DateTimeFormat('tr-TR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Istanbul' }).format(new Date(iso));
}
