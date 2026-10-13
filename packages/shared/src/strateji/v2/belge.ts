import { REHBER_ACILIS, REHBER_AMACLARI, type RehberAmacKodu, type RehberPlatformu } from '../../reklam/rehber/amaclar';
import type { OlcumTuru } from '../../olcum';
import { OLCUM_TURU_AMACLARI } from '../../olcum';
import type { StratejiKalemiGirdisi } from './kalem';

/**
 * ═══ STRATEJİ BELGESİ — BÖLÜM LİSTESİ VE RİSKLER (TEK KAYNAK) ═══
 *
 * Panel belgesi ve PDF bu listeyi AYNI SIRAYLA gezer (CLAUDE.md "AYNI
 * RAPORUN İKİ GÖSTERİMİ VARSA REFERANS BİRİ OLMALI — ve o panel"). Rapor
 * PDF'indeki `PLATFORM_SIRASI` dersi: döngünün gezmediği bölüm hata vermeden
 * HİÇ çizilmez; Ajan 4 PDF'in bölüm başlıklarını bu listeyle karşılaştırır.
 */
export const STRATEJI_BELGE_BOLUMLERI = [
  { kod: 'kapak', baslik: 'Kapak', onaydanSonra: false },
  { kod: 'ozet', baslik: 'Özet', onaydanSonra: false },
  { kod: 'isletme', baslik: 'İşletme ve pazar', onaydanSonra: false },
  { kod: 'gecmis', baslik: 'Bugüne kadar', onaydanSonra: false },
  { kod: 'hedefler', baslik: 'Hedefler ve ölçütler', onaydanSonra: false },
  { kod: 'butce', baslik: 'Bütçe dağılımı', onaydanSonra: false },
  { kod: 'kampanyalar', baslik: 'Kampanyalar', onaydanSonra: false },
  { kod: 'kitle', baslik: 'Kitle ve bölge', onaydanSonra: false },
  { kod: 'kreatif', baslik: 'Kreatif ve mesaj', onaydanSonra: false },
  { kod: 'takvim', baslik: 'Takvim', onaydanSonra: false },
  { kod: 'olcum', baslik: 'Ölçüm', onaydanSonra: false },
  { kod: 'riskler', baslik: 'Riskler', onaydanSonra: false },
  { kod: 'onay', baslik: 'Onay', onaydanSonra: false },
  /** Yalnız onaylı/kapanmış stratejide: kalem × platform harcanan ve sonuç. */
  { kod: 'gerceklesen', baslik: 'Plan ve gerçekleşen', onaydanSonra: true },
] as const;
export type StratejiBolumKodu = (typeof STRATEJI_BELGE_BOLUMLERI)[number]['kod'];

/** Yapay zekânın yazabildiği bölüm metinleri (sayı yasağı, `stratejiMetniDenetle`). */
export const AI_METIN_BOLUMLERI = ['ozet', 'isletme', 'kitle', 'kreatif'] as const satisfies readonly StratejiBolumKodu[];

// ─── Riskler: DETERMİNİSTİK ─────────────────────────────────────────────

export const STRATEJI_RISK_KODLARI = ['R-OLCUM', 'R-ASGARI', 'R-OGRENME', 'R-DENEME', 'R-KATEGORI', 'R-HESAP', 'R-VERI'] as const;
export type StratejiRiskKodu = (typeof STRATEJI_RISK_KODLARI)[number];

export interface StratejiRiski {
  kod: StratejiRiskKodu;
  /** Kalem sırası (1'den); plan geneli risk `null`. */
  kalem: number | null;
  platform: RehberPlatformu | null;
  metin: string;
}

export interface RiskBaglami {
  /** Ölçüm türü × platform hazır mı; `null` = okunamadı (uyarı ÜRETMEZ, yanlış alarm). */
  olcum: Partial<Record<OlcumTuru, Partial<Record<RehberPlatformu, boolean | null>>>>;
  /** Platformun hesabı atanmış mı. */
  hesap: Record<RehberPlatformu, boolean>;
  /** Kalem × platform günlük tutar asgarinin altında mı; `null` = asgari bilinmiyor. */
  asgariAlti: (kalemSira: number, p: RehberPlatformu) => boolean | null;
  /** Kalem × platform tahmini haftalık sonuç (yalnız veri varsa). */
  haftalikSonuc: (kalemSira: number, p: RehberPlatformu) => number | null;
  /** Workspace'in özel reklam kategorisi beyanı var mı. */
  ozelKategori: boolean;
  /** Hiçbir kalemde veri tahmini çıkmadı mı. */
  hicTahminYok: boolean;
}

/** Meta'nın öğrenme rehberi: haftada ~50 optimizasyon olayı. Platform gerçeği, Advetics tahmini değil. */
export const OGRENME_HAFTALIK_SONUC = 50;

function olcumTuru(amac: RehberAmacKodu): OlcumTuru | null {
  for (const [t, amaclar] of Object.entries(OLCUM_TURU_AMACLARI) as Array<[OlcumTuru, readonly RehberAmacKodu[]]>) {
    if (amaclar.includes(amac)) return t;
  }
  return null;
}

/**
 * Riskler kurallardan çıkar; yapay zekâ risk ÜRETMEZ (yalnız açıklama
 * cümlesi yazabilir). `null` (bilinmiyor) hiçbir kuralda risk sayılmaz:
 * RLS'li tabloda "satır yok" ile "göremiyorum" aynı şey değil dersi.
 */
export function stratejiRiskleri(
  kalemler: ReadonlyArray<Pick<StratejiKalemiGirdisi, 'amac' | 'meta' | 'google'>>,
  b: RiskBaglami,
): StratejiRiski[] {
  const r: StratejiRiski[] = [];
  kalemler.forEach((k, i) => {
    const sira = i + 1;
    const acik: RehberPlatformu[] = [...(k.meta ? (['meta'] as const) : []), ...(k.google ? (['google'] as const) : [])];
    const tur = olcumTuru(k.amac);
    const ad = REHBER_AMACLARI[k.amac].ekranAdi;
    for (const p of acik) {
      const pAd = p === 'meta' ? 'Meta' : 'Google';
      if (!b.hesap[p]) r.push({ kod: 'R-HESAP', kalem: sira, platform: p, metin: `${pAd} reklam hesabı bu workspace’e atanmadı.` });
      if (tur && b.olcum[tur]?.[p] === false) {
        r.push({ kod: 'R-OLCUM', kalem: sira, platform: p, metin: `“${ad}” ${pAd}’da ölçülmüyor; reklam sonuca değil tıklamaya göre çalışır.` });
      }
      if (b.asgariAlti(sira, p) === true) r.push({ kod: 'R-ASGARI', kalem: sira, platform: p, metin: `${pAd} payı platformun günlük asgarisinin altında.` });
      const h = b.haftalikSonuc(sira, p);
      if (p === 'meta' && h !== null && h < OGRENME_HAFTALIK_SONUC) {
        r.push({ kod: 'R-OGRENME', kalem: sira, platform: p, metin: `“${ad}” haftada az sonuç bekliyor; Meta öğrenme dönemini geç bitirebilir.` });
      }
      if (REHBER_ACILIS[k.amac][p] === 'deneme') {
        r.push({ kod: 'R-DENEME', kalem: sira, platform: p, metin: `“${ad}” ${pAd}’da ajansın deneme listesinde; ilk kurulum duraklatılmış yapılır.` });
      }
    }
  });
  if (b.ozelKategori) r.push({ kod: 'R-KATEGORI', kalem: null, platform: null, metin: 'Özel reklam kategorisi: yaş ve bölge daraltılamaz.' });
  if (b.hicTahminYok && kalemler.length > 0) r.push({ kod: 'R-VERI', kalem: null, platform: null, metin: 'Beklenen sonuç gösterilmedi: hesabın geçmiş verisi yok.' });
  return r;
}
