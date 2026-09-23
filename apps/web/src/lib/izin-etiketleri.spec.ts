import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { eksikIzinMetni, eksikIzinOzellikleri } from './izin-etiketleri';

/**
 * EKSİK İZİN UYARISI GERÇEĞİ SÖYLÜYOR MU — iki paket arası kaynak taraması.
 *
 * Sınanan şey bir fonksiyonun çıktısı değil, İKİ PAKETTEKİ İKİ LİSTENİN
 * TUTARLILIĞI: izin listesi API sağlayıcısında, kullanıcıya gösterilen ad
 * panelde. Ayrıştıklarında hiçbir tip hatası çıkmıyor, hiçbir birim testi
 * düşmüyor — yalnızca kullanıcı yanlış özelliğin adını okuyor ve olmayan bir
 * arızayı aramaya gidiyor.
 *
 * Tam olarak bu oldu: uyarı "Akıllı Boost için ek izin bekliyor" diye SABİT
 * yazılıydı ve liste o gün tek özellik taşıyordu. Liste organik içerik,
 * içgörü ve Ads MCP izinleriyle büyüyünce cümle üç ayrı durumda da aynı
 * yalanı söylemeye başladı.
 */

const SAGLAYICI = readFileSync(
  join(__dirname, '../../../api/src/modules/connections/providers/meta.provider.ts'),
  'utf8',
);

const KART = readFileSync(
  join(__dirname, '../components/connections/kanal-kartlari.tsx'),
  'utf8',
);

/**
 * YORUMSUZ KAYNAK. Bu dosyadaki kuralları ANLATAN yorumlar sağlayıcının
 * içinde de duruyor ve `ads_mcp_management` sözcüğü orada birkaç kez geçiyor;
 * yorum taranırsa izin listeden SİLİNDİĞİNDE bile test yeşil kalır.
 */
function yorumsuz(kaynak: string): string {
  return kaynak.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

/** Sağlayıcının `optionalScopes` dizisindeki kapsam adları. */
function isteneIzinler(): string[] {
  const kaynak = yorumsuz(SAGLAYICI);
  const start = kaynak.indexOf('readonly optionalScopes');
  expect(start, 'optionalScopes bulunamadı — tarama boşa düştü').toBeGreaterThan(-1);
  const end = kaynak.indexOf('] as const;', start);
  expect(end, 'optionalScopes kapanışı bulunamadı — tarama boşa düştü').toBeGreaterThan(start);

  const govde = kaynak.slice(start, end);
  const adlar = [...govde.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
  expect(adlar.length, 'optionalScopes boş çıktı — tarama boşa düştü').toBeGreaterThan(0);
  return adlar;
}

function cekirdekIzinler(): string[] {
  const kaynak = yorumsuz(SAGLAYICI);
  const m = /readonly requiredScopes = \[([^\]]*)\]/.exec(kaynak);
  expect(m, 'requiredScopes bulunamadı — tarama boşa düştü').not.toBeNull();
  return [...m![1].matchAll(/'([a-z_]+)'/g)].map((x) => x[1]);
}

describe('eksik izin uyarısı', () => {
  it('KRİTİK: istenen her isteğe bağlı iznin kullanıcıya gösterilecek bir adı var', () => {
    /*
      Etiketi olmayan izin ham kapsam adıyla yazılıyor, yani uyarı
      "instagram_manage_insights için izin bekliyor" oluyor. Panelin dili
      Türkçe ve iş dilinde; hedef kullanıcı reklamcılık bilmiyor, kapsam adı
      hiç bilmiyor.
    */
    for (const izin of isteneIzinler()) {
      const [etiket] = eksikIzinOzellikleri([izin]);
      expect(etiket, `\`${izin}\` için etiket yok — izin-etiketleri.ts'e ekle`).not.toBe(izin);
    }
  });

  it('KRİTİK: `ads_mcp_management` isteniyor ama ÇEKİRDEK sayılmıyor', () => {
    /*
      İzin uygulama panelinde "Ready for testing": rolü olmayan müşteride
      Meta onu sessizce atlıyor. `requiredScopes` içine koymak, App Review
      onaylayana kadar BÜTÜN müşteri bağlantılarını `needs_reauth` göstermek
      ve gerçek bir izin arızasını o gürültünün içinde kaybetmek olurdu.
    */
    expect(isteneIzinler()).toContain('ads_mcp_management');
    expect(cekirdekIzinler()).not.toContain('ads_mcp_management');
  });

  it('panel artık tek bir özelliğin adını sabit yazmıyor', () => {
    // Sabit cümle listeye ikinci bir izin girdiği anda yanlış özelliği söyler.
    expect(yorumsuz(KART)).not.toContain('Akıllı Boost için ek izin bekliyor');
    expect(yorumsuz(KART)).toContain('eksikIzinMetni(baglanti.missingOptionalScopes)');
  });

  it('eksik izin yoksa cümle hiç kurulmuyor', () => {
    expect(eksikIzinMetni([])).toBeNull();
  });

  it('sağlayıcıdaki sıra korunuyor — önem sırası alfabeye feda edilmiyor', () => {
    const metin = eksikIzinMetni(['instagram_basic', 'ads_management']);
    expect(metin).not.toBeNull();
    const ig = metin!.indexOf('Instagram');
    const kural = metin!.indexOf('Kural motoru');
    expect(ig).toBeGreaterThan(-1);
    expect(kural).toBeGreaterThan(ig);
  });
});

/**
 * KULLANICIYA VERİLEN TAVSİYE UYGULANABİLİR Mİ.
 *
 * Bu, etiketlerden AYRI bir arıza türü ve daha sinsisi: kod kullanıcıya
 * "bağlantıyı `leads_retrieval` izniyle yeniden kur" diyordu, izin ekranı o
 * izni HİÇ İSTEMİYORDU. Kullanıcı tavsiyeye uyuyor, "Yeniden yetkilendir"e
 * basıyor, Meta ekranı gösteriyor, izin verilmiyor çünkü istenmiyor ve ekranda
 * AYNI cümle duruyor. Hiçbir yerde tek satır hata yok.
 *
 * İddia kullanıcıya GÖSTERİLEN METNE çapalı: bir kapsam adını hata mesajında
 * anmak, onu izin ekranında istemeyi ZORUNLU kılıyor.
 */
const TAVSIYE_VEREN_DOSYALAR = [
  '../../../api/src/queue/lead-sync.service.ts',
  '../../../api/src/modules/leads/leads.service.ts',
];

describe('izin tavsiyesi uygulanabilir mi', () => {
  it('KRİTİK: hata mesajında anılan her kapsam izin ekranında da isteniyor', () => {
    const istenen = new Set([...isteneIzinler(), ...cekirdekIzinler()]);
    let bulunanTavsiye = 0;

    for (const yol of TAVSIYE_VEREN_DOSYALAR) {
      const kaynak = yorumsuz(readFileSync(join(__dirname, yol), 'utf8'));

      /*
        Kapsam adı kullanıcıya giden dizenin İÇİNDE geçiyor ve dize kimi yerde
        ikiye bölünmüş, kimi yerde ters tırnak içine alınmış. O yüzden kapsam
        biçimine göre değil, BİLİNEN AD LİSTESİNE göre aranıyor: uydurulmuş
        bir düzenli ifade burada boşa düşer ve iddia her zaman doğru çıkardı.
      */
      for (const kapsam of ['leads_retrieval', 'pages_manage_ads', 'ads_management']) {
        if (!kaynak.includes(kapsam)) continue;
        bulunanTavsiye++;
        expect(
          istenen.has(kapsam),
          `\`${kapsam}\` kullanıcıya tavsiye ediliyor ama izin ekranında istenmiyor — ` +
            'meta.provider.ts optionalScopes listesine ekle',
        ).toBe(true);
      }
    }

    expect(bulunanTavsiye, 'hiçbir tavsiye bulunamadı — tarama boşa düştü').toBeGreaterThan(0);
  });

  it('`leads_retrieval` isteniyorsa `pages_manage_ads` de isteniyor', () => {
    /*
      ÇİFT, ÇÜNKÜ TEK BAŞINA HİÇBİRİ YETMİYOR: sayfa token'ıyla form kaydı
      okumak Meta'nın Lead Ads belgesinde ikisini birden istiyor.

      CANLIDA DOĞRULANMADI — belgeden alındı. Kilitlenmesinin sebebi doğruluğu
      değil SESSİZLİĞİ: hiçbir hata mesajı `pages_manage_ads`i anmıyor, yani
      listeden düştüğünde tek bir satır bile uyarmıyor ve arıza "kayıtlar
      gelmiyor" olarak, ilk seferkiyle birebir aynı biçimde geri geliyor.

      Canlıda gereksiz olduğu ölçülürse bu test ve kapsam AYNI commit'te
      gidiyor; biri kalırsa diğeri yalan söyler.
    */
    const istenen = isteneIzinler();
    if (istenen.includes('leads_retrieval')) {
      expect(istenen).toContain('pages_manage_ads');
    }
  });
});
