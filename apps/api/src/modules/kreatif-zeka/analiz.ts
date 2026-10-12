import {
  BRIEF_EN_FAZLA_BULGU,
  ETIKET_ALAN_ADLARI,
  YENI_KREATIF_GUN,
  alanDegerleri,
  anaMetrik,
  etiketKarsilastir,
  farkCumlesi,
  karsilastirmaKumesi,
  kreatifKovasi,
  kreatifMetrikDegeri,
  kreatifPuani,
  type AgirlikliDeger,
  type BriefBulgusu,
  type EtiketFarkSatiri,
  type EtiketlenemezNedeni,
  type GeciciNeden,
  type IcerikDurumu,
  type KreatifEtiketleri,
  type KreatifMetrigi,
  type KreatifSatiri,
  type KumeOzeti,
} from '@advetics/shared';
import { gunKaydir, type PencereSatiri } from './pencere';

/**
 * ═══ PUAN, KOVA, ETİKET FARKLARI — SAF HESAP (MIMARI § 6-7) ═══
 *
 * Bütün sayılar shared'daki fonksiyonlardan (`kreatifPuani`,
 * `kreatifKovasi`, `etiketKarsilastir`, `farkCumlesi`); burada yalnız
 * kimin kiminle karşılaştırılacağı kuruluyor. İkinci bir istatistik
 * yazılmadı: ekran, brief ve sözleşme testi aynı hesabı okusun.
 *
 * BENZER = AYNI KÜME (platform + amaç), EŞİĞİ GEÇMİŞ, KENDİSİ HARİÇ.
 * Kendisini dahil etmek her puanı yukarı çeker; eşiği geçmemişleri dahil
 * etmek 300 ₺'lik şanslı kreatifleri ölçüt yapar.
 */

export interface IcerikBilgisi {
  durum: IcerikDurumu;
  neden: EtiketlenemezNedeni | GeciciNeden | null;
  /** Güncel şema sürümünün etiketi + kesin alanlar; yoksa null. */
  etiketler: KreatifEtiketleri | null;
  kismi: 'video_kapagi' | 'ilk_kart' | null;
}

export interface AnalizGirdisi {
  pencere: PencereSatiri[];
  ilkGosterim: ReadonlyMap<string, string>;
  icerik: ReadonlyMap<string, IcerikBilgisi>;
  /** Rapor biriminde eşik (micros); kur bilinmiyorsa null. */
  esikMicros: bigint | null;
  paraBirimi: string;
  /** Açık `kreatif_yorgunlugu` önerisi olan reklam kimlikleri. */
  yorgunReklamlar: ReadonlySet<string>;
  bugun: string;
}

export interface KumeAnalizi {
  ozet: KumeOzeti;
  satirlar: KreatifSatiri[];
  farklar: EtiketFarkSatiri[];
  /** Brief'e girebilecek bulgular: anlamlı ve değeri DAHA İYİ giden, en çok 5. */
  bulgular: BriefBulgusu[];
  /** Etiketli + eşiği geçmiş + ölçülebilir kreatif sayısı. */
  karsilastirilabilir: number;
  etiketli: number;
}

export function analiz(g: AnalizGirdisi): { kumeler: KumeAnalizi[]; kumesiz: KreatifSatiri[] } {
  const yeniSiniri = gunKaydir(g.bugun, -YENI_KREATIF_GUN);
  const gruplar = new Map<string, { kume: NonNullable<ReturnType<typeof karsilastirmaKumesi>>; satirlar: PencereSatiri[] }>();
  const kumesizPencere: PencereSatiri[] = [];
  for (const s of g.pencere) {
    const k = karsilastirmaKumesi(s.platform, s.objective);
    if (!k) {
      kumesizPencere.push(s);
      continue;
    }
    const grup = gruplar.get(k.anahtar) ?? { kume: k, satirlar: [] };
    grup.satirlar.push(s);
    gruplar.set(k.anahtar, grup);
  }

  const satirKur = (s: PencereSatiri, metrik: KreatifMetrigi | null, deger: number | null, puan: KreatifSatiri['puan'], kova: KreatifSatiri['kova'], kumeAnahtari: string | null): KreatifSatiri => {
    const ic = g.icerik.get(s.creativeId);
    const ilk = g.ilkGosterim.get(s.creativeId) ?? null;
    return {
      creativeId: s.creativeId,
      adId: s.adId,
      adAdi: s.adAdi,
      kampanyaAdi: s.kampanyaAdi,
      platform: s.platform,
      kumeAnahtari,
      ilkGosterim: ilk,
      yeni: ilk !== null && ilk >= yeniSiniri,
      gosterim: s.gosterim,
      tiklama: s.tiklama,
      donusum: s.donusum,
      harcamaMicros: s.harcamaMicros.toString(),
      paraBirimi: g.paraBirimi,
      anaMetrik: metrik,
      anaDeger: deger,
      puan,
      kova,
      etiketDurumu: ic?.durum ?? 'bekliyor',
      etiketNedeni: ic?.neden ?? null,
      etiketler: ic?.etiketler ?? null,
      kismiEtiket: ic?.kismi ?? null,
    };
  };

  const kumeler: KumeAnalizi[] = [];
  for (const { kume, satirlar } of gruplar.values()) {
    const toplamDonusum = satirlar.reduce((a, s) => a + s.donusum, 0);
    const { metrik, dusus } = anaMetrik(kume.amac, toplamDonusum);
    const olcum = satirlar.map((s) => {
      const deger = kreatifMetrikDegeri(s, metrik);
      const yeterli = g.esikMicros !== null && !s.kurEksik && s.harcamaMicros >= g.esikMicros;
      return { s, deger, yeterli };
    });

    const kreatifSatirlari = olcum.map(({ s, deger, yeterli }) => {
      const benzerler = olcum
        .filter((o) => o.s.creativeId !== s.creativeId && o.yeterli && o.deger !== null)
        .map((o) => o.deger as number);
      const puan = kreatifPuani(deger, yeterli, benzerler);
      const ilk = g.ilkGosterim.get(s.creativeId) ?? null;
      const yeni = ilk !== null && ilk >= yeniSiniri;
      const kova = yeni
        ? kreatifKovasi({ puan, esikBiliniyor: g.esikMicros !== null && !s.kurEksik, yorgunlukOnerisi: g.yorgunReklamlar.has(s.adId) })
        : null;
      return satirKur(s, metrik, deger, puan, kova, kume.anahtar);
    });

    /*
     * FARKLAR YALNIZ ETİKETLİ + EŞİĞİ GEÇMİŞ + ÖLÇÜLEBİLİR kreatiflerden.
     * Etiketsiz kreatifi "insan yok" grubuna saymak karşılaştırmayı
     * bozardı (`etiketCoz` eksik alanı varsayılanla doldurmuyor, aynı ders).
     */
    const veri = olcum
      .map((o) => ({ ...o, et: g.icerik.get(o.s.creativeId)?.etiketler ?? null }))
      .filter((o): o is typeof o & { et: KreatifEtiketleri; deger: number } => o.yeterli && o.deger !== null && o.et !== null);
    const agirlik = (liste: typeof veri): AgirlikliDeger[] => liste.map((o) => ({ deger: o.deger, harcamaMicros: o.s.harcamaMicros }));

    const farklar: EtiketFarkSatiri[] = [];
    for (const alan of ETIKET_ALAN_ADLARI) {
      const degerler = alanDegerleri(alan);
      const alanli = veri.filter((o) => typeof o.et[alan] === 'string');
      const ekle = (deger: string, karsiDegerler: string[]) => {
        const a = alanli.filter((o) => o.et[alan] === deger);
        const b = alanli.filter((o) => karsiDegerler.includes(o.et[alan] as string));
        let fark = etiketKarsilastir(agirlik(a), agirlik(b));
        let d = deger;
        let karsi = karsiDegerler.join(',');
        /*
         * İKİ DEĞERLİ ALANDA DAHA İYİ OLAN "DEĞER" TARAFINA GEÇİYOR: brief
         * "daha iyi giden değer"i istiyor ve "insan yok daha kötü" ile
         * "insan var daha iyi" aynı bulgu. Üç değerlide ters çevrilemiyor
         * (karşı taraf iki değerin birleşimi); o satır ekranda "daha düşük"
         * diye yazılıyor ve brief'e girmiyor.
         */
        if (degerler.length === 2 && fark.goreliFark !== null && fark.goreliFark < 0) {
          fark = etiketKarsilastir(agirlik(b), agirlik(a));
          d = karsiDegerler[0]!;
          karsi = deger;
        }
        farklar.push({ alan, deger: d, karsi, metrik, fark, cumle: farkCumlesi(alan, d, metrik, fark) });
      };
      if (degerler.length === 2) ekle(degerler[1]!, [degerler[0]!]);
      else for (const v of degerler) ekle(v, degerler.filter((x) => x !== v));
    }
    const sira = { anlamli: 0, belirsiz: 1, yetersiz: 2 } as const;
    farklar.sort(
      (x, y) => sira[x.fark.karar] - sira[y.fark.karar] || Math.abs(y.fark.goreliFark ?? 0) - Math.abs(x.fark.goreliFark ?? 0),
    );
    const bulgular: BriefBulgusu[] = farklar
      .filter((f) => f.fark.karar === 'anlamli' && (f.fark.goreliFark ?? 0) > 0)
      .slice(0, BRIEF_EN_FAZLA_BULGU)
      .map((f) => ({ alan: f.alan, deger: f.deger, karsi: f.karsi, metrik: f.metrik, fark: f.fark, cumle: f.cumle }));

    kumeler.push({
      ozet: { anahtar: kume.anahtar, ad: kume.ad, kreatif: satirlar.length, anaMetrik: metrik, metrikDusus: dusus },
      satirlar: kreatifSatirlari,
      farklar,
      bulgular,
      karsilastirilabilir: veri.length,
      etiketli: olcum.filter((o) => g.icerik.get(o.s.creativeId)?.etiketler).length,
    });
  }

  // En çok harcayan küme önce: seçili küme verilmezse o açılıyor (MIMARI § 3).
  const harcama = (k: KumeAnalizi) => k.satirlar.reduce((a, s) => a + BigInt(s.harcamaMicros), 0n);
  kumeler.sort((a, b) => (harcama(b) > harcama(a) ? 1 : harcama(b) < harcama(a) ? -1 : a.ozet.anahtar.localeCompare(b.ozet.anahtar)));

  const kumesiz = kumesizPencere.map((s) => satirKur(s, null, null, { puan: null, neden: 'metrik_yok', benzer: 0 }, null, null));
  return { kumeler, kumesiz };
}
