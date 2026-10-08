import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * ═══ PİLOT EKRANLARI — KAYNAK TARAMALARI ═══
 *
 * Davranış `hesap.spec.ts`te ÇALIŞTIRILARAK sınanıyor. Buradakiler o
 * kararların ekranda GERÇEKTEN kullanıldığını kilitliyor: bir fonksiyonun
 * test edilmesi, çağrıldığının test edilmesi değil (CLAUDE.md mutasyon
 * dersi 1).
 *
 * TARAMA YORUMSUZ KAYNAKTA: kuralı anlatan yorum aynı dosyada duruyor ve
 * `toContain` ikisini ayırt etmiyor.
 */
const KOK = __dirname;
const STRATEJI = join(__dirname, '..', '..', 'app', '(dashboard)', 'strateji', 'page.tsx');
const REKLAM = join(__dirname, '..', '..', 'app', '(dashboard)', 'reklam', 'page.tsx');

function yorumsuz(yol: string): string {
  return readFileSync(yol, 'utf8')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/(?<![:'"`\w])\/\/[^\n'"`]*$/gm, '');
}

const DOSYALAR = readdirSync(KOK).filter((f) => /\.tsx?$/.test(f) && !f.includes('.spec.'));
const KOD: Record<string, string> = Object.fromEntries(DOSYALAR.map((f) => [f, yorumsuz(join(KOK, f))]));
const kod = (ad: string): string => {
  const k = KOD[ad];
  if (k === undefined) throw new Error(`${ad} okunamadı — tarama boşa düştü`);
  return k;
};
const TSX = Object.entries(KOD).filter(([f]) => f.endsWith('.tsx'));

/** Bir gövdeyi açılış karakterinden eşi kapanana kadar keser; bulunamazsa PATLAR (tarama boşa düşmesin). */
function govde(kaynak: string, baslangic: string, ac = '{', kapa = '}', bas = baslangic): string {
  const i = kaynak.indexOf(baslangic);
  if (i < 0) throw new Error(`Tarama boşa düştü: ${baslangic}`);
  const b = kaynak.indexOf(bas, i);
  if (b < 0) throw new Error(`Tarama boşa düştü: ${baslangic} → ${bas}`);
  const a = kaynak.indexOf(ac, b + (bas === baslangic ? 0 : bas.length - 1));
  let d = 0;
  for (let j = a; j < kaynak.length; j++) {
    if (kaynak[j] === ac) d++;
    else if (kaynak[j] === kapa && --d === 0) return kaynak.slice(i, j + 1);
  }
  throw new Error(`Gövde kapanmadı: ${baslangic}`);
}

describe('tarama boşa düşmüyor', () => {
  it('bütün pilot dosyaları okundu', () => {
    expect(Object.keys(KOD).sort()).toEqual(
      [
        'beyan-bolumu.tsx',
        'butce-seridi.tsx',
        'degistir-kutusu.tsx',
        'gercek-yayin-satiri.tsx',
        'hesap.ts',
        'kaynak-cipi.tsx',
        'kurulum-karti.tsx',
        'oneri-kartlari.tsx',
        'pilot-acilisi.tsx',
        'plan-belgesi.tsx',
        'plan-hazirla.tsx',
        'plan-sayfasi.tsx',
      ].sort(),
    );
    for (const [f, k] of Object.entries(KOD)) expect(k.length, f).toBeGreaterThan(500);
  });
});

describe('sessiz hata yok', () => {
  it('KRİTİK: hiçbir dosyada hatayı yutan `.catch(() =>` yok', () => {
    for (const [f, k] of Object.entries(KOD)) expect(k, f).not.toMatch(/\.catch\(\s*\(\s*\)\s*=>/);
  });

  it('KRİTİK: her yazma hatası ekrana çıkıyor (okumaHatasi ile state)', () => {
    expect(kod('plan-belgesi.tsx')).toContain("setIslem({ tur: 'hata', ...yazmaHatasi(e) })");
    // Retler başlığın altında liste olarak çiziliyor.
    expect(kod('plan-belgesi.tsx')).toContain('islem.retler.map(');
    expect(kod('degistir-kutusu.tsx')).toContain("setHal({ tur: 'hata', mesaj: okumaHatasi(e) })");
    expect(kod('plan-hazirla.tsx')).toContain("setHal({ tur: 'hata', mesaj: okumaHatasi(e) })");
    expect(kod('oneri-kartlari.tsx')).toContain('[k.id]: okumaHatasi(e)');
    expect(kod('kurulum-karti.tsx')).toContain("setHal({ tur: 'hata', mesaj: okumaHatasi(e) })");
  });

  it('KRİTİK: sunucu okumaları ayrı hata dallı; düşen bölüm kendi cümlesiyle', () => {
    const a = kod('pilot-acilisi.tsx');
    for (const b of ['Bugünün özeti alınamadı.', 'Öneriler alınamadı.', 'Planlar alınamadı.', 'Kurulum durumu alınamadı.']) expect(a).toContain(b);
    const s = kod('plan-sayfasi.tsx');
    expect(s).toContain('baslik="Planlar alınamadı."');
    expect(s).toContain('baslik="Plan alınamadı."');
  });

  it('boş öneri listesi nedeni olmadan "öneri yok" demiyor', () => {
    const a = kod('pilot-acilisi.tsx');
    expect(a).toContain('if (!neden) return');
    expect(a).toContain('ONERI_BOS_METNI[neden]');
  });

  it('panel metninde uzun tire yok', () => {
    for (const [f, k] of Object.entries(KOD)) expect(k, f).not.toMatch(/[—–]/);
  });
});

describe('uç ve adres sözleşmeden', () => {
  it('KRİTİK: hiçbir dosya `/pilot/...` yolunu elle kurmuyor', () => {
    for (const [f, k] of Object.entries(KOD)) {
      expect(k, f).not.toMatch(/(?<!pilotUcAdresi\()['`]\/pilot\//);
    }
    // Ve gerçekten kullanılıyor (aksi hâlde yukarıdaki iddia boşa geçer).
    expect(TSX.filter(([, k]) => k.includes('pilotUcAdresi(')).length).toBeGreaterThanOrEqual(6);
  });

  it('KRİTİK: sorgu dizgesi elle birleştirilmiyor (`baglanti` ile)', () => {
    for (const [f, k] of Object.entries(KOD)) expect(k, f).not.toMatch(/[?&](plan|musteri|eski|clientId|bolum)=/);
  });
});

describe('düğmeler ve onay', () => {
  it('KRİTİK: plan düğmeleri `altCubuk(detay)`tan, geçiş tablosundan değil', () => {
    expect(kod('plan-belgesi.tsx')).toContain('const cubuk = altCubuk(detay)');
    expect(kod('plan-belgesi.tsx')).toContain('cubuk.ikincil.map(');
    for (const [f, k] of Object.entries(KOD)) expect(k, f).not.toMatch(/PILOT_PLAN_GECISLERI|pilotGecisMumkunMu/);
  });

  it('KRİTİK: onay gövdesi `onayIstegi`nden; hiçbir bileşen içerik özetini elle koymuyor', () => {
    const b = kod('plan-belgesi.tsx');
    expect(b).toContain("pilotUcAdresi('/pilot/planlar/:id/onayla', plan.id), onayIstegi(plan))");
    expect(b).toContain("pilotUcAdresi('/pilot/planlar/:id/onayla', plan.id), onayIstegi(plan, g))");
    for (const [f, k] of TSX) expect(k, f).not.toMatch(/icerikOzeti\s*:/);
  });

  it('KRİTİK: ajans müşteri adına onayı gerekçe kutusundan geçiyor; düğme gerekçe eksikken kapalı', () => {
    const b = kod('plan-belgesi.tsx');
    expect(b).toContain("return setAcikKutu('adina_onay')");
    expect(b).toContain('disabled={eksik > 0}');
    expect(b).toContain('const eksik = gerekceEksigi(gerekce)');
  });

  it('KRİTİK: uyum ve yayın kipi notu müşteriye çizilmiyor', () => {
    const b = kod('plan-belgesi.tsx');
    expect(b).toContain('{!musteri && <AjansNotlari');
    // AjansNotlari dışında uyum alanına bakan bir çizim yok.
    expect(b.match(/detay\.uyum/g)?.length).toBe(1);
  });

  it('eylem gövdeleri `eylemIstegi`nden (plan sayfası ve kurulum kartı aynı)', () => {
    expect(kod('plan-belgesi.tsx')).toContain('eylemIstegi(plan.id, e, plan.surum)');
    expect(kod('kurulum-karti.tsx')).toContain('eylemIstegi(k.plan.id, eylem, k.plan.surum)');
    expect(kod('kurulum-karti.tsx')).toContain("onClick={() => void calistir('yeniden_dene')}");
  });

  it('"Şimdi kur" ve "Kurulumu durdur" sunucunun listesinden', () => {
    const k = kod('kurulum-karti.tsx');
    expect(k).toContain('const izinli = new Set<PilotEkranEylemi>(k.yapilabilir)');
    expect(k).toContain("const kurabilir = izinli.has('yeniden_dene')");
    expect(k).toContain("const durdurabilir = izinli.has('takilan_kurulumu_durdur')");
    expect(k).toContain("{durdurabilir && (");
    expect(k).toContain("onClick={() => void calistir('takilan_kurulumu_durdur')}");
  });

  it('KRİTİK: plan belgesinde "Kurulumu durdur" araya kutu koymadan isteği gönderiyor', () => {
    const b = kod('plan-belgesi.tsx');
    expect(b).toContain('const izinli = new Set<PilotEkranEylemi>(detay.yapilabilir)');
    const e = govde(b, 'function eylemYap(');
    const dal = e.slice(e.indexOf("case 'musteriye_gonder'"), e.indexOf("case 'onayla'"));
    expect(dal).toContain("case 'takilan_kurulumu_durdur'");
    expect(dal).toContain('eylemIstegi(plan.id, e, plan.surum)');
    expect(dal).toContain('void yaz(');
    expect(dal).not.toContain('setAcikKutu');
  });
});

describe('sayfalar: yeni ekran varsayılan, eski ekran geri dönüş yolu', () => {
  const strateji = yorumsuz(STRATEJI);
  const reklam = yorumsuz(REKLAM);

  it('KRİTİK: AdvStrategy yeni belgeyi `?eski=1` yoksa açıyor ve kapı aynı izinden sonra', () => {
    const i = strateji.indexOf('if (!eskiEkranMi({ eski: first(params.eski) }))');
    expect(i).toBeGreaterThan(-1);
    expect(strateji.indexOf('hasPermission(session, STRATEJI_SAYFA_IZNI)')).toBeLessThan(i);
    expect(strateji.slice(i, i + 600)).toContain('<PilotPlanSayfasi');
  });

  it('KRİTİK: AdvCampaign Pilot\'u açıyor; `?oturum=` eski sohbete gidiyor; kapı aynı izinden sonra', () => {
    const i = reklam.indexOf('if (!eskiEkranMi({ eski: first(params.eski), oturum: first(params.oturum) }))');
    expect(i).toBeGreaterThan(-1);
    expect(reklam.indexOf("hasPermission(session, 'bulk.write')")).toBeLessThan(i);
    expect(reklam.slice(i, i + 400)).toContain('<PilotAcilisi');
  });
});

describe('gerçek yayın anahtarı', () => {
  it('KRİTİK: anahtar yalnız ucu okuyabilene okunuyor; izin sözleşmeden', () => {
    const a = kod('pilot-acilisi.tsx');
    expect(a).toContain("gercekYayinOkuyabilir ? oku(serverApiFetch<PilotGercekYayinDurumu>(pilotUcAdresi('/pilot/gercek-yayin')))");
    expect(yorumsuz(REKLAM)).toContain("gercekYayinOkuyabilir={hasPermission(session, ucIzni('GET', '/pilot/gercek-yayin'))}");
  });

  it('KRİTİK: açma isteği sözleşmenin şemasından geçiyor, açarken uyarı cümlesi çiziliyor', () => {
    const g = kod('gercek-yayin-satiri.tsx');
    expect(g).toContain('const istek = gercekYayinIstegi(!g.acik, sebep)');
    expect(g).toContain("if (istek.tur === 'hata') return");
    expect(g).toContain("{g.eylem === 'ac' && <p");
    expect(g).toContain('GERCEK_YAYIN_ACMA_UYARISI');
  });
});

describe('workspace beyanı', () => {
  const MM = yorumsuz(join(__dirname, '..', '..', 'app', '(dashboard)', 'marka-merkezi', 'page.tsx'));

  it('KRİTİK: form sunucunun hâlinden başlıyor, önceden seçili seçenek yok', () => {
    const b = kod('beyan-bolumu.tsx');
    expect(b).toContain('useState<BeyanSecimi>(beyanBaslangici(beyan))');
    expect(b).toContain('const istek = beyanIstegi(clientId, secim, sektor)');
    expect(b).toContain('Bunu senin yerine cevaplayamam, yasal bir beyan.');
    expect(b).toContain("setOku({ tur: 'hata', mesaj: okumaHatasi(e) })");
  });

  it('KRİTİK: Marka Merkezi bölümü olarak çiziliyor, ayrı sayfa değil', () => {
    expect(MM).toContain("{bolum === 'beyan' && (");
    expect(MM).toContain('<BeyanBolumu clientId={clientId} />');
  });

  it('plan belgesi beyanla çözülen bulguda ajansı beyana gönderiyor', () => {
    expect(kod('plan-belgesi.tsx')).toContain("{beyanGerekiyorMu(bulgular) && (");
    expect(kod('plan-belgesi.tsx')).toContain("href={mmAdresi(clientId, 'beyan')}");
  });
});

describe('panel kalıbı ve dar ekran', () => {
  it('kart kalıbı kullanılıyor, ekrana özel gölge yazılmıyor', () => {
    for (const [f, k] of TSX) expect(k, f).not.toMatch(/shadow-\[/);
    expect(TSX.filter(([, k]) => k.includes('rounded-xl border border-line bg-surface')).length).toBeGreaterThanOrEqual(5);
  });

  it('KRİTİK: her sabit kolonlu ızgara esneyen bir `minmax(0,1fr)` kolonu taşıyor (375 pikselde yatay kaydırma yok)', () => {
    const izgaralar = TSX.flatMap(([f, k]) => [...k.matchAll(/(?<![\w:])grid-cols-\[([^\]]+)\]/g)].map((m) => [f, m[1]!] as const));
    expect(izgaralar.length).toBeGreaterThan(3);
    for (const [f, iz] of izgaralar) expect(iz, f).toContain('minmax(0,1fr)');
  });

  it('dar ekranda sabit genişlik yok (önek almamış en az genişlik 10rem’i geçmiyor)', () => {
    for (const [f, k] of TSX) {
      for (const m of k.matchAll(/(?<![\w:])min-w-\[(\d+(?:\.\d+)?)rem\]/g)) expect(Number(m[1]), f).toBeLessThanOrEqual(10);
      expect(k, f).not.toMatch(/(?<![\w:-])w-\[\d{2,}rem\]/);
    }
  });
});

describe('reklam metni önizlemesi (karar (a): müşteri onayladığı metni görür)', () => {
  const b = kod('plan-belgesi.tsx');
  // Parametre listesi de süslü parantezle açılıyor; gövde imzanın `}) {` kapanışından sonra.
  const liste = govde(b, 'function KampanyaListesi(', '{', '}', '}) {');
  const onizleme = govde(b, 'function MetinOnizlemesi(', '{', '}', '}) {');

  it('KRİTİK: her satırda önizleme çiziliyor ve AJANSA ÖZEL bloğun DIŞINDA (müşteri de görüyor)', () => {
    const cagri = '<MetinOnizlemesi planId={planId} satir={s} clientId={clientId} musteri={musteri} metinNotlari={notlar.metin} />';
    const i = liste.indexOf(cagri);
    expect(i).toBeGreaterThan(-1);
    // Ajansa özel HER bloğu (paranteziyle) ve `musteri &&` taşıyan her satırı
    // at: çağrı yine duruyorsa müşteri de görüyor. Yalnız ilk bloğa bakmak,
    // önizlemeyi ikinci bir `!musteri &&` ile sarmayı yakalamıyordu.
    let disari = liste;
    for (let j = disari.indexOf('!musteri && ('); j >= 0; j = disari.indexOf('!musteri && (')) {
      disari = disari.replace(govde(disari, '!musteri && (', '(', ')'), '');
    }
    disari = disari.split('\n').filter((l) => !/musteri\s*&&/.test(l)).join('\n');
    expect(disari).toContain(cagri);
    // Satırın içinde (aynı `<li>`), tutardan SONRA: ızgara yerleşimi tutarı itmesin.
    expect(i).toBeGreaterThan(liste.indexOf('Plandan çıkar'));
    expect(i).toBeLessThan(liste.lastIndexOf('</li>'));
  });

  it('KRİTİK: önizleme sözleşmenin metninden: başlık, ana metin ve görselin küçük resmi', () => {
    expect(onizleme).toContain('const o = metinOnizlemesi(satir)');
    expect(onizleme).toContain("if (o.tur === 'yok') return null");
    expect(onizleme).toContain('o.kartlar.map(');
    expect(onizleme).toContain('{k.baslik}');
    expect(onizleme).toContain('{k.metin}');
    expect(onizleme).toContain('<KreatifGorsel src={varlikOnizlemeAdresi(planId, k.gorsel.id)}');
    expect(onizleme).toContain('<KaynakCipi kaynak={o.kaynak}');
  });

  it('KRİTİK: boş metin nedeniyle (BosHucre), müşteride kısa', () => {
    expect(onizleme).toContain('<BosHucre neden={o.neden} clientId={clientId} kisa={musteri} />');
  });

  it('KRİTİK: metin notları yalnız ajansa, metnin yanında', () => {
    expect(onizleme).toContain('const notlar = !musteri && metinNotlari.length > 0 && (');
    expect(onizleme.match(/\{notlar\}/g)?.length).toBe(2);
    expect(liste).toContain('const notlar = satirNotlari(s.notlar)');
    expect(liste).toContain('notlar.diger.map(');
    expect(liste).not.toContain('s.notlar.map(');
  });

  it('KRİTİK: satır engel listesinde metin nedenleri tekrar yazılmıyor', () => {
    expect(liste).toContain('const engeller = metinDisiEngeller(s.engeller)');
    expect(liste).toContain('engeller.map((n) =>');
    expect(liste).not.toContain('s.engeller.map(');
  });
});
