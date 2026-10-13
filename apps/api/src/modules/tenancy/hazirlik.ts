import {
  PLATFORM_KISA_ADLARI,
  type HazirlikMaddesi,
  type Platform,
} from '@advetics/shared';
import {
  BAGLANTI_GORUNMUYOR,
  supurmeDisiSebep,
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
  /**
   * Hesabın EN SON veri işi (yapı ya da metrik; `sync_jobs`). `null` = hiç iş
   * yok ya da okunmadı. İlk çekimin SÜRDÜĞÜNÜ "hiç koşmadı"dan ayırmak için:
   * ikisi de `lastStructureSyncAt = null` görünüyor ama birinde yapılacak iş
   * beklemek, ötekinde "Şimdi güncelle".
   */
  sonIs?: { durum: string; zaman: Date; hata: string | null } | null;
}

/**
 * Workspace bilgileri adımının girdisi (sihirbaz, MIMARI § 2b). `clients`
 * satırının kendisi; satır zaten okunmuş olmadan liste kurulmuyor.
 */
export interface HazirlikBilgileri {
  website: string | null;
  contactName: string | null;
  contactPhone: string | null;
  contactEmails: string[];
  address: string | null;
  /** `address_latitude` + `address_longitude` ikisi de dolu. */
  konumVar: boolean;
}

/**
 * İLK ÇEKİM BU SÜREDEN UZUN "SÜRÜYORSA" ARTIK BEKLENMİYOR. `sync_jobs` satırı
 * bir NİYET kaydı ve kuyruktaki işle ayrışabiliyor (CLAUDE.md: deploy
 * sırasında öldürülen iş satırı sonsuza kadar `queued` bırakıyordu). Sınır
 * olmasaydı takılmış bir iş adımı SONSUZA kadar "bekliyor" gösterirdi —
 * kullanıcıya yapılacak bir şey yok demek, oysa "Şimdi güncelle" takılmış
 * işi kaldırıp yeniden kuruyor (`takilmis-is`). Üç saat ÖLÇÜLMEDİ: 90 günlük
 * reklam seviyesi geçmişi büyük bir hesapta parçalı çekiliyor ve bunun
 * gerçek süresi canlıda görülmedi; kısa bir sınır sağlam çekimi "takıldı"
 * diye gösterirdi.
 */
export const ILK_CEKIM_BEKLEME_SINIRI_MS = 3 * 60 * 60 * 1000;

const SURUYOR: ReadonlySet<string> = new Set(['queued', 'running', 'throttled']);

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
  /**
   * Hazır workspace işinin sonucu (`workspace_hazirlama`); satır yoksa
   * `null` = hazırlık hiç koşmadı. Bu madde olmadan şerit "6/6 hazır"
   * derken hemen altındaki kart soru bekliyordu (canlı, 2026-10-12).
   */
  hazirlama: { durum: string; soruSayisi: number } | null;
  /** Sihirbazın "Workspace bilgileri" adımı. */
  bilgiler: HazirlikBilgileri;
  /** Bildirim kanalları: etkin ve toplam. */
  bildirimKanali: { etkin: number; toplam: number };
  /**
   * Workspace'e ÖZEL atanmış yönetici/reklam yöneticisi sayısı (org geneli
   * üyelik sayılmaz, müşteri girişi sayılmaz). `null` = bu kişi ekip
   * listesini GÖREMİYOR: `memberships` politikası satırı yalnız şirket
   * yöneticisine ve sahibine gösteriyor; "kimse yok" ile "göremiyorum"
   * aynı şey değil (CLAUDE.md "GÖRÜNMEYEN SATIRI 'YOK' SAYMAK").
   */
  sorumluKisi: number | null;
  /** "N dk önce başladı" ve takılma sınırı için şimdiki an. */
  simdi: Date;
}

const bos = (s: string | null | undefined): boolean => !s || s.trim().length === 0;

function platformOzeti(hesaplar: HazirlikHesabi[]): string {
  const sayac = new Map<Platform, number>();
  for (const h of hesaplar) sayac.set(h.platform, (sayac.get(h.platform) ?? 0) + 1);
  return [...sayac.entries()].map(([p, n]) => `${n} ${PLATFORM_KISA_ADLARI[p]}`).join(', ');
}

/**
 * İLK ÇEKİMİN HÂLİ — yalnız "henüz hiç yapı/metrik yok" engelinde anlamlı.
 * İzleme kapalı, workspace pasif, bağlantı düşmüş gibi süpürme dışı
 * sebeplerde iş sürse bile sonucu değişmez; onlar kullanıcının işi.
 */
type IlkCekim = { tur: 'suruyor' | 'takildi' | 'dustu'; metin: string };

export function ilkCekimHali(h: HazirlikHesabi, simdi: Date): IlkCekim | null {
  if (h.connection === null || !h.sonIs) return null;
  if (supurmeDisiSebep({ ...h, connection: h.connection }) !== null) return null;
  if (h.lastStructureSyncAt !== null && h.lastInsightsSyncAt !== null) return null;
  const is = h.sonIs;
  if (SURUYOR.has(is.durum)) {
    const gecen = Math.max(0, simdi.getTime() - is.zaman.getTime());
    if (gecen < ILK_CEKIM_BEKLEME_SINIRI_MS) {
      const dk = Math.floor(gecen / 60_000);
      return { tur: 'suruyor', metin: dk < 1 ? 'az önce başladı' : `${dk} dk önce başladı` };
    }
    return {
      tur: 'takildi',
      metin: `İlk çekim ${Math.floor(gecen / 3_600_000)} saattir bitmedi; iş kuyrukta takılmış olabilir. "Şimdi güncelle" takılan işi kaldırıp yeniden kurar.`,
    };
  }
  if (is.durum === 'failed') {
    return { tur: 'dustu', metin: `Son veri işi düştü${is.hata ? `: ${is.hata}` : ' (sebep kaydedilmemiş)'}.` };
  }
  return null;
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
    const kararlar = g.hesaplar.map((h) => {
      const engel = veriAkisiEngeli(h);
      return { ad: h.name, engel, cekim: engel === null || engel === BAGLANTI_GORUNMUYOR ? null : ilkCekimHali(h, g.simdi) };
    });
    /*
     * İLK ÇEKİM SÜRÜYORSA "EKSİK" DEĞİL "BEKLİYOR" (sihirbaz, MIMARI Ç-5).
     * Hesap atandığı an yapı + 90 günlük geçmiş kuyruğa giriyor; o sırada
     * "veri gelmiyor" demek kullanıcıyı "Şimdi güncelle"ye bastırıp kuyruğa
     * ikinci iş koydurur. Takılmış ya da düşmüş iş ise EKSİK ve sebebiyle.
     */
    const engelli = kararlar
      .filter((x): x is typeof x & { engel: string } => x.engel !== null && x.engel !== BAGLANTI_GORUNMUYOR && x.cekim?.tur !== 'suruyor')
      .map((x) => ({ ad: x.ad, engel: x.cekim && x.cekim.tur !== 'suruyor' ? `${x.engel} ${x.cekim.metin}` : x.engel }));
    const bekleyen = kararlar.filter((x) => x.cekim?.tur === 'suruyor');
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
    } else if (engelli.length === 0 && bekleyen.length > 0) {
      maddeler.push({
        kod: 'veri_akisi',
        zorunlu: true,
        durum: 'bekliyor',
        aciklama:
          `${g.hesaplar.length} hesaptan ${bekleyen.length} tanesinde ilk veri çekimi sürüyor: ` +
          bekleyen.map((x) => `${x.ad} (${x.cekim!.metin})`).join(', ') +
          '. Bitince veri kendiliğinden gelir; yapılacak bir şey yok.',
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
    // Marka bölümündeki kartın adı (eski "Hedef kitle", Kitleler'deki hedeflemeyle karışıyordu).
    ['Kime satıyoruz', !bos(p?.hedefKitle)],
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

  // ─── 7. Reklam hazırlığı ───────────────────────────────────────────────
  // Önerilen, zorunlu değil: sorular reklamı durdurmuyor, rehberde elle
  // seçiliyor; ama cevaplanınca her reklamda önden doluyor.
  const hz = g.hazirlama;
  maddeler.push(
    hz?.durum === 'hazir'
      ? { kod: 'reklam_hazirligi', zorunlu: false, durum: 'tamam', aciklama: 'Site, piksel, kategori, bölge ve bütçe hazır; reklamda önden dolu gelir.' }
      : {
          kod: 'reklam_hazirligi',
          zorunlu: false,
          durum: 'eksik',
          aciklama:
            hz === null
              ? 'Hazırlık henüz koşmadı. Reklam hesabı atanınca kendiliğinden başlar.'
              : hz.soruSayisi > 0
                ? `${hz.soruSayisi} soru cevabını bekliyor; cevaplanınca her reklamda önden dolu gelir.`
                : 'Bazı adımlar tamamlanamadı; nedeni Marka Merkezi › Kurulum’da yazıyor.',
        },
  );

  maddeler.push(...sihirbazMaddeleri(g));
  return maddeler;
}

/**
 * ═══ SİHİRBAZIN MADDELERİ (docs/kurulum-sihirbazi/MIMARI.md § 2b) ═══
 *
 * "Workspace bilgileri" ve "Bildirimler ve erişim" adımlarının parçaları.
 * Hiçbiri ZORUNLU değil (`hazir` bayrağı bugünkü anlamını korusun: reklam
 * hesabı + veri akışı); sihirbazın sayacı bunları kurulum listesinden
 * sayıyor. BEYAN BURADA UYGULANMIYOR: madde gerçeği söylüyor ("adres
 * yok"), "fiziksel adresimiz yok" beyanını kurulum listesi parçaya
 * uyguluyor (`kurulumListesi`). Burada da uygulamak, beyan geri alınınca
 * iki yerin ayrışması demekti.
 *
 * Sıra `HAZIRLIK_KODLARI`ndaki sihirbaz maddelerinin sırası; `hazirlik.spec.ts` kilitliyor.
 */
function sihirbazMaddeleri(g: HazirlikGirdisi): HazirlikMaddesi[] {
  const b = g.bilgiler;
  const m: HazirlikMaddesi[] = [];

  // Site adresi — ölçümün ve AI marka hazırlığının girdisi.
  const site = b.website?.trim() ?? '';
  m.push(
    site === ''
      ? {
          kod: 'site_adresi',
          zorunlu: false,
          durum: 'eksik',
          aciklama: 'Web sitesi adresi yok. Dönüşüm ölçümü ve marka hazırlığı siteden başlıyor; siten yoksa "Web sitemiz yok" de.',
        }
      : /^https:\/\//i.test(site)
        ? { kod: 'site_adresi', zorunlu: false, durum: 'tamam', aciklama: `${site} kayıtlı.` }
        : {
            kod: 'site_adresi',
            zorunlu: false,
            durum: 'eksik',
            aciklama: `Site adresi güvenli (https) değil: ${site}. Sitenin https adresini kaydet.`,
          },
  );

  // Yetkili kişi + telefon — rehber telefon/WhatsApp amaçlarında önden dolduruyor.
  const iletisimBos = [
    ...(bos(b.contactName) ? ['yetkili kişi adı'] : []),
    ...(bos(b.contactPhone) ? ['telefon'] : []),
  ];
  m.push(
    iletisimBos.length === 0
      ? { kod: 'iletisim', zorunlu: false, durum: 'tamam', aciklama: `${b.contactName!.trim()} · ${b.contactPhone!.trim()}` }
      : {
          kod: 'iletisim',
          zorunlu: false,
          durum: 'eksik',
          aciklama: `Boş: ${iletisimBos.join(', ')}. Telefon, arama ve WhatsApp reklamlarında önden dolu geliyor.`,
        },
  );

  // Rapor alıcıları — planlı raporların gideceği adresler.
  const alicilar = b.contactEmails.filter((e) => !bos(e));
  m.push(
    alicilar.length > 0
      ? { kod: 'rapor_alicisi', zorunlu: false, durum: 'tamam', aciklama: `${alicilar.length} rapor alıcısı.` }
      : { kod: 'rapor_alicisi', zorunlu: false, durum: 'eksik', aciklama: 'Rapor alıcısı yok; planlı raporlar kimseye gitmez.' },
  );

  // Adres + harita konumu — ADRES YAZILI AMA KONUM YOKSA EKSİK: rehberin
  // yakın çevre hedeflemesi metni değil koordinatı okuyor.
  const adres = !bos(b.address);
  m.push(
    adres && b.konumVar
      ? { kod: 'adres', zorunlu: false, durum: 'tamam', aciklama: 'Adres ve harita konumu kayıtlı.' }
      : {
          kod: 'adres',
          zorunlu: false,
          durum: 'eksik',
          aciklama: adres
            ? 'Adres yazılı ama haritada konumu işaretlenmemiş; yakın çevre hedeflemesi konumdan çalışıyor.'
            : 'İşletme adresi yok. Fiziksel adresin yoksa "Fiziksel adresimiz yok" de.',
        },
  );

  // Bildirim kanalı — "N kanal var ama hiçbiri etkin değil" ayrı cümle:
  // kanalı kurmuş kullanıcıya "kanal yok" demek yanlış işe gönderir.
  const k = g.bildirimKanali;
  m.push(
    k.etkin > 0
      ? { kod: 'bildirim', zorunlu: false, durum: 'tamam', aciklama: `${k.etkin} etkin bildirim kanalı.` }
      : {
          kod: 'bildirim',
          zorunlu: false,
          durum: 'eksik',
          aciklama:
            k.toplam > 0
              ? `${k.toplam} bildirim kanalı var ama hiçbiri etkin değil; sinyal ve kural bildirimleri kimseye gitmiyor.`
              : 'Bildirim kanalı yok; sinyal ve kural bildirimleri kimseye gitmiyor. İstemiyorsan "Bildirim istemiyoruz" de.',
        },
  );

  // Sorumlu kişi — görünmüyorsa BİLİNMİYOR, "yok" değil.
  m.push(
    g.sorumluKisi === null
      ? {
          kod: 'erisim',
          zorunlu: false,
          durum: 'bilinmiyor',
          aciklama: 'Bu workspace’e atanmış kişileri yalnız şirket yöneticileri görebilir.',
        }
      : g.sorumluKisi > 0
        ? { kod: 'erisim', zorunlu: false, durum: 'tamam', aciklama: `${g.sorumluKisi} kişi bu workspace’ten sorumlu.` }
        : {
            kod: 'erisim',
            zorunlu: false,
            durum: 'eksik',
            aciklama:
              'Bu workspace’e özel atanmış kimse yok (şirket yöneticileri dışında). Yalnız yöneticiler yönetiyorsa bunu beyan et.',
          },
  );

  return m;
}
