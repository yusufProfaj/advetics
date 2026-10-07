import type { HedefKonum, OzelKategori } from '../reklam/meta/hedefleme';
import type { NiyetKodu } from '../reklam/meta/niyetler';
import { kanonikJson, metinUyariIceriyor } from '../reklam/taslak-alanlari';
import { bos, dolu, SAYI_URETEMEYEN_KAYNAKLAR, type Hucre, type Kaynak, type KaynakTuru, type Kaynakli } from './kaynak';
import type { PilotPlatformu, PlanSatiri } from './plan';

/**
 * ═══ PLANDAN TASLAK — `satirdanTaslak` ═══
 *
 * Eski yol (`aktarimIstemi`) plan satırını bir METNE çevirip sohbete
 * koyuyordu; model metni yeniden okuyup alanları kendisi dolduruyordu. Yani
 * müşterinin onayladığı "Meta yeni kitle 24.000 TL" bilgisi bir kez yazıya,
 * bir kez de modelin yorumuna giriyordu: iki kayıp noktası. Yeni yol VERİ:
 * onaylı plan satırı doğrudan taslak alanlarına kopyalanır, her alan
 * kaynağını taşır ve modelin yazdığı TEK şey reklam metnidir.
 *
 * Bütçe ve takvim `onayli_plan` kaynaklıdır (Ç-1: onaylı plan satırı
 * "kullanıcı kararı" sayılır). Konum kitle şablonundan, sayfa ve hesap
 * workspace profilinden, özel kategori Marka Merkezi'nden (Ç-2: workspace
 * başına BİR KEZ sorulur).
 */
export interface PilotTaslak {
  planId: string;
  planSurum: number;
  satirAnahtari: string;
  platform: PilotPlatformu;
  ad: string;
  niyet: Hucre<NiyetKodu>;
  reklamHesabiId: Hucre<string>;
  /** Meta: Facebook sayfası (boost hesabı eşlemesinden). Google: `null`. */
  sayfaId: Hucre<string> | null;
  instagramId: Hucre<string | null> | null;
  konumlar: Hucre<HedefKonum[]> | null;
  kitleSablonuId: Hucre<string> | null;
  /** Taban ∪ ek; `bos('ozel_kategori_sorulmadi')` = yayın yok (sorulmayan soru beyansız konut reklamı üretir). */
  ozelKategoriler: Hucre<OzelKategori[]> | null;
  butce: Kaynakli<{ tip: 'toplam' | 'gunluk'; micros: string }>;
  takvim: Kaynakli<{ baslangic: string; bitis: string }>;
  varliklar: Hucre<string[]> | null;
  /** Varlık başına metin; yapay zekâ yazabilir (`yz_metin`), sayı alanı değil. */
  metinler: Hucre<Array<{ varlikId: string | null; baslik: string; metin: string }>>;
  hedefAdres: Hucre<string>;
  formSablonuId: Hucre<string> | null;
  kelimeler: Kaynakli<string[]> | null;
  /** Google taban negatifler (K-06). */
  negatifler: Kaynakli<string[]> | null;
  /** K-02: Google satırı DURAKLATILMIŞ kurulur ve açılmaz. */
  acilis: Kaynakli<'onaydan_sonra_acilir' | 'duraklatilmis_kalir'>;
}

export interface SatirdanTaslakBaglami {
  planId: string;
  planSurum: number;
  /** Onaylı plan sürümünün kaynağı (`kimlik` = `<planId>@<surum>`). */
  onayKaynagi: Kaynak;
  takvim: { baslangic: string; bitis: string };
  /** Bu platformun workspace'e atanmış hesabı; tek değilse çağıran seçimi açıkça yazar. */
  hesap: Kaynakli<string> | null;
  sayfa: Kaynakli<string> | null;
  instagram: Kaynakli<string | null> | null;
  /** Kitle şablonlarının konumları (kopya, referans değil: şablon sonra değişirse taslak sessizce değişmez). */
  kitleKonumlari: ReadonlyMap<string, Kaynakli<HedefKonum[]>>;
  ozelKategoriler: Kaynakli<OzelKategori[]> | null;
  hedefAdres: Kaynakli<string> | null;
  formSablonuId: Kaynakli<string> | null;
  tabanNegatifler: Kaynakli<string[]> | null;
  zaman: string;
}

export function satirdanTaslak(s: PlanSatiri, b: SatirdanTaslakBaglami): PilotTaslak {
  const k = <T>(v: Kaynakli<T> | null, neden: Parameters<typeof bos>[0]): Hucre<T> => (v ? dolu(v.deger, v.kaynak) : bos(neden));
  const meta = s.platform === 'meta';
  const kitleId = s.kitle?.dolu ? s.kitle.deger.id : null;
  const konum = kitleId ? b.kitleKonumlari.get(kitleId) ?? null : null;
  const niyet = s.niyet.dolu ? s.niyet.deger : null;
  const onay: Kaynak = b.onayKaynagi;
  return {
    planId: b.planId,
    planSurum: b.planSurum,
    satirAnahtari: s.anahtar,
    platform: s.platform,
    ad: s.ad,
    niyet: s.niyet,
    reklamHesabiId: k(b.hesap, 'hesap_yok'),
    sayfaId: meta ? k(b.sayfa, 'sayfa_yok') : null,
    instagramId: meta ? (b.instagram ? dolu(b.instagram.deger, b.instagram.kaynak) : dolu(null, { tur: 'workspace_profili', kimlik: 'instagram_yok', zaman: b.zaman })) : null,
    konumlar: meta ? (konum ? dolu(konum.deger, konum.kaynak) : bos('kitle_yok')) : null,
    kitleSablonuId: meta ? (kitleId && s.kitle?.dolu ? dolu(kitleId, s.kitle.kaynak) : bos('kitle_yok')) : null,
    ozelKategoriler: meta ? k(b.ozelKategoriler, 'ozel_kategori_sorulmadi') : null,
    butce: { deger: { ...s.butce.deger }, kaynak: onay },
    takvim: { deger: { ...b.takvim }, kaynak: onay },
    varliklar: s.varliklar === null ? null : s.varliklar.dolu ? dolu(s.varliklar.deger.map((v) => v.deger.id), onay) : bos('varlik_yok'),
    // Metin henüz yok: yapay zekâ taslak açıldıktan sonra yazar.
    metinler: bos('yz_yazmadi'),
    hedefAdres: k(b.hedefAdres, 'adres_yok'),
    formSablonuId: niyet === 'FORM' ? k(b.formSablonuId, 'form_yok') : null,
    kelimeler: s.kelimeGrubu ? { deger: [...s.kelimeGrubu.kelimeler.deger], kaynak: onay } : null,
    negatifler: meta ? null : b.tabanNegatifler,
    acilis: {
      deger: meta ? 'onaydan_sonra_acilir' : 'duraklatilmis_kalir',
      kaynak: { tur: 'sabit_kural', kimlik: meta ? 'C6_MUSTERI_ONAYI_YAYIN' : 'K02_GOOGLE_DURAKLATILMIS', zaman: b.zaman },
    },
  };
}

/** Sayı/para/yer alanlarının İZİNLİ kaynakları. Yapay zekâ hiçbirinde yok. */
const IZINLI_KAYNAKLAR: Record<'butce' | 'takvim' | 'konumlar' | 'niyet' | 'ozelKategoriler', readonly KaynakTuru[]> = {
  butce: ['onayli_plan', 'kullanici'],
  takvim: ['onayli_plan', 'kullanici'],
  konumlar: ['kitle_sablonu', 'marka_merkezi', 'kullanici'],
  niyet: ['marka_merkezi', 'sabit_kural', 'kullanici', 'onayli_plan'],
  // Hukuki beyan: yalnız bir kişi (Marka Merkezi'nde cevaplayan) ya da taslakta kullanıcı.
  ozelKategoriler: ['marka_merkezi', 'kullanici'],
};

export interface PilotTaslakEksigi {
  alan: keyof PilotTaslak;
  kod: string;
  metin: string;
}

/**
 * "Kuruluma ne kaldı" — tek liste. Kurulum işçisi prova ÖNCESİ, panel
 * kurulum ekranında aynısını okur. Eski `taslakEksikleri` kurallarının
 * pilot karşılığı (kabul listesi K-TAS-*).
 */
export function pilotTaslakEksikleri(t: PilotTaslak, baglam: { yasalUyari?: string | null } = {}): PilotTaslakEksigi[] {
  const e: PilotTaslakEksigi[] = [];
  const ekle = (alan: keyof PilotTaslak, kod: string, metin: string) => e.push({ alan, kod, metin });

  // KAYNAK KİLİDİ: alan dolu görünse de kaynağı izinli değilse karar değil.
  const kilit = (alan: keyof typeof IZINLI_KAYNAKLAR, kaynak: Kaynak | null) => {
    if (kaynak && !IZINLI_KAYNAKLAR[alan].includes(kaynak.tur)) ekle(alan, 'KAYNAK', `${alan}: kaynağı (${kaynak.tur}) bu alan için geçerli değil`);
  };
  kilit('butce', t.butce.kaynak);
  kilit('takvim', t.takvim.kaynak);
  if (t.niyet.dolu) kilit('niyet', t.niyet.kaynak);
  if (t.konumlar?.dolu) kilit('konumlar', t.konumlar.kaynak);
  if (t.ozelKategoriler?.dolu) kilit('ozelKategoriler', t.ozelKategoriler.kaynak);
  if (SAYI_URETEMEYEN_KAYNAKLAR.includes(t.butce.kaynak.tur)) ekle('butce', 'YZ-SAYI', 'Bütçeyi yapay zekâ yazamaz');

  if (!t.niyet.dolu) ekle('niyet', 'NIYET', 'Amaç belirlenmedi');
  if (!t.reklamHesabiId.dolu) ekle('reklamHesabiId', 'OK-01', 'Reklam hesabı yok');
  if (BigInt(t.butce.deger.micros) <= 0n) ekle('butce', 'BTC-01', 'Bütçe sıfır');
  if (t.takvim.deger.bitis < t.takvim.deger.baslangic) ekle('takvim', 'TKV', 'Bitiş başlangıçtan önce');

  if (t.platform === 'meta') {
    if (!t.sayfaId?.dolu) ekle('sayfaId', 'SAYFA', 'Facebook sayfası seçilmedi');
    if (!t.konumlar?.dolu || t.konumlar.deger.length === 0) ekle('konumlar', 'KNM-01', 'Konum yok');
    if (!t.ozelKategoriler?.dolu) ekle('ozelKategoriler', 'OZK-SORU', 'Özel reklam kategorisi sorusu cevaplanmadı');
    else if (t.ozelKategoriler.deger.includes('ISSUES_ELECTIONS_POLITICS')) {
      ekle('ozelKategoriler', 'OZK-SIYASI', "Siyasi ve toplumsal konulu reklamlar Advetics'ten yayınlanamıyor");
    }
    if (!t.varliklar?.dolu || t.varliklar.deger.length === 0) ekle('varliklar', 'KRT-SAYI', 'En az bir görsel gerekli');
    if (t.niyet.dolu && t.niyet.deger === 'FORM' && !t.formSablonuId?.dolu) ekle('formSablonuId', 'FORM-YOK', 'Form seçilmedi');
  } else {
    if (!t.kelimeler || t.kelimeler.deger.length === 0) ekle('kelimeler', 'KLM-YOK', 'Anahtar kelime yok');
    if (t.acilis.deger !== 'duraklatilmis_kalir') ekle('acilis', 'K-02', 'Google satırı duraklatılmış kurulmalı');
  }

  if (t.niyet.dolu && (t.niyet.deger === 'SITE' || t.platform === 'google')) {
    if (!(t.hedefAdres.dolu && /^https:\/\/[^\s/]+\.[^\s]+/.test(t.hedefAdres.deger))) ekle('hedefAdres', 'SITE-ADRES', 'Site adresi https:// ile başlamalı');
  }

  if (!t.metinler.dolu || t.metinler.deger.length === 0) ekle('metinler', 'KRT-METIN', 'Reklam metni yazılmadı');
  else {
    t.metinler.deger.forEach((m, i) => {
      if (!m.baslik.trim()) ekle('metinler', 'KRT-METIN', `Metin ${i + 1}: başlık boş`);
      if (!m.metin.trim()) ekle('metinler', 'KRT-METIN', `Metin ${i + 1}: ana metin boş`);
      else if (baglam.yasalUyari && !metinUyariIceriyor(m.metin, baglam.yasalUyari)) {
        ekle('metinler', 'YASAL-UYARI', `Metin ${i + 1}: zorunlu yasal uyarı metinde yok`);
      }
    });
  }
  return e;
}

/**
 * Prova ve kurulumun bağlandığı özet. Kaynak ZAMANI özete girmez (aynı
 * içerik farklı anda okunduysa aynı taslak); kaynak TÜRÜ ve KİMLİĞİ girer
 * (bütçenin plandan mı kullanıcıdan mı geldiği içerik farkı).
 */
export function pilotTaslakKanonikIcerik(t: PilotTaslak): string {
  const temizle = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(temizle);
    if (v && typeof v === 'object') {
      const o: Record<string, unknown> = {};
      for (const [a, x] of Object.entries(v as Record<string, unknown>)) {
        if (a === 'kaynak' && x && typeof x === 'object') {
          const kk = x as Kaynak;
          o[a] = { tur: kk.tur, kimlik: kk.kimlik };
        } else o[a] = temizle(x);
      }
      return o;
    }
    return v;
  };
  return kanonikJson(temizle(t));
}
