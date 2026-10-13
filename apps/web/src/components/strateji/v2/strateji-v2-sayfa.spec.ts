import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';
import { ONAY_SAYFASI_ONEKI, STRATEJI_BELGE_BOLUMLERI } from '@advetics/shared';
import { middleware } from '@/middleware';

/**
 * ═══ AdvStrategy v2 — KAYNAK TARAMALARI ═══
 *
 * Davranış `hesap.spec.ts`te çalıştırılarak sınanıyor; burada o kararların
 * ekranda GERÇEKTEN kullanıldığı (bir fonksiyonun test edilmesi çağrıldığının
 * test edilmesi değil). Tarama YORUMSUZ kaynakta: kuralı anlatan yorum aynı
 * dosyada duruyor ve `toContain` ikisini ayırt etmiyor.
 */
const V2 = __dirname;
const SRC = join(__dirname, '..', '..', '..');
const SAYFA = join(SRC, 'app', '(dashboard)', 'strateji', 'page.tsx');
const ONAY_SAYFASI = join(SRC, 'app', 'strateji-onay', '[token]', 'page.tsx');
const KUTU = join(SRC, 'components', 'rehber', 'stratejiden-kutusu.tsx');
const REHBER = join(SRC, 'components', 'rehber');

function yorumsuz(yol: string): string {
  return readFileSync(yol, 'utf8')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/(?<![:'"`\w])\/\/[^\n'"`]*$/gm, '');
}

const V2_DOSYALAR = readdirSync(V2).filter((f) => /\.tsx?$/.test(f) && !f.includes('.spec.'));
const KOD: Record<string, string> = Object.fromEntries([
  ...V2_DOSYALAR.map((f) => [f, yorumsuz(join(V2, f))]),
  ['page', yorumsuz(SAYFA)],
  ['onay-page', yorumsuz(ONAY_SAYFASI)],
  ['stratejiden-kutusu.tsx', yorumsuz(KUTU)],
]);
const kod = (ad: string): string => {
  const k = KOD[ad];
  if (k === undefined || k.length < 200) throw new Error(`${ad} okunamadı — tarama boşa düştü`);
  return k;
};
/** Ekran dosyaları (tip/yanıt dosyası ve saf yardımcı hariç). */
const EKRANLAR = Object.keys(KOD).filter((k) => k.endsWith('.tsx') || k.endsWith('page'));

describe('tarama boşa düşmüyor', () => {
  it('v2 bileşenleri, iki sayfa ve rehber kutusu okundu', () => {
    for (const f of [
      'akis.ts',
      'akis-cerceve.tsx',
      'adimlar-soru.tsx',
      'adim-inceleme.tsx',
      'adim-plan.tsx',
      'adim-gonder.tsx',
      'belge.tsx',
      'giris.tsx',
      'gonder.tsx',
      'hesap.ts',
      'kalem-duzenleyici.tsx',
      'kurulum.tsx',
      'onay-kutusu.tsx',
      'ortak.tsx',
      'rapor-ekrani.tsx',
      'sihirbaz.tsx',
      'tutar.tsx',
      'page',
      'onay-page',
      'stratejiden-kutusu.tsx',
    ]) {
      expect(kod(f).length, f).toBeGreaterThan(200);
    }
    expect(EKRANLAR.length).toBeGreaterThanOrEqual(17);
  });
});

describe('sekmeli düzenleyici KALKTI; akış taslaktaki gibi (simulasyon.html)', () => {
  it('KRİTİK: eski üç görünümün bileşenleri ve görünüm kapısı yok', () => {
    for (const f of ['duzenleyici.tsx', 'gorunumler.tsx', 'aktarim.tsx', 'plan-secici.tsx']) expect(V2_DOSYALAR, f).not.toContain(f);
    for (const [ad, k] of Object.entries(KOD)) expect(k, ad).not.toMatch(/stratejiGorunumKapisi|monteGorunumler|StratejiGorunumleri|gorunum:/);
  });
  it('KRİTİK: eski adres yeni ekrana yönleniyor (mail ve rehber bağlantıları ölmesin)', () => {
    const s = kod('page');
    expect(s).toContain('const eski = eskiGorunumEkrani(first(params.gorunum));');
    expect(s).toMatch(/if \(eski && !first\(params\.adim\)\) redirect\(stratejiPanelAdresi\(/);
  });
  it('KRİTİK: yedi adımın her biri sihirbazda TEK bileşenle ve sırası sözleşmeden', () => {
    const s = kod('sihirbaz.tsx');
    for (const [adim, bilesen] of [
      ['hedef', 'AdimHedef'],
      ['butce', 'AdimButce'],
      ['bolge', 'AdimBolge'],
      ['kime', 'AdimKime'],
      ['inceleme', 'AdimInceleme'],
      ['plan', 'AdimPlan'],
      ['gonder', 'AdimGonder'],
    ]) {
      expect(s.match(new RegExp(`<${bilesen} `, 'g'))?.length, bilesen).toBe(1);
      expect(s, adim).toMatch(new RegExp(`\\{adim === '${adim}' && [^\\n]*<${bilesen} `));
    }
    expect(kod('akis-cerceve.tsx')).toContain('rayParcalari(adim)');
    expect(kod('akis.ts')).toContain('STRATEJI_OLUSTURMA_ADIMLARI.map(');
  });
  it('KRİTİK: her "Devam" kaydediyor (sihirbaz ucu, sürümle); plan bütçe adımında hedef seçimiyle AYNI istekte doğuyor', () => {
    const s = kod('sihirbaz.tsx');
    expect(s).toContain("stratejiUcYolu('/strateji/v2/planlar/:id/sihirbaz', { id: d0.plan.id })");
    expect(s).toMatch(/surum: d0\.plan\.surum,\s*sihirbaz:/);
    expect(s).toMatch(/stratejiUcYolu\('\/strateji\/v2\/planlar'\)[\s\S]{0,200}sihirbaz: \{ \.\.\.durum\(/);
    for (const a of ['bolge', 'kime', 'inceleme', 'plan', 'gonder']) expect(s, a).toContain(`kaydet('${a}'`);
  });
  it('KRİTİK: adım adresi tek üreticiden ve istemcide (pushState); geri tuşu dinleniyor', () => {
    const s = kod('sihirbaz.tsx');
    expect(s).toContain('stratejiPanelAdresi({ musteri: clientId, plan: pid, adim: a, amaclar: pid ? null : sec })');
    expect(s).toContain('window.history.pushState(null, \'\', url)');
    expect(s).toContain("window.addEventListener('popstate', geriTusu)");
    expect(s).toContain("return () => window.removeEventListener('popstate', geriTusu)");
  });
  it('KRİTİK: bütçe adımı asgarinin altında ilerletmiyor (karar `butceDurumu` → sözleşmenin `sihirbazButceKontrolu`)', () => {
    const s = kod('sihirbaz.tsx');
    expect(s).toMatch(/case 'butce': \{\s*const ok = !!butce && butce\.ilerler && !g\?\.paraBirimiHatasi;/);
    expect(kod('akis.ts')).toContain('sihirbazButceKontrolu({ amaclar: o.amaclar');
    const b = kod('adimlar-soru.tsx');
    expect(b).toMatch(/yetmeyen\.map\(\(s\) => \(\s*<p key=\{s\.amac\}[^>]*role="alert">\s*\{s\.cumle\}/);
  });
  it('KRİTİK: kitle tarifi onaylanmadan plana geçilmiyor; metne dokunmak onayı kaldırıyor', () => {
    expect(kod('sihirbaz.tsx')).toMatch(/case 'kime':\s*devam = \{ etiket: 'Planı hazırla', kapali: !kitle\?\.onaylandi,/);
    expect(kod('adimlar-soru.tsx')).toContain("degistir(e.target.value.trim() === '' ? null : { metin: e.target.value, kaynak: 'ajans', onaylandi: false })");
  });
  it('KRİTİK: "müşteri adına onayla" yalnız ajans yöneticisine açık ve ikinci tıklamayla', () => {
    const g = kod('adim-gonder.tsx');
    expect(g).toContain('disabled={!ajansYoneticisi || is.tur === \'suruyor\'}');
    expect(g).toContain('Onayladım, kuruluma geç');
    expect(kod('sihirbaz.tsx')).toContain('ajansYoneticisi={g?.ajansYoneticisi ?? false}');
  });
});

describe('İNCELEME: gerçek okuma, sahte bekleme yok', () => {
  it('KRİTİK: zamanlayıcı yok; her satır gerçek uç, son satır motor + kayıt', () => {
    const i = kod('adim-inceleme.tsx');
    expect(i).not.toMatch(/setTimeout|setInterval/);
    expect(i).toContain("apiFetch<StratejiIncelemeSatiri>(stratejiUcYolu('/strateji/v2/planlar/:id/inceleme/:parca', { ...id, parca }))");
    expect(i).toContain("apiFetch<StratejiOnerisi>(stratejiUcYolu('/strateji/v2/planlar/:id/oner', id)");
    expect(i).toContain("stratejiUcYolu('/strateji/v2/planlar/:id/kalemler', id), 'PUT'");
    expect(i).toContain("satir(i, { tur: 'dustu', mesaj: okumaHatasi(e) })");
  });
  it('KRİTİK: girdiler değişmediyse yeniden koşmuyor (Plan düzenlemeleri ezilmesin)', () => {
    const i = kod('adim-inceleme.tsx');
    expect(i).toContain('const dahaOnce = detay.kalemler.length > 0 && detay.sihirbaz?.incelenen === imza;');
    expect(i).toMatch(/if \(dahaOnce\) \{\s*bittiBildir\(true\);\s*return;\s*\}/);
  });
});

describe('müşteri hesabı yalnız "Raporu incele" yolunu görür', () => {
  it('KRİTİK: sayfa ekranı sözleşmenin kapısıyla seçiyor; oluşturma ve kurma YALNIZ kapıdan geçen ekranda monte', () => {
    const s = kod('page');
    expect(s).toContain('const ekran = stratejiEkranKapisi(session.permissions, stratejiEkrani(first(params.adim)));');
    expect(s).toMatch(/if \(olusturmaAdimiMi\(ekran\)\) \{[\s\S]*<StratejiSihirbazi/);
    expect(s).toMatch(/if \(ekran === 'kur'\) \{[\s\S]*<KampanyaKurulumu /);
    expect(s.match(/<StratejiSihirbazi/g)?.length).toBe(1);
    expect(s.match(/<KampanyaKurulumu /g)?.length).toBe(1);
    for (const ad of EKRANLAR) {
      if (ad === 'page') continue;
      expect(kod(ad), ad).not.toContain('<StratejiSihirbazi');
      expect(kod(ad), ad).not.toContain('<KampanyaKurulumu');
    }
  });
});

describe('açılıp kapanan öğe DOM\'dan çıkmaz, hareket yalnız motion-safe', () => {
  it('KRİTİK: kalem akordiyonu ve düzenleyici kapalıyken `inert`, yükseklik `grid-template-rows` ile', () => {
    for (const ad of ['adim-plan.tsx', 'kalem-duzenleyici.tsx']) {
      const k = kod(ad);
      expect(k, ad).toContain('inert={!acik}');
      expect(k, ad).toMatch(/motion-safe:transition-\[grid-template-rows\]/);
      expect(k, ad).toContain("acik ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'");
    }
  });
  it('KRİTİK: animasyon ve geçiş sınıfları `motion-safe:` önekli (ya da globals.css\'in reduced-motion altındaki sınıfı)', () => {
    for (const ad of EKRANLAR) {
      for (const m of kod(ad).matchAll(/(?<![\w:-])(animate-[\w[\]-]+|transition-[\w[\],-]+|duration-[\w[\]]+)/g)) {
        throw new Error(`${ad}: önekiz hareket sınıfı ${m[0]}`);
      }
    }
  });
});

describe('yanıt tipleri TEK YERDE — shared sözleşmesi (Ajan 4 entegrasyonu)', () => {
  /*
   * Panel bir süre uçların yanıt şekillerini kendi `yanit.ts`inde taşıdı;
   * Ajan 2 aynı şekilleri shared'a aldı ve üç yerde ayrıştı (`ret` sebepli
   * nesneye döndü, iki ad değişti). `serverApiFetch<T>` denetimsiz bir
   * dönüşüm: iki tanım yan yana durduğu sürece panel derlenir ve `ret`i
   * "[object Object]" diye yazar. Panel yanıt tipi TANIMLAMAZ.
   */
  it('KRİTİK: v2 dizininde yanıt dosyası yok; hiçbir ekran yerel yanıt tipi tanımlamıyor', () => {
    expect(V2_DOSYALAR).not.toContain('yanit.ts');
    for (const [ad, k] of Object.entries(KOD)) {
      expect(k, ad).not.toMatch(/from '(\.\/|@\/components\/strateji\/v2\/)yanit'/);
      expect(k, ad).not.toMatch(/\b(interface|type)\s+(StratejiDetayi|StratejiListesi|GonderimSonucu|BaglantiBelgesi|AktarimOnizlemesi|Gerceklesen|StratejiGirdileri|StratejiOnerisi)\b/);
    }
  });
  it('KRİTİK: mail reddi SEBEBİYLE yazılıyor (ret nesne dizisi, `join` değil)', () => {
    const g = kod('gonder.tsx');
    expect(g).not.toContain('mail.ret.join');
    expect(g).toMatch(/mail\.ret\.map\(\(x\) =>[\s\S]{0,200}x\.adres[\s\S]{0,40}x\.sebep/);
  });
  it('KRİTİK: bölüm kaydı farkı `bolumKayitGovdesi`nden (yalnız ajans süzgeci geri gelmedi)', () => {
    // İnceleme önerinin metinlerini, Plan adımı kabul edilen metinleri yazıyor; ikisi de farktan.
    expect(kod('adim-inceleme.tsx')).toContain('bolumKayitGovdesi(d.bolumler, o.bolumler, AI_METIN_BOLUMLERI)');
    expect(kod('adim-plan.tsx')).toContain('bolumKayitGovdesi(d.bolumler, kabulMetin, RAPOR_METINLERI)');
    for (const ad of ['adim-inceleme.tsx', 'adim-plan.tsx']) expect(kod(ad), ad).not.toMatch(/filter\(\(b\) => \w+\[b\]\?\.kaynak === 'ajans'\)/);
  });
});

describe('onay sayfası istemcinin IP\'sini iletir (deneme sınırı ortak sunucu IP\'sine düşmesin)', () => {
  it('KRİTİK: belge iç adresten, X-Forwarded-For zincirinin SON elemanıyla okunuyor', () => {
    const o = kod('onay-page');
    expect(o).toMatch(/fetch\(`\$\{INTERNAL_API_URL\}\$\{stratejiUcYolu\('\/strateji\/v2\/onay\/:token'/);
    expect(o).toContain("headers: ip ? { 'X-Forwarded-For': ip } : {}");
    expect(o).toContain('zincir.at(-1)');
  });
});

describe('para tutarı Montserrat ile (Open Sans `₺` taşımıyor)', () => {
  it('KRİTİK: `tutar` yardımcısı başlık yazı tipine bağlı', () => {
    const css = readFileSync(join(SRC, 'app', 'globals.css'), 'utf8');
    const i = css.indexOf('@utility tutar {');
    expect(i).toBeGreaterThan(-1);
    const blok = css.slice(i, css.indexOf('}', i));
    expect(blok).toContain('font-family: var(--baslik-font)');
    expect(blok).toContain('tabular-nums');
  });

  it('KRİTİK: tutar tek bileşenden — `Tutar` sınıfı taşıyor, başka v2 dosyası `formatMoney` çağırmıyor', () => {
    expect(kod('tutar.tsx')).toMatch(/className=\{className \? `tutar \$\{className\}` : 'tutar'\}/);
    expect(kod('tutar.tsx')).toContain('formatMoney(');
    for (const ad of EKRANLAR) {
      if (ad === 'tutar.tsx') continue;
      expect(kod(ad), ad).not.toContain('formatMoney');
    }
    // Ekranlar gerçekten kullanıyor (bileşen var ama çağrılmıyorsa iddia boşa düşerdi).
    for (const ad of ['belge.tsx', 'adim-plan.tsx', 'adimlar-soru.tsx', 'kurulum.tsx', 'giris.tsx']) expect(kod(ad), ad).toContain('<Tutar ');
  });
});

describe('kılavuz: yalnız dört renk, yeşil yalnız durum', () => {
  it('KRİTİK: kılavuz dışı onaltılık renk yok', () => {
    const izinli = new Set(['#ffffff', '#fff', '#000000', '#000', '#302e2d', '#ff2400']);
    for (const ad of EKRANLAR) {
      for (const m of kod(ad).matchAll(/#[0-9a-fA-F]{3,8}\b/g)) {
        expect(izinli.has(m[0].toLowerCase()), `${ad}: ${m[0]}`).toBe(true);
      }
    }
  });

  it('KRİTİK: Tailwind paleti, uyarı/bilgi/tehlike belirteçleri ve `Uyari` bileşeni yok', () => {
    for (const ad of EKRANLAR) {
      const k = kod(ad);
      expect(k, ad).not.toMatch(/\b(?:bg|text|border|ring)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d/);
      expect(k, ad).not.toMatch(/\b(?:bg|text|border)-(?:warn|info|danger)\b/);
      expect(k, ad).not.toMatch(/<Uyari\b/);
      expect(k, ad).not.toMatch(/ton="tehlike"/);
      // Yeşil YALNIZ durum: `ok` belirteci yalnız nokta ve "Hazır" metninde.
      for (const m of k.matchAll(/\b(?:bg|text)-ok(?:-[a-z]+)?\b/g)) expect(['bg-ok', 'text-ok'], `${ad}: ${m[0]}`).toContain(m[0]);
    }
  });

  it('gradyan yok', () => {
    for (const ad of EKRANLAR) expect(kod(ad), ad).not.toMatch(/gradient/);
  });
});

describe('tahmin yoksa "Tahmin yok"; varsayım rozeti YOK (kullanıcı kararı K-3)', () => {
  it('KRİTİK: hiçbir v2 ekranında "Varsayım" yok', () => {
    for (const ad of EKRANLAR) expect(kod(ad), ad).not.toMatch(/[Vv]arsay[ıi]m/);
  });
  it('tahmin metni tek yardımcıdan', () => {
    for (const ad of ['belge.tsx', 'adim-plan.tsx']) expect(kod(ad), ad).toContain('tahminMetni(');
  });
});

describe('sessiz hata yok', () => {
  it('KRİTİK: hatayı yutan `.catch(() =>` yok', () => {
    for (const ad of EKRANLAR) expect(kod(ad), ad).not.toMatch(/\.catch\(\s*\(\s*\)\s*=>/);
  });
  it('panel metninde uzun tire yok', () => {
    for (const ad of EKRANLAR) expect(kod(ad), ad).not.toMatch(/[—–]/);
  });
});

describe('adresler TEK üreticiden (sözleşme `adresler.ts`)', () => {
  it('KRİTİK: API yolu elle kurulmuyor — her `/strateji/v2` dizgesi `stratejiUcYolu(` argümanı', () => {
    for (const ad of EKRANLAR) {
      expect(kod(ad), ad).not.toMatch(/(?<!stratejiUcYolu\()['`]\/strateji\/v2/);
      expect(kod(ad), ad).not.toMatch(/['`]\/reklam\/rehberler\/\$\{/);
    }
  });
  it('KRİTİK: panel adresi `stratejiPanelAdresi`, PDF `stratejiPdfYolu` (sürüm zorunlu)', () => {
    for (const ad of EKRANLAR) {
      expect(kod(ad), ad).not.toMatch(/[?&](gorunum|plan|musteri|adim|kalem|amaclar)=/);
      expect(kod(ad), ad).not.toMatch(/\/pdf['`?]/);
    }
    expect(kod('gonder.tsx')).toContain('stratejiPdfYolu(planId, surum)');
    expect(kod('kurulum.tsx')).toContain("stratejiPanelAdresi({ musteri: clientId, plan: plan.id, adim: 'kur', kalem })");
  });
});

describe('belge tek bölüm listesinden', () => {
  it('KRİTİK: çizici her bölümü taşıyor ve `gorunurBolumler` sırasıyla geziyor', () => {
    const b = kod('belge.tsx');
    expect(b).toContain('gorunurBolumler(durum).map(');
    expect(b).toContain('const cizici: Record<StratejiBolumKodu, () => ReactNode>');
    for (const { kod: k } of STRATEJI_BELGE_BOLUMLERI) expect(b, k).toMatch(new RegExp(`\\b${k}: \\(\\) =>`));
  });
  it('KRİTİK: belge metinleri `belgeMetni`nden (yapay zekâ önerisi müşteriye gitmez)', () => {
    const b = kod('belge.tsx');
    expect(b.match(/belgeMetni\(/g)?.length).toBeGreaterThanOrEqual(5);
    expect(b).not.toMatch(/bolumler\.\w+\??\.metin/);
  });
  it('kapakta yalnız Advetics logosu (K-1)', () => {
    const b = kod('belge.tsx');
    expect(b.match(/<img /g)?.length).toBe(1);
    expect(b).toContain('src="/advetics-logo.png"');
    expect(b).not.toMatch(/logoUrl|branding/);
  });
});

describe('girişsiz onay sayfası', () => {
  it('KRİTİK: noindex + nocache + no-referrer', () => {
    const s = kod('onay-page');
    expect(s).toContain('robots: { index: false, follow: false, nocache: true }');
    expect(s).toContain("referrer: 'no-referrer'");
    expect(s).toContain("export const dynamic = 'force-dynamic'");
  });
  it('KRİTİK: biçimsiz token sorulmuyor, oturum çerezi gitmiyor', () => {
    const s = kod('onay-page');
    expect(s).toContain('tokenSorulmaliMi(token) ? await belgeOku(token)');
    expect(s).not.toContain('serverApiFetch');
    expect(s).toContain('onaySayfasiHali(okuma.status, okuma.govde)');
    const kutu = kod('onay-kutusu.tsx');
    expect(kutu).toContain("credentials: 'omit'");
    expect(kutu).toContain('baglantiKarariSchema.safeParse(');
  });
  it('KRİTİK: middleware önekini genel erişim listesinde taşıyor; panel sayfası korunuyor', () => {
    const istek = (yol: string) => new NextRequest(new URL(`http://localhost:3000${yol}`), { headers: new Headers({ host: 'localhost:3000' }) });
    const hedef = (yol: string) => {
      const l = middleware(istek(yol)).headers.get('location');
      return l ? new URL(l).pathname : null;
    };
    expect(hedef(`${ONAY_SAYFASI_ONEKI}/${'A'.repeat(43)}`)).toBeNull();
    expect(hedef('/strateji')).toBe('/login');
    expect(hedef('/strateji-onayx')).toBe('/login');
    expect(readFileSync(join(SRC, 'middleware.ts'), 'utf8')).toContain(`'${ONAY_SAYFASI_ONEKI}',`);
  });
});

describe('rehber: "Stratejiden"', () => {
  it('KRİTİK: bütçe adımı rozeti `kaynakRozeti`nden; `kullanici` dışını "Önerilen" diyen eski satır yok', () => {
    const butce = yorumsuz(join(REHBER, 'adim-butce.tsx'));
    expect(butce).toContain("kaynakRozeti(b.a.metaPayiYuzde?.kaynak, 'Önerilen')");
    expect(butce).toContain('kaynakRozeti(b.a.butce?.kaynak, null)');
    expect(butce).not.toMatch(/kaynak !== 'kullanici' && <span className=\{s\.onerilen\}>Önerilen/);
    expect(yorumsuz(join(REHBER, 'adim-kime.tsx'))).toContain('kaynakRozeti(b.a.konumlar?.kaynak');
  });
  it('KRİTİK: rehber ekranı kutuyu monte ediyor; kutu yalnız belgeye girmiş metni gösteriyor', () => {
    expect(yorumsuz(join(REHBER, 'rehber-ekrani.tsx'))).toContain('<StratejidenKutusu rehberId={kayit.id} />');
    const k = kod('stratejiden-kutusu.tsx');
    expect(k).toContain("stratejiUcYolu('/reklam/rehberler/:id/strateji', { id: rehberId })");
    expect(k).toContain('belgeyeGirerMi(v.kreatifYonergesi)');
    expect(k).toContain('belgeyeGirerMi(v.kitleTarifi)');
    expect(k).toContain("setHal({ tur: 'hata'");
  });
});

describe('Google kelime araması v2 ekranı (Ajan 4 AÇIK-1)', () => {
  it('KRİTİK: v2 uçlarıyla arıyor ve kaydediyor; v1 detayına ya da v1 ucuna yazmıyor', () => {
    const k = kod('kelime-bolumu.tsx');
    expect(k).toContain("stratejiUcYolu('/strateji/v2/planlar/:id/kelime-ara', { id: plan.id })");
    expect(k).toContain("stratejiUcYolu('/strateji/v2/planlar/:id/kelimeler', { id: plan.id }), 'PATCH', { satirlar: degisiklik, surum: plan.surum }");
    expect(k).not.toMatch(/['`]\/strateji\/planlar/);
    expect(k).not.toContain('PlanDetayi');
  });
  it('KRİTİK: tohum, gruplama ve değişiklik v1\'in saf yardımcılarından (ikinci ayrıştırıcı yok)', () => {
    const k = kod('kelime-bolumu.tsx');
    for (const f of ['tohumlariAyir(tohum)', 'kelimeGruplari(kelimeler.satirlar, taslak)', 'kelimeDegisiklikleri(kelimeler.satirlar, taslak)', 'aylikAramaMetni(s.aylikArama)']) expect(k, f).toContain(f);
    expect(k).toContain("s.varyantlar.join(', ')");
    expect(k).toMatch(/import \{[^}]*\btohumlariAyir\b[^}]*\} from '\.\.\/hesap'/);
  });
  it('KRİTİK: yoklama yalnız arama sürerken, temizleniyor ve okuma düşünce duruyor', () => {
    const k = kod('kelime-bolumu.tsx');
    const i = k.indexOf('YOKLAMA_MS);');
    expect(i).toBeGreaterThan(-1);
    const effect = k.slice(k.lastIndexOf('useEffect(', i), k.indexOf('}, [kelimeler, yenile, yoklamaDustu]);', i));
    expect(effect).toContain('if (!kelimeler.aramaSuruyor || yoklamaDustu) return;');
    expect(effect).toContain('if (!taze) setYoklamaDustu(true);');
    expect(effect).toContain('return () => window.clearTimeout(t);');
  });
  it('KRİTİK: hâller ayrı yazılı ve platformun mesajı ekranda', () => {
    const k = kod('kelime-bolumu.tsx');
    expect(k).toContain('kelimeAramaHali(kelimeler)');
    expect(k).toMatch(/hal === 'erisim_yok' && \([\s\S]{0,200}\{kelimeler\.sonHata \?\?/);
    expect(k).toMatch(/hal === 'dustu' && \([\s\S]{0,200}\{kelimeler\.sonHata\}/);
    expect(k).toContain("hal === 'suruyor' && (");
  });
  it('KRİTİK: grup kaleme yalnız kaydedilmiş seçili kelimeyle bağlanıyor', () => {
    const k = kod('kelime-bolumu.tsx');
    expect(k).toContain('seciliKelimeGruplari(kelimeler.satirlar)');
    expect(k).toContain("baglanabilir={g.anahtar !== '' && baglanabilir.has(g.anahtar) && !kirli}");
  });
  it('KRİTİK: Google Arama kalemi kelimeleri Plan adımında KALEMİN İÇİNDE arıyor; eksikse nedeni yazıyor; liste canlı tablodan', () => {
    const p = kod('adim-plan.tsx');
    expect(p).toContain('const kelimeGruplari = seciliKelimeGruplari(detay.kelimeler.satirlar);');
    expect(p).toMatch(/\{kalemKelimeDurumu\(k, kelimeGruplari\) !== 'gerekmez' && \([\s\S]{0,400}KALEM_KELIME_METNI\[[\s\S]{0,200}<KelimeBolumu/);
    expect(p).toContain('aramaKalemleri={[{ index: i, ad: amacAdi(k.amac), kelimeGrubu: k.kelimeGrubu }]}');
    expect(p.match(/<KelimeBolumu/g)?.length).toBe(1);
    expect(kod('kalem-duzenleyici.tsx')).not.toContain('girdiler?.kelimeGruplari');
  });
});
