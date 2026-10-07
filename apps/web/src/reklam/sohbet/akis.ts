import type { MesajDurumu, SohbetOlayi } from '@advetics/shared';

/**
 * AdvCampaign akışının SAF tarafı: SSE ayrıştırma ve olayların ekran
 * durumuna uygulanması. Panelde bileşen render testi yok; ekranın "ne
 * gösteriyorum" kararı buraya çıkarıldı ki sınanabilsin (CLAUDE.md "REACT
 * EFFECT'İNİN İÇİNDEKİ KARAR TEST EDİLEMİYOR").
 */

export interface EkranMesaji {
  id: string;
  sira: number;
  rol: 'kullanici' | 'asistan';
  metin: string;
  olaylar: SohbetOlayi[];
  durum: MesajDurumu;
  /** Kullanıcı balonunda gösterilecek medya önizlemeleri (yalnız yerel). */
  medya?: Array<{ adres: string; video: boolean }>;
}

/**
 * Parça parça gelen SSE metninden tam olayları çıkarır; yarım kalan son
 * olay `kalan`da bir sonraki parçayı bekler. Bozuk JSON SESSİZCE atılmaz:
 * `bozuk` sayılır ve ekran "bağlantı sorunu" der.
 */
export function olaylariAyikla(tampon: string): { olaylar: SohbetOlayi[]; kalan: string; bozuk: number } {
  const bloklar = tampon.split('\n\n');
  const kalan = bloklar.pop() ?? '';
  const olaylar: SohbetOlayi[] = [];
  let bozuk = 0;
  for (const b of bloklar) {
    const veri = b
      .split('\n')
      .filter((l) => l.startsWith('data:'))
      .map((l) => l.slice(5).trimStart())
      .join('\n');
    if (!veri) continue;
    try {
      olaylar.push(JSON.parse(veri) as SohbetOlayi);
    } catch {
      bozuk++;
    }
  }
  return { olaylar, kalan, bozuk };
}

/**
 * Bir olayı mesaj listesine uygular. Asistanın akıştaki mesajı listenin
 * SONUNDA, `durum: 'akista'`. `bitti` gelene kadar "akista" kalır; gelmezse
 * (bağlantı koptu) ekran bunu "tamam" sanmaz.
 */
export function olayUygula(mesajlar: EkranMesaji[], e: SohbetOlayi): EkranMesaji[] {
  if (e.tur === 'mesaj_basladi') {
    return [...mesajlar, { id: e.mesajId, sira: e.sira, rol: 'asistan', metin: '', olaylar: [], durum: 'akista' }];
  }
  const son = mesajlar.at(-1);
  if (!son || son.rol !== 'asistan' || son.durum !== 'akista') {
    // Kota gibi tur açılmadan dönen hata: ayrı bir sistem satırı olarak eklenir.
    if (e.tur === 'hata') return [...mesajlar, { id: `hata-${mesajlar.length}`, sira: (son?.sira ?? 0) + 1, rol: 'asistan', metin: '', olaylar: [e], durum: 'hata' }];
    return mesajlar;
  }
  const guncel: EkranMesaji = { ...son, olaylar: [...son.olaylar, e] };
  if (e.tur === 'metin') {
    guncel.metin = son.metin + e.parca;
    guncel.olaylar = son.olaylar; // metin parçaları olay listesini şişirmez
  }
  if (e.tur === 'bitti') guncel.durum = e.durum;
  return [...mesajlar.slice(0, -1), guncel];
}

/** Ekranda araç izi satırları: başladı + bitti eşleşir; bitmeyen "sürüyor". */
export function aracIzleri(olaylar: SohbetOlayi[]): Array<{ arac: string; adim: number; hal: string | 'suruyor'; sureMs: number | null }> {
  const izler: Array<{ arac: string; adim: number; hal: string; sureMs: number | null }> = [];
  for (const e of olaylar) {
    if (e.tur === 'arac_basladi') izler.push({ arac: e.arac, adim: e.adim, hal: 'suruyor', sureMs: null });
    if (e.tur === 'arac_bitti') {
      const i = izler.findIndex((x) => x.adim === e.adim);
      if (i >= 0) izler[i] = { arac: e.arac, adim: e.adim, hal: e.hal, sureMs: e.sureMs };
    }
  }
  return izler;
}

/** Son soru: yalnız EN SON asistan mesajındaki ve ondan sonra kullanıcı yazmadıysa. */
export function bekleyenSoru(mesajlar: EkranMesaji[]) {
  const son = mesajlar.at(-1);
  if (!son || son.rol !== 'asistan' || son.durum !== 'tamam') return null;
  const s = [...son.olaylar].reverse().find((e) => e.tur === 'soru');
  return s && s.tur === 'soru' ? s.soru : null;
}

/** "1,2 sn" — Türkçe ondalık. */
export function sureMetni(ms: number): string {
  return `${(ms / 1000).toFixed(1).replace('.', ',')} sn`;
}
