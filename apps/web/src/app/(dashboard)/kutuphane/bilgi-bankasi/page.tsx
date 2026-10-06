import { redirect } from 'next/navigation';
import { bilgiBankasiYonu } from '@/components/marka-merkezi/bolumler';

/**
 * ═══ BİLGİ BANKASI AYRI BİR SAYFA DEĞİL ARTIK ═══
 *
 * Beş sekmesi (genel metin, bütçe, hedef kitle metni, marka, logo) Marka
 * Merkezi'nin Marka bölümüne taşındı; bütçe tek yerinde, Aylık Bütçe'de
 * (2026-10-06, kullanıcının "nereye nereden girdiğimi unutuyorum" şikâyeti).
 * Adres silinmiyor, yönleniyor: kayıtlı bağlantılar kırılmamalı.
 */
export default async function BilgiBankasiYonlendirme({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const p = await searchParams;
  redirect(bilgiBankasiYonu(ilk(p.musteri), ilk(p.sekme)));
}

function ilk(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}
