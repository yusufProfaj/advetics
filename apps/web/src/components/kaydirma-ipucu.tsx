/**
 * Dar ekranda tablonun yana kaydığını söyleyen satır.
 *
 * Tablolar `overflow-x-auto` içinde ve en az 720 piksel genişliğinde, yani
 * telefonda sağdaki sütunlar EKRANIN DIŞINDA kalıyor. Kaydırma çalışıyor ama
 * çalıştığı görünmüyor: kullanıcı CPA ve dönüşüm sütunlarının var olduğunu
 * bilmiyor, tabloyu eksik sanıyor. Kesme sessiz olmasın.
 *
 * `sm:hidden`: geniş ekranda sütunlar zaten sığıyor ve cümle yalan olurdu.
 */
export function KaydirmaIpucu() {
  return (
    <p className="border-t border-line px-4 py-1.5 text-[11px] text-ink-muted sm:hidden">
      Tabloyu yana kaydırabilirsin
    </p>
  );
}
