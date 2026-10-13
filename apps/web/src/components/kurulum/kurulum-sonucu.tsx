import Link from 'next/link';
import type { ClientSetupResult } from '@advetics/shared';
import { markaMerkeziAdresi, PANEL_YERLERI } from '@/lib/panel-adresleri';
import { atamaBildirimi } from '@/lib/atama-bildirimi';
import { formatNumber } from '@/lib/format';
import { Serit } from '@/components/ui/hal';

/**
 * KURULUM SONUCU — kısmi başarı SESSİZ KALMIYOR.
 *
 * Sunucu atanamayan her kaydı sebebiyle dönüyor ve kurulumu GERİ ALMIYOR
 * (tek hatalı hesap yüzünden çalışan kurulumu çöpe atmak olurdu). Ekranın
 * "hazır" deyip eksiği göstermemesi, kullanıcının eksiği ancak veri
 * gelmediğinde fark etmesi demekti; o noktada sebebin aranacağı yer de
 * kaybolmuş olurdu.
 */
export function KurulumSonucu({
  sonuc,
  boostSayfaSayisi,
}: {
  sonuc: ClientSetupResult;
  /** Boost'a uygun kaç sayfa seçildi — bağlanmayanı saymak için. */
  boostSayfaSayisi: number;
}) {
  const veriGelecek = sonuc.assignedAccounts + sonuc.assignedProfiles > 0;
  /*
   * BOOST BAĞLANMAYAN SAYFA AYRICA SÖYLENİYOR. Bu, kurulumun yalnızca
   * sistemi kuran kişinin bildiği kuralıydı: sayfa atanıp boost hesabı
   * bağlanmazsa Akıllı Boost her gönderide "bağlı reklam hesabı yok" diyor.
   */
  const boostsuz = Math.max(0, boostSayfaSayisi - sonuc.boostBaglanan);

  return (
    <div className="space-y-3">
      <ul className="grid gap-2 sm:grid-cols-3">
        <Sayac etiket="Reklam hesabı" deger={sonuc.assignedAccounts} />
        <Sayac etiket="Sayfa ve kanal" deger={sonuc.assignedProfiles} />
        <Sayac etiket="Boost'a hazır sayfa" deger={sonuc.boostBaglanan} />
      </ul>

      {veriGelecek && (
        <Serit ton="bilgi" baslik="Son 90 günün verisi çekiliyor.">
          Birkaç dakika içinde Genel Bakış&apos;ta görünür.
        </Serit>
      )}

      {boostsuz > 0 && (
        <Serit ton="uyari" baslik={`${boostsuz} sayfaya boost hesabı bağlanmadı.`}>
          Akıllı Boost bu sayfalarda çalışmaz;{' '}
          <KurulumBaglantisi clientId={sonuc.clientId} capa="kanallar" /> bölümünden bağlayabilirsin.
        </Serit>
      )}

      {sonuc.userCreated && (
        <p className="text-13 text-ink-muted">
          Giriş hesabı açıldı. Parolayı sen ileteceksin.
        </p>
      )}

      {/*
        HAVUZDAN GELEN HESABIN GEÇMİŞİ DE TAŞINDI — ve bu yazılmak zorunda.
        Havuzdaki bir hesap "hiç kullanılmamış" demek değil: başka bir
        workspace'ten kaldırılmış olabilir ve kampanyaları, geçmiş metrikleri
        onun altında duruyordu. Atama onları buraya taşıdı, yani BAŞKA bir
        workspace'in raporundaki rakam da değişti.
      */}
      {(sonuc.movedRows > 0 || Object.keys(sonuc.leftBehind).length > 0) && (
        <Serit ton="uyari" baslik="Başka bir workspace'in verisi değişti.">
          {sonuc.movedRows > 0 && (
            <span className="block">
              {formatNumber(sonuc.movedRows)} kayıt eski workspace&apos;ten buraya taşındı. Eski
              workspace&apos;in raporundaki rakamlar buna göre değişti.
            </span>
          )}
          {Object.keys(sonuc.leftBehind).length > 0 && (
            <span className="mt-1 block">
              Eski workspace&apos;te kalanlar:{' '}
              {Object.entries(sonuc.leftBehind)
                .map(([etiket, n]) => `${formatNumber(n)} ${etiket}`)
                .join(', ')}
              .
            </span>
          )}
        </Serit>
      )}

      {atamaBildirimi(sonuc, true) && (
        <Serit ton="bilgi" baslik={atamaBildirimi(sonuc, true)} />
      )}

      {sonuc.failures.length > 0 && (
        <Serit ton="hata" baslik={`${sonuc.failures.length} adım tamamlanamadı`}>
          <span className="mt-1 grid gap-1">
            {sonuc.failures.map((f) => (
              <span key={`${f.kind}-${f.id}`} className="block text-ink">
                {f.reason}
              </span>
            ))}
          </span>
          <span className="mt-1.5 block">
            Workspace kuruldu. Eksikleri <KurulumBaglantisi clientId={sonuc.clientId} /> bölümünden
            tamamlayabilirsin.
          </span>
        </Serit>
      )}
    </div>
  );
}

/**
 * EKSİĞİN EVİ MARKA MERKEZİ › KURULUM (docs/panel-sadelestirme/MIMARI.md).
 * Burada uzun süre "Şirketler ekranındaki workspace kartından" yazıyordu;
 * o pencere kaldırıldı ve hesap/sayfa/boost ataması tek yerde: yeni
 * workspace'in Kurulum'u. Adres ve ad sözleşmeden (`markaMerkeziAdresi`,
 * `PANEL_YERLERI`), elle değil.
 */
function KurulumBaglantisi({ clientId, capa }: { clientId: string; capa?: 'kanallar' }) {
  return (
    <Link href={markaMerkeziAdresi('kurulum', clientId, capa)} className="font-semibold text-ink underline-offset-2 hover:underline">
      {PANEL_YERLERI.kurulum}
    </Link>
  );
}

function Sayac({ etiket, deger }: { etiket: string; deger: number }) {
  return (
    <li className="rounded-kart border border-line px-4 py-3">
      <span className="block font-baslik text-18 font-bold tabular-nums text-ink">{deger}</span>
      <span className="block text-12 text-ink-muted">{etiket}</span>
    </li>
  );
}
