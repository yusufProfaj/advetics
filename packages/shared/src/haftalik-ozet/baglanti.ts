/**
 * Haftalık özetin panel yolu — TEK ÜRETİCİ (CLAUDE.md "bağlantıyı elle
 * birleştirme"). Mail ("Panelde aç"), Slack/Teams kısa sürümü ve Genel
 * Bakış bağlantısı aynı adrese gitmeli; üçü ayrı kursaydı biri `hafta`yı
 * düşürür ve geçen haftanın mailinden tıklayan kullanıcı başka bir haftanın
 * özetine inerdi.
 *
 * Göreli yol; kökü (`APP_URL`) gönderen ekler.
 */
export function ozetPanelYolu(clientId: string, hafta?: string | null): string {
  // shared DOM/Node kitaplığı yüklemiyor (URLSearchParams yok); değerler
  // kodlanarak elle diziliyor, sıra sabit.
  const q = [`musteri=${encodeURIComponent(clientId)}`, 'sekme=ozet'];
  if (hafta) q.push(`hafta=${encodeURIComponent(hafta)}`);
  return `/raporlar?${q.join('&')}`;
}

export function ozetPanelAdresi(appUrl: string, clientId: string, hafta?: string | null): string {
  return `${appUrl.replace(/\/+$/, '')}${ozetPanelYolu(clientId, hafta)}`;
}
