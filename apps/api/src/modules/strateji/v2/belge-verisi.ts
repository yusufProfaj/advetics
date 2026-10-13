import type { StratejiBelgeVerisi } from '@advetics/shared';
import { gecmisOku, tahminPenceresi } from './gecmis';
import { belgeGecmisi, isletmeSatirlari, istanbulBugun, markaOku, siteTaramasiOku } from './girdiler';
import { belgeOku, olcumOzetiOku, planKur, type PlanSatiri, type Sorgucu } from './satirlar';

/**
 * MÜŞTERİYE GİDEN BELGE — TEK ÜRETİCİ. Panelin müşteri görünümü, PDF ve
 * girişsiz onay sayfası bunu okur (`musteriGorunumu: true`: ajans notu ve
 * "Kullan" denmemiş yapay zekâ metni yok). Üç ayrı derleme, bağlantıda
 * görülen belge ile PDF'in ayrışması demekti (CLAUDE.md "AYNI BELGEYİ
 * İSTEYEN HER YOL AYNI SORGUYU KURMALI").
 *
 * `Sorgucu` RLS'li tx ya da yönetim bağlantısı olabilir; her sorgu plan
 * kimliği ve client_id ile açıkça süzülüyor.
 */
export async function belgeVerisiKur(t: Sorgucu, p: PlanSatiri, simdi: Date): Promise<StratejiBelgeVerisi> {
  const belge = await belgeOku(t, p, true);
  const pencere = tahminPenceresi(istanbulBugun(simdi));
  return {
    plan: planKur(p),
    ...belge,
    isletme: isletmeSatirlari(await markaOku(t, p.client_id), await siteTaramasiOku(t, p.client_id)),
    gecmis: belgeGecmisi(await gecmisOku(t, p.client_id, p.para_birimi, pencere), pencere),
    olcum: olcumOzetiOku(p.olcum_ozeti),
  };
}
