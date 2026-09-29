import { yasalUyariVar } from '@advetics/shared';
import type { PrismaService } from '../../prisma/prisma.service';
import type { TenantContext } from '@advetics/shared';

/**
 * ═══ ZORUNLU YASAL UYARI — YAYIN ÖNCESİ KONTROLÜN TEK KAPISI ═══
 *
 * Marka Merkezi'nde tanımlı uyarı (sağlık, finans, konut sektörlerinde
 * reklamda bulunması zorunlu cümle) iki yayın yolunda denetleniyor: taslak
 * ağacı (`draft-publish.service.ts` → Hızlı Reklam, uzman, AI asistan) ve eski
 * tek reklam taslağı (`ad-builder.service.ts`). Kontrol burada, ikisi de
 * çağırıyor; biri güncellenip öbürü unutulursa AI asistanın kurduğu taslak
 * uyarısız yayına çıkardı.
 *
 * YALNIZCA META ANA METNİ. Google arama reklamında "ana metin" yok ve
 * açıklama 90 karakter: uyarı çoğu zaman sığmaz. Tahmin edip bir alana
 * yazmak yerine kısıt kullanıcıya SÖYLENİYOR (`googleUyarisi`).
 */
export async function yasalUyariOku(
  prisma: PrismaService,
  ctx: TenantContext,
  clientId: string,
): Promise<string | null> {
  const p = await prisma.withTenant(ctx, (tx) =>
    tx.clientProfile.findUnique({ where: { clientId }, select: { yasalUyari: true } }),
  );
  return p?.yasalUyari?.trim() || null;
}

export function yasalUyariEngeli(
  metin: string | null | undefined,
  uyari: string | null,
  etiket = '',
): string | null {
  if (yasalUyariVar(metin, uyari)) return null;
  return (
    `${etiket}Zorunlu yasal uyarı ana metinde yok: "${uyari}". ` +
    'Marka Merkezi’nde tanımlı; metnin sonuna aynen ekle.'
  );
}

export function googleUyarisi(uyari: string | null): string | null {
  return uyari
    ? 'Zorunlu yasal uyarı Google reklamında otomatik denetlenmiyor (ana metin alanı yok). ' +
        'Açıklamalardan birine sığıyorsa elle ekle.'
    : null;
}
