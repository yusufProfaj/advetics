import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SECTIONS } from '@/lib/nav-sections';

/**
 * ═══ ADVSTRATEGY EKRANI — KAYNAK TARAMALARI ═══
 *
 * Davranış `hesap.spec.ts`te çalıştırılarak sınanıyor. Buradakiler o
 * kararların ekranda GERÇEKTEN kullanıldığını kilitliyor: bir fonksiyonun
 * test edilmesi, çağrıldığının test edilmesi değil (CLAUDE.md mutasyon
 * dersi 1).
 *
 * TARAMA YORUMSUZ KAYNAKTA. Kuralı anlatan yorum aynı dosyada duruyor ve
 * `toContain` ikisini ayırt etmiyor (CLAUDE.md "TARAMAYI YORUMSUZ KAYNAKTA
 * YAP").
 */
const BILESEN = __dirname;
const SAYFA = join(__dirname, '..', '..', 'app', '(dashboard)', 'strateji', 'page.tsx');

function yorumsuz(yol: string): string {
  return readFileSync(yol, 'utf8')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/(?<![:'"`\w])\/\/[^\n'"`]*$/gm, '');
}

const DOSYALAR = [
  SAYFA,
  ...readdirSync(BILESEN)
    .filter((f) => /\.tsx?$/.test(f) && !f.includes('.spec.'))
    .map((f) => join(BILESEN, f)),
];
const KOD = Object.fromEntries(DOSYALAR.map((f) => [f.slice(f.lastIndexOf('/') + 1).replace('page.tsx', 'page'), yorumsuz(f)]));
const kod = (ad: string): string => {
  const k = KOD[ad];
  if (k === undefined) throw new Error(`${ad} okunamadı — tarama boşa düştü`);
  return k;
};

/**
 * `ac` konumundaki parantez ya da süslü parantezin GERÇEK kapanışına kadar
 * dilim. Sabit uzunluklu pencere komşu bloğu yakalardı (CLAUDE.md "SABİT
 * UZUNLUKLU DİLİM KOMŞUYU YAKALIYOR").
 */
function blok(metin: string, ac: number): string {
  const acilis = metin[ac];
  const kapanis = acilis === '(' ? ')' : acilis === '{' ? '}' : null;
  if (!kapanis) throw new Error(`${ac} konumunda parantez yok`);
  let derinlik = 0;
  for (let i = ac; i < metin.length; i++) {
    if (metin[i] === acilis) derinlik++;
    else if (metin[i] === kapanis && --derinlik === 0) return metin.slice(ac, i + 1);
  }
  throw new Error('blok kapanmadı');
}

describe('tarama boşa düşmüyor', () => {
  it('sayfa ve sekiz bileşen dosyası okundu', () => {
    expect(Object.keys(KOD).sort()).toEqual(
      ['arama-bolumu.tsx', 'butce-bolumu.tsx', 'hesap.ts', 'matris-bolumu.tsx', 'ortak.tsx', 'page', 'plan-ekrani.tsx', 'plan-listesi.tsx', 'sunum-bolumu.tsx'].sort(),
    );
    for (const k of Object.values(KOD)) expect(k.length).toBeGreaterThan(500);
  });
});

describe('menü ile sayfa aynı adı taşıyor', () => {
  it('KRİTİK: sekme başlığı ve sayfa başlığı menü etiketiyle aynı', () => {
    const satir = SECTIONS.flatMap((s) => s.items).find((i) => i.href === '/strateji');
    expect(satir?.label).toBe('AdvStrategy');
    const sayfa = kod('page');
    expect(/metadata\s*=\s*\{\s*title:\s*'([^']+)'/.exec(sayfa)?.[1]).toBe('AdvStrategy · Advetics');
    expect(sayfa).toContain('baslik="AdvStrategy"');
  });
});

describe('sessiz hata yok', () => {
  it('KRİTİK: hiçbir dosyada hatayı yutan `.catch(() =>` yok', () => {
    for (const [ad, k] of Object.entries(KOD)) {
      expect(k, ad).not.toMatch(/\.catch\(\s*\(\s*\)\s*=>/);
    }
  });

  it('KRİTİK: okuma hataları sunucunun cümlesiyle (`okumaHatasi`) gösteriliyor', () => {
    const sayfa = kod('page');
    // Liste ve plan okuması ayrı ayrı hata dalı taşıyor.
    expect(sayfa.match(/\(e: unknown\) => \(\{ ok: false as const, hata: okumaHatasi\(e\) \}\)/g)?.length).toBe(2);
    expect(sayfa).toContain('baslik="Planlar alınamadı."');
    expect(sayfa).toContain('baslik="Plan alınamadı."');
    const matris = kod('matris-bolumu.tsx');
    expect(matris.match(/setKitleler\(\{ tur: 'hata', mesaj: okumaHatasi\(e\) \}\)/g)?.length).toBe(1);
    expect(matris.match(/setGorseller\(\{ tur: 'hata', mesaj: okumaHatasi\(e\) \}\)/g)?.length).toBe(1);
  });

  it('panel metninde uzun tire yok', () => {
    for (const [ad, k] of Object.entries(KOD)) expect(k, ad).not.toMatch(/[—–]/);
  });
});

describe('düğmeler sunucunun kararından', () => {
  it('KRİTİK: eylem düğmeleri `yapilabilir`den çiziliyor, geçiş tablosundan değil', () => {
    const ekran = kod('plan-ekrani.tsx');
    expect(ekran).toContain('eylemDugmeleri(detay.yapilabilir)');
    expect(ekran).toContain('dugmeler.map(');
    // Panel kendi listesini kurarsa yetkiyi bilmez: müşteri hesabı "Aktar"ı görür.
    for (const [ad, k] of Object.entries(KOD)) {
      expect(k, ad).not.toMatch(/PLAN_GECISLERI|gecisMumkunMu/);
    }
  });

  it('KRİTİK: eylem isteği `eylemIstegi`nden — onay kendi ucuna', () => {
    expect(kod('plan-ekrani.tsx')).toContain('eylemIstegi(plan.id, eylem, plan.surum)');
    // Ekranda elle kurulmuş bir yol yok: her `/strateji/planlar` dizgesi
    // `ucAdresi(` argümanı (tipi sözleşmenin uç listesiyle sınırlı).
    for (const [ad, k] of Object.entries(KOD)) {
      if (ad === 'hesap.ts') continue;
      expect(k, ad).not.toMatch(/(?<!ucAdresi\()['`]\/strateji\/planlar/);
    }
  });
});

describe('bütçe denetimi tek kaynaktan', () => {
  it('KRİTİK: hücre aşımı sözleşmenin `matrisButceDenetimi` fonksiyonuyla', () => {
    const hesap = kod('hesap.ts');
    expect(hesap).toMatch(/import \{[^}]*\bmatrisButceDenetimi\b[^}]*\} from '@advetics\/shared'/);
    expect(hesap).toContain('matrisButceDenetimi(');
    expect(hesap).not.toMatch(/function matrisButceDenetimi/);
    expect(kod('matris-bolumu.tsx')).toContain('matrisAsimlari(detay.dagilim, taslak, para)');
  });

  it('dağılım toplamı sözleşmenin `dagilimToplamDenetimi` fonksiyonuyla', () => {
    expect(kod('hesap.ts')).toContain('dagilimToplamDenetimi(');
    expect(kod('butce-bolumu.tsx')).toContain('butceOzeti(plan.toplamButceMicros, tutarlar)');
  });
});

describe('adres ve sürüm', () => {
  it('KRİTİK: bölüm ve plan bağlantıları elle birleştirilmiyor', () => {
    for (const [ad, k] of Object.entries(KOD)) {
      expect(k, ad).not.toMatch(/[?&](bolum|plan|musteri)=/);
    }
    expect(kod('plan-ekrani.tsx')).toContain('stratejiAdresi(clientId, { plan: plan.id, bolum: b.kod })');
  });

  it('KRİTİK: her düzenleme yazısı `surum` taşıyor (kelime araması hariç, şemasında yok)', () => {
    let sayac = 0;
    for (const ad of ['butce-bolumu.tsx', 'arama-bolumu.tsx', 'matris-bolumu.tsx', 'plan-ekrani.tsx']) {
      const k = kod(ad);
      for (const m of k.matchAll(/planaYaz(?:<[^>]*>)?\(/g)) {
        const cagri = blok(k, m.index! + m[0].length - 1);
        sayac++;
        if (cagri.includes("'/strateji/planlar/:id/kelime-ara'")) continue;
        // Eylem gövdesi `eylemIstegi`nden geliyor; onun `surum` taşıdığını
        // `hesap.spec.ts` çalıştırarak sınıyor.
        if (cagri === '(yol, \'POST\', govde, yenile, plan.surum)') {
          expect(k).toContain('const { yol, govde } = eylemIstegi(plan.id, eylem, plan.surum)');
          continue;
        }
        expect(cagri, `${ad}: ${cagri.slice(0, 80)}`).toMatch(/surum: plan\.surum/);
      }
    }
    // Bütçe, kelime ara, kelime seçimi, matris, eylem.
    expect(sayac).toBe(5);
  });

  it('KRİTİK: yoklama zamanlayıcısı bileşen kalkınca temizleniyor', () => {
    const ekran = kod('plan-ekrani.tsx');
    const i = ekran.indexOf('YOKLAMA_MS)');
    expect(i).toBeGreaterThan(-1);
    const effect = ekran.lastIndexOf('useEffect(', i);
    const govde = blok(ekran, ekran.indexOf('(', effect));
    expect(govde).toContain('aramaSuruyor');
    expect(govde).toMatch(/return \(\) => window\.clearTimeout\(t\)/);
  });
});

describe('ikinci tur: aktarım, sunum, gruplar', () => {
  it('KRİTİK: aktarım önizlemesi sözleşmenin `aktarimEngeli` kararıyla', () => {
    const hesap = kod('hesap.ts');
    expect(hesap).toMatch(/import \{[^}]*\baktarimEngeli\b[^}]*\} from '@advetics\/shared'/);
    expect(hesap).toContain('aktarimEngeli({');
    expect(hesap).not.toMatch(/function aktarimEngeli/);
    // Panelde ikinci bir platform listesi yok: hangi platformun aktarıldığını sözleşme söylüyor.
    for (const [ad, k] of Object.entries(KOD)) expect(k, ad).not.toContain('AKTARILABILIR_PLATFORMLAR');
  });

  it('KRİTİK: aktar düğmesi önce önizlemeyi açıyor, eylemi önizlemedeki onay yapıyor', () => {
    const ekran = kod('plan-ekrani.tsx');
    expect(ekran).toContain("onClick={() => setOnayBekleyen(d.eylem as 'iptal' | 'aktar')}");
    expect(ekran).toContain('onizleme={aktarimOnizlemesi(detay)}');
    expect(ekran).toContain("onayla={() => void eylemYap('aktar')}");
    // Hiç satır gitmeyecekse onay kapalı.
    expect(ekran).toContain('disabled={gidecek.length === 0}');
  });

  it('KRİTİK: PDF adresi TEK üreticiden — başka hiçbir dosya `/pdf` kurmuyor', () => {
    for (const [ad, k] of Object.entries(KOD)) {
      if (ad === 'hesap.ts') continue;
      expect(k, ad).not.toMatch(/\/pdf/);
    }
    expect(kod('sunum-bolumu.tsx')).toContain('fetch(pdfAdresi(plan.id)');
  });

  it('sunum bölümü sürümü ve taslak uyarısını gösteriyor, sürüm istek anında sabitleniyor', () => {
    const sunum = kod('sunum-bolumu.tsx');
    expect(sunum).toContain('sunumNotu(plan.durum)');
    expect(sunum).toContain('Sürüm {plan.surum}');
    expect(sunum).toContain('const surum = plan.surum;');
    expect(sunum).toContain("setHal({ tur: 'hata', mesaj })");
    expect(kod('plan-ekrani.tsx')).toContain('<SunumBolumu plan={plan} kaydedilmemis={kaydedilmemis} />');
  });

  it('KRİTİK: kelime tablosu `kelimeGruplari`ndan gruplu çiziliyor, grup adı mevcut PATCH ile', () => {
    const arama = kod('arama-bolumu.tsx');
    expect(arama).toContain('kelimeGruplari(kelimeler.satirlar, taslak)');
    expect(arama).toContain('gruplu.map((g) => (');
    expect(arama).toContain('adDegistir={(ad) => grupGuncelle(g, { grup: ad })}');
    // Kayıt yolu değişmedi: yalnız değişen satırlar, tek PATCH.
    expect(arama).toContain("ucAdresi('/strateji/planlar/:id/kelimeler', plan.id)");
    expect(arama).toContain('kelimeDegisiklikleri(kelimeler.satirlar, taslak)');
  });
});
