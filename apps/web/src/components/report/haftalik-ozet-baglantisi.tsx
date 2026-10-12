import Link from 'next/link';
import { aralikMetni, isoHaftaAraligi, ozetHaftasi, ozetPanelYolu } from '@advetics/shared';
import s from '@/components/taslak/taslak.module.css';

/**
 * GENEL BAKIŞ → HAFTALIK ÖZET (Paket B, MIMARI § 7). Son TAMAMLANMIŞ haftanın
 * özetine tek bağlantı; adres tek üreticiden (`ozetPanelYolu`), mail ve
 * Slack'teki "Panelde aç" ile aynı yere iniyor.
 *
 * Sayı göstermiyor: özet ilk açılışta üretiliyor (yapay zekâ çağrısı dahil)
 * ve Genel Bakış'ı ona bekletmek her açılışı yavaşlatırdı.
 */
export function HaftalikOzetBaglantisi({ clientId, simdi = new Date() }: { clientId: string; simdi?: Date }) {
  const hafta = ozetHaftasi(simdi);
  const aralik = aralikMetni(isoHaftaAraligi(hafta)!);
  return (
    <section className={`${s.kart} ${s.gir}`} aria-labelledby="haftalik-ozet-baslik">
      <div className={s.kartUst}>
        <h2 id="haftalik-ozet-baslik">Haftalık özet</h2>
      </div>
      <div className={s.kartAlt}>
        <span>Geçen hafta · {aralik}</span>
        <Link href={ozetPanelYolu(clientId, hafta)}>Haftalık özet hazır →</Link>
      </div>
    </section>
  );
}
