import { DERLENEN_NIYETLER } from '../reklam/meta/derle';
import type { NiyetKodu } from '../reklam/meta/niyetler';
import { kanonikJson } from '../reklam/taslak-alanlari';
import { HUNI_ETIKETLERI, HUNI_KATMANLARI, type HuniKatmani } from '../strateji/plan';
import { bos, dolu, metindekiSayilar, yzMetniDenetle, type BosNedeni, type Hucre, type Kaynak, type Kaynakli } from './kaynak';
import {
  ARAMA_HACMI_ESIGI,
  GECMISSIZ_PLATFORM_PAYI_YUZ,
  GOOGLE_ARAMA_NIYETI,
  GOOGLE_DONEM_BUTCE_TIPI,
  KITLESIZ_KATMAN_HEDEFI,
  META_DONEM_BUTCE_TIPI,
  META_KATMAN_PAYI_YUZ,
  PILOT_PLATFORMLARI,
  SATIR_BASI_VARLIK,
  type PilotPlatformu,
  type PlanDegisikligi,
  type PlanOnerisi,
  type PlanSatiri,
  type PlanUretGirdisi,
  type PlatformPayi,
} from './plan';

/**
 * ═══ `planUret` — SAF, DETERMİNİSTİK PLAN ÜRETİCİSİ ═══
 *
 * Aynı girdi her zaman aynı planı verir (testte kilitli). Yapay zekâ bu
 * fonksiyonun İÇİNDE YOK: sayıları kurallar üretir, model yalnız sonradan
 * `yzMetniEkle` ile gerekçe paragrafı yazar ve o paragraf plandaki sayıların
 * dışında sayı taşıyamaz.
 *
 * PARA TAM SAYI. Her bölüşüm `bigint` ve TAM PARA BİRİMİNE aşağı yuvarlanıyor
 * (kuruşlu bütçe Meta'da `microsToMinor`dan geçer ama ekranda "40.799,99 ₺"
 * okunmaz). Yuvarlamadan kalan EN BÜYÜK satıra eklenir: toplam her zaman
 * plan toplamına TAM eşit (testte kilitli); kalanın "dağıtılmamış" diye
 * görünmesi, harcanmayacak bir kuruş için müşteriyi uyarmak olurdu.
 */

const BIRIM = 1_000_000n;
const BAZ = 10_000n;

function tamBirim(micros: bigint): bigint {
  return micros - (micros % BIRIM);
}

function ayGunSayisi(donem: string): number {
  const [y, a] = donem.split('-').map(Number) as [number, number];
  return new Date(Date.UTC(y, a, 0)).getUTCDate();
}

function gunNo(t: string): number {
  const [y, a, g] = t.split('-').map(Number) as [number, number, number];
  return Math.floor(Date.UTC(y, a - 1, g, 12) / 86_400_000);
}

function noTarih(no: number): string {
  return new Date(no * 86_400_000).toISOString().slice(0, 10);
}

/**
 * Ağırlıklara göre bölüştür. Ağırlıklar tam sayı; her pay tam birime aşağı
 * yuvarlanır ve kalan en büyük paya eklenir (eşitlikte ilk gelen: sıra
 * çağıranın verdiği kararlı sıra).
 */
export function bolustur(toplam: bigint, agirliklar: readonly bigint[]): bigint[] {
  const top = agirliklar.reduce((a, b) => a + b, 0n);
  if (top <= 0n) throw new Error('Bölüştürme ağırlıklarının toplamı sıfır');
  const paylar = agirliklar.map((w) => tamBirim((toplam * w) / top));
  const kalan = toplam - paylar.reduce((a, b) => a + b, 0n);
  let enBuyuk = 0;
  for (let i = 1; i < paylar.length; i++) if (paylar[i]! > paylar[enBuyuk]!) enBuyuk = i;
  paylar[enBuyuk] = paylar[enBuyuk]! + kalan;
  return paylar;
}

/** Ağırlıkları on binlik baza çevir; kalan en büyük paya (toplam tam 10.000). */
function bazPuanlari(agirliklar: readonly bigint[]): number[] {
  const top = agirliklar.reduce((a, b) => a + b, 0n);
  const p = agirliklar.map((w) => (w * BAZ) / top);
  const kalan = BAZ - p.reduce((a, b) => a + b, 0n);
  let enBuyuk = 0;
  for (let i = 1; i < p.length; i++) if (p[i]! > p[enBuyuk]!) enBuyuk = i;
  p[enBuyuk] = p[enBuyuk]! + kalan;
  return p.map(Number);
}

function yuzde(baz: number): string {
  const t = Math.floor(baz / 100);
  const k = baz % 100;
  return k === 0 ? `%${t}` : `%${t},${String(k).padStart(2, '0').replace(/0$/, '')}`;
}

const AMAC_NIYETI: Record<'form' | 'whatsapp' | 'website', NiyetKodu> = {
  form: 'FORM',
  whatsapp: 'WHATSAPP',
  website: 'SITE',
};

function bosPlan(g: PlanUretGirdisi, engeller: BosNedeni[], paraBirimi: string | null = null): PlanOnerisi {
  return {
    bicim: 1,
    clientId: g.clientId,
    donem: g.donem,
    paraBirimi,
    takvim: null,
    toplam: bos(engeller[0] ?? 'aylik_butce_yok'),
    platformlar: [],
    disaridaKalanlar: [],
    satirlar: [],
    dagitilmamis: { micros: '0', nedenler: [] },
    beklenenSonuc: bos(engeller[0] ?? 'gecmis_yok'),
    engeller,
    ozetMetni: bos('yz_yazmadi'),
  };
}

export function planUret(g: PlanUretGirdisi): PlanOnerisi {
  // --- Plan seviyesi ön koşullar (her biri ayrı neden) ------------------
  if (!g.aylikButce) return bosPlan(g, ['aylik_butce_yok']);
  const para = g.aylikButce.paraBirimi.toUpperCase();
  if (g.hesaplar.length === 0) return bosPlan(g, ['hesap_yok'], para);
  // Kur çevrimi yok: TL bütçe USD hesaba bölüştürülürse rakamlar anlamsız.
  if (g.hesaplar.some((h) => h.paraBirimi.toUpperCase() !== para)) return bosPlan(g, ['karisik_birim'], para);

  const ayGun = ayGunSayisi(g.donem);
  const ilk = `${g.donem}-01`;
  const son = `${g.donem}-${String(ayGun).padStart(2, '0')}`;
  if (g.bugun >= son) return bosPlan(g, ['donem_gecti'], para);
  const baslangic = g.bugun < ilk ? ilk : noTarih(gunNo(g.bugun) + 1);
  const kalanGun = gunNo(son) - gunNo(baslangic) + 1;

  // AYIN HARCANMAMIŞ KALANI (S-7, kullanıcı kararı 2026-10-07). Plan, aylık
  // bütçeden o ay ZATEN harcanmış olanı düşer: ay ortasında hazırlanan plan
  // bütçenin tamamını yeniden dağıtsaydı ay toplamı bütçeyi aşardı. Harcanan
  // bilinmiyorsa toplam BOŞ — gün oranıyla "tahmini kalan" üretmek, kaynağı
  // olmayan bir sayı olurdu. Harcanan ≥ bütçe ise toplam 0 DEĞİL boş + neden:
  // sıfır tutarlı bir plan "dağıtıldı" gibi görünür, oysa iş bütçeyi artırmak.
  if (!g.ayHarcanan) return bosPlan(g, ['harcanan_bilinmiyor'], para);
  const harcanan = g.ayHarcanan.deger;
  if (harcanan >= g.aylikButce.micros) return bosPlan(g, ['ay_butcesi_bitti'], para);
  const butceKaynagi: Kaynak = { tur: 'aylik_butce', kimlik: g.aylikButce.id, zaman: g.aylikButce.guncellendi };
  const toplamMicros = tamBirim(g.aylikButce.micros - harcanan);
  const toplam: Kaynakli<string> = {
    deger: toplamMicros.toString(),
    kaynak:
      harcanan === 0n
        ? butceKaynagi
        : { ...butceKaynagi, aciklama: `Aylık bütçe eksi bu ay harcanan (${(harcanan / BIRIM).toString()}, ${g.ayHarcanan.kaynak.tur})` },
  };

  // --- Hangi platformlar plana girebilir --------------------------------
  const disarida: PlanOnerisi['disaridaKalanlar'] = [];
  const secKelimeler = g.kelimeler.filter((k) => k.aylikArama !== null && k.aylikArama >= ARAMA_HACMI_ESIGI);
  const kitleli = g.kitleler.filter((k) => k.katman !== null);
  const uygun: PilotPlatformu[] = [];
  for (const p of PILOT_PLATFORMLARI) {
    if (!g.hesaplar.some((h) => h.platform === p)) continue;
    if (p === 'google' && secKelimeler.length === 0) disarida.push({ platform: p, neden: 'kelime_yok' });
    else if (p === 'meta' && kitleli.length === 0) disarida.push({ platform: p, neden: 'kitle_yok' });
    else uygun.push(p);
  }

  // --- Platform payı ------------------------------------------------------
  const gecmisi = (p: PilotPlatformu) => {
    const s = g.gecmis?.platformlar.filter((x) => x.platform === p) ?? [];
    return { harcama: s.reduce((a, b) => a + b.harcamaMicros, 0n), sonuc: s.reduce((a, b) => a + b.sonuc, 0) };
  };
  const gecmisKaynagi = (aciklama: string): Kaynak => ({
    tur: 'gecmis_veri',
    kimlik: 'insights_daily',
    zaman: g.gecmis?.okundu ?? g.simdi,
    ...(g.gecmis ? { pencere: g.gecmis.pencere } : {}),
    aciklama,
  });

  let agirlik: bigint[] = [];
  let payKaynagi: Kaynak;
  let payGerekcesi: (p: PilotPlatformu, baz: number) => string;
  const sonucToplam = uygun.reduce((a, p) => a + gecmisi(p).sonuc, 0);
  const harcamaToplam = uygun.reduce((a, p) => a + gecmisi(p).harcama, 0n);

  if (uygun.length === 1) {
    agirlik = [1n];
    payKaynagi = { tur: 'sabit_kural', kimlik: 'TEK_PLATFORM', zaman: g.simdi, aciklama: 'Plana giren tek platform' };
    payGerekcesi = () => 'Bütçenin tamamı bu platformda: plana giren başka platform yok.';
  } else if (sonucToplam > 0) {
    // Dönüşüm payı. Dönüşümü SIFIR olan platform plana giremez: sıfır pay,
    // sıfır bütçeli satırlar demek ve o satırlar kurulmaz. Dışarıda
    // kaldığı ve nedeni yazılır.
    for (const p of [...uygun]) {
      if (gecmisi(p).sonuc === 0) {
        uygun.splice(uygun.indexOf(p), 1);
        disarida.push({ platform: p, neden: 'donusum_yok' });
      }
    }
    agirlik = uygun.map((p) => BigInt(gecmisi(p).sonuc));
    payKaynagi = gecmisKaynagi('Son 90 günün sonuç payı');
    payGerekcesi = (p, baz) => `Son 90 günde sonuçların ${yuzde(baz)} kadarı bu platformdan geldi.`;
  } else if (harcamaToplam > 0n) {
    agirlik = uygun.map((p) => gecmisi(p).harcama);
    payKaynagi = gecmisKaynagi('Dönüşüm ölçülmedi; son 90 günün harcama payı');
    payGerekcesi = (_p, baz) => `Son 90 günde dönüşüm ölçülmedi; pay harcamadan: ${yuzde(baz)}.`;
  } else {
    agirlik = uygun.map((p) => BigInt(GECMISSIZ_PLATFORM_PAYI_YUZ[p]));
    payKaynagi = { tur: 'sabit_kural', kimlik: 'GECMISSIZ_PLATFORM_PAYI_YUZ', zaman: g.simdi, aciklama: 'Ajans kuralı: geçmiş veri yok' };
    payGerekcesi = (_p, baz) => `Geçmiş veri yok; ajans kuralıyla ${yuzde(baz)}.`;
  }

  if (uygun.length === 0) {
    return {
      ...bosPlan(g, [...new Set(disarida.map((d) => d.neden))], para),
      toplam: dolu(toplam.deger, toplam.kaynak),
      disaridaKalanlar: disarida,
      dagitilmamis: { micros: toplam.deger, nedenler: [...new Set(disarida.map((d) => d.neden))] },
      takvim: { baslangic, bitis: son },
    };
  }

  const bazlar = bazPuanlari(agirlik);
  const platformTutarlari = bolustur(toplamMicros, agirlik);

  // --- Satırlar -------------------------------------------------------------
  const satirlar: PlanSatiri[] = [];
  const niyetHucresi = (): { hucre: Hucre<NiyetKodu>; engel: BosNedeni | null } => {
    if (!g.marka) return { hucre: bos('marka_profili_yok'), engel: 'marka_profili_yok' };
    if (!g.marka.anaAmac) return { hucre: bos('ana_amac_yok'), engel: 'ana_amac_yok' };
    const n = AMAC_NIYETI[g.marka.anaAmac];
    return {
      hucre: dolu(n, { tur: 'marka_merkezi', kimlik: g.marka.profilId, zaman: g.marka.guncellendi, aciklama: 'Ana amaç' }),
      engel: (DERLENEN_NIYETLER as readonly string[]).includes(n) ? null : 'niyet_derlenmiyor',
    };
  };

  const secilenVarliklar = varlikSirasi(g);

  uygun.forEach((p, i) => {
    const tutarP = platformTutarlari[i]!;
    if (p === 'meta') {
      // Katman → kitle (varsayılan önce, sonra ada göre, sonra kimlik: kararlı).
      const katmanKitlesi = new Map<HuniKatmani, PlanUretGirdisi['kitleler'][number]>();
      for (const k of HUNI_KATMANLARI) {
        const aday = [...kitleli.filter((x) => x.katman === k)].sort(
          (a, b) => Number(b.varsayilan) - Number(a.varsayilan) || a.ad.localeCompare(b.ad, 'tr') || a.id.localeCompare(b.id),
        )[0];
        if (aday) katmanKitlesi.set(k, aday);
      }
      const mevcut = HUNI_KATMANLARI.filter((k) => katmanKitlesi.has(k));
      const hedef = katmanKitlesi.has(KITLESIZ_KATMAN_HEDEFI) ? KITLESIZ_KATMAN_HEDEFI : mevcut[0]!;
      const katmanPayi = new Map<HuniKatmani, bigint>(mevcut.map((k) => [k, BigInt(META_KATMAN_PAYI_YUZ[k])]));
      const eklenen: HuniKatmani[] = [];
      for (const k of HUNI_KATMANLARI) {
        if (!katmanKitlesi.has(k)) {
          katmanPayi.set(hedef, katmanPayi.get(hedef)! + BigInt(META_KATMAN_PAYI_YUZ[k]));
          eklenen.push(k);
        }
      }
      const tutarlar = bolustur(tutarP, mevcut.map((k) => katmanPayi.get(k)!));
      const n = niyetHucresi();
      mevcut.forEach((k, j) => {
        const kitle = katmanKitlesi.get(k)!;
        const t = tutarlar[j]!;
        const engeller: BosNedeni[] = [];
        if (n.engel) engeller.push(n.engel);
        if (secilenVarliklar.length === 0) engeller.push('varlik_yok');
        const notlar = [`${HUNI_ETIKETLERI[k]} payı ajans kuralıyla ${yuzde(Number(katmanPayi.get(k)!) * 100)}.`];
        if (k === hedef && eklenen.length > 0) {
          notlar.push(`Kitlesi olmayan katmanların payı buraya eklendi: ${eklenen.map((x) => HUNI_ETIKETLERI[x]).join(', ')}.`);
        }
        const tutarKaynagi: Kaynak = {
          ...butceKaynagi,
          aciklama: `Meta payı ${yuzde(bazlar[i]!)} × ${HUNI_ETIKETLERI[k].toLocaleLowerCase('tr-TR')} ${yuzde(Number(katmanPayi.get(k)!) * 100)}`,
        };
        satirlar.push({
          anahtar: `meta:${k}:${kitle.id}`,
          platform: 'meta',
          katman: k,
          ad: `${kitle.ad} · ${HUNI_ETIKETLERI[k].toLocaleLowerCase('tr-TR')}`,
          niyet: n.hucre,
          kitle: dolu({ id: kitle.id, ad: kitle.ad }, { tur: 'kitle_sablonu', kimlik: kitle.id, zaman: kitle.guncellendi }),
          kelimeGrubu: null,
          varliklar: secilenVarliklar.length > 0 ? dolu(secilenVarliklar, { tur: 'sabit_kural', kimlik: 'SATIR_BASI_VARLIK', zaman: g.simdi, aciklama: `En iyi ${SATIR_BASI_VARLIK} varlık` }) : bos('varlik_yok'),
          tutar: { deger: t.toString(), kaynak: tutarKaynagi },
          butce: {
            deger: { tip: META_DONEM_BUTCE_TIPI, micros: t.toString() },
            kaynak: { tur: 'sabit_kural', kimlik: 'META_DONEM_BUTCE_TIPI', zaman: g.simdi, aciklama: 'Dönem toplamı: en çok bu kadar harcanır' },
          },
          engeller,
          notlar,
        });
      });
    } else {
      // Google: kelime grubu başına bir satır, pay grubun arama hacmiyle.
      const gruplar = new Map<string, { kelimeler: string[]; hacim: number; cekim: string }>();
      for (const k of secKelimeler) {
        const v = gruplar.get(k.grup) ?? { kelimeler: [], hacim: 0, cekim: k.cekim };
        v.kelimeler.push(k.kelime);
        v.hacim += k.aylikArama!;
        if (k.cekim > v.cekim) v.cekim = k.cekim;
        gruplar.set(k.grup, v);
      }
      const sirali = [...gruplar.entries()].sort((a, b) => b[1].hacim - a[1].hacim || a[0].localeCompare(b[0], 'tr'));
      const tutarlar = bolustur(tutarP, sirali.map(([, v]) => BigInt(v.hacim)));
      sirali.forEach(([grup, v], j) => {
        const t = tutarlar[j]!;
        const kelimeKaynagi: Kaynak = { tur: 'kelime_fikri', kimlik: `grup:${grup}`, zaman: v.cekim, aciklama: `Ayda ${ARAMA_HACMI_ESIGI} aramanın üstündekiler` };
        satirlar.push({
          anahtar: `google:soguk:${grup}`,
          platform: 'google',
          katman: 'soguk',
          ad: `${grup} · arama`,
          niyet: dolu(GOOGLE_ARAMA_NIYETI, { tur: 'sabit_kural', kimlik: 'GOOGLE_ARAMA_NIYETI', zaman: g.simdi }),
          kitle: null,
          kelimeGrubu: {
            grup,
            kelimeler: { deger: [...v.kelimeler].sort((a, b) => a.localeCompare(b, 'tr')), kaynak: kelimeKaynagi },
            aylikArama: { deger: v.hacim, kaynak: kelimeKaynagi },
          },
          varliklar: null,
          tutar: { deger: t.toString(), kaynak: { ...butceKaynagi, aciklama: `Google payı ${yuzde(bazlar[i]!)} × grubun arama payı` } },
          butce: {
            // Günlük = satır tutarı ÷ kalan gün, tam birime aşağı. "En çok"
            // hesabı (Google'ın günlük 2 kat esnekliği) müşteri özetinde.
            deger: { tip: GOOGLE_DONEM_BUTCE_TIPI, micros: tamBirim(t / BigInt(kalanGun)).toString() },
            kaynak: { tur: 'sabit_kural', kimlik: 'GOOGLE_DONEM_BUTCE_TIPI', zaman: g.simdi, aciklama: `Satır tutarı ÷ ${kalanGun} gün` },
          },
          engeller: tamBirim(t / BigInt(kalanGun)) === 0n ? ['kelime_yok'] : [],
          notlar: [`Ayda yaklaşık ${v.hacim} arama (Google'ın yuvarladığı değer).`],
        });
      });
    }
  });

  // --- Platform özetleri ve beklenen sonuç -------------------------------
  const platformlar: PlatformPayi[] = uygun.map((p, i) => {
    const gp = gecmisi(p);
    const tutarP = platformTutarlari[i]!;
    const beklenen: Hucre<number> =
      gp.sonuc > 0 && gp.harcama > 0n
        ? dolu(Number((tutarP * BigInt(gp.sonuc)) / gp.harcama), gecmisKaynagi('90 günün sonuç başı maliyetiyle'))
        : bos(g.gecmis ? 'donusum_yok' : 'gecmis_yok');
    return {
      platform: p,
      payBaz: { deger: bazlar[i]!, kaynak: payKaynagi },
      tutar: { deger: tutarP.toString(), kaynak: butceKaynagi },
      beklenenSonuc: beklenen,
      gerekce: payGerekcesi(p, bazlar[i]!),
    };
  });
  const hepsiDolu = platformlar.every((x) => x.beklenenSonuc.dolu);
  const beklenenSonuc: Hucre<number> = hepsiDolu
    ? dolu(
        platformlar.reduce((a, x) => a + (x.beklenenSonuc.dolu ? x.beklenenSonuc.deger : 0), 0),
        gecmisKaynagi('Platform tahminlerinin toplamı'),
      )
    : bos(g.gecmis ? 'donusum_yok' : 'gecmis_yok');

  const dagitilan = satirlar.reduce((a, s) => a + BigInt(s.tutar.deger), 0n);
  return {
    bicim: 1,
    clientId: g.clientId,
    donem: g.donem,
    paraBirimi: para,
    takvim: { baslangic, bitis: son },
    toplam: dolu(toplam.deger, toplam.kaynak),
    platformlar,
    disaridaKalanlar: disarida,
    satirlar,
    dagitilmamis: { micros: (toplamMicros - dagitilan).toString(), nedenler: toplamMicros > dagitilan ? [...new Set(disarida.map((d) => d.neden))] : [] },
    beklenenSonuc,
    engeller: [],
    ozetMetni: bos('yz_yazmadi'),
  };
}

/**
 * Varlık sırası: ÖLÇÜLÜP SONUÇ GETİRENLER sonuç başı maliyete göre, sonra
 * HİÇ ÖLÇÜLMEMİŞLER en yeniden eskiye. Harcayıp sonuç getirmemiş varlık
 * HİÇ seçilmez: ölçülmüş kötü bir varlığı ölçülmemiş bir varlığın önüne
 * koymak, kanıtı yok saymak olurdu.
 */
function varlikSirasi(g: PlanUretGirdisi): Array<Kaynakli<{ id: string; ad: string }>> {
  const olculen = g.varliklar
    .filter((v) => v.performans && v.performans.sonuc > 0 && v.performans.harcamaMicros > 0n)
    .sort((a, b) => {
      // a.h/a.s < b.h/b.s  ⇔  a.h·b.s < b.h·a.s (bölme yok, bigint)
      const sol = a.performans!.harcamaMicros * BigInt(b.performans!.sonuc);
      const sag = b.performans!.harcamaMicros * BigInt(a.performans!.sonuc);
      return sol < sag ? -1 : sol > sag ? 1 : a.id.localeCompare(b.id);
    });
  const olculmemis = g.varliklar
    .filter((v) => !v.performans || (v.performans.harcamaMicros === 0n && v.performans.sonuc === 0))
    .sort((a, b) => b.yuklendi.localeCompare(a.yuklendi) || a.id.localeCompare(b.id));
  const sonuc: Array<Kaynakli<{ id: string; ad: string }>> = [];
  for (const v of olculen) {
    sonuc.push({
      deger: { id: v.id, ad: v.ad },
      kaynak: { tur: 'varlik_performansi', kimlik: v.id, zaman: v.performans!.okundu, pencere: v.performans!.pencere },
    });
  }
  for (const v of olculmemis) {
    sonuc.push({ deger: { id: v.id, ad: v.ad }, kaynak: { tur: 'sabit_kural', kimlik: 'EN_YENI_VARLIK', zaman: v.yuklendi, aciklama: 'Ölçülmemiş; en yeni yüklenen' } });
  }
  return sonuc.slice(0, SATIR_BASI_VARLIK);
}

// ─── Kanonik içerik (onay özeti) ───────────────────────────────────────────

/**
 * Onaylanan şeyin kanonik metni. SHA-256'sı API'de alınır (`node:crypto`;
 * shared tarayıcıda da koşuyor). Anahtar sırası bağımsız: aynı plan aynı
 * özeti vermeli, yoksa her kayıt onayı sebepsiz bayatlatır.
 */
export function planKanonikIcerik(p: PlanOnerisi): string {
  return kanonikJson(p);
}

// ─── Yapay zekâ metni ──────────────────────────────────────────────────────

/** Plandaki her sayının ekranda okunabilecek biçimleri (yapay zekâ süzgeci için). */
export function planSayilari(p: PlanOnerisi): string[] {
  const s = new Set<string>();
  const para = (m: string) => {
    const v = BigInt(m);
    s.add((v / BIRIM).toString());
    s.add(`${v / BIRIM}${(v % BIRIM).toString().padStart(6, '0').slice(0, 2)}`);
  };
  if (p.toplam.dolu) para(p.toplam.deger);
  for (const x of p.platformlar) {
    para(x.tutar.deger);
    s.add(String(Math.floor(x.payBaz.deger / 100)));
    s.add(String(x.payBaz.deger));
    if (x.beklenenSonuc.dolu) s.add(String(x.beklenenSonuc.deger));
  }
  for (const r of p.satirlar) {
    para(r.tutar.deger);
    para(r.butce.deger.micros);
    if (r.kelimeGrubu) {
      s.add(String(r.kelimeGrubu.aylikArama.deger));
      s.add(String(r.kelimeGrubu.kelimeler.deger.length));
    }
  }
  if (p.beklenenSonuc.dolu) s.add(String(p.beklenenSonuc.deger));
  s.add(String(p.satirlar.length));
  if (p.takvim) for (const t of [p.takvim.baslangic, p.takvim.bitis]) for (const parca of t.split('-')) s.add(String(Number(parca)));
  for (const parca of p.donem.split('-')) s.add(String(Number(parca)));
  return [...s];
}

export type YzMetniSonucu = { tur: 'tamam'; plan: PlanOnerisi } | { tur: 'ret'; uydurulanSayilar: string[] };

/**
 * Gerekçe paragrafını plana yazar. Plandaki sayıların dışında bir sayı
 * taşıyan metin REDDEDİLİR ve plan değişmez; ekranda paragraf yerine
 * "gerekçe yazılmadı" kalır (sayılar zaten hücrelerde).
 */
export function yzMetniEkle(p: PlanOnerisi, metin: string, kaynak: { model: string; zaman: string }): YzMetniSonucu {
  const uydurulan = yzMetniDenetle(metin, planSayilari(p));
  if (uydurulan.length > 0) return { tur: 'ret', uydurulanSayilar: uydurulan };
  return { tur: 'tamam', plan: { ...p, ozetMetni: dolu(metin, { tur: 'yz_metin', kimlik: kaynak.model, zaman: kaynak.zaman }) } };
}

// ─── Değişiklik uygulama ───────────────────────────────────────────────────

export type DegisiklikSonucu = { tur: 'tamam'; plan: PlanOnerisi } | { tur: 'ret'; mesaj: string };

/**
 * Cümledeki sayılar değişikliği karşılıyor mu. Model "5.000 TL daha"yı
 * `farkMicros: 50000000000` diye yazarsa (sıfır fazla) cümlede 50000 yok ve
 * değişiklik reddedilir. Elle düzenlemede `cumle` yok ve kontrol koşmaz.
 */
export function degisiklikCumleyleUyumluMu(cumle: string, degisiklikler: readonly PlanDegisikligi[]): boolean {
  const sayilar = new Set(metindekiSayilar(cumle));
  return degisiklikler.every((d) => {
    if (d.tur === 'satir_tutari') return sayilar.has((BigInt(d.tutarMicros) / BIRIM).toString());
    if (d.tur === 'satir_tutari_fark') return sayilar.has((BigInt(d.farkMicros) / BIRIM).toString());
    return true;
  });
}

/**
 * Değişiklikleri uygular; plan toplamını AŞAN sonuç reddedilir (müşteriye
 * onaylattığımızdan fazlasını vaat eden plan). Değişen satırın kaynağı
 * `kim` olur; yapay zekâ paragrafı DÜŞER (artık eski sayıları anlatıyor
 * olabilir) ve yeniden yazılmalıdır.
 */
export function degisiklikUygula(p: PlanOnerisi, degisiklikler: readonly PlanDegisikligi[], kim: Kaynak): DegisiklikSonucu {
  if (!p.toplam.dolu || !p.takvim) return { tur: 'ret', mesaj: 'Plan üretilemediği için değiştirilemez.' };
  if (kim.tur !== 'kullanici') return { tur: 'ret', mesaj: 'Değişikliğin kaynağı bir kişi olmalı.' };
  const kalanGun = gunNo(p.takvim.bitis) - gunNo(p.takvim.baslangic) + 1;
  let satirlar = p.satirlar.map((s) => ({ ...s }));
  const bul = (a: string) => satirlar.find((s) => s.anahtar === a);
  let cikarilan = false;

  for (const d of degisiklikler) {
    const s = bul(d.anahtar);
    if (!s) return { tur: 'ret', mesaj: `Satır bulunamadı: ${d.anahtar}` };
    if (d.tur === 'satir_cikar') {
      satirlar = satirlar.filter((x) => x.anahtar !== d.anahtar);
      cikarilan = true;
      continue;
    }
    if (d.tur === 'varlik_cikar') {
      if (!s.varliklar?.dolu) return { tur: 'ret', mesaj: 'Bu satırda varlık yok.' };
      const kalan = s.varliklar.deger.filter((v) => v.deger.id !== d.varlikId);
      if (kalan.length === s.varliklar.deger.length) return { tur: 'ret', mesaj: 'Varlık bu satırda değil.' };
      s.varliklar = kalan.length > 0 ? dolu(kalan, kim) : bos('varlik_yok');
      if (kalan.length === 0 && !s.engeller.includes('varlik_yok')) s.engeller = [...s.engeller, 'varlik_yok'];
      continue;
    }
    const eski = BigInt(s.tutar.deger);
    const yeni =
      d.tur === 'satir_tutari'
        ? BigInt(d.tutarMicros)
        : d.yon === 'artir'
          ? eski + BigInt(d.farkMicros)
          : eski - BigInt(d.farkMicros);
    if (yeni <= 0n) return { tur: 'ret', mesaj: 'Satır tutarı sıfırın altına inemez; satırı çıkarmak için "çıkar" de.' };
    const yeniTam = tamBirim(yeni);
    s.tutar = { deger: yeniTam.toString(), kaynak: kim };
    s.butce = {
      deger: {
        tip: s.butce.deger.tip,
        micros: (s.butce.deger.tip === 'toplam' ? yeniTam : tamBirim(yeniTam / BigInt(kalanGun))).toString(),
      },
      kaynak: kim,
    };
  }

  const toplam = BigInt(p.toplam.deger);
  const dagitilan = satirlar.reduce((a, s) => a + BigInt(s.tutar.deger), 0n);
  if (dagitilan > toplam) {
    return { tur: 'ret', mesaj: 'Bu değişiklik plan toplamını aşıyor; önce başka bir satırdan azalt.' };
  }

  // Platform tutarı satırlarının toplamı; tahmin aynı sonuç başı maliyetle ölçeklenir.
  const platformlar = p.platformlar.map((x) => {
    const yeniT = satirlar.filter((s) => s.platform === x.platform).reduce((a, s) => a + BigInt(s.tutar.deger), 0n);
    const eskiT = BigInt(x.tutar.deger);
    if (yeniT === eskiT) return x;
    return {
      ...x,
      tutar: { deger: yeniT.toString(), kaynak: kim },
      payBaz: { deger: Number((yeniT * BAZ) / toplam), kaynak: kim },
      beklenenSonuc: x.beklenenSonuc.dolu && eskiT > 0n
        ? dolu(Number((BigInt(x.beklenenSonuc.deger) * yeniT) / eskiT), x.beklenenSonuc.kaynak)
        : x.beklenenSonuc,
    };
  });
  const nedenler = new Set(p.dagitilmamis.nedenler);
  if (cikarilan) nedenler.add('kullanici_cikardi');
  return {
    tur: 'tamam',
    plan: {
      ...p,
      satirlar,
      platformlar,
      dagitilmamis: { micros: (toplam - dagitilan).toString(), nedenler: toplam > dagitilan ? [...nedenler] : [] },
      beklenenSonuc: platformlar.every((x) => x.beklenenSonuc.dolu)
        ? dolu(platformlar.reduce((a, x) => a + (x.beklenenSonuc.dolu ? x.beklenenSonuc.deger : 0), 0), p.beklenenSonuc.dolu ? p.beklenenSonuc.kaynak : kim)
        : p.beklenenSonuc,
      ozetMetni: bos('yz_yazmadi'),
    },
  };
}
