import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * ═══ GENEL BAKIŞ: DÜZEN KARARLARI ═══
 *
 * Buradaki iddialar davranış değil KARAR kilitliyor. Hepsi tasarım turunda
 * tek tek gerekçelendirildi ve hiçbiri hata üretmiyor: bozulduklarında panel
 * çalışmaya devam ediyor, yalnızca okunması zorlaşıyor. O yüzden yazılılar.
 */
const DIZIN = __dirname;
const yorumsuz = (yol: string): string =>
  readFileSync(yol, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((l) => !l.trim().startsWith('//'))
    .join('\n');

const SAYFA = yorumsuz(join(DIZIN, 'page.tsx'));
const KART = yorumsuz(join(DIZIN, '..', '..', '..', 'components', 'metric-card.tsx'));
const UYARI = yorumsuz(join(DIZIN, '..', '..', '..', 'components', 'ui', 'uyari.tsx'));
const ROZET = yorumsuz(join(DIZIN, '..', '..', '..', 'components', 'delta-rozeti.tsx'));
const tablo = (ad: string): string =>
  yorumsuz(join(DIZIN, '..', '..', '..', 'components', ad));

describe('tarama boşa düşmüyor', () => {
  it('kaynaklar okundu', () => {
    expect(SAYFA).toContain('Genel Bakış');
    expect(KART).toContain('export function MetricCard');
    expect(ROZET.length).toBeGreaterThan(500);
  });
});

describe('uyarılar', () => {
  it('KRİTİK: hepsi TEK kutuda toplanıyor', () => {
    /*
     * Üçü ayrı ayrı tam genişlikte sarı kutulardı ve aynı anda
     * çıkabiliyorlardı: kötü bir günde kullanıcı tek bir rakam görmeden üç
     * katlı bir uyarı duvarına bakıyordu.
     */
    expect(SAYFA).toContain('<Uyarilar');
    expect(SAYFA).toContain('function Uyarilar(');
  });

  it('KRİTİK: hiç uyarı yoksa boş çerçeve çizilmiyor', () => {
    // Boş bir kutu, kullanıcıya okunacak bir şey varmış gibi görünüyor.
    // Kural ortak listede (`UyariListesi`); sayfa onu kullanıyor.
    expect(SAYFA).toContain('<UyariListesi satirlar={satirlar} />');
    expect(UYARI).toContain('if (dolu.length === 0) return null;');
  });

  it('hata kutusu `alert`, uyarı `status`', () => {
    /*
     * İkisi de `status` iken ekran okuyucu hatayı sıradan bir güncelleme
     * gibi duyuruyordu: kullanıcı verinin alınamadığını öğrenmeden sayfada
     * gezinmeye devam ediyordu.
     */
    // Kural artık ORTAK uyarı kutusunda; sayfa yalnızca tonu seçiyor.
    expect(SAYFA).toContain('<Uyari ton="tehlike">');
    expect(UYARI).toContain("role={tehlike ? 'alert' : 'status'}");
    expect(UYARI).toContain("const tehlike = ton === 'tehlike';");
  });
});

describe('başlık şeridi', () => {
  it('KRİTİK: kontroller başlıkla AYNI satırda değil', () => {
    /*
     * Platform sekmeleri, tarih seçici ve güncelle düğmesi başlıkla aynı
     * satırdaydı ve sığmayınca tek tek alt satıra düşüp başlığın altını
     * parçalıyordu. Tablette en kötü hâlindeydi.
     */
    const bas = SAYFA.indexOf('<header');
    expect(bas).toBeGreaterThan(-1);
    const etiket = SAYFA.slice(bas, SAYFA.indexOf('>', bas));
    expect(etiket).toContain('space-y-3');
    expect(etiket).not.toContain('justify-between');
  });

  it('KRİTİK: veri tazeliği BAŞLIKTA, sayfanın dibinde değil', () => {
    /*
     * "Veriler ne zaman güncellendi" en çok bakılan bilgilerden biriydi ve
     * en az görünen yerde duruyordu. Güncelle düğmesinin yanında olması da
     * doğru: kullanıcı buna bakıp o düğmeye basıyor.
     */
    const bas = SAYFA.indexOf('<header');
    const son = SAYFA.indexOf('</header>');
    expect(son).toBeGreaterThan(bas);
    // Tazelik güncelle düğmesinin İÇİNDE (nokta + zaman); sarı şerit kalktı.
    expect(SAYFA.slice(bas, son)).toContain('sonGuncelleme={summary?.lastFetchedAt ?? null}');
    expect(SAYFA).not.toContain('Güncelleme durmuş olabilir');
  });

  it('tamamlanmamış gün uyarısı hâlâ YAZILI', () => {
    // Sabah 09:00'da görülen düşük harcama "kampanya durmuş" diye okunuyor,
    // oysa gün bitmemiş. Satır kısaldı ama kaybolmadı.
    expect(SAYFA).toContain('Gün bitmedi');
  });
});

describe('vurgu kartı', () => {
  it('KRİTİK: marka rengiyle DOLDURULMUYOR', () => {
    /*
     * Vurgulu kart `bg-brand-soft` ile dolduruluyordu ve varsayılan marka
     * rengi KIRMIZI: kırmızı zeminli bir "Harcama" kartı sorun varmış gibi
     * okunuyor. Beyaz etiketli üründe hangi rengin nasıl okunacağı önceden
     * bilinemiyor, o yüzden dolgu yerine kenarlık ve daha büyük rakam.
     */
    expect(KART).not.toContain('bg-brand-soft');
    expect(KART).toContain("emphasis ? 'border-brand/40' : 'border-line'");
    // Vurgulu kartın rakamı daha büyük ve kart genişliğine göre boyutlanıyor.
    expect(KART).toContain("'text-[clamp(1.25rem,13cqi,1.875rem)] leading-9'");
    expect(KART).toContain('whitespace-nowrap');
    // Şerit izinli, zemin ışığı değil: yarı saydam marka dolgusu da dolgu.
    expect(KART).not.toMatch(/bg-brand\/\d/);
  });
});

describe('değişim rozeti', () => {
  it('KRİTİK: yön yalnızca RENKTEN okunmuyor', () => {
    /*
     * Ok işareti artışı gösteriyor ama o artışın İYİ mi kötü mü olduğunu
     * yalnızca yeşil/kırmızı söylüyordu; `inverse` metriklerde (CPA, CPC)
     * yukarı ok KÖTÜ ve renk körlüğünde iki hâl ayırt edilemiyor.
     */
    expect(ROZET).toContain('aria-label={etiket}');
    expect(ROZET).toContain('title={etiket}');
    expect(ROZET).toContain("good ? 'iyi' : 'kötü'");
  });
});

describe('tablolarda kaydırma', () => {
  const TABLOLAR = ['breakdown-table.tsx', 'musteri-tablosu.tsx', 'sirket-tablosu.tsx'];

  it('KRİTİK: her yatay kayan tablo bunu SÖYLÜYOR', () => {
    /*
     * Tablolar en az 720 piksel genişliğinde ve telefonda sağdaki sütunlar
     * ekranın dışında kalıyor. Kaydırma çalışıyor ama çalıştığı görünmüyor:
     * kullanıcı CPA ve dönüşüm sütunlarının var olduğunu bilmiyor, tabloyu
     * eksik sanıyor. Bu depoda sessiz kesme ayrı bir hata türü.
     */
    for (const t of TABLOLAR) {
      const kod = tablo(t);
      expect(kod, `${t} yatay kayıyor mu`).toContain('overflow-x-auto');
      expect(kod, `${t} kaydırma ipucu yok`).toContain('<KaydirmaIpucu />');
    }
  });

  it('ipucu kaydırma kabının DIŞINDA — yoksa kendisi de kayardı', () => {
    for (const t of TABLOLAR) {
      const kod = tablo(t);
      const kap = kod.indexOf('overflow-x-auto');
      const ipucu = kod.indexOf('<KaydirmaIpucu />');
      const kapanis = kod.indexOf('</table>');
      expect(ipucu, `${t}: ipucu tablodan sonra gelmeli`).toBeGreaterThan(kapanis);
      expect(kap).toBeGreaterThan(-1);
    }
  });
});

/*
 * ═══ 2026-10-09 DÜZENİ: GENEL BAKIŞ ÖZET, İNİŞ REKLAM YÖNETİCİSİ'NDE ═══
 */
describe('iniş Reklam Yöneticisi’ne taşındı', () => {
  it('KRİTİK: eski iniş adresi oraya YÖNLENİYOR — süzgeç sessizce düşmüyor', () => {
    // Paylaşılmış `/dashboard?kampanya=…` burada açılsaydı kampanya süzgeci
    // düşer ve workspace geneli o kampanyanınki sanılırdı.
    for (const k of ["'hesap'", "'kampanya'", "'reklamSeti'", "'seviye'"]) {
      expect(SAYFA.slice(SAYFA.indexOf('const INIS_PARAMETRELERI'), SAYFA.indexOf('as const'))).toContain(k);
    }
    expect(SAYFA).toContain('redirect(`${REKLAM_YONETICISI}?${tasi}`);');
  });

  it('KRİTİK: şirket ve workspace listesi KESİLİYOR ama söyleniyor', () => {
    expect(SAYFA).toContain('limit={OZET_SATIR}');
    expect(SAYFA).toContain('tumuHref={REKLAM_YONETICISI}');
    for (const t of ['sirket-tablosu.tsx', 'musteri-tablosu.tsx']) {
      const kod = tablo(t);
      expect(kod).toContain('gosterilen.length < rows.length ? `${gosterilen.length} / ${rows.length}`');
      expect(kod).toContain('{gosterilen.map((r) => (');
    }
  });
});

describe('Performans tek kart', () => {
  it('KRİTİK: kutular, grafik ve ikincil şerit AYNI çerçevede', () => {
    const bas = SAYFA.indexOf('aria-label="Performans"');
    const son = SAYFA.indexOf('</section>', bas);
    const kart = SAYFA.slice(bas, son);
    expect(kart).toContain('<PerformansKutulari');
    expect(kart).toContain('cerceve={false}');
    expect(kart).toContain('<IkincilSerit');
  });

  it('bitişik kutu kendi çerçevesini çizmiyor', () => {
    expect(KART).toContain("? '@container relative min-w-0 bg-surface p-4'");
  });
});
