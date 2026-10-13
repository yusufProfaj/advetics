import { YORGUNLUK } from '@advetics/shared';
import type { AsistanOturumu, EtkiListesi, KreatifZekaYaniti, OneriListesi, RuleRecord, SinyalListesi } from '@advetics/shared';
import { hasPermission, requireSession } from '@/lib/session';
import { serverApiFetch } from '@/lib/api';
import { sayfaWorkspaceId, workspaceSecimVerisi } from '@/lib/sayfa-workspace';
import { first, hataMetni } from '@/lib/sayfa-yardimcilari';
import { formatDayLong } from '@/lib/format';
import { baglanti } from '@/lib/baglanti';
import { SEKMELER, SEKME_ETIKETI, ozetSayilari, sekmeCoz, type Sekme } from '@/lib/iyilestir';
import { sinyalListeYolu, type SinyalSonucu } from '@/lib/sinyal';
import { etkiListeYolu, type EtkiSonucu } from '@/lib/etki';
import { kreatifZekaYolu, rozetSayisi, type KreatifSonucu } from '@/lib/kreatif-zeka';
import { WorkspaceGerekli } from '@/components/workspace-gerekli';
import { SayfaBasligi } from '@/components/ui/sayfa-basligi';
import { SayfaIcDuzen, SayfaIcMenu } from '@/components/ui/sayfa-ic-menu';
import { Uyari } from '@/components/ui/uyari';
import { OnerilerSekmesi, type OneriSonucu } from '@/components/iyilestir/oneriler-sekmesi';
import { AsistanSekmesi, type OturumSonucu } from '@/components/iyilestir/asistan-sekmesi';
import { SinyallerSekmesi } from '@/components/iyilestir/sinyaller-sekmesi';
import { EtkiSekmesi } from '@/components/iyilestir/etki-sekmesi';
import { KreatiflerSekmesi } from '@/components/iyilestir/kreatifler-sekmesi';
import { KurallarIcerik, type HesapSonucu, type KurallarSonucu } from '@/components/rules/kurallar-icerik';
import { NewRuleButton } from '@/components/rules/rule-controls';

export const metadata = { title: 'İyileştir · Advetics' };
export const dynamic = 'force-dynamic';

/**
 * ÖNERİ PENCERESİ SABİT: son 7 gün, bugün hariç (sunucu `YORGUNLUK.pencereGun`
 * ile hesaplıyor ve `from/to` okumuyor). Burada bir tarih seçicisi vardı
 * ("Son 14 gün") ve hiçbir şeyi değiştirmiyordu: çalışmayan seçici olmayan
 * bir süzgeç vaat ediyordu (canlı denetim, 2026-10-09). Ekran pencereyi
 * yalnız YAZIYOR.
 */
function oneriPenceresi(): { from: string; to: string } {
  const gun = (fark: number) => {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - fark);
    return d.toISOString().slice(0, 10);
  };
  return { from: gun(YORGUNLUK.pencereGun), to: gun(1) };
}

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
        <SayfaBasligi bolum="İyileştir" baslik="İyileştir" />
        <Uyari ton="uyari" baslik="Bu ekranı görme yetkin yok.">
          Yöneticine sor.
        </Uyari>
      </div>
    );
  }

  const sekme = sekmeCoz(first(params.sekme));
  const clientAdi = session.availableClients.find((c) => c.id === clientId)?.name ?? 'Workspace';
  const yazabilir = hasPermission(session, 'budget.write');

  const range = oneriPenceresi();

  /*
   * TAŞINAN PARAMETRELER: workspace (adresle geldiyse) ve tarih. Sekme
   * bağlantıları ve kural geçmişi bağlantısı bunları düşürseydi, adresle
   * seçilmiş workspace sekme değişince üst bardakine dönerdi.
   */
  const tasinan = {
    musteri: first(params.musteri),
  };

  const oturumParam = first(params.oturum);
  const kuralYazabilir = hasPermission(session, 'rule.write');
  const [oneriSonucu, kuralSonucu, sinyalSonucu, oturumSonucu, etkiSonucu, kreatifSonucu, hesapSonucu] = await Promise.all([
    serverApiFetch<OneriListesi>(
      `/iyilestir/oneriler?${new URLSearchParams({ clientId })}`,
    ).then(
      (liste): OneriSonucu => ({ durum: 'tamam', liste }),
      (e: unknown): OneriSonucu => ({ durum: 'hata', mesaj: hataMetni(e) }),
    ),
    serverApiFetch<RuleRecord[]>(`/rules?clientId=${clientId}`).then(
      (kurallar): KurallarSonucu => ({ durum: 'tamam', kurallar }),
      (e: unknown): KurallarSonucu => ({ durum: 'hata', mesaj: hataMetni(e) }),
    ),
    /*
     * SİNYALLER DE HER SEKMEDE: rozet açık sinyal sayısını gösteriyor ve
     * Sinyaller sekmesinin ilk listesi AYNI yanıt (iki çağrı iki sayı
     * söyleyebilirdi). Düşerse rozet çizilmiyor; "0" yalanı yok.
     */
    serverApiFetch<SinyalListesi>(sinyalListeYolu({ clientId, gorunum: 'acik', tur: null, platform: null, sayfa: 1 })).then(
      (liste): SinyalSonucu => ({ durum: 'tamam', liste }),
      (e: unknown): SinyalSonucu => ({ durum: 'hata', mesaj: hataMetni(e) }),
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
    /*
     * ETKİ (Paket C) iki sekmede: Etkisi sekmesinin ilk listesi ve Öneriler
     * sekmesinde uygulanmış kartların altındaki tek satır. Öneriler'de
     * yalnız İyileştir yolundan gelenler istenir; kart satırı öneri
     * anahtarıyla eşleniyor (kart başına ayrı istek yok). Düşerse kartın
     * altı sunucunun cümlesini yazar, "ölçülmedi" demez.
     */
    sekme === 'etki' || sekme === 'oneriler'
      ? serverApiFetch<EtkiListesi>(
          etkiListeYolu({ clientId, durum: 'hepsi', yol: sekme === 'oneriler' ? 'iyilestir' : undefined, sayfa: 1 }),
        ).then(
          (liste): EtkiSonucu => ({ durum: 'tamam', liste }),
          (e: unknown): EtkiSonucu => ({ durum: 'hata', mesaj: hataMetni(e) }),
        )
      : Promise.resolve<EtkiSonucu | null>(null),
    /*
     * KREATİFLER (Paket D) HER SEKMEDE: rozet "Dikkat" kovasındaki yeni
     * kreatif sayısı ve Kreatifler sekmesinin ilk yanıtı AYNI çağrı (iki
     * çağrı iki sayı söyleyebilirdi). Düşerse rozet çizilmiyor; "0" yalanı yok.
     */
    serverApiFetch<KreatifZekaYaniti>(kreatifZekaYolu({ clientId, kume: null, gorunum: 'yeni', kova: null, sayfa: 1 })).then(
      (yanit): KreatifSonucu => ({ durum: 'tamam', yanit }),
      (e: unknown): KreatifSonucu => ({ durum: 'hata', mesaj: hataMetni(e) }),
    ),
    /*
     * REKLAM HESAPLARI SAYFADA OKUNUYOR, KURAL SEKMESİNDE DEĞİL: "Yeni kural"
     * artık her sekmede başlığın sağında ve kural düzenleyicinin hesap
     * seçicisi bu listeyi istiyor. Tek çağrı iki yere veriliyor (başlık ve
     * Kurallar sekmesi); iki çağrı iki farklı liste gösterebilirdi.
     * HATA YUTULMUYOR: eski kod `.catch(() => [])` diyordu ve düşen çağrı
     * "hiç hesap yok" gibi görünüp kuralı sessizce bütün hesaplara
     * kurduruyordu. Yazma yetkisi yoksa hiç sorulmuyor.
     */
    kuralYazabilir
      ? serverApiFetch<Array<{ adAccounts: Array<{ id: string; name: string }> }>>(`/connections?clientId=${clientId}`).then(
          (baglantilar): HesapSonucu => ({ durum: 'tamam', liste: baglantilar.flatMap((c) => c.adAccounts ?? []) }),
          (e: unknown): HesapSonucu => ({ durum: 'hata', mesaj: hataMetni(e) }),
        )
      : Promise.resolve<HesapSonucu>({ durum: 'tamam', liste: [] }),
  ]);

  const rozet: Record<(typeof SEKMELER)[number], number | null> = {
    oneriler: oneriSonucu.durum === 'tamam' ? ozetSayilari(oneriSonucu.liste).acik : null,
    sinyaller: sinyalSonucu.durum === 'tamam' ? sinyalSonucu.liste.sayilar.acik : null,
    kreatifler: rozetSayisi(kreatifSonucu),
    // Rozet yok: etki bir "yapılacak iş" değil, sonuç listesi. Sayı koymak
    // kullanıcıyı açılacak bir şey varmış gibi çağırırdı.
    etki: null,
    asistan: null,
    kurallar: kuralSonucu.durum === 'tamam' ? kuralSonucu.kurallar.length : null,
  };

  const altSatir =
    sekme === 'oneriler'
      ? `${clientAdi} · Son 7 gün · ${formatDayLong(range.from)} - ${formatDayLong(range.to)}`
      : sekme === 'sinyaller'
        ? `${clientAdi} · her gece, dünün verisi beklenen aralıkla karşılaştırılıyor`
        : sekme === 'kreatifler'
          ? `${clientAdi} · son 90 gün · aynı amaçtaki kreatifler birbiriyle karşılaştırılıyor`
        : sekme === 'etki'
          ? `${clientAdi} · Advetics’ten yapılan durdurma ve bütçe değişiklikleri, değişmeyenlerle kıyaslanarak`
        : sekme === 'kurallar'
        ? `${clientAdi} · otomatik kurallar saatte bir değerlendiriliyor`
        : `${clientAdi} · okur, önerir, onayınla uygular`;

  /*
   * BÖLÜMLER SAYFA İÇİ YAN MENÜDE (kullanıcı kararı 2026-10-14, BILESENLER
   * § 9). SIRA taslaktan: Kurallar ikinci (menüden en çok gelinen yer).
   * `SEKMELER` (lib) adres çözümünün listesi; görünür sıra burada, çünkü
   * sıra bir görünüş kararı ve adres çözümünü değiştirmemeli.
   */
  const SIRA: readonly Sekme[] = ['oneriler', 'kurallar', 'sinyaller', 'etki', 'kreatifler', 'asistan'];

  return (
    <div className="grid gap-6">
      <SayfaBasligi
        bolum="İyileştir"
        baslik="İyileştir"
        aciklama={altSatir}
        eylemler={
          /*
           * TEK BİRİNCİL HER SEKMEDE AYNI YERDE: "Yeni kural". Eskiden düğme
           * yalnız Kurallar sekmesinin kartındaydı ve öneriden kural kurmak
           * isteyen kullanıcı önce sekme değiştirmek zorundaydı.
           */
          <NewRuleButton
            clientId={clientId}
            accounts={hesapSonucu.durum === 'tamam' ? hesapSonucu.liste : []}
            hesapHatasi={hesapSonucu.durum === 'hata' ? hesapSonucu.mesaj : null}
            etiket="Yeni kural"
            kapaliNedeni={kuralYazabilir ? undefined : 'Kural yazma yetkin yok.'}
          />
        }
      />

      <SayfaIcDuzen
        menu={
          <SayfaIcMenu
            etiket="İyileştir bölümleri"
            secili={sekme}
            ogeler={SIRA.map((k) => ({
              deger: k,
              etiket: SEKME_ETIKETI[k],
              href: baglanti('/iyilestir', tasinan, { sekme: k }),
              // Rozet yalnız sayı GELDİYSE: düşen çağrının "0"ı yalan olurdu.
              sayi: rozet[k] !== null && rozet[k]! > 0 ? rozet[k]! : undefined,
            }))}
          />
        }
      >
        <section key={sekme} className="bolum-gecis grid min-w-0 content-start gap-5">
          {sekme === 'oneriler' && <OnerilerSekmesi sonuc={oneriSonucu} yazabilir={yazabilir} etki={etkiSonucu} />}
          {sekme === 'etki' && etkiSonucu && <EtkiSekmesi clientId={clientId} ilk={etkiSonucu} />}
          {sekme === 'kreatifler' && (
            <KreatiflerSekmesi
              clientId={clientId}
              ilk={kreatifSonucu}
              yetki={{ yaz: hasPermission(session, 'rule.write'), aktar: hasPermission(session, 'bulk.write') }}
            />
          )}
          {sekme === 'sinyaller' && (
            <SinyallerSekmesi
              clientId={clientId}
              ilk={sinyalSonucu}
              yetki={{ butce: yazabilir, kural: hasPermission(session, 'rule.write') }}
            />
          )}
          {sekme === 'asistan' && (
            <AsistanSekmesi clientId={clientId} clientAdi={clientAdi} ilk={oturumSonucu} yazabilir={yazabilir} />
          )}
          {sekme === 'kurallar' && (
            <KurallarIcerik
              sonuc={kuralSonucu}
              hesaplar={hesapSonucu}
              clientId={clientId}
              clientAdi={clientAdi}
              canWrite={kuralYazabilir}
              canActivate={hasPermission(session, 'rule.activate')}
              acikKural={first(params.kural)}
              adres={(kural) => baglanti('/iyilestir', tasinan, { sekme: 'kurallar', kural })}
            />
          )}
        </section>
      </SayfaIcDuzen>
    </div>
  );
}
