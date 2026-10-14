import { describe, expect, it } from 'vitest';
import {
  ADVANTAGE_SATIS_YERLESIM_CUMLESI,
  ADVANTAGE_YERLESIM_CUMLESI,
  advantageEkBilgisi,
  beklenenYankilar,
  derleMeta,
  type DerlemeGirdisi,
  type MetaGovdesi,
} from '@advetics/shared';

/*
 * ═══ ADVANTAGE+ NEDEN KAPALI (pazar araştırması 2026-10-15) ═══
 *
 * Geri okuma "Meta bu kampanyayı Advantage+ olarak işaretlemedi" diyordu
 * ama Form ve WhatsApp'ta yerleşim daraldığında (eksik banner boyutu)
 * NEDENİ söylemiyordu. Gövdeler derleyicinin GERÇEK çıktısı; elle yerleşim
 * reklam setine sonradan eklenerek sınanıyor.
 */
const temel = {
  apiSurumu: 'v25.0',
  yayinKimligi: '7q2kab12-0000-4000-8000-000000000000',
  tarih: '2026-10-15',
  workspaceKisaAdi: 'Örnek Yapı',
  niyet: 'FORM',
  hesap: { platformId: 'act_1', paraBirimi: 'TRY' },
  sayfaPlatformId: '111',
  instagramPlatformId: '222',
  hedefleme: { konumlar: [{ tur: 'region', key: '2347', etiket: 'İzmir', ulkeKodu: 'TR' }], enDusukYas: 18, ipucuYas: null, ipucuCinsiyet: null },
  kategoriler: { taban: [], ek: [] },
  butce: { tip: 'gunluk', micros: 500_000_000n, seviye: 'kampanya' },
  takvim: { baslangic: '2026-10-16T00:00:00+0300', bitis: null },
  atif: 'tik7_gor1',
  kavramlar: [{ gorselHash: 'h1', baslik: 'B1', metin: 'M1' }],
  hedefAdres: 'https://ornek.com/',
  formId: '999',
  telefon: '+905551112233',
  urlEtiketleri: null,
  whatsappNumarasi: '+905551112233',
  pikselId: '123456789',
} as DerlemeGirdisi;

function govdeler(niyet: DerlemeGirdisi['niyet']): MetaGovdesi[] {
  const r = derleMeta({ ...temel, niyet });
  if (r.tur !== 'govde') throw new Error(JSON.stringify(r.retler));
  return r.govdeler.map((g) => structuredClone(g));
}
function elleYerlesimEkle(gs: MetaGovdesi[]): MetaGovdesi[] {
  for (const g of gs) if (g.nesne === 'reklam_seti') (g.alanlar.targeting as Record<string, unknown>).publisher_platforms = ['facebook'];
  return gs;
}
const advantageSatiri = (gs: MetaGovdesi[]) => beklenenYankilar(gs).find((y) => y.alanYolu === 'advantage_state_info');

describe('Advantage+ satırının ek bilgisi', () => {
  it('KRİTİK: Form’da yerleşim daralmışsa NEDEN söyleniyor', () => {
    const satir = advantageSatiri(elleYerlesimEkle(govdeler('FORM')));
    expect(satir).toBeDefined();
    expect(satir!.ekBilgi).toBe(ADVANTAGE_YERLESIM_CUMLESI);
  });

  it('Form’da yerleşim otomatikse ek cümle YOK (olmayan sorunu söylemez)', () => {
    const satir = advantageSatiri(govdeler('FORM'));
    expect(satir).toBeDefined();
    expect(satir!.ekBilgi).toBeUndefined();
  });

  it('Satış kendi cümlesini koruyor', () => {
    expect(advantageSatiri(elleYerlesimEkle(govdeler('SATIS')))!.ekBilgi).toBe(ADVANTAGE_SATIS_YERLESIM_CUMLESI);
  });

  it('yalnız gövdeye bakıyor: reklam seti yoksa ya da kısıt yoksa null', () => {
    expect(advantageEkBilgisi([], 'diger')).toBeNull();
    expect(advantageEkBilgisi(govdeler('WHATSAPP'), 'diger')).toBeNull();
  });
});
