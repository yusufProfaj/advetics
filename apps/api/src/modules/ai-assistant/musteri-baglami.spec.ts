import { describe, expect, it } from 'vitest';
import { baglamiMetne, type MusteriBaglami } from './musteri-baglami';

/**
 * BAĞLAM METNİ — asistanın "sorma, bak" davranışının tek dayanağı.
 *
 * Bu metin sistem promptuna giriyor. İçinde OLMAYAN bilgi asistanın
 * SORDUĞU bilgi demek; kullanıcının şikâyeti tam olarak buydu:
 * *"müşteriye bağlı hesapları göremiyor"*, *"whatsapp telefon numarası
 * istiyor"*.
 */
const TAM: MusteriBaglami = {
  clientId: 'c-1',
  ad: 'Sabancı İnşaat',
  website: 'https://sabanci.example',
  iletisimTelefonu: '+905551112233',
  bilgiBankasi: '20 yıllık emlak ofisi',
  hedefKitle: 'İzmir, 25-45 yaş',
  markaBilgileri: 'Premium konum, "en ucuz" deme',
  hesaplar: [{ id: 'acc-1', platform: 'meta', ad: 'Sabancı Meta', paraBirimi: 'TRY' }],
  sayfalar: [{ id: 'page-1', ad: 'Sabancı İnşaat' }],
};

describe('baglamiMetne', () => {
  it('KRİTİK: hesap ve sayfa KİMLİKLERİ metne giriyor', () => {
    // Kimlik girmezse model tool çağrısını kuramıyor ve kullanıcıya soruyor —
    // "hesapları göremiyor" arızasının ta kendisi.
    const m = baglamiMetne(TAM);
    expect(m).toContain('acc-1');
    expect(m).toContain('page-1');
    expect(m).toContain('c-1');
  });

  it('KRİTİK: kayıtlı telefon ve web sitesi metinde — asistan sormasın diye', () => {
    const m = baglamiMetne(TAM);
    expect(m).toContain('+905551112233');
    expect(m).toContain('https://sabanci.example');
  });

  it('profil metinleri (bilgi bankası, hedef kitle, marka) giriyor', () => {
    // Reklam metnini bunlara göre yazacak; girmezlerse ya sorar ya da
    // markadan bağımsız bir metin üretir.
    const m = baglamiMetne(TAM);
    expect(m).toContain('20 yıllık emlak ofisi');
    expect(m).toContain('İzmir, 25-45 yaş');
    expect(m).toContain('en ucuz');
  });

  it('metin asistana AÇIKÇA "sorma" diyor', () => {
    expect(baglamiMetne(TAM)).toContain('SORMA');
  });

  it('BOŞ alan hiç yazılmıyor — doldurulacak boşluk gibi görünmesin', () => {
    /*
     * "Web sitesi: yok" gibi bir satır modele eksik bir alan gibi görünüyor
     * ve onu sormaya itiyor. Olmayan bilgi hiç yazılmamalı.
     */
    const m = baglamiMetne({
      ...TAM,
      website: null,
      iletisimTelefonu: null,
      bilgiBankasi: null,
      hedefKitle: null,
      markaBilgileri: null,
    });
    expect(m).not.toContain('Web sitesi');
    expect(m).not.toContain('Kayıtlı telefon');
    expect(m).not.toContain('Bilgi Bankası');
    expect(m).not.toContain('Hedef kitle');
  });

  it('KRİTİK: hesap YOKSA bu AÇIKÇA söyleniyor — sessizce boş liste değil', () => {
    /*
     * Hesapsız müşteride taslak kurulamıyor. Bunu yazmazsak model boş
     * listeyi "bilmiyorum" sanıp kullanıcıya hesap kimliği soruyor —
     * kullanıcının cevaplayamayacağı bir soru.
     */
    const m = baglamiMetne({ ...TAM, hesaplar: [] });
    expect(m).toContain('ATANMIŞ hesap yok');
  });

  it('bağlam KURULAMADIYSA model bunu biliyor ve resolve_client\'a yönlendiriliyor', () => {
    // Sessizce boş bir bağlam vermek, modelin müşteriyi bildiğini SANMASI
    // demekti — en kötüsü, yanlış müşteriye taslak açması.
    const m = baglamiMetne(null);
    expect(m).toContain('KURULAMADI');
    expect(m).toContain('resolve_client');
  });
});
