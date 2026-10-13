import {
  ayarlarAdresi,
  markaMerkeziAdresi,
  varliklarAdresi,
  veriDurumuAdresi,
  type MarkaMerkeziBolumKodu,
  type VarliklarSekmeKodu,
} from './adresler';

/**
 * ═══ ESKİ ADRES → YENİ ADRES — TEK EŞLEME ═══
 *
 * Eski sayfalar SİLİNMİYOR, YÖNLENİYOR: yer imleri, ekipte paylaşılmış
 * bağlantılar, maillerde ve bildirimlerde duran adresler kırılmamalı.
 * Her eski sayfanın `page.tsx`i tek satır: `redirect(eskiAdresYonu('…', …))`.
 * `panel-adresleri.spec.ts` bu satırı her eski sayfada arıyor.
 *
 * EŞLEME BURADA, SAYFADA DEĞİL: 2026-10-06'da `?bolum=butce` taşınırken eşleme
 * iki yerde (sayfa ve `bilgiBankasiYonu`) ayrı yazılmıştı ve biri `ay`
 * parametresini düşürüyordu. Bir eşleme = bir satır.
 */

/** Yönlendirmenin elindeki bilgi — sayfanın `params`, `searchParams` ve oturumu. */
export interface EskiAdresGirdisi {
  /** Adresteki `?musteri=`. */
  musteri?: string | null;
  /** Oturumdaki aktif workspace (adres workspace taşımıyorsa). */
  aktifMusteri?: string | null;
  /** Dinamik yol parçası (`/ayarlar/musteriler/[id]/...`). */
  id?: string | null;
  /** Sayfanın taşıdığı diğer sorgu parametreleri — DÜŞÜRÜLMEMELİ. */
  sorgu?: Readonly<Record<string, string | undefined>>;
}

/**
 * Eski adresler ve gittikleri yer. `yol` dosya sistemindeki sayfanın yolu
 * (`app/(dashboard)/<yol>/page.tsx`); test sayfanın var olduğunu ve
 * yönlendirdiğini bu alandan kontrol ediyor.
 */
export const ESKI_ADRESLER = {
  'ayarlar/ust-hesap': {
    yol: 'ayarlar/ust-hesap',
    yon: (_g: EskiAdresGirdisi) => ayarlarAdresi('sirketler'),
  },
  /*
   * ÜST HESAPLAR ŞİRKETLER SEKMESİNİN İÇİNDE ve yalnız platform sahibine
   * (kullanıcı kararı). Sahip olmayan biri çapaya düşerse kart çizilmiyor
   * ve sayfa başından açılıyor — 403 yok, çünkü sekmenin kendisi açık.
   */
  'ayarlar/ust-hesaplar': {
    yol: 'ayarlar/ust-hesaplar',
    yon: (_g: EskiAdresGirdisi) => ayarlarAdresi('sirketler', { capa: 'ust-hesaplar' }),
  },
  'ayarlar/musteriler': {
    yol: 'ayarlar/musteriler',
    yon: (_g: EskiAdresGirdisi) => ayarlarAdresi('sirketler', { capa: 'workspaceler' }),
  },
  /* Ekip TEK yerde: workspace süzgeciyle Ekip ve güvenlik. */
  'ayarlar/musteriler/[id]/ekip': {
    yol: 'ayarlar/musteriler/[id]/ekip',
    yon: (g: EskiAdresGirdisi) => ayarlarAdresi('ekip', { workspace: g.id ?? null, capa: 'workspace-erisimi' }),
  },
  /* Bir workspace'in hesapları ve kanalları: hesap ataması yalnız Kurulum'da. */
  'ayarlar/musteriler/[id]/kanallar': {
    yol: 'ayarlar/musteriler/[id]/kanallar',
    yon: (g: EskiAdresGirdisi) => markaMerkeziAdresi('kurulum', g.id ?? null, 'kanallar'),
  },
  /*
   * SENKRONİZASYON DURUMU workspace'e bakan bir teşhis ekranıydı ama Ayarlar'da
   * duruyordu ve AKTİF workspace'i okuyordu (sekmede seçili olan, adresteki
   * değil). Artık Workspace bilgileri › Veri durumu; adres workspace
   * taşımadığı için oturumdaki seçim geçiliyor.
   */
  'ayarlar/senkronizasyon': {
    yol: 'ayarlar/senkronizasyon',
    yon: (g: EskiAdresGirdisi) => veriDurumuAdresi(g.musteri ?? g.aktifMusteri ?? null),
  },
  'ayarlar/e-posta': {
    yol: 'ayarlar/e-posta',
    yon: (_g: EskiAdresGirdisi) => ayarlarAdresi('hesabim', { capa: 'e-posta' }),
  },
  'ayarlar/okuma-api': {
    yol: 'ayarlar/okuma-api',
    yon: (_g: EskiAdresGirdisi) => ayarlarAdresi('hesabim', { capa: 'okuma-api' }),
  },
  /* `?kurtarma=1` TAŞINIYOR: kurtarma koduyla giren kişiye yeni kod üretmesi söyleniyor. */
  hesabim: {
    yol: 'hesabim',
    yon: (g: EskiAdresGirdisi) => ayarlarAdresi('hesabim', { kurtarma: g.sorgu?.kurtarma === '1' }),
  },
  /*
   * ESKİ BİLGİ BANKASI (2026-10-06'dan beri yönleniyordu, `bilgiBankasiYonu`).
   * BÜTÇE SEKMESİ BURADA YOK: `?sekme=butce` Planla › Aylık Bütçe'ye gidiyor
   * ve o yolun tek üreticisi panelde (`lib/butce-adresi.ts`). Sayfa onu BU
   * ÇAĞRIDAN ÖNCE yakalıyor; burada ikinci bir `/butce` dizgesi yazmak,
   * 2026-10-06'daki iki yönlendirmeden birinin `ay`ı düşürmesinin aynısı
   * olurdu.
   */
  'kutuphane/bilgi-bankasi': {
    yol: 'kutuphane/bilgi-bankasi',
    yon: (g: EskiAdresGirdisi) => {
      const musteri = g.musteri ?? null;
      switch (g.sorgu?.sekme) {
        case 'logo':
          return markaMerkeziAdresi('marka', musteri, 'logo');
        case 'bilgi-bankasi':
          return markaMerkeziAdresi('marka', musteri, 'markayi-anlat');
        case 'hedef-kitle':
          return markaMerkeziAdresi('marka', musteri, 'kime-satiyoruz');
        default:
          return markaMerkeziAdresi('marka', musteri);
      }
    },
  },
  'kutuphane/gorseller': {
    yol: 'kutuphane/gorseller',
    yon: (g: EskiAdresGirdisi) => varlikYonu(g, 'gorseller'),
  },
  'kutuphane/kreatifler': {
    yol: 'kutuphane/kreatifler',
    yon: (g: EskiAdresGirdisi) => varlikYonu(g, 'kreatifler'),
  },
  'kutuphane/formlar': {
    yol: 'kutuphane/formlar',
    yon: (g: EskiAdresGirdisi) => varlikYonu(g, 'formlar'),
  },
} as const satisfies Record<string, { yol: string; yon: (g: EskiAdresGirdisi) => string }>;

export type EskiAdresAnahtari = keyof typeof ESKI_ADRESLER;

export function eskiAdresYonu(anahtar: EskiAdresAnahtari, g: EskiAdresGirdisi = {}): string {
  return ESKI_ADRESLER[anahtar].yon(g);
}

/**
 * LOGO VARLIKLAR'DA DEĞİL. Eski `/kutuphane/gorseller?tur=logo` bağlantısı
 * logonun EVİNE gidiyor (Marka › Logo); Görseller'in logo süzgeci kalktı ve
 * oraya `tur=logo` taşımak boş bir süzgeç açardı.
 */
function varlikYonu(g: EskiAdresGirdisi, sekme: VarliklarSekmeKodu): string {
  const musteri = g.musteri ?? null;
  if (g.sorgu?.tur === 'logo') return markaMerkeziAdresi('marka', musteri, 'logo');
  return varliklarAdresi(sekme, musteri, { tur: g.sorgu?.tur, form: g.sorgu?.form });
}

// ─────────────────────────────────────────────────────────────────────────────
// Marka Merkezi'nin eski `?bolum=` değerleri
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Marka Merkezi'nin ESKİ bölüm kodları ve gittikleri yer. `butce` burada YOK:
 * o 2026-10-09'dan beri Planla'ya yönleniyor ve yönü `butceAdresi`
 * (panel, `lib/butce-adresi.ts`); sayfa `butce`yi bu fonksiyondan ÖNCE
 * yakalıyor.
 *
 * `olcum` paylaşılan sözleşmede de geçiyor (`olcum/index.ts` eylemi
 * `{ tur: 'marka_merkezi', bolum: 'baglantilar' | 'ayarlar' }`): o değerler
 * eski kod ve panel `eskiMarkaMerkeziYonu` ile çeviriyor; sözleşmeyi
 * değiştirmek API'nin yanıt biçimini değiştirmek demekti.
 */
export const ESKI_MM_BOLUMLERI = ['baglantilar', 'olcum', 'kitleler', 'varliklar', 'ayarlar', 'bildirimler'] as const;
export type EskiMmBolumu = (typeof ESKI_MM_BOLUMLERI)[number];

export function eskiMarkaMerkeziYonu(
  ham: string | null | undefined,
  g: {
    musteri: string | null | undefined;
    /** Eski `?varlik=` (Varlıklar alt bölümü). */
    varlik?: string | null;
    tur?: string | null;
    form?: string | null;
  },
): string | null {
  const musteri = g.musteri ?? null;
  switch (ham as EskiMmBolumu) {
    case 'baglantilar':
      return markaMerkeziAdresi('kurulum', musteri, 'kanallar');
    case 'olcum':
      return markaMerkeziAdresi('kurulum', musteri, 'olcum');
    case 'kitleler':
      return varliklarAdresi('kitleler', musteri);
    case 'varliklar': {
      if (g.tur === 'logo') return markaMerkeziAdresi('marka', musteri, 'logo');
      const sekme: VarliklarSekmeKodu =
        g.varlik === 'kreatifler' || g.varlik === 'formlar' ? g.varlik : 'gorseller';
      return varliklarAdresi(sekme, musteri, { tur: g.tur, form: g.form });
    }
    case 'ayarlar':
      return markaMerkeziAdresi('workspace', musteri);
    case 'bildirimler':
      return markaMerkeziAdresi('workspace', musteri, 'bildirimler');
    default:
      return null;
  }
}

/**
 * ESKİ ÇAPALAR — İSTEMCİDE çevrilir. Parça (`#…`) sunucuya hiç gitmiyor;
 * `?bolum=ayarlar#kategori` sunucuda `?bolum=workspace`a yönleniyor ve
 * tarayıcı eski parçayı KORUYOR (Location parça taşımıyorsa). Sayfa
 * açılınca küçük bir istemci bileşeni `location.hash`i buradan geçirir;
 * sonuç `null` değilse `history.replaceState` + kaydırma.
 *
 * Dönüş TAM ADRES, yalnız çapa değil: `#kategori` (özel reklam kategorisi)
 * artık BAŞKA bir bölümde (Kurulum › Reklam varsayılanları).
 */
export function eskiCapaYonu(
  bolum: MarkaMerkeziBolumKodu,
  capa: string,
  musteri: string | null | undefined,
): string | null {
  const c = capa.replace(/^#/, '');
  if (bolum === 'marka' && c === 'bilgi') return markaMerkeziAdresi('marka', musteri, 'markayi-anlat');
  if (bolum === 'workspace' && c === 'kategori') return markaMerkeziAdresi('kurulum', musteri, 'varsayilanlar');
  if (bolum === 'workspace' && c === 'ekip') return markaMerkeziAdresi('workspace', musteri, 'erisim');
  return null;
}
