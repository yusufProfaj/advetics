import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * ŞABLON YÖNETİM EKRANI.
 *
 * Kaynak taraması, çünkü buradaki riskler render kararları ve hepsi
 * "sessizce yanlış davranan arayüz" türünden — birim testiyle yakalamak için
 * bütün ağacı kurmak gerekirdi, ayrışma ise tek satırlık.
 */
const KAYNAK = readFileSync(join(__dirname, 'sablon-yonetimi.tsx'), 'utf8');

/**
 * YORUMSUZ KAYNAK — iddia koda çapalansın.
 *
 * Bu dosyadaki kuralları ANLATAN yorumlar aynı kaynakta duruyor ve
 * `toContain` ikisini ayırt etmiyor: kural silinse bile onu anlatan yorum
 * eşleşip test yeşil kalırdı. CLAUDE.md'de kayıtlı ve bu oturumda bir kez
 * daha yakalanan tuzak.
 */
function kod(kaynak: string): string {
  return kaynak.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

function modalGovdesi(): string {
  const bas = KAYNAK.indexOf('function SablonModal(');
  if (bas === -1) {
    throw new Error('SablonModal bulunamadı — tarama boşa düştü, testi güncelle.');
  }
  const g = KAYNAK.slice(bas);
  if (!g.includes('/reports/templates')) {
    throw new Error('SablonModal dilimi kaydetmiyor — tarama boşa düştü.');
  }
  return g;
}

describe('şablon yönetimi', () => {
  it('KRİTİK: silme onayı KAÇ LİNKİN gideceğini söylüyor', () => {
    // Şablonu silmek ona bağlı bütün paylaşım linklerini de siliyor;
    // müşteriye gönderilmiş bir rapor haber vermeden 404 olur.
    const g = modalGovdesi();
    expect(g).toContain('sablon.shareCount > 0');
    expect(g).toContain('paylaşım linki');
  });

  it('KRİTİK: silme İKİ ADIMLI — tek tıkla silinmiyor', () => {
    const g = modalGovdesi();
    expect(g).toContain('silOnay ? sil() : setSilOnay(true)');
  });

  it('BOŞ bölüm listesi kaydedilemiyor', () => {
    // Boş bir rapor, müşteriye gönderilecek bir belge değil.
    expect(modalGovdesi()).toContain('secili.length === 0');
  });

  it('org varsayılanı seçeneği YÖNETİCİ DEĞİLKEN kapalı ve sebebi yazılı', () => {
    /*
     * RLS bunu zaten uyguluyor ama SESSİZCE: politika 0 satır döndürür ve
     * ekran "kaydedildi" derdi.
     */
    const g = modalGovdesi();
    expect(g).toContain('disabled={!isOrgAdmin}');
    expect(g).toContain('yalnızca yönetici');
  });

  it('sunucunun KENDİ mesajı ekranda — "bir hata oluştu" değil', () => {
    const g = modalGovdesi();
    expect(g).toContain('err instanceof ApiRequestError ? err.message');
  });

  it('SÜTUN SEÇİMİ yalnızca TABLOSU OLAN bölümlerde', () => {
    /*
     * Kapak, özet ve kapanışta gösterilecek bir sütun listesi yok; oraya
     * seçici koymak boş bir vaat olurdu. (Bu test bir süre "metrik seçimi
     * ekranda YOK" diyordu ve doğruydu: belge sütunlarını sabit setlerden
     * kuruyordu. Belge artık options'tan kuruyor, iddia da değişti.)
     */
    const g = modalGovdesi();
    expect(g).toContain("s === 'meta_campaigns' || s === 'google_campaigns'");
    expect(g).toContain('<SutunSecici');
  });

  it('mevcut ayarlar düzenlemede KORUNUYOR — kaydetmek onları boşaltmamalı', () => {
    const g = modalGovdesi();
    expect(g).toContain('useState<ReportOptions>(sablon?.options ?? {})');
    expect(g).toContain('options: ayarlar');
  });

  it('BOŞ sütun seçimi SAKLANMIYOR — varsayılana dönmeli', () => {
    // Boş diziyi bir seçim olarak yazmak, bir dahaki açılışta boş tablo
    // göstermek olurdu.
    expect(modalGovdesi()).toContain('sutunlar.length === 0 ? {}');
  });

  it("Google'da form/mesaj seçilirse UYARI çıkıyor", () => {
    // Google `actions` dizisi döndürmüyor; o sütunlar raporda her zaman 0
    // görünür ve "hiç form gelmedi" diye okunur.
    expect(KAYNAK).toContain('Google Ads form ve mesaj dökümü');
  });
});

/**
 * ═══ BÖLÜM SIRASI SÜRÜKLENEREK DEĞİŞİYOR ═══
 *
 * Satır başına ↑/↓ düğmeleri vardı ve gerekçesi kaynakta yazılıydı: "yedi
 * öğelik bir listede kazancı yok". Liste ON DÖRT bölüme çıkınca o gerekçe
 * çürüdü — bir bölümü en alttan en üste almak on üç tıklama demek.
 *
 * Kaynak taraması, çünkü buradaki risk render davranışı: sürükleme olayları
 * jsdom'da gerçek bir sürükleme üretmiyor ve bütün ağacı kurmak bu ekran için
 * ölçüsüz. Ayrışma ise tek satırlık.
 */
describe('bölüm sırası — sürükle bırak', () => {
  const KOD = kod(KAYNAK);

  it('tarama BOŞA DÜŞMÜYOR', () => {
    // Bölüm listesi yeniden yazılırsa iddialar sessizce her zaman doğru olurdu.
    expect(KOD).toContain('SECTION_LABELS[s]');
    expect(KOD).toContain('tasiSiraya');
  });

  it('KRİTİK: satır SÜRÜKLENEBİLİR', () => {
    expect(KOD).toContain('draggable');
    expect(KOD).toContain('onDragStart');
    expect(KOD).toContain('onDragOver');
  });

  /**
   * BİR OLAY İŞLEYİCİSİNİN GÖVDESİ — süslü parantez sayarak.
   *
   * İlk yazımda dilim `indexOf(ad) + 400 karakter`di ve MUTASYON TESTİNDE
   * BOŞA DÜŞTÜ: `onDragOver`dan `preventDefault`u silmek testi düşürmüyordu,
   * çünkü 400 karakterlik pencere KOMŞU işleyicinin (`onDrop`) içindeki
   * `preventDefault`a kadar uzanıyordu. Sabit uzunluklu dilim, kilitlediğini
   * sandığın şeyi kilitlemiyor.
   */
  function isleyici(ad: string): string {
    const bas = KOD.indexOf(`${ad}={(e) => {`);
    if (bas === -1) throw new Error(`${ad} bulunamadı — tarama boşa düştü, testi güncelle.`);
    const acilis = KOD.indexOf('{', KOD.indexOf('=>', bas));
    let derinlik = 0;
    for (let i = acilis; i < KOD.length; i++) {
      if (KOD[i] === '{') derinlik++;
      else if (KOD[i] === '}') {
        derinlik--;
        if (derinlik === 0) return KOD.slice(acilis, i + 1);
      }
    }
    throw new Error(`${ad} gövdesi kapanmadı — tarama boşa düştü.`);
  }

  it('KRİTİK: `onDragOver` VARSAYILANI ENGELLİYOR', () => {
    /*
     * Engellenmezse tarayıcı `drop`u HİÇ tetiklemiyor ve satır kıpırdamıyor —
     * hatasız, sessiz, "sürükle-bırak çalışmıyor" olarak görünen bir arıza.
     */
    expect(isleyici('onDragOver')).toContain('e.preventDefault()');
  });

  it('KRİTİK: `dataTransfer.setData` ÇAĞRILIYOR — Firefox olmadan başlatmıyor', () => {
    expect(isleyici('onDragStart')).toContain('dataTransfer.setData');
  });

  it('KRİTİK: TAKAS DEĞİL ARAYA SOKMA', () => {
    /*
     * ↑/↓ komşuyla takas ediyordu ve tek adımda ikisi aynı şey. Sürüklemede
     * değil: üçüncü sıradaki bir bölümü sona bırakmak, aradakilerin bir üste
     * kayması demek. Takas yapan bir sürükleme kullanıcının bıraktığı yere
     * koymuyor, iki öğeyi yer değiştiriyor.
     */
    const i = KOD.indexOf('function tasiSiraya');
    expect(i, 'tasiSiraya bulunamadı — tarama boşa düştü').toBeGreaterThan(-1);
    const govde = KOD.slice(i, KOD.indexOf('\n  }', i));
    expect(govde).toContain('splice(kaynak, 1)');
    expect(govde).toContain('splice(hedef, 0,');
    // Takas deseni KALMAMALI.
    expect(govde).not.toContain('[kopya[i], kopya[j]]');
  });

  it('KRİTİK: KLAVYE İLE de taşınabiliyor — erişilebilirlik kaybolmadı', () => {
    /*
     * Sürükle-bırak fare gerektiriyor. ↑/↓ düğmelerini kaldırıp yerine
     * YALNIZCA sürüklemeyi koymak, klavyeyle çalışan kullanıcı için bölüm
     * sırasını değiştirmeyi TAMAMEN imkânsız yapardı.
     */
    expect(KOD).toContain('onKeyDown');
    expect(KOD).toContain('function klavyeyle');
    const i = KOD.indexOf('function klavyeyle');
    const govde = KOD.slice(i, KOD.indexOf('\n  }', i));
    expect(govde).toContain("'ArrowUp'");
    expect(govde).toContain("'ArrowDown'");
    expect(govde).toContain('tasiSiraya');
    // Satır odaklanabilir olmalı, yoksa tuş olayı hiç gelmez.
    expect(KOD).toContain('tabIndex={0}');
  });

  it('KRİTİK: nasıl taşınacağı EKRANDA yazıyor', () => {
    // ↑/↓ düğmeleri kalkınca kullanıcı özelliğin gittiğini sanıyor; sürüklenebilir
    // olduğu hiçbir işaretle söylenmezse keşfedilebilir değil.
    expect(KAYNAK).toContain('sürükle');
    expect(KOD).toContain('cursor-grab');
  });
});
