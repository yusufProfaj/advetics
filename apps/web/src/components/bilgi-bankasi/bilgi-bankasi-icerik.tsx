'use client';

import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { useTransition } from 'react';
import type { Permission } from '@advetics/shared';
import { Halka } from '@/components/yukleniyor';
import { ButceSekmesi } from './butce-sekmesi';
import { MetinSekmesi } from './metin-sekmesi';
import { LogoSekmesi } from './logo-sekmesi';
import { gorunurSekmeler, type SekmeKodu } from './sekmeler';

/**
 * Bilgi Bankası — sekme çubuğu + içerik anahtarlama.
 *
 * `rapor-sekmeleri.tsx` İLE AYNI DESEN: seçim URL'de, diğer parametreler
 * (`?musteri=`) korunuyor — elle birleştirmek "CLAUDE.md: BAĞLANTIYI ELLE
 * BİRLEŞTİRME" hatasını tekrar ederdi.
 *
 * TÜMÜ İSTEMCİ TARAFI: `raporlar` sayfasının aksine hiçbir sekme sunucuda
 * önceden çekilen veriye ihtiyaç duymuyor (hepsi küçük, kullanıcı düzenlediği
 * alanlar) — sunucu bileşeninde sekmeye göre dallanmak burada gereksiz
 * karmaşıklık olurdu.
 *
 * YETKİ SUNUCUDAN GELİYOR: `izinler` oturumdan okunup süzülmüş hâlde
 * geçiriliyor (bkz. `sekmeler.ts`). Bileşen kendi başına yetki hesaplamıyor —
 * hesaplasaydı ikinci bir kaynak doğardı.
 */
export function BilgiBankasiIcerik({
  clientId,
  izinler,
}: {
  clientId: string;
  izinler: readonly Permission[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const sekmeler = gorunurSekmeler(izinler);
  const varsayilan = sekmeler[0];

  /*
   * URL'DEKİ SEKME GÖRÜNÜR DEĞİLSE İLK GÖRÜNÜR SEKMEYE DÜŞÜLÜYOR.
   *
   * Yetkisi olmayan birine `?sekme=logo` bağlantısı gönderilebiliyor (ekip
   * içinde bağlantı paylaşmak sıradan). Süzgeçsiz bir `find` o sekmeyi
   * açar ve kullanıcı arka uçtan gelen 403'ü kırmızı bir kutu olarak görür.
   */
  const istenen = searchParams?.get('sekme');
  const aktif: SekmeKodu | undefined =
    sekmeler.find((s) => s.kod === istenen)?.kod ?? varsayilan?.kod;

  function sec(kod: SekmeKodu): void {
    if (kod === aktif) return;
    const p = new URLSearchParams(searchParams?.toString() ?? '');
    /*
     * VARSAYILAN SEKME URL'DEN SİLİNİYOR — `rapor-sekmeleri.tsx` ile aynı
     * gerekçe. "Varsayılan" sabit bir kod DEĞİL, bu kullanıcının İLK GÖRÜNÜR
     * sekmesi: sabit yazsaydık, o sekmeyi göremeyen kullanıcının URL'si
     * hiçbir zaman temizlenmezdi.
     */
    if (kod === varsayilan?.kod) p.delete('sekme');
    else p.set('sekme', kod);
    const dize = p.toString();
    startTransition(() => router.replace(dize ? `${pathname}?${dize}` : pathname));
  }

  /*
   * SEKME YOKSA SEBEBİ YAZILIYOR. Sayfa zaten `SAYFA_GIRIS_IZNI` ile
   * korunuyor, yani buraya normalde düşülmüyor — ama override ile yetkisi
   * daraltılmış bir kullanıcıda düşülebilir ve boş bir sekme çubuğu
   * "yetkin yok" ile "yükleniyor"u aynı boşluğa çevirirdi.
   */
  if (!aktif || !varsayilan) {
    return (
      <div className="rounded-xl border border-dashed border-line bg-surface p-8 text-center">
        <p className="text-sm font-semibold text-ink">Görüntüleyebileceğin bölüm yok</p>
        <p className="mx-auto mt-2 max-w-lg text-xs text-ink-muted">
          Bilgi Bankası bölümleri ayrı yetkiler istiyor: profil bölümleri için
          müşteri okuma, Bütçe için bütçe okuma, Logo için varlık okuma
          yetkisi. Hiçbiri hesabında tanımlı değil — yöneticine sor.
        </p>
      </div>
    );
  }

  const yazabilir = (kod: SekmeKodu): boolean => {
    const s = sekmeler.find((x) => x.kod === kod);
    return s ? izinler.includes(s.yaz) : false;
  };

  return (
    <div className="space-y-4">
      <div role="tablist" className="flex flex-wrap items-center gap-1 border-b border-line">
        {sekmeler.map((s) => (
          <button
            key={s.kod}
            type="button"
            role="tab"
            aria-selected={s.kod === aktif}
            onClick={() => sec(s.kod)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium transition ${
              s.kod === aktif
                ? 'border-brand text-ink'
                : 'border-transparent text-ink-muted hover:text-ink'
            }`}
          >
            {s.ad}
          </button>
        ))}
        {isPending && <Halka className="ml-1 h-3.5 w-3.5" />}
      </div>

      {aktif === 'bilgi-bankasi' && (
        /*
         * ÜÇÜNCÜ `MetinSekmesi` KULLANIMI — ikinci bir form yazılmadı.
         * Metin, MÜŞTERİYE AİT genel bilgi: ajans içi not değil, kampanya
         * üretirken ve AI asistanında bağlam olarak okunacak bilgi.
         */
        <MetinSekmesi
          clientId={clientId}
          canWrite={yazabilir('bilgi-bankasi')}
          alan="bilgiBankasi"
          baslik="Bilgi Bankası"
          aciklama="Müşterinin genel bilgileri: ne satıyor, hangi hizmetleri veriyor, sık sorulan sorular. Reklam metni ve AI üretimi bu metni bağlam olarak okuyor."
          placeholder="Örn. 20 yıllık emlak ofisiyiz. Konut satışı ve kiralama yapıyoruz; İzmir Bornova ve Karşıyaka'da ofisimiz var. En çok sorulan: komisyon oranı %2 + KDV."
        />
      )}
      {aktif === 'butce' && <ButceSekmesi clientId={clientId} canWrite={yazabilir('butce')} />}
      {aktif === 'hedef-kitle' && (
        <MetinSekmesi
          clientId={clientId}
          canWrite={yazabilir('hedef-kitle')}
          alan="hedefKitle"
          baslik="Hedef Kitle"
          aciklama="Kime satıyoruz? Düz dilde yaz — yaş/cinsiyet/lokasyon gibi teknik hedefleme burada değil, Akıllı Boost ön ayarında."
          placeholder="Örn. İzmir ve çevresinde, 25-45 yaş arası, ev almayı düşünen aileler."
        />
      )}
      {aktif === 'marka' && (
        <MetinSekmesi
          clientId={clientId}
          canWrite={yazabilir('marka')}
          alan="markaBilgileri"
          baslik="Marka Bilgileri / Öncelikleri"
          aciklama="Marka sesi, öne çıkarılması gereken değerler, kaçınılması gereken ifadeler."
          placeholder="Örn. Güven veren, sade bir dil kullan. 'En ucuz' gibi ifadelerden kaçın — marka konumu premium."
        />
      )}
      {aktif === 'logo' && <LogoSekmesi clientId={clientId} canWrite={yazabilir('logo')} />}
    </div>
  );
}
