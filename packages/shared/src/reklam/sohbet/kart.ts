/**
 * ADVCAMPAIGN — ONAY KARTI (TASARIM-PLAN § 1.6, § 4.5; İP-15).
 *
 * Kartın METNİNİ model yazmaz: model "yayınlandı" ya da "bütçe 250 TL"
 * yazıp yanılabilir ve kullanıcının onayladığı şey ekranda okuduğu metin
 * olur. Kart taslağın kendisinden, saf bir fonksiyonla üretiliyor; arayüz ve
 * model AYNI kartı görüyor.
 *
 * Düğmeler kapılardan türer. Gerçek yayın uyum denetçisi bağlanana kadar
 * kapalı ve kart bunu söylüyor; düğme yokken "neden yok" yazmamak,
 * kullanıcıyı arızayı kendinde aramaya gönderir.
 */
import { BILINEN_KAPATILAMAYAN_OZELLIKLER, KAPATILAN_OZELLIK_ADLARI, AJANS_STANDARDI_HEDEFLERI } from '../meta/derle';
import { NIYET_KATALOGU, type NiyetKodu } from '../meta/niyetler';
import { tutarGoster } from '../para';
import type { TaslakAlanlari } from '../taslak-alanlari';

/** Meta günlük bütçeyi bazı günler bu kadar aşabiliyor (v24'ten beri %75). */
export const META_GUNLUK_ESNEKLIK = 0.75;

export interface OnayKartiGirdisi {
  alanlar: TaslakAlanlari;
  surumNo: number;
  /** Kullanıcının kendi eksikleri (prova eksiği ve öneri kilidi hariç). */
  kalanEksikler: string[];
  prova: { tur: string; metin: string };
  hesap: { ad: string; paraBirimi: string } | null;
  sayfaAdi: string | null;
  atifEtiketi: string | null;
  kapilar: {
    metaYazma: { acik: true } | { acik: false; sebep: string };
    yayinYetkisi: boolean;
    /** Gerçek yayın açık mı (uyum denetçisi). Bugün kapalı. */
    gercekYayin: { acik: true } | { acik: false; sebep: string };
    /** Test kipi: ajans yöneticisi + ajansın kendi şirketi. */
    testKipi: boolean;
  };
}

export type KartDugmesi =
  | { tur: 'yayinla'; etiket: string }
  | { tur: 'test_kipi'; etiket: string }
  | { tur: 'panelde_ac'; etiket: string }
  | { tur: 'degistir'; etiket: string };

export interface OnayKarti {
  baslik: string;
  surumNo: number;
  satirlar: Array<{ platform: 'meta' | 'google'; ozet: string; prova: string; durum: string }>;
  esneklik: string | null;
  kapattiklarimiz: string[];
  metaOtomatikYapabilir: string[];
  olcum: string | null;
  uyarilar: string[];
  dugmeler: KartDugmesi[];
  /** Birincil düğme neden yok (varsa). */
  dugmeYokSebebi: string | null;
}

export function esneklikCumlesi(tip: 'gunluk' | 'toplam', micros: bigint, paraBirimi: string): string {
  if (tip === 'toplam') return `Toplam ${tutarGoster(micros, paraBirimi)}. Meta günlere kendisi dağıtır, toplamı geçmez.`;
  const fazla = (micros * BigInt(Math.round((1 + META_GUNLUK_ESNEKLIK) * 100))) / 100n;
  return `Meta bazı günler ${tutarGoster(micros, paraBirimi)} yerine ${tutarGoster(fazla, paraBirimi)}’ye kadar harcayabilir; haftalık toplam ${tutarGoster(micros * 7n, paraBirimi)}’yi geçmez.`;
}

export function onayKartiUret(g: OnayKartiGirdisi): OnayKarti {
  const a = g.alanlar;
  const niyet = a.niyet?.deger as NiyetKodu | undefined;
  const satir = niyet ? NIYET_KATALOGU[niyet] : null;
  const gun = a.takvim?.deger ? (a.takvim.deger.bitis ? gunFarki(a.takvim.deger.baslangic, a.takvim.deger.bitis) + 1 : null) : null;
  const butce = a.butce?.deger ?? null;
  const para = g.hesap?.paraBirimi ?? 'TRY';
  const konum = (a.konumlar?.deger ?? []).map((k) => k.etiket).join(', ') || 'seçilmedi';
  const fikir = a.kavramlar?.deger.length ?? 0;
  const video = (a.kavramlar?.deger ?? []).some((k) => k.kapakVarlikId);

  const parcalar = [
    butce ? `${butce.tip === 'gunluk' ? 'Günlük' : 'Toplam'} ${tutarGoster(BigInt(butce.micros), para)}` : 'Bütçe seçilmedi',
    konum,
    gun ? `${gun} gün` : 'bitiş yok',
    `${fikir} reklam${video ? ' (video dahil)' : ''}`,
  ];
  const uyarilar: string[] = [];
  if (g.kalanEksikler.length) uyarilar.push(`Eksik: ${g.kalanEksikler.join(', ')}`);
  if (g.prova.tur !== 'gecti') uyarilar.push(`Meta kontrolü: ${g.prova.metin}`);

  // --- Düğmeler: kapılardan türer -----------------------------------------
  const dugmeler: KartDugmesi[] = [];
  let dugmeYokSebebi: string | null = null;
  const hazir = g.kalanEksikler.length === 0 && g.prova.tur === 'gecti';
  if (!hazir) dugmeYokSebebi = 'Önce eksikler tamamlanmalı ve Meta kontrolü geçmeli.';
  else if (!g.kapilar.metaYazma.acik) dugmeYokSebebi = g.kapilar.metaYazma.sebep;
  else if (!g.kapilar.yayinYetkisi) dugmeYokSebebi = 'Yayın yetkin yok; kartı yayın yetkisi olan birine gönder.';
  else if (g.kapilar.gercekYayin.acik) dugmeler.push({ tur: 'yayinla', etiket: 'Onayla ve Meta’da yayınla' });
  else {
    dugmeYokSebebi = g.kapilar.gercekYayin.sebep;
    if (g.kapilar.testKipi) dugmeler.push({ tur: 'test_kipi', etiket: 'Test kipinde dene (kurar, kontrol eder, açmadan kaldırır)' });
  }
  dugmeler.push({ tur: 'degistir', etiket: 'Değiştir' }, { tur: 'panelde_ac', etiket: 'Taslağı panelde aç' });

  const hedef = satir?.meta?.optimizationGoal;
  return {
    baslik: `${hazir ? 'Onaya hazır' : 'Henüz hazır değil'}: ${satir?.ekranAdi ?? 'Amaç seçilmedi'}${gun ? ` · ${gun} gün` : ''}`,
    surumNo: g.surumNo,
    satirlar: [
      {
        platform: 'meta',
        ozet: `${g.sayfaAdi ? `${g.sayfaAdi} · ` : ''}Instagram ve Facebook · ${parcalar.join(' · ')}`,
        prova: g.prova.tur === 'gecti' ? 'Kontrol geçti' : g.prova.metin,
        durum: g.kapilar.gercekYayin.acik ? 'Onaylarsan yayınlanır' : 'Yayın kapalı, taslak olarak kalır',
      },
    ],
    esneklik: butce ? esneklikCumlesi(butce.tip, BigInt(butce.micros), para) : null,
    kapattiklarimiz: ['Başka markaların reklamlarıyla yan yana gösterim', ...Object.values(KAPATILAN_OZELLIK_ADLARI)],
    metaOtomatikYapabilir: Object.values(BILINEN_KAPATILAMAYAN_OZELLIKLER),
    olcum: hedef
      ? `Meta’nın saydığı sonuç · ${AJANS_STANDARDI_HEDEFLERI.includes(hedef) ? (g.atifEtiketi ?? 'ajans standardı seçilmedi') : '1 gün tıklama'}`
      : null,
    uyarilar,
    dugmeler,
    dugmeYokSebebi,
  };
}

function gunFarki(a: string, b: string): number {
  const t = (s: string) => Date.UTC(Number(s.slice(0, 4)), Number(s.slice(5, 7)) - 1, Number(s.slice(8, 10)));
  return Math.round((t(b) - t(a)) / 86_400_000);
}
