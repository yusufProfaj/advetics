import type { ClientSetupResult } from '@advetics/shared';
import { atamaBildirimi } from '@/lib/atama-bildirimi';
import { formatNumber } from '@/lib/format';

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
        <p className="rounded-lg bg-surface-sunken px-3.5 py-2.5 text-sm text-ink-muted">
          Son 90 günün verisi çekiliyor. Birkaç dakika içinde Genel Bakış&apos;ta görünür.
        </p>
      )}

      {boostsuz > 0 && (
        <p className="rounded-lg bg-warn-soft px-3.5 py-2.5 text-sm text-warn-strong ring-1 ring-inset ring-warn/30">
          {boostsuz} sayfaya boost hesabı bağlanmadı. Akıllı Boost bu sayfalarda çalışmaz;
          Şirketler ekranındaki workspace kartından bağlayabilirsin.
        </p>
      )}

      {sonuc.userCreated && (
        <p className="text-sm text-ink-muted">
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
        <div className="rounded-lg bg-warn-soft px-3.5 py-2.5 text-sm text-warn-strong ring-1 ring-inset ring-warn/30">
          {sonuc.movedRows > 0 && (
            <p>
              {formatNumber(sonuc.movedRows)} kayıt eski workspace&apos;ten buraya taşındı. Eski
              workspace&apos;in raporundaki rakamlar buna göre değişti.
            </p>
          )}
          {Object.keys(sonuc.leftBehind).length > 0 && (
            <p className="mt-1">
              Eski workspace&apos;te kalanlar:{' '}
              {Object.entries(sonuc.leftBehind)
                .map(([etiket, n]) => `${formatNumber(n)} ${etiket}`)
                .join(', ')}
              .
            </p>
          )}
        </div>
      )}

      {atamaBildirimi(sonuc, true) && (
        <p className="rounded-lg bg-surface-sunken px-3.5 py-2.5 text-xs text-ink-muted">
          {atamaBildirimi(sonuc, true)}
        </p>
      )}

      {sonuc.failures.length > 0 && (
        <div
          role="alert"
          className="rounded-lg bg-danger-soft px-3.5 py-2.5 ring-1 ring-inset ring-danger/30"
        >
          <p className="text-sm font-semibold text-danger-strong">
            {sonuc.failures.length} adım tamamlanamadı
          </p>
          <ul className="mt-1 space-y-1">
            {sonuc.failures.map((f) => (
              <li key={`${f.kind}-${f.id}`} className="text-xs text-danger-strong">
                {f.reason}
              </li>
            ))}
          </ul>
          <p className="mt-1.5 text-xs text-ink-muted">
            Workspace kuruldu. Eksikleri Şirketler ekranındaki workspace kartından
            tamamlayabilirsin.
          </p>
        </div>
      )}
    </div>
  );
}

function Sayac({ etiket, deger }: { etiket: string; deger: number }) {
  return (
    <li className="rounded-lg border border-line px-3.5 py-2.5">
      <span className="block text-xl font-semibold tabular-nums text-ink">{deger}</span>
      <span className="block text-xs text-ink-muted">{etiket}</span>
    </li>
  );
}
