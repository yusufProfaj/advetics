import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * EKİP EKRANININ KARARLARI.
 *
 * Ekran tarayıcı olayları etrafında kurulu (modal, katlanır kart) ve bu
 * depoda DOM test altyapısı yok. Sınanan şey, ekranın eski hâline dönmesini
 * ve sessiz bir yetki hatasını engelleyen kararlar.
 */
const KAYNAK = readFileSync(join(__dirname, 'team-screen.tsx'), 'utf8');
const SAYFA = readFileSync(
  join(__dirname, '..', '..', 'app', '(dashboard)', 'ayarlar', 'ekip', 'page.tsx'),
  'utf8',
);

const yorumsuz = (m: string): string =>
  m
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');

describe('tarama boşa düşmüyor', () => {
  it('dosyalar okunuyor ve beklenen gövdeyi taşıyor', () => {
    expect(KAYNAK.length).toBeGreaterThan(4000);
    expect(yorumsuz(KAYNAK)).toContain('TeamScreen');
    expect(yorumsuz(SAYFA)).toContain('TeamScreen');
  });
});

describe('RAY — kişi listesi', () => {
  it('KRİTİK: ajans personeli / müşteri hesabı ayrımı ROLE göre, KAPSAMA göre DEĞİL', () => {
    /*
     * İki sürüm boyunca kapsama bakıldı ("org geneli üyeliği var mı") ve
     * ikisi de yanlıştı: bir workspace'e ATANMIŞ DANIŞMAN ile o
     * workspace'in MÜŞTERİ HESABI kapsam açısından birebir aynı görünüyor.
     * Üç workspace'e atanmış yusuf@ hesabı "müşteri hesabı" sanılıp ajans
     * ekibinden düşmüştü.
     *
     * Ayırt eden şey ROL: müşteriye teslim edilen hesap `client_viewer`.
     * Kural sunucudaki `listMembers` süzgeciyle BİREBİR aynı — ikisinin
     * ayrışması, kullanıcının API listesinde olup ekranda görünmemesi
     * demek.
     */
    const kod = yorumsuz(KAYNAK);
    const m = /const kisiler: KisiSatiri\[\] = useMemo\(([\s\S]*?)\[members\]/.exec(kod);
    if (!m) throw new Error('kisiler tanımı bulunamadı — tarama boşa düştü.');
    expect(m[1]).toContain("x.role !== 'client_viewer'");
    expect(m[1]).toContain('m.memberships.length === 0');
    expect(m[1]).not.toContain('x.clientId === null');
    // Alan adına bakan bir ayrım ilk istisnada yanlış kümeye koyardı.
    expect(kod).not.toContain('@profaj');
  });

  it('KRİTİK: KİMSE SÜZÜLMÜYOR — herkes TEK listede', () => {
    /*
     * ═══ "KAYIP KULLANICI" SAYACI ARTIK GEREKSİZ ═══
     *
     * Eski ekranda İKİ liste vardı (ajans ekibi + workspace kartları) ve
     * ikisine de girmeyen bir kullanıcı SESSİZCE kayboluyordu; sayaç "4
     * kullanıcı" derken ekranda bir kişi görünüyordu. O yüzden bir "kayıp"
     * uyarısı eklenmişti.
     *
     * Ray TEK liste ve hiçbir süzgeç uygulamıyor — kaybolma yapısal olarak
     * imkânsız. Uyarı da kalktı: hiçbir zaman çıkmayacak bir uyarıyı
     * ekranda tutmak, okunmayan uyarı üretmenin yolu.
     *
     * İDDİA SÜZGECİN YOKLUĞUNA ÇAPALI: `suzulmus` yalnızca ARAMAYA bağlı.
     */
    const kod = yorumsuz(KAYNAK);
    expect(kod).toContain("q === ''\n        ? kisiler");
    expect(kod).not.toContain('kayipSayisi');
  });

  it('KRİTİK: ARAMA var — ad ve e-posta birlikte', () => {
    // Kırk dokuz şirketlik bir ajansta kişi listesi de uzuyor; gözle
    // taramak Şirketler ekranında olduğu gibi burada da çöküyordu.
    const kod = yorumsuz(KAYNAK);
    expect(kod).toContain('type="search"');
    expect(kod).toContain("(k.fullName ?? '').toLocaleLowerCase('tr').includes(q)");
    expect(kod).toContain("k.email.toLocaleLowerCase('tr').includes(q)");
  });

  it('KRİTİK: Türkçe küçültme — "İkon" araması "ikon" ile eşleşsin', () => {
    // Varsayılan `toLowerCase()` "İ"yi "i̇" yapıyor ve eşleşme sessizce
    // kaçıyor.
    expect(yorumsuz(KAYNAK)).toContain("arama.trim().toLocaleLowerCase('tr')");
  });

  it('KRİTİK: SESSİZ KESME YOK — süzülen liste sayıyı söylüyor', () => {
    expect(yorumsuz(KAYNAK)).toContain('kişiden {suzulmus.length} tanesi gösteriliyor');
  });

  it('ARAMA SEÇİMİ DÜŞÜRMÜYOR', () => {
    /*
     * Aranan kişi listeden çıkınca seçimi sıfırlamak, sağ tarafı
     * kullanıcıya habersizce boşaltmak olurdu; detay hâlâ o kişiyi
     * anlatıyor.
     */
    expect(yorumsuz(KAYNAK)).toContain(
      'const secilen = kisiler.find((k) => k.id === secilenId) ?? suzulmus[0] ?? null',
    );
  });
});

describe('DETAY — "bu kişi nerelere erişiyor"', () => {
  it('KRİTİK: ŞİRKET ve WORKSPACE yetkileri AYRI bölümlerde', () => {
    /*
     * Aynı düz listede `clientId: null` bir satır ile bir workspace satırı
     * görsel olarak AYIRT EDİLEMİYORDU — oysa biri o şirketin TAMAMINI,
     * diğeri tek bir workspace'i açıyor ve aradaki fark bu ekranın bütün
     * konusu.
     */
    const kod = yorumsuz(KAYNAK);
    expect(kod).toContain('const sirketYetkileri = kisi.memberships.filter((m) => m.clientId === null)');
    expect(kod).toContain('const workspaceYetkileri = kisi.memberships.filter((m) => m.clientId !== null)');
    expect(kod).toContain('baslik="Şirket yetkileri"');
    expect(kod).toContain('baslik="Workspace yetkileri"');
  });

  it('KRİTİK: rol değiştirme ve kaldırma SATIRIN yanında', () => {
    // Eski ekranda bunlar yalnızca workspace kartının içindeydi; şirket
    // geneli bir yetkiyi kaldırmanın hiçbir yolu YOKTU.
    const g = govde(KAYNAK, 'YetkiBolumu');
    expect(g).toContain("apiFetch(`/memberships/${m.id}`, { method: 'DELETE' })");
    expect(g).toContain("method: 'PATCH'");
  });

  it('KRİTİK: ŞİRKET GENELİ satırda `client_viewer` rolü seçilemiyor', () => {
    /*
     * Veritabanı CHECK'i `client_id IS NOT NULL OR role <> 'client_viewer'`
     * diyor: org geneli bir `client_viewer` satırı REDDEDİLİYOR. Seçeneği
     * göstermek, kullanıcıyı ham bir kısıt hatasına davet etmek olurdu.
     * Karar `isOrgScopedRole`tan OKUNUYOR, rol adları kopyalanmıyor.
     */
    expect(govde(KAYNAK, 'YetkiBolumu')).toContain(
      "ROLES.filter((r) => m.clientId !== null || isOrgScopedRole(r as Role))",
    );
  });

  it('KRİTİK: hata YUTULMUYOR', () => {
    // Sessizce başarısız olan bir yetki değişikliği, kullanıcının verdiğini
    // sandığı bir erişim demek.
    expect(govde(KAYNAK, 'YetkiBolumu')).toContain('ApiRequestError');
  });

  it('YETKİSİZ hesap detayda SÖYLENİYOR', () => {
    // Giriş yapabiliyor ama panelde hiçbir veri göremiyor.
    expect(yorumsuz(KAYNAK)).toContain('giriş yapabiliyor ama panelde hiçbir');
  });
});

/**
 * Bir fonksiyonun gövdesini SINIRINA KADAR alır.
 *
 * Testler daha önce `slice(i, i + 3500)` gibi sabit uzunluklar kullanıyordu
 * ve iki yönde de kırılgan: gövde büyüyünce iddia dilimden düşüyor (bu
 * oturumda üç test böyle düştü), küçülünce dilim KOMŞU fonksiyona taşıyor ve
 * iddia yanlış gövdede tutuyor — ikincisi sessiz.
 */
function govde(kaynak: string, ad: string): string {
  const kod = yorumsuz(kaynak);
  const i = kod.indexOf(`function ${ad}`);
  if (i === -1) throw new Error(`${ad} bulunamadı — tarama boşa düştü`);
  const sonraki = kod.indexOf('\nfunction ', i + 1);
  return kod.slice(i, sonraki === -1 ? undefined : sonraki);
}

describe('DANIŞMAN ATA', () => {
  const ATA = () => govde(KAYNAK, 'DanismanAtaModal');

  it('KRİTİK: org geneli rol buradan VERİLEMİYOR', () => {
    /*
     * Bu ekran "bir müşteriye ata" işi. Buradan owner/admin seçilebilse bir
     * danışman atama işlemi sessizce org yöneticisi üretirdi.
     */
    expect(ATA()).toContain("r !== 'owner' && r !== 'admin'");
  });

  it('zaten yetkisi olan ŞİRKET SEÇİLEMİYOR ve sebebi yazılı', () => {
    /*
     * KAPSAM DEĞİŞTİ, KARAR DEĞİŞMEDİ. Pencere artık workspace'e değil
     * ŞİRKETE yetki veriyor (danışman ajans seviyesinde duruyor ve şirkete
     * atanıyor); engel de o seviyede hesaplanıyor.
     *
     * Sunucu ikinci üyeliği 409 ile reddediyor. Satır listeden DÜŞÜRÜLMÜYOR
     * — düşürmek "bu şirket neden yok" sorusunu cevapsız bırakırdı; satır
     * duruyor, işaretlenemiyor ve sebebi yanında yazıyor.
     *
     * ENGEL `orgId` ÜZERİNDEN BULUNUYOR: bir danışmanın birden çok şirkette
     * üyeliği olabiliyor ve `clientId === null` tek başına hangi şirket
     * olduğunu söylemiyor.
     */
    const g = ATA();
    expect(g).toContain('m.orgId === o.id && m.clientId === null');
    expect(g).toContain('Zaten şirket geneli yetkisi var');
    expect(g).toContain('disabled={c.engel !== null || busy}');
  });

  it('KRİTİK: üç adım da duruyor — kim, hangi şirketler, hangi rol', () => {
    /*
     * Pencere artık SEÇİLİ kişiyle açılıyor (üst bant yerine kişinin
     * detayından) ve ilk adım tek seçenekli kalıyor. Adımı kaldırmadım:
     * pencere kimin yetkilendirildiğini EKRANDA yazmaya devam etmeli —
     * "hangi kişiye veriyorum" sorusunu hatırlamaya bırakmak, para
     * harcamayan ama erişim açan bir işlemde de kabul edilemez.
     */
    const g = ATA();
    expect(g).toContain('1 · Danışman');
    expect(g).toContain('2 · Şirket');
    expect(g).toContain('3 · Rol');
    // Danışman listesi bileşene DIŞARIDAN geliyor — tek kişiye sabitlenmiş
    // bir modal bu akışı kuramaz.
    expect(g).toContain('danismanlar');
  });

  it('KRİTİK: danışman seçilmeden workspace seçilemiyor', () => {
    // Uygun müşteriler KİME atadığına bağlı; önce hepsini gösterip sonra
    // kısaltmak, seçimi kullanıcının gözü önünde geri almak olurdu.
    const g = ATA();
    expect(g).toContain('Önce danışman seç');
  });

  it('üyelik ucuna gidiyor, kullanıcı ucuna değil', () => {
    expect(ATA()).toContain("'/memberships'");
  });

  it('KRİTİK: TOPLU atama — tek seferde birden çok workspace', () => {
    /*
     * Kullanıcının bildirdiği hâli: "tek tek atama yapılıyor". Sekiz
     * müşteriye bakacak bir danışman için aynı pencere sekiz kez açılıyor ve
     * danışman ile rol sekiz kez seçiliyordu. İşin kendisi zaten toplu.
     *
     * İddia SEÇİM KÜMESİNE çapalı: tek bir `clientId` state'i toplu atama
     * yapamaz.
     */
    const g = ATA();
    expect(g).toContain('useState<Set<string>>(new Set())');
    expect(g).toContain('type="checkbox"');
    expect(g).toContain('Hepsini seç');
  });

  it('KRİTİK: gönderim ortak yürütücüden geçiyor', () => {
    /*
     * `atamalariYurut` sırayla gidiyor, bir hata döngüyü kesmiyor ve her
     * hedefin sonucunu ayrı sayıyor. Burada elle bir `Promise.all` yazmak,
     * ilk reddedilende geri kalanların sonucunu belirsiz bırakırdı.
     */
    expect(ATA()).toContain('atamalariYurut(');
  });

  it('KRİTİK: kısmi başarı tek tek yazılıyor ve pencere AÇIK kalıyor', () => {
    /*
     * "5 workspace atandı" deyip altıncıyı yutmak, atandığı sanılan yerde
     * hiçbir şey görememek demek. Pencere hata varsa kapanmıyor: kapatmak o
     * bilgiyi hiç göstermeden yok ederdi.
     */
    const g = ATA();
    expect(g).toContain('sonuc.hatalar.map(');
    expect(g).toContain('if (r.hatalar.length === 0) onKapat();');
  });

  it('KRİTİK: tek rol bütün seçime uygulanıyor ve bu SÖYLENİYOR', () => {
    /*
     * Aynı kişinin iki müşteride farklı rolü olabiliyor; toplu atama o
     * ayrımı yapamıyor. Söylenmezse kullanıcı yaptığını sanır.
     */
    expect(ATA()).toContain('Farklı');
  });

  it('"Hepsini seç" yalnızca ATANABİLİR olanları kapsıyor', () => {
    // Engelli satırı da işaretlemek, gönderilir gönderilmez 409 yiyecek bir
    // istek üretirdi.
    expect(ATA()).toContain('new Set(atanabilir.map((c) => c.id))');
  });
});

describe('ÜST BANT — tek ekleme düğmesi', () => {
  it('KRİTİK: "Danışman ekle" ve "Kullanıcı ekle" TEK düğmeye indi', () => {
    /*
     * İkisi AYNI işi yapıyordu; tek fark rolün önceden seçili gelmesiydi.
     * Yan yana durunca ekranın cevapladığı soru "kimi ekliyorum" değil
     * "hangi düğmeye basmalıyım" oluyordu — kullanıcının "mantıksız,
     * kullanışsız" dediği yerin merkezi.
     */
    const kod = yorumsuz(KAYNAK);
    expect(kod).toContain('+ Kişi ekle');
    expect(kod).not.toContain('setDanismanEkleAcik');
    expect(kod).not.toContain('DanismanEkleModal');
  });

  it('KRİTİK: "Şirkete yetki ver" KİŞİNİN DETAYINDA, üst bantta değil', () => {
    /*
     * Bu bir EKLEME değil, SEÇİLİ KİŞİYE yetki verme işi. Üst banttayken
     * pencere önce "kimi atıyorsun" diye soruyordu — oysa kullanıcı o
     * kişiyi zaten seçmiş oluyor.
     */
    const kod = yorumsuz(KAYNAK);
    expect(kod).toContain('+ Şirkete yetki ver');
    expect(kod).toContain('onSirketYetkisi={() => setAtananKisi(secilen)}');
    expect(kod).not.toContain('setAtamaAcik');
  });

  it('KRİTİK: pencere SEÇİLİ kişiyle açılıyor', () => {
    // Tek elemanlı liste: pencerenin kendi kişi seçici adımı boşa düşmüyor,
    // zaten tek seçenek var.
    expect(yorumsuz(KAYNAK)).toContain('danismanlar={[atananKisi]}');
  });

  it('ŞİRKET YETKİSİ yalnızca AJANS personeline teklif ediliyor', () => {
    // Müşteri hesabının sınırı tam olarak tek bir workspace; ona şirket
    // geneli yetki teklif etmek, reddedilecek bir seçenek göstermek olurdu.
    expect(yorumsuz(KAYNAK)).toContain('canManage && kisi.ajans ?');
  });
});

describe('eski düzen geri gelmesin', () => {
  it('KRİTİK: sayfa artık kullanıcıları tek tek kart olarak basmıyor', () => {
    // Eski ekran her KULLANICIYI kart yapıyordu ve "bu workspace’e kim
    // erişiyor" sorusu cevapsız kalıyordu.
    expect(yorumsuz(SAYFA)).not.toContain('<TeamManager');
  });

  it('KRİTİK: kullanıcı ekleme POP-UP’ta, sayfada sabit form değil', () => {
    const kod = yorumsuz(KAYNAK);
    expect(kod).toContain('KullaniciEkleModal');
    expect(kod).toContain('role="dialog"');
  });
});

describe('yetki kararları', () => {
  it('KRİTİK: rol düzenleme modalında YOK — üyelikte kalıyor', () => {
    /*
     * Bir kişi bir müşteride yönetici, başkasında görüntüleyici olabiliyor.
     * Rolü kullanıcı bilgisiyle birlikte göndermek o kuralı sessizce bozardı.
     */
    const kod = yorumsuz(KAYNAK);
    const i = kod.indexOf('function UyeDuzenleModal');
    expect(i).toBeGreaterThan(-1);
    const govde = kod.slice(i, i + 2500);
    expect(govde).toContain('/members/');
    expect(govde).not.toContain('role:');
  });

  it('KRİTİK: yalnızca DEĞİŞEN alanlar gönderiliyor', () => {
    // Hepsini göndermek, parola alanını boş bırakanın parolasını
    // sıfırlamaya çalışmak demekti.
    const kod = yorumsuz(KAYNAK);
    expect(kod).toContain('adDegisti ?');
    expect(kod).toContain('epostaDegisti ?');
    expect(kod).toContain("parola !== '' ?");
  });

  it('KRİTİK: kendi yetkini değiştirmek kapalı', () => {
    // Tek yöneticinin kendini düşürmesi, panelden geri alınamayan bir
    // kilitlenme üretir.
    expect(yorumsuz(KAYNAK)).toContain('kendisi');
  });

  it('KRİTİK: şirket geneli kapsam YALNIZCA müşteri hesabına kapalı', () => {
    /*
     * KURAL TERS ÇEVRİLDİ. Önce `rol === 'owner' || rol === 'admin'` idi ve
     * rol adları EKRANA KOPYALANMIŞTI; kural genişleyince (danışman şirket
     * seviyesinde yetkilendirilebilmeli) o kopya geride kalır ve ekran,
     * sunucunun KABUL ETTİĞİ bir seçeneği kapalı gösterirdi.
     *
     * Ayırt eden şey rolün genişliği değil, KİMİN hesabı olduğu:
     * `client_viewer` müşterinin kendi giriş hesabı ve sınırı tam olarak
     * workspace. Ekran artık kararı `ORG_SCOPED_ROLES`tan OKUYOR — üç yer
     * (ekran, Zod şeması, veritabanı CHECK'i) aynı kaynağa bakıyor.
     */
    const kod = yorumsuz(KAYNAK);
    expect(kod).not.toContain("rol === 'owner' || rol === 'admin'");
    expect(kod).toContain('isOrgScopedRole(rol)');
  });
});

describe('sessiz kalmayan yerler', () => {
  it('davet gönderilmediği yazılı', () => {
    expect(yorumsuz(KAYNAK)).toContain('davet gönderilmiyor');
  });

  it('KRİTİK: parola değişince oturumun düşmediği yazılı', () => {
    // Bilinen eksik; gizlemek, erişimi kestiğini sanan birine yanlış
    // güven verirdi.
    expect(yorumsuz(KAYNAK)).toContain('açık oturumu düşmüyor');
  });
});
