import type { Permission } from '../auth/roles';

/**
 * ═══ UÇ LİSTESİ — TEK KAYNAK ═══
 *
 * Ajan 2 controller'ı bu listeye göre yazar; Ajan 4 bir kaynak taramasıyla
 * controller'daki `@Yetki`/rota çiftlerinin BURAYLA aynı olduğunu kilitler.
 * Ajan 3 menü satırının iznini `STRATEJI_SAYFA_IZNI`nden okur:
 * `nav-sections.spec.ts` menü izni ile sayfa kapısının aynı olmasını istiyor
 * ve ikisi ayrı yazılırsa menüde görünüp açılmayan bir satır doğar.
 *
 * Bütün uçlar `withTenant` altında; workspace kapsamı RLS + servis.
 * PLATFORM ÇAĞRISI (kelime ara) TRANSACTION DIŞINDA: Google 1 QPS ve yavaş;
 * `withTenant`in 5 sn sınırı içinde kalamaz (CLAUDE.md).
 */
export const STRATEJI_SAYFA_IZNI: Permission = 'strategy.read';

export const STRATEJI_UCLARI = [
  { yontem: 'GET', yol: '/strateji/planlar', izin: 'strategy.read', ne: 'Workspace planları (dönem azalan)' },
  { yontem: 'POST', yol: '/strateji/planlar', izin: 'strategy.write', ne: 'Yeni taslak plan' },
  { yontem: 'GET', yol: '/strateji/planlar/:id', izin: 'strategy.read', ne: 'Plan + dağılım + matris + kelimeler' },
  { yontem: 'PUT', yol: '/strateji/planlar/:id/dagilim', izin: 'strategy.write', ne: 'Dağılımı tek seferde yaz' },
  { yontem: 'POST', yol: '/strateji/planlar/:id/dagilim-oner', izin: 'strategy.write', ne: 'Geçmişten öneri (yazmaz, döndürür)' },
  { yontem: 'PUT', yol: '/strateji/planlar/:id/matris', izin: 'strategy.write', ne: 'Matrisi tek seferde yaz' },
  { yontem: 'POST', yol: '/strateji/planlar/:id/kelime-ara', izin: 'strategy.write', ne: 'Google kelime fikirleri (kuyruk, 1 QPS)' },
  { yontem: 'PATCH', yol: '/strateji/planlar/:id/kelimeler', izin: 'strategy.write', ne: 'Seçim + grup adı' },
  { yontem: 'GET', yol: '/strateji/planlar/:id/sezon', izin: 'strategy.read', ne: 'Özel günler + geçen yıl kıyası' },
  { yontem: 'POST', yol: '/strateji/planlar/:id/eylem', izin: 'strategy.write', ne: 'onaya_gonder | geri_cek | aktar | iptal' },
  { yontem: 'POST', yol: '/strateji/planlar/:id/onayla', izin: 'strategy.approve', ne: 'Onay (rol kaydedilir)' },
  { yontem: 'GET', yol: '/strateji/planlar/:id/pdf', izin: 'strategy.read', ne: 'Medya planı PDF (Advetics logosu)' },
] as const satisfies ReadonlyArray<{ yontem: string; yol: string; izin: Permission; ne: string }>;
