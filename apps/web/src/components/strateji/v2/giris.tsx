import Link from 'next/link';
import { stratejiPanelAdresi, type PlanDurumu, type StratejiDurumu, type StratejiListeSatiri, type StratejiOlusturmaAdimi } from '@advetics/shared';
import { DURUM_ETIKETI, donemEtiketi } from '../hesap';
import { durumTonu, olusturKarti } from './akis';
import { BUYUK_KART_SINIFI, BuyukKart } from './akis-cerceve';
import { STRATEJI_DURUM_ETIKETI, donemMetni } from './hesap';
import { Nokta, Rozet } from './ortak';
import { Tutar } from './tutar';

/** Liste satırının adı: v2 dönemi, v1 ayı + "eski medya planı" (salt okunur). */
export function planSatiriAdi(p: StratejiListeSatiri): string {
  if (p.bicim === 1) return `${p.donem ? donemEtiketi(p.donem) : 'Tarihsiz'} · eski medya planı`;
  return p.baslangic && p.bitis ? donemMetni(p.baslangic, p.bitis) : 'Tarihsiz';
}

export function planDurumMetni(p: StratejiListeSatiri): string {
  return p.bicim === 1 ? (DURUM_ETIKETI[p.durum as PlanDurumu]?.metin ?? p.durum) : (STRATEJI_DURUM_ETIKETI[p.durum as StratejiDurumu] ?? p.durum);
}

/**
 * ═══ GİRİŞ: İKİ BÜYÜK KART (taslak `simulasyon.html`) ═══
 *
 * "Raporu incele" (altta son stratejinin durumu) ve "Strateji oluştur"
 * (altta süre tahmini). Açık taslak varsa ikinci kart "Taslağa devam et"
 * olur ve kaldığı adımı açar; onay bekleyen varsa yeni oluşturulamayacağı
 * (workspace başına tek açık strateji) kartta yazar ve rapora götürür.
 * Sunucu bileşeni: istek atmaz, yalnız bağlantı.
 */
export function StratejiGirisi({ clientId, planlar, devamAdimi }: { clientId: string; planlar: StratejiListeSatiri[]; devamAdimi: StratejiOlusturmaAdimi | null }) {
  const son = planlar[0] ?? null;
  const kart = olusturKarti(planlar);
  const olusturAdresi =
    kart.tur === 'yeni'
      ? stratejiPanelAdresi({ musteri: clientId, adim: 'hedef' })
      : kart.tur === 'devam'
        ? stratejiPanelAdresi({ musteri: clientId, plan: kart.planId, adim: kart.revizyon ? 'plan' : (devamAdimi ?? 'plan') })
        : stratejiPanelAdresi({ musteri: clientId, plan: kart.planId, adim: 'rapor' });
  return (
    <div className="space-y-6">
      <div>
        <span className="text-xs font-bold uppercase tracking-[0.08em] text-brand-strong">AdvStrategy</span>
        <h2 className="font-baslik m-0 mt-1.5 text-2xl font-extrabold tracking-tight text-ink sm:text-[30px]">Bugün ne yapmak istiyorsun?</h2>
        <p className="m-0 mt-2 max-w-[62ch] text-sm leading-relaxed text-ink-muted">Strateji, reklamlarının neden ve nasıl kurulacağını anlatan plan. Ya hazır olanı incele ya da birlikte yenisini oluşturalım.</p>
      </div>
      <div className="grid gap-[18px] md:grid-cols-2">
        <Link href={stratejiPanelAdresi({ musteri: clientId, adim: 'raporlar' })} className={BUYUK_KART_SINIFI}>
          <BuyukKart
            ikon="rapor"
            baslik="Raporu incele"
            aciklama="Hazırlanan stratejiyi oku, onayla ya da değişiklik iste. Onaylanan planın kampanyalarını burada kurarsın."
            altSol={
              son ? (
                <span className="inline-flex items-center gap-1.5">
                  <Nokta ton={durumTonu(son.durum)} />
                  {planSatiriAdi(son)} · {planDurumMetni(son)}
                </span>
              ) : (
                'Henüz strateji yok'
              )
            }
            altSag="Aç →"
          />
        </Link>
        <Link href={olusturAdresi} className={BUYUK_KART_SINIFI}>
          <BuyukKart
            ikon="yeni"
            kirmizi
            baslik={kart.tur === 'devam' ? 'Taslağa devam et' : 'Strateji oluştur'}
            aciklama={
              kart.tur === 'onayda'
                ? 'Açık bir strateji onay bekliyor. Yenisi için önce onu raporundan geri çek ya da sonuçlanmasını bekle.'
                : kart.tur === 'devam'
                  ? kart.revizyon
                    ? 'Müşteri değişiklik istedi. Planı düzeltip yeniden gönder.'
                    : 'Yarım kalan strateji kaldığın adımdan açılır.'
                  : 'Yedi kısa soru. Hesabının geçmişine bakıp sana bir plan önereceğiz; her kampanyayı tek tek onaylayarak ilerlersin.'
            }
            altSol={kart.tur === 'yeni' ? 'Yaklaşık 5 dakika' : kart.tur === 'devam' ? <Rozet ton="kirmizi">{kart.revizyon ? 'Revizyon istendi' : 'Taslak'}</Rozet> : <Rozet ton="kirmizi">Onay bekliyor</Rozet>}
            altSag={kart.tur === 'onayda' ? 'Raporu aç →' : kart.tur === 'devam' ? 'Devam →' : 'Başla →'}
          />
        </Link>
      </div>
    </div>
  );
}

/**
 * ═══ STRATEJİLER LİSTESİ ═══ durum rozetleriyle; satır rapora açılır.
 * Sessiz kesme yok: sunucu listeyi keserse "N / toplam" yazar. Eski aylık
 * medya planları (v1) aynı listede, salt okunur açılır.
 */
export function StratejiListesiEkrani({ clientId, planlar, toplam, workspaceAdi }: { clientId: string; planlar: StratejiListeSatiri[]; toplam: number; workspaceAdi: string | null }) {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="font-baslik m-0 text-2xl font-extrabold tracking-tight text-ink sm:text-[30px]">Stratejiler</h2>
        <p className="m-0 mt-1.5 text-sm text-ink-muted">
          {workspaceAdi ? `${workspaceAdi} · ` : ''}
          {planlar.length < toplam ? `${planlar.length} / ${toplam} gösteriliyor` : `${toplam} strateji`}. Bir rapora tıkla.
        </p>
      </div>
      {planlar.length === 0 ? (
        // BOŞ LİSTE NEDENİNİ SÖYLÜYOR: okuyan hesabın yapacağı iş beklemek.
        <p className="rounded-xl border border-dashed border-line bg-surface p-5 text-center text-sm text-ink-muted">Bu workspace için henüz strateji yok. Ajans hazırlayınca burada görünür.</p>
      ) : (
        <ul className="m-0 grid list-none gap-3 p-0">
          {planlar.map((p) => (
            <li key={p.id}>
              <Link
                href={stratejiPanelAdresi({ musteri: clientId, plan: p.id, adim: 'rapor' })}
                className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 rounded-xl border border-line bg-surface px-[18px] py-4 text-ink no-underline motion-safe:transition-colors hover:border-ink/25 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand sm:grid-cols-[minmax(0,1fr)_auto_auto]"
              >
                <span className="min-w-0">
                  <b className="font-baslik block">{planSatiriAdi(p)}</b>
                  <small className="block text-[13px] text-ink-muted">
                    {p.kalemSayisi} kampanya · <Tutar micros={p.toplamButceMicros} para={p.paraBirimi} /> · sürüm {p.surum}
                  </small>
                </span>
                <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-line px-2.5 py-0.5 text-xs font-bold">
                  <Nokta ton={durumTonu(p.durum)} />
                  {planDurumMetni(p)}
                </span>
                <span className="hidden font-bold sm:inline">Aç →</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
