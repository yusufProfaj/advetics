import type { Metadata } from 'next';

import { YasalDuzen, yasalMeta } from '@/components/landing/yasal-duzen';
import { kosullarEn } from '@/components/yasal/kosullar.en';
import { kosullarTr } from '@/components/yasal/kosullar.tr';
import { dilAl } from '@/dil/sunucu';

/**
 * Sayfa İNCE: metin `components/yasal/kosullar.{tr,en}.tsx` çiftinde. Türkçe
 * adres (`/kosullar`) Google/Meta başvurusunda kayıtlı ve DEĞİŞMİYOR;
 * İngilizcesi `/en/...` adresinden middleware ile buraya yeniden yazılıyor
 * (`lib/site-yollari.ts`), dil `dilAl()`den. İki sayfa ağacı yazılmadı:
 * iki ağaç, iki dilin yapısının (bölüm, çapa, üst bilgi) ayrışması demekti.
 */
const YOL = '/kosullar';

async function icerik() {
  return (await dilAl()) === 'en' ? kosullarEn() : kosullarTr();
}

export async function generateMetadata(): Promise<Metadata> {
  return yasalMeta(await icerik(), YOL, await dilAl());
}

export default async function TermsPage() {
  const i = await icerik();
  return (
    <YasalDuzen yol={YOL} baslik={i.baslik} guncelleme={i.guncelleme} ozet={i.ozet} bolumler={i.bolumler}>
      {i.govde}
    </YasalDuzen>
  );
}
