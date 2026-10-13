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
    for (const f of ['aktarim.tsx', 'belge.tsx', 'duzenleyici.tsx', 'gonder.tsx', 'gorunumler.tsx', 'hesap.ts', 'kalem-duzenleyici.tsx', 'onay-kutusu.tsx', 'ortak.tsx', 'plan-secici.tsx', 'tutar.tsx', 'page', 'onay-page', 'stratejiden-kutusu.tsx']) {
      expect(kod(f).length, f).toBeGreaterThan(200);
    }
    expect(EKRANLAR.length).toBeGreaterThanOrEqual(12);
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
    const d = kod('duzenleyici.tsx');
    expect(d).toContain('bolumKayitGovdesi(kayitliBolumler, bolumler, AI_METIN_BOLUMLERI)');
    expect(d).not.toMatch(/filter\(\(b\) => bolumler\[b\]\?\.kaynak === 'ajans'\)/);
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
    for (const ad of ['belge.tsx', 'duzenleyici.tsx', 'aktarim.tsx']) expect(kod(ad), ad).toContain('<Tutar ');
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
    for (const ad of ['belge.tsx', 'duzenleyici.tsx']) expect(kod(ad), ad).toContain('tahminMetni(');
  });
});

describe('müşteri hesabında düzenleyici monte edilmez', () => {
  it('KRİTİK: sayfa görünümü sözleşmenin kapısıyla, monte listesini `monteGorunumler`le seçiyor', () => {
    const s = kod('page');
    expect(s).toContain('stratejiGorunumKapisi(session.permissions, stratejiGorunumu(first(params.gorunum)))');
    expect(s).toContain('const monte = monteGorunumler(session.permissions)');
    expect(s).toContain('monte={monte}');
  });
  it('KRİTİK: her görünüm `monte.includes(...)` arkasında; düzenleyici başka yerde çizilmiyor', () => {
    const g = kod('gorunumler.tsx');
    expect(g).toMatch(/\{monte\.includes\('duzenle'\) && \(/);
    expect(g).toMatch(/\{monte\.includes\('belge'\) && \(/);
    expect(g).toMatch(/\{monte\.includes\('aktar'\) && \(/);
    expect(g.match(/<StratejiDuzenleyici /g)?.length).toBe(1);
    for (const ad of EKRANLAR) {
      if (ad === 'gorunumler.tsx' || ad === 'duzenleyici.tsx') continue;
      expect(kod(ad), ad).not.toContain('<StratejiDuzenleyici');
    }
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
      expect(kod(ad), ad).not.toMatch(/[?&](gorunum|plan|musteri)=/);
      expect(kod(ad), ad).not.toMatch(/\/pdf['`?]/);
    }
    expect(kod('gonder.tsx')).toContain('stratejiPdfYolu(planId, surum)');
    expect(kod('gorunumler.tsx')).toContain('stratejiPanelAdresi({ musteri: clientId, plan: planId, gorunum: g })');
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
  it('KRİTİK: kelimesiz Arama kalemi düzenleyicide doğrudan "Kelime ara" gösteriyor; liste canlı tablodan', () => {
    const kd = kod('kalem-duzenleyici.tsx');
    expect(kd).toContain('kalemKelimeDurumu(k, kelimeGruplari)');
    expect(kd).toMatch(/kelimeDurumu !== 'tamam' && !kilitli && \(\s*<Dugme [^>]*onClick=\{kelimeAra\}>\s*Kelime ara/);
    expect(kd).not.toContain('girdiler?.kelimeGruplari');
    const d = kod('duzenleyici.tsx');
    expect(d).toContain('seciliKelimeGruplari(detay.kelimeler.satirlar)');
    expect(d).toContain('kelimeAra={kelimeAraAc}');
    expect(d).toContain('document.getElementById(KELIME_TOHUM_ID)');
    expect(d).toMatch(/\{kelimeBolumuGorunur && \(\s*<KelimeBolumu/);
  });
});
