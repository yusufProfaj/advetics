import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * ═══ BOOST YÖNLENDİRME METİNLERİ OLMAYAN BİR SAYFAYA GÖNDERMESİN ═══
 *
 * Otomatik boost ön ayarı formu bir süre `/kutuphane/bilgi-bankasi` altında
 * yaşadı ve bu modüldeki ALTI ayrı hata cümlesi kullanıcıyı oraya
 * yönlendiriyordu. Form Akıllı Boost sayfasındaki "Boost ön ayarı" modalına
 * taşınınca altı cümlenin hiçbiri değişmedi: kullanıcı artık ön ayar
 * TAŞIMAYAN bir sayfaya gönderildi ve aynı ekrandaki elle boost kutusu doğru
 * yeri gösterdiği için ÇELİŞEN İKİ TALİMAT okudu. Hata yok, log yok — yalnızca
 * bir kullanıcı boşluğa bakıyor.
 *
 * Bu tarama iki şeyi kilitliyor:
 *  1. Bu modülün ürettiği KULLANICIYA GÖRÜNEN metinlerde eski yer adı
 *     geçmiyor.
 *  2. Yönlendirme, panelde GERÇEKTEN duran düğmenin etiketini kullanıyor.
 *
 * TARAMA YORUMSUZ KAYNAKTA YAPILIYOR. Bu dosyanın taradığı servislerde kuralı
 * ANLATAN yorumlar duruyor ve orada "Kütüphane → Bilgi Bankası" dizesi
 * KELİMESİ KELİMESİNE geçiyor; yorumları soymadan `toContain` ikisini ayırt
 * etmez ve kural silinse bile test yeşil kalırdı.
 */

const MODUL = join(__dirname);

/** Panelde düğmenin etiketi. Metindeki ad bundan ayrışırsa kullanıcı arar. */
const DUGME_ETIKETI = 'Boost ön ayarı';

/** Kenar çubuğundaki sayfa adı (`apps/web/src/lib/nav-sections.ts`). */
const SAYFA_ADI = 'Akıllı Boost';

/** Artık ön ayar taşımayan eski yer — kullanıcıya görünen metinde YASAK. */
const ESKI_YERLER = ['Bilgi Bankası', 'Bilgi Bankasi', 'Kütüphane', 'bilgi-bankasi'];

/**
 * Yorumları söker.
 *
 * `/* *\/` bloklarını ve `//` satırlarını atıyor. Şablon/dize içinde `//`
 * geçen bir yol olsaydı bu kabaca davranırdı; bu modülde yok ve aşağıdaki
 * "tarama boşa düşmedi" testi soyulmuş gövdenin hâlâ gerçek kod taşıdığını
 * kanıtlıyor.
 */
function yorumsuz(kaynak: string): string {
  return kaynak
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((satir) => satir.replace(/(^|\s)\/\/.*$/, '$1'))
    .join('\n');
}

function oku(dosya: string): string {
  return readFileSync(join(MODUL, dosya), 'utf8');
}

/**
 * Modüldeki servis/controller kaynakları — spec'ler HARİÇ.
 *
 * Dosya listesi ELLE YAZILMIYOR: yeni bir servis eklendiğinde elle yazılmış
 * bir liste onu sessizce dışarıda bırakır ve tarama "hiçbir yerde geçmiyor"
 * diyerek doğru cevabı yanlış sebeple verir.
 */
function modulKaynaklari(): string[] {
  return readdirSync(MODUL).filter(
    (ad) => ad.endsWith('.ts') && !ad.endsWith('.spec.ts'),
  );
}

describe('boost yönlendirme metinleri', () => {
  it('TARAMA BOŞA DÜŞMÜYOR: dosyalar okundu ve gövde gerçekten kod taşıyor', () => {
    const dosyalar = modulKaynaklari();
    // Modülde en az launch/read/preset/controller var; sayı düşerse dosya
    // adı değişmiş demektir ve aşağıdaki iddialar boş kümede doğru olurdu.
    expect(dosyalar.length).toBeGreaterThanOrEqual(4);
    expect(dosyalar).toContain('autoboost-launch.service.ts');
    expect(dosyalar).toContain('autoboost-read.service.ts');

    for (const dosya of dosyalar) {
      const govde = yorumsuz(oku(dosya));
      expect(govde.trim().length, `${dosya} yorumsuz gövdesi boş`).toBeGreaterThan(50);
    }

    /*
     * SOYUCU GERÇEKTEN SOYUYOR. Bu iki dosyada kuralı anlatan yorumlar
     * "Bilgi Bankası" dizesini taşıyor; yorumlar sökülmemişse aşağıdaki
     * "yasak dizge yok" iddiası ASLA düşmez ve test yalan söylerdi.
     */
    for (const dosya of ['autoboost-launch.service.ts', 'autoboost-read.service.ts']) {
      const ham = oku(dosya);
      expect(ham, `${dosya} ham kaynağında açıklayıcı yorum bekleniyordu`).toContain(
        'Bilgi Bankası',
      );
      expect(yorumsuz(ham)).not.toContain('Bilgi Bankası');
    }
  });

  it('kullanıcıya görünen metinlerde eski yer adı GEÇMİYOR', () => {
    for (const dosya of modulKaynaklari()) {
      const govde = yorumsuz(oku(dosya));
      for (const eski of ESKI_YERLER) {
        expect(govde, `${dosya} hâlâ "${eski}" yazıyor`).not.toContain(eski);
      }
    }
  });

  it('yönlendirme panelde DURAN düğmenin etiketini kullanıyor', () => {
    const launch = yorumsuz(oku('autoboost-launch.service.ts'));
    const read = yorumsuz(oku('autoboost-read.service.ts'));

    // Sayfa adı YALNIZCA launch tarafında zorunlu: o hatalar gönderi
    // listesinden de fırlıyor, yani kullanıcı düğmenin durduğu sayfada
    // olmayabiliyor. `read` tarafındaki cümleler kartın kendi sayfasında
    // basılıyor ve orada düğme ekranın üstünde duruyor.
    expect(launch).toContain(SAYFA_ADI);
    expect(launch).toContain(DUGME_ETIKETI);
    expect(read).toContain(DUGME_ETIKETI);
  });

  it('DÜĞME ETİKETİ PANELDEKİYLE AYNI — ekranla metin ayrışırsa kullanıcı arar', () => {
    /*
     * Ayrışma sessiz: API metni "Boost ön ayarı" derken panel düğmesi
     * yeniden adlandırılırsa kullanıcı ekranda olmayan bir adı arar ve
     * hiçbir test kırmızıya dönmez. İki taraf burada karşılaştırılıyor.
     */
    const panel = readFileSync(
      join(
        __dirname,
        '../../../../../apps/web/src/components/autoboost/boost-on-ayari.tsx',
      ),
      'utf8',
    );

    /*
     * DİLİM DÜĞMENİN GERÇEK SINIRIYLA ÇIKARILIYOR. Sabit uzunluklu bir pencere
     * (`indexOf(...) + 400`) komşu öğeye taşıyor ve etiket silinse bile
     * modaldaki başlık metnine eşleşip testi yeşil bırakırdı.
     */
    const acilis = panel.indexOf('onClick={() => setAcik(true)}');
    expect(acilis, 'modalı açan düğme bulunamadı').toBeGreaterThan(-1);
    const kapanis = panel.indexOf('</button>', acilis);
    expect(kapanis, 'düğme kapanışı bulunamadı').toBeGreaterThan(acilis);

    expect(panel.slice(acilis, kapanis)).toContain(DUGME_ETIKETI);
  });
});
