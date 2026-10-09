import Link from 'next/link';
import type { AsistanOturumu, OneriListesi, RuleRecord } from '@advetics/shared';
import { hasPermission, requireSession } from '@/lib/session';
import { serverApiFetch } from '@/lib/api';
import { sayfaWorkspaceId, workspaceSecimVerisi } from '@/lib/sayfa-workspace';
import { first, hataMetni } from '@/lib/sayfa-yardimcilari';
import { resolveRange } from '@/lib/date-range';
import { formatDayLong } from '@/lib/format';
import { baglanti } from '@/lib/baglanti';
import { SEKMELER, SEKME_ETIKETI, ozetSayilari, sekmeCoz } from '@/lib/iyilestir';
import { WorkspaceGerekli } from '@/components/workspace-gerekli';
import { Uyari } from '@/components/ui/uyari';
import { TarihSecici } from '@/components/tarih-secici';
import { OnerilerSekmesi, type OneriSonucu } from '@/components/iyilestir/oneriler-sekmesi';
import { AsistanSekmesi, type OturumSonucu } from '@/components/iyilestir/asistan-sekmesi';
import { KurallarIcerik, type KurallarSonucu } from '@/components/rules/kurallar-icerik';
import s from '@/components/taslak/taslak.module.css';
import i from '@/components/taslak/iyilestir.module.css';

export const metadata = { title: 'İyileştir · Advetics' };
export const dynamic = 'force-dynamic';

/** Öneri ekranının açılış aralığı (taslak: "Son 14 gün"). */
const IYILESTIR_ARALIGI = '14g';

/**
 * ═══ İYİLEŞTİR — ONAYLANAN TASLAĞIN BİREBİR HÂLİ (Aşama 4, 2026-10-09) ═══
 *
 * Taslak `docs/iyilestir/taslak.html`, sözleşme `@advetics/shared`
 * (`iyilestir`), mimari `docs/iyilestir/MIMARI.md`. Tek sayfa, üç sekme;
 * sekme ADRESTE (`?sekme=`): yer imi ve "geri" doğru sekmeye dönsün, kapsam
 * değişince de sekme korunsun (`kapsam-hedefi.ts` `sekme`yi taşıyor).
 *
 * KAPI `rule.read` (menü satırıyla AYNI anahtar): ayrışırlarsa menüde
 * görünüp açılmayan ya da menüde olmayıp adresle açılan bir sayfa olur.
 * Müşteri hesabı (`client_viewer`) bu yetkiyi taşımıyor. Uygula/Yoksay
 * ayrıca `budget.write` istiyor (kullanıcı kararı İ-7); yetkisi olmayan
 * kart neden uygulanamadığını yazıyor.
 *
 * İKİ ÇAĞRI HER SEKMEDE: öneriler ve kurallar sekme rozetlerini besliyor.
 * Rozet yalnız sayı GELDİYSE çiziliyor; düşen çağrının rozeti "0"
 * gösterseydi "öneri yok" yalanını sekme başlığında söylerdi.
 */
export default async function IyilestirPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireSession();
  const params = await searchParams;

  // SESSİZCE İLK WORKSPACE'E DÜŞÜLMÜYOR — gerekçe `lib/sayfa-workspace.ts`.
  const clientId = sayfaWorkspaceId(session, first(params.musteri));
  if (!clientId) {
    return (
      <WorkspaceGerekli
        ekran="İyileştir"
        neden="Öneriler, asistan ve kurallar bir workspace’in reklam hesaplarına bakıyor."
        {...workspaceSecimVerisi(session)}
      />
    );
  }

  if (!hasPermission(session, 'rule.read')) {
    return (
      <div className="space-y-5">
        <h1 className="sayfa-baslik">İyileştir</h1>
        <Uyari ton="uyari" baslik="Bu ekranı görme yetkin yok.">
          Yöneticine sor.
        </Uyari>
      </div>
    );
  }

  const sekme = sekmeCoz(first(params.sekme));
  const clientAdi = session.availableClients.find((c) => c.id === clientId)?.name ?? 'Workspace';
  const yazabilir = hasPermission(session, 'budget.write');

  const range = resolveRange({
    aralik: first(params.aralik) ?? IYILESTIR_ARALIGI,
    baslangic: first(params.baslangic),
    bitis: first(params.bitis),
    enEskiGun: null,
  });

  /*
   * TAŞINAN PARAMETRELER: workspace (adresle geldiyse) ve tarih. Sekme
   * bağlantıları ve kural geçmişi bağlantısı bunları düşürseydi, adresle
   * seçilmiş workspace sekme değişince üst bardakine dönerdi.
   */
  const tasinan = {
    musteri: first(params.musteri),
    aralik: first(params.aralik),
    baslangic: first(params.baslangic),
    bitis: first(params.bitis),
  };

  const oturumParam = first(params.oturum);
  const [oneriSonucu, kuralSonucu, oturumSonucu] = await Promise.all([
    serverApiFetch<OneriListesi>(
      `/iyilestir/oneriler?${new URLSearchParams({ clientId, from: range.from, to: range.to })}`,
    ).then(
      (liste): OneriSonucu => ({ durum: 'tamam', liste }),
      (e: unknown): OneriSonucu => ({ durum: 'hata', mesaj: hataMetni(e) }),
    ),
    serverApiFetch<RuleRecord[]>(`/rules?clientId=${clientId}`).then(
      (kurallar): KurallarSonucu => ({ durum: 'tamam', kurallar }),
      (e: unknown): KurallarSonucu => ({ durum: 'hata', mesaj: hataMetni(e) }),
    ),
    sekme === 'asistan' && oturumParam
      ? serverApiFetch<AsistanOturumu>(`/iyilestir/asistan/oturumlar/${encodeURIComponent(oturumParam)}`).then(
          /*
           * BAŞKA WORKSPACE'İN OTURUMU YENİ SOHBETE DÜŞÜYOR: adres eski bir
           * kapsamdan kalmış olabilir ve o sohbeti bu workspace'in ekranında
           * sürdürmek, asistana yanlış hesapların verisini sordurmak olurdu.
           */
          (oturum): OturumSonucu => (oturum.clientId === clientId ? { durum: 'tamam', oturum } : { durum: 'yok' }),
          (e: unknown): OturumSonucu => ({ durum: 'hata', mesaj: hataMetni(e) }),
        )
      : Promise.resolve<OturumSonucu>({ durum: 'yok' }),
  ]);

  const rozet: Record<(typeof SEKMELER)[number], number | null> = {
    oneriler: oneriSonucu.durum === 'tamam' ? ozetSayilari(oneriSonucu.liste).acik : null,
    asistan: null,
    kurallar: kuralSonucu.durum === 'tamam' ? kuralSonucu.kurallar.length : null,
  };

  const altSatir =
    sekme === 'oneriler'
      ? `${clientAdi} · ${range.label} · ${formatDayLong(range.from)} - ${formatDayLong(range.to)}`
      : sekme === 'kurallar'
        ? `${clientAdi} · otomatik kurallar saatte bir değerlendiriliyor`
        : `${clientAdi} · okur, önerir, onayınla uygular`;

  return (
    <div className={`${s.kok} ${i.sayfa}`}>
      <header className={s.ust}>
        <div>
          <h1>İyileştir</h1>
          <div className={s.altSatir}>{altSatir}</div>
        </div>
        {/* TARİH YALNIZ ÖNERİLERDE: asistan ve kurallar onu okumuyor ve
            çalışmayan bir seçici, olmayan bir süzgeç vaat ederdi. */}
        {sekme === 'oneriler' && (
          <div className={s.kontroller}>
            <TarihSecici aralik={range} enEskiGun={null} karsilastirmaVar={false} />
          </div>
        )}
      </header>

      <div>
        <nav className={i.seg} aria-label="İyileştir sekmeleri">
          {SEKMELER.map((k) => (
            <Link
              key={k}
              href={baglanti('/iyilestir', tasinan, { sekme: k })}
              aria-current={sekme === k ? 'page' : undefined}
              scroll={false}
            >
              {SEKME_ETIKETI[k]}
              {rozet[k] !== null && rozet[k]! > 0 && <span className={i.rozet}>{rozet[k]}</span>}
            </Link>
          ))}
        </nav>
      </div>

      <section key={sekme} className={i.sekme}>
        {sekme === 'oneriler' && <OnerilerSekmesi sonuc={oneriSonucu} yazabilir={yazabilir} />}
        {sekme === 'asistan' && (
          <AsistanSekmesi clientId={clientId} clientAdi={clientAdi} ilk={oturumSonucu} yazabilir={yazabilir} />
        )}
        {sekme === 'kurallar' && (
          <KurallarIcerik
            sonuc={kuralSonucu}
            clientId={clientId}
            clientAdi={clientAdi}
            canWrite={hasPermission(session, 'rule.write')}
            canActivate={hasPermission(session, 'rule.activate')}
            acikKural={first(params.kural)}
            adres={(kural) => baglanti('/iyilestir', tasinan, { sekme: 'kurallar', kural })}
          />
        )}
      </section>
    </div>
  );
}
