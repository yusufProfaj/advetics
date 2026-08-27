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

describe('ajans ekibi / workspace ayrımı', () => {
  it('KRİTİK: ayrım ROLE göre — üyelik KAPSAMINA göre DEĞİL', () => {
    /*
     * İki sürüm boyunca kapsama bakıldı ("org geneli üyeliği var mı") ve ikisi
     * de yanlıştı: bir workspace'e ATANMIŞ DANIŞMAN ile o workspace'in
     * MÜŞTERİ HESABI kapsam açısından birebir aynı görünüyor. Üç workspace'e
     * atanmış yusuf@ hesabı "müşteri hesabı" sanılıp ajans ekibinden düştü.
     *
     * Ayırt eden şey ROL: müşteriye teslim edilen hesap `client_viewer`.
     */
    const kod = yorumsuz(KAYNAK);
    const m = /const ajansEkibi = useMemo\(([\s\S]*?)\[members\]/.exec(kod);
    if (!m) throw new Error('ajansEkibi tanımı bulunamadı — tarama boşa düştü.');
    expect(m[1]).toContain("x.role !== 'client_viewer'");
    expect(m[1]).not.toContain('x.clientId === null');
    // Alan adına bakan bir ayrım ilk istisnada yanlış kümeye koyardı.
    expect(kod).not.toContain('@profaj');
  });

  it('KRİTİK: kural sunucudaki süzgeçle aynı biçimde', () => {
    // İkisinin ayrışması, kullanıcının API listesinde olup ekranda
    // görünmemesi demek — bu ekranda tam olarak o yaşandı.
    const kod = yorumsuz(KAYNAK);
    const m = /const ajansEkibi = useMemo\(([\s\S]*?)\[members\]/.exec(kod)!;
    expect(m[1]).toContain('m.memberships.length === 0');
  });

  it('workspace üyeleri o müşterinin kimliğiyle eşleşiyor', () => {
    expect(yorumsuz(KAYNAK)).toContain('x.clientId === c.id');
  });
});

describe('KİMSE KAYBOLMUYOR', () => {
  it('KRİTİK: üyeliği OLMAYAN kullanıcı da ajans ekibinde', () => {
    /*
     * İlk sürüm yalnızca org geneli üyeliği olanları alıyordu ve hiçbir
     * üyeliği olmayan kullanıcı iki listede de çıkmıyordu: sayaç "4
     * kullanıcı" derken ekranda bir kişi görünüyordu. Ajans personeli önce
     * açılıp yetkisi sonra verildiği için bu hâl istisna değil, normal.
     */
    /*
     * ÇAPA `ajansEkibi` TANIMININ GÖVDESİ, dosyanın tamamı DEĞİL. İlk sürüm
     * dizgeyi her yerde arıyordu ve mutasyon testi BOŞ çıktı: koşulu
     * listeden sildim, aynı dizge satır içindeki "yetkisi yok" kontrolünde
     * geçtiği için test GEÇTİ.
     */
    const kod = yorumsuz(KAYNAK);
    const m = /const ajansEkibi = useMemo\(([\s\S]*?)\[members\]/.exec(kod);
    if (!m) throw new Error('ajansEkibi tanımı bulunamadı — tarama boşa düştü.');
    expect(m[1]).toContain('m.memberships.length === 0');
  });

  it('KRİTİK: hiçbir listeye düşmeyen varsa EKRANDA uyarı çıkıyor', () => {
    // Sayı ile liste birbirini tutmuyorsa bu bir arıza ve sessiz kalmamalı.
    /*
     * ÇAPA KOŞULLU RENDER, değişkenin varlığı DEĞİL. `kayipSayisi` tanımlı
     * kalıp render kapatılabiliyordu ve test yine geçiyordu.
     */
    const kod = yorumsuz(KAYNAK);
    expect(kod).toContain('{kayipSayisi > 0 && (');
    expect(kod).toContain('hiçbir listede görünmüyor');
  });

  it('yetkisiz hesabın durumu satırda yazılı', () => {
    // Giriş yapabiliyor ama panelde hiçbir veri göremiyor.
    expect(yorumsuz(KAYNAK)).toContain('yetkisi yok');
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

  it('zaten yetkisi olan workspace SEÇİLEMİYOR ve sebebi yazılı', () => {
    /*
     * Sunucu ikinci üyeliği 409 ile reddediyor. Önceki hâl o satırı listeden
     * DÜŞÜRÜYORDU ve "bu müşteri neden yok" sorusu cevapsız kalıyordu; artık
     * satır duruyor, işaretlenemiyor ve sebebi yanında yazıyor.
     *
     * Karar ORTAK FONKSİYONDAN geliyor: aynı kural workspace ekibi
     * ekranında da uygulanıyor ve iki kopya doğduğu anda ayrışırdı.
     */
    const g = ATA();
    expect(g).toContain('atamaEngeli(');
    expect(g).toContain('ENGEL_WORKSPACE[');
    expect(g).toContain('disabled={c.engel !== null || busy}');
  });

  it('KRİTİK: akış DANIŞMAN SEÇİMİYLE başlıyor', () => {
    /*
     * İstenen sıra: önce kim, sonra hangi workspace'ler, sonra hangi rol.
     */
    const g = ATA();
    expect(g).toContain('1 · Danışman');
    expect(g).toContain('2 · Workspace');
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

describe('DANIŞMAN EKLE', () => {
  it('KRİTİK: rol listesinde client_viewer YOK', () => {
    /*
     * `client_viewer` müşteri hesabının rolü. Bir danışmanı onunla açmak,
     * kişiyi ajans ekibi listesinden düşürüp müşteri hesabı gibi göstermeye
     * yetiyor.
     */
    const kod = yorumsuz(KAYNAK);
    const i = kod.indexOf('function DanismanEkleModal');
    expect(i).toBeGreaterThan(-1);
    const govde = kod.slice(i, i + 5000);
    expect(govde).toContain("r !== 'client_viewer'");
  });

  it('KRİTİK: org geneli kapsamda rol ZORLA admin', () => {
    // Sunucu org geneli erişimi yalnızca owner/admin'e veriyor; manager
    // seçili kalırsa istek reddedilir ve sebebi ekranda anlaşılmaz.
    const kod = yorumsuz(KAYNAK);
    const i = kod.indexOf('function DanismanEkleModal');
    const govde = kod.slice(i, i + 5000);
    expect(govde).toContain("orgGeneli ? 'admin' : rol");
  });

  it('kapsam zorunlu — erişimsiz hesap açılamıyor', () => {
    const kod = yorumsuz(KAYNAK);
    const i = kod.indexOf('function DanismanEkleModal');
    const govde = kod.slice(i, i + 5000);
    expect(govde).toContain("kapsam === ''");
  });
});

describe('üst bant', () => {
  it('KRİTİK: "Danışman ata" ÜST BANTTA, satır içinde değil', () => {
    const kod = yorumsuz(KAYNAK);
    expect(kod).toContain('setAtamaAcik(true)');
    // Satır içi kişi-bazlı tetikleyici kalmamalı.
    expect(kod).not.toContain('setAtanan(');
  });

  it('KRİTİK: üç ayrı düğme — ekle, ata, kullanıcı', () => {
    // Tek bir "ekle" düğmesi her seferinde "rolü ne olsun, kapsamı ne olsun"
    // sorusunu sordurtuyordu.
    const kod = yorumsuz(KAYNAK);
    expect(kod).toContain('setDanismanEkleAcik(true)');
    expect(kod).toContain('setAtamaAcik(true)');
    expect(kod).toContain('setEkleAcik(true)');
  });
});

describe('eski düzen geri gelmesin', () => {
  it('KRİTİK: sayfa artık kullanıcıları tek tek kart olarak basmıyor', () => {
    // Eski ekran her KULLANICIYI kart yapıyordu ve "bu workspace'e kim
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

  it('org geneli kapsam yalnızca owner/admin için seçilebilir', () => {
    const kod = yorumsuz(KAYNAK);
    expect(kod).toContain("rol === 'owner' || rol === 'admin'");
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
