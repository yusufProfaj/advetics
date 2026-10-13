import { redirect } from 'next/navigation';
import { eskiAdresYonu } from '@/lib/panel-adresleri';

/**
 * ESKİ "WORKSPACE EKİBİ" — EKİP TEK YERDE (MIMARI Ç-14). Ekip ve güvenlik
 * sekmesi `?workspace=` süzgeciyle aynı listeyi (müşterinin kendi giriş
 * hesapları dahil) gösteriyor; iki ayrı ekip ekranı iki ayrı yetki yolu
 * demekti.
 */
export default async function EskiWorkspaceEkibiSayfasi({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(eskiAdresYonu('ayarlar/musteriler/[id]/ekip', { id }));
}
