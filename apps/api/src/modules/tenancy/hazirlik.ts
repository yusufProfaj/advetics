import {
  PLATFORM_KISA_ADLARI,
  type HazirlikMaddesi,
  type Platform,
} from '@advetics/shared';
import {
  BAGLANTI_GORUNMUYOR,
  veriAkisiEngeli,
  type VeriAkisiAdayi,
} from '../../queue/supurme-kapsami';

/**
 * ═══ HAZIRLIK KARARI — SAF ═══
 *
 * Veritabanından toplanan girdiyi maddelere çeviriyor. Ayrı ve saf, çünkü
 * asıl mantık burada ve bir sorgunun içine gömülü olsaydı yalnızca
 * veritabanlı testle sınanabilirdi; bu depoda sessiz hatanın en çok
 * saklandığı yer tam da bu tür "hangi hâl hangi cümleye düşüyor"
 * kararları.
 */
export interface HazirlikHesabi extends VeriAkisiAdayi {
  name: string;
  platform: Platform;
}

export interface HazirlikGirdisi {
  hesaplar: HazirlikHesabi[];
  sosyalKanalSayisi: number;
  profil: {
    markaBilgileri: string | null;
    hedefKitle: string | null;
    bilgiBankasi: string | null;
    logoAssetId: string | null;
    sektor: string | null;
    anaAmac: string | null;
    kategoriSayisi: number;
    vaatSayisi: number;
    sayfaSayisi: number;
  } | null;
  /**
   * `null` = bu kişi bütçeyi OKUYAMIYOR. "Bütçe yok" ile "göremiyorum" aynı
   * şey değil; ikincisi `bilinmiyor` olarak dönüyor.
   */
  buAyButceVar: boolean | null;
}

const bos = (s: string | null | undefined): boolean => !s || s.trim().length === 0;

function platformOzeti(hesaplar: HazirlikHesabi[]): string {
  const sayac = new Map<Platform, number>();
  for (const h of hesaplar) sayac.set(h.platform, (sayac.get(h.platform) ?? 0) + 1);
  return [...sayac.entries()].map(([p, n]) => `${n} ${PLATFORM_KISA_ADLARI[p]}`).join(', ');
}

export function hazirlikMaddeleri(g: HazirlikGirdisi): HazirlikMaddesi[] {
  const maddeler: HazirlikMaddesi[] = [];

  // ─── 1. Reklam hesabı ──────────────────────────────────────────────────
  maddeler.push(
    g.hesaplar.length > 0
      ? {
          kod: 'reklam_hesabi',
          zorunlu: true,
          durum: 'tamam',
          aciklama: `${g.hesaplar.length} reklam hesabı: ${platformOzeti(g.hesaplar)}.`,
        }
      : {
          kod: 'reklam_hesabi',
          zorunlu: true,
          durum: 'eksik',
          aciklama:
            'Bu workspace’e henüz reklam hesabı atanmadı. Hesap atandığı anda izleme açılır ve son 90 günün verisi çekilmeye başlar.',
        },
  );

  // ─── 2. Veri akışı ─────────────────────────────────────────────────────
  /*
   * KARAR `veriAkisiEngeli`NDE — Senkronizasyon Durumu ekranıyla AYNI
   * fonksiyon. Burada ayrı bir "veri geliyor mu" kuralı yazmak, bir ekranın
   * "geliyor", ötekinin "gelmiyor" demesi olurdu.
   *
   * HESAP YOKSA madde "eksik" ama sebebi bir önceki madde: iki maddenin
   * birden "hesap ata" demesi yerine bu, önce neyin yapılacağını söylüyor.
   */
  if (g.hesaplar.length === 0) {
    maddeler.push({
      kod: 'veri_akisi',
      zorunlu: true,
      durum: 'eksik',
      aciklama: 'Önce bir reklam hesabı ata; veri akışı onun ardından başlar.',
    });
  } else {
    const kararlar = g.hesaplar.map((h) => ({ ad: h.name, engel: veriAkisiEngeli(h) }));
    const engelli = kararlar.filter(
      (x): x is { ad: string; engel: string } => x.engel !== null && x.engel !== BAGLANTI_GORUNMUYOR,
    );
    /*
     * GÖRÜNMEYEN BAĞLANTI "EKSİK" DEĞİL "BİLİNMİYOR". Bağlantı başka şirketin
     * kendi bağlantısıysa bu görünümden okunamıyor; "veri gelmiyor" demek
     * sağlam bir kurulumu bozmaya gönderen yanlış alarm olurdu.
     */
    const gorunmeyen = kararlar.filter((x) => x.engel === BAGLANTI_GORUNMUYOR);
    if (engelli.length === 0 && gorunmeyen.length > 0) {
      maddeler.push({
        kod: 'veri_akisi',
        zorunlu: true,
        durum: 'bilinmiyor',
        aciklama:
          `${g.hesaplar.length} hesaptan ${gorunmeyen.length} tanesinin bağlantısı bu görünümden okunamıyor ` +
          `(${gorunmeyen.map((x) => x.ad).join(', ')}). Hesap başka bir şirketin kendi bağlantısından geliyor; ` +
          'veri durumunu görmek için o şirkete geç.',
      });
    } else if (engelli.length === 0) {
      maddeler.push({
        kod: 'veri_akisi',
        zorunlu: true,
        durum: 'tamam',
        aciklama:
          g.hesaplar.length === 1
            ? 'Hesaptan veri geliyor.'
            : `${g.hesaplar.length} hesabın hepsinden veri geliyor.`,
      });
    } else {
      /*
       * SESSİZ KESME YOK: kaç hesapta sorun olduğu ve toplamın kaç olduğu
       * yazıyor. İlk hesabın sebebi TAM yazılıyor, çünkü "bir sorun var" bir
       * teşhis değil; gerisi sayıyla.
       */
      const [ilk] = engelli;
      const kalan = engelli.length - 1;
      maddeler.push({
        kod: 'veri_akisi',
        zorunlu: true,
        durum: 'eksik',
        aciklama:
          `${g.hesaplar.length} hesaptan ${engelli.length} tanesinden veri gelmiyor. ` +
          `${ilk!.ad}: ${ilk!.engel}` +
          (kalan > 0 ? ` (ve ${kalan} hesap daha)` : ''),
      });
    }
  }

  // ─── 3. Marka bilgisi ──────────────────────────────────────────────────
  /*
   * YAPILANDIRILMIŞ ALANLARA BAKIYOR, serbest metne değil. Üç serbest metin
   * alanı dolu olsa bile Reklam Oluştur amacı ve hedef adresi yeniden
   * soruyordu: makinenin kullanabildiği şey bu alanlar. Serbest metin "Ek
   * notlar" oldu ve boş olması eksik sayılmıyor.
   *
   * Zorunlu değil (boş alan hata vermiyor, AI markayı tanımadan yazıyor);
   * ama HANGİSİNİN boş olduğu yazıyor.
   */
  const p = g.profil;
  const alanlar: Array<[string, boolean]> = [
    ['Sektör', !bos(p?.sektor)],
    ['Ürün/hizmet kategorileri', (p?.kategoriSayisi ?? 0) > 0],
    ['Ana amaç', !bos(p?.anaAmac)],
    ['Hedef kitle', !bos(p?.hedefKitle)],
    ['Öne çıkan vaatler', (p?.vaatSayisi ?? 0) > 0],
  ];
  const bosAlanlar = alanlar.filter(([, dolu]) => !dolu).map(([ad]) => ad);
  /*
   * AMAÇ "WEB SİTESİ" AMA SAYFA YOK: Reklam Oluştur hedef adresi bu
   * listeden seçiyor. Boşsa kullanıcı adresi yine elle yazıyor — alan dolu
   * görünür, iş yapılmamış olur.
   */
  if (p?.anaAmac === 'website' && p.sayfaSayisi === 0) {
    bosAlanlar.push('Sık kullanılan sayfalar (ana amaç web sitesi)');
  }
  maddeler.push(
    bosAlanlar.length === 0
      ? { kod: 'marka_bilgisi', zorunlu: false, durum: 'tamam', aciklama: 'Marka alanları dolu.' }
      : {
          kod: 'marka_bilgisi',
          zorunlu: false,
          durum: 'eksik',
          aciklama:
            `Boş: ${bosAlanlar.join(', ')}. ` +
            'AI reklam metni yazarken ve Reklam Oluştur amacı seçerken markayı bu alanlardan tanıyor.',
        },
  );

  // ─── 4. Logo ───────────────────────────────────────────────────────────
  maddeler.push(
    g.profil?.logoAssetId
      ? { kod: 'logo', zorunlu: false, durum: 'tamam', aciklama: 'Logo yüklü.' }
      : {
          kod: 'logo',
          zorunlu: false,
          durum: 'eksik',
          aciklama: 'Logo yok. Google Performance Max logosuz kampanya açmıyor.',
        },
  );

  // ─── 5. Aylık bütçe ────────────────────────────────────────────────────
  maddeler.push(
    g.buAyButceVar === null
      ? {
          kod: 'aylik_butce',
          zorunlu: false,
          durum: 'bilinmiyor',
          aciklama: 'Bütçeyi görme yetkin yok, bu madde senin için değerlendirilemiyor.',
        }
      : g.buAyButceVar
        ? { kod: 'aylik_butce', zorunlu: false, durum: 'tamam', aciklama: 'Bu ayın bütçesi tanımlı.' }
        : {
            kod: 'aylik_butce',
            zorunlu: false,
            durum: 'eksik',
            aciklama:
              'Bu ay için bütçe tanımlı değil. Harcamanın bütçeye göre hızı izlenemiyor ve bütçeye bakan kurallar çalışmıyor.',
          },
  );

  // ─── 6. Sosyal kanal ───────────────────────────────────────────────────
  maddeler.push(
    g.sosyalKanalSayisi > 0
      ? {
          kod: 'sosyal_kanal',
          zorunlu: false,
          durum: 'tamam',
          aciklama: `${g.sosyalKanalSayisi} sayfa ya da kanal bağlı.`,
        }
      : {
          kod: 'sosyal_kanal',
          zorunlu: false,
          durum: 'eksik',
          aciklama:
            'Facebook sayfası, Instagram hesabı ya da YouTube kanalı bağlı değil. Akıllı Boost öne çıkaracağı gönderileri buradan alıyor.',
        },
  );

  return maddeler;
}
