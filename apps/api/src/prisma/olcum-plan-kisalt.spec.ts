import { describe, expect, it } from 'vitest';
import { planKisalt } from '../../prisma/olcum-plan-kisalt';

/**
 * Kısaltma bir TEŞHİS ARACININ okunabilirliği — ama fazla yiyen bir regex
 * planın anlamlı kısmını da siler ve o zaman elde yine ölçüm kalmaz.
 */
const UUID_A = 'b44e3b47-26e7-4d98-83ad-fa26624a3cc5';
const UUID_B = 'e461ebf7-5054-463b-9ea9-ffa8dc090128';

describe('planKisalt', () => {
  it('KRİTİK: uuid dizisi SAYIYA iniyor', () => {
    const satir = `Index Cond: (client_id = ANY ('{${UUID_A},${UUID_B}}'::uuid[]))`;
    expect(planKisalt(satir)).toBe("Index Cond: (client_id = ANY ('{… 2 kimlik …}'::uuid[]))");
  });

  it('KRİTİK: satırın GERİ KALANI korunuyor', () => {
    // Teşhisin kendisi burada: hangi sütunlar tarama sınırı olmuş.
    const satir = `Index Cond: ((client_id = ANY ('{${UUID_A}}'::uuid[])) AND (date >= '2026-08-12'::date) AND (entity_level = 'campaign'::"EntityLevel"))`;
    const c = planKisalt(satir);
    expect(c).toContain("date >= '2026-08-12'::date");
    expect(c).toContain('entity_level = \'campaign\'::"EntityLevel"');
    expect(c).toContain("'{… 1 kimlik …}'::uuid[]");
  });

  it('KRİTİK: uuid OLMAYAN diziler yenmiyor', () => {
    /*
     * `'\\{[^}]*\\}'` gibi genel bir desen plandaki başka dizileri de yerdi
     * ve kısaltma, okunurluk adına teşhisi yok ederdi.
     */
    const satir = `Filter: (platform = ANY ('{meta,google}'::"Platform"[]))`;
    expect(planKisalt(satir)).toBe(satir);
  });

  it('aynı satırdaki BİRDEN ÇOK dizi kısalıyor', () => {
    // Plan satırları hem RLS yüklemini hem sorgunun kendi süzgecini
    // taşıyor; yalnızca ilkini kısaltmak çıktıyı yine okunmaz bırakırdı.
    const satir = `((client_id = ANY ('{${UUID_A},${UUID_B}}'::uuid[])) AND (client_id = ANY ('{${UUID_A}}'::uuid[])))`;
    expect(planKisalt(satir)).toBe(
      "((client_id = ANY ('{… 2 kimlik …}'::uuid[])) AND (client_id = ANY ('{… 1 kimlik …}'::uuid[])))",
    );
  });

  it('KRİTİK: BOŞ dizi "1 kimlik" olmuyor', () => {
    /*
     * Plan `COALESCE(..., '{}'::uuid[])` taşıyor. Gevşek bir desen onu
     * `'{… 1 kimlik …}'` diye kısaltır ve BOŞ bir kapsam teşhiste "bir
     * kimlik var" gibi görünürdü — oysa boş kapsam (bağlam kurulmamış)
     * aranan arızalardan biri.
     *
     * Bu testi mutasyon yazdırdı: deseni gevşettiğimde diğer beş test de
     * geçiyordu.
     */
    const satir = `Filter: (client_id = ANY (COALESCE(x, '{}'::uuid[])))`;
    expect(planKisalt(satir)).toBe(satir);
  });

  it('dizi yoksa satır AYNEN dönüyor', () => {
    const satir = 'Heap Blocks: exact=5357';
    expect(planKisalt(satir)).toBe(satir);
  });
});
