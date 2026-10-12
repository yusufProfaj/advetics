import {
  YORUM_SISTEM_TALIMATI,
  yerTutucuDoldur,
  yorumDenetle,
  yorumGirdisi,
  type HaftalikOzet,
} from '@advetics/shared';
import { metinIste, type MetinUretici } from '../../yapay-zeka/gemini';
import { yuzdeMetni } from './ozet-uret';

/**
 * ═══ YAPAY ZEKÂ YORUMU — TEK DENEME, SAYI UYDURAMAZ (MIMARI Ç-B5) ═══
 *
 * Modele SAYI ve AD gitmiyor (`yorumGirdisi`): yalnız nitel tarif ve yer
 * tutucu adları. Dönen metin `yorumDenetle`den geçmezse yorum ATILIYOR ve
 * mail yorumsuz gidiyor; nedeni `not`ta (ajans önizlemesi gösteriyor).
 *
 * TEK DENEME: haftada bir, workspace başına bir çağrı. Reddedilen bir yorumu
 * "bir daha dene" demek maliyeti ikiye katlar ve aynı talimata aynı cevabı
 * almak muhtemel; ret oranı Ajan 5'in ölçüm listesinde (MIMARI § 9).
 *
 * HATA YUTULMUYOR AMA ÖZETİ DE DÜŞÜRMÜYOR: kota doldu, anahtar geçersiz,
 * ağ koptu — hepsi `hata` ve cümlesi `not`ta. Yorum bir EK; sayılar onsuz
 * da doğru ve müşteri maili yorumsuz gidebilir.
 */
export interface YorumSonucu {
  durum: HaftalikOzet['yorum']['durum'];
  metin: string | null;
  not: string | null;
  model: string | null;
}

export async function yorumYaz(o: HaftalikOzet, yz: MetinUretici | null): Promise<YorumSonucu> {
  const girdi = yorumGirdisi(o, { yuzde: yuzdeMetni });
  if (!girdi) {
    return { durum: 'atlandi', metin: null, not: o.hacim === 'bos' ? 'Bu hafta harcama yok.' : 'Gösterim az; yorum gürültü olurdu.', model: null };
  }
  if (!yz) return { durum: 'kapali', metin: null, not: 'Yapay zekâ anahtarı tanımlı değil (GEMINI_API_KEY).', model: null };

  let cevap: Awaited<ReturnType<typeof metinIste>>;
  try {
    cevap = await metinIste(yz, { sistem: YORUM_SISTEM_TALIMATI, metin: girdi.metin, enCokCikti: 400, dusunme: 'low' });
  } catch (e) {
    return { durum: 'hata', metin: null, not: e instanceof Error ? e.message.slice(0, 300) : String(e), model: yz.model };
  }
  if (cevap.tur !== 'tamam') return { durum: 'hata', metin: null, not: cevap.mesaj.slice(0, 300), model: yz.model };

  const denetim = yorumDenetle(cevap.metin, new Set(Object.keys(girdi.degerler)));
  if (!denetim.gecerli) {
    return { durum: 'reddedildi', metin: null, not: `${denetim.neden}: ${denetim.ayrinti}`.slice(0, 300), model: yz.model };
  }
  return { durum: 'yazildi', metin: yerTutucuDoldur(denetim.sablon, girdi.degerler), not: null, model: yz.model };
}
