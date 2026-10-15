import type { Metadata } from 'next';

import { YasalDuzen, yasalMeta } from '@/components/landing/yasal-duzen';
import { cerezPolitikasiEn } from '@/components/yasal/cerez-politikasi.en';
import { cerezPolitikasiTr } from '@/components/yasal/cerez-politikasi.tr';
import { dilAl } from '@/dil/sunucu';

/**
 * Sayfa İNCE: metin `components/yasal/cerez-politikasi.{tr,en}.tsx` çiftinde. Türkçe
 * adres (`/cerez-politikasi`) DEĞİŞMİYOR;
 * İngilizcesi `/en/...` adresinden middleware ile buraya yeniden yazılıyor
 * (`lib/site-yollari.ts`), dil `dilAl()`den. İki sayfa ağacı yazılmadı:
 * iki ağaç, iki dilin yapısının (bölüm, çapa, üst bilgi) ayrışması demekti.
 */
const YOL = '/cerez-politikasi';

async function icerik() {
  return (await dilAl()) === 'en' ? cerezPolitikasiEn() : cerezPolitikasiTr();
}

export async function generateMetadata(): Promise<Metadata> {
  return yasalMeta(await icerik(), YOL, await dilAl());
}

export default async function CerezPolitikasi() {
  const i = await icerik();
  return (
    <YasalDuzen yol={YOL} baslik={i.baslik} guncelleme={i.guncelleme} ozet={i.ozet} bolumler={i.bolumler}>
      {i.govde}
    </YasalDuzen>
  );
}
