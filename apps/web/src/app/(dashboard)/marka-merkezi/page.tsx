import Link from 'next/link';
import type { ClientChannels, WorkspaceHazirlik } from '@advetics/shared';
import { ApiRequestError, serverApiFetch } from '@/lib/api';
import { hasPermission, requireSession } from '@/lib/session';
import { sayfaWorkspaceId, workspaceSecimVerisi } from '@/lib/sayfa-workspace';
import { baglanti } from '@/lib/baglanti';
import { WorkspaceGerekli } from '@/components/workspace-gerekli';
import { SayfaBasligi } from '@/components/ui/sayfa-basligi';
import { Uyari } from '@/components/ui/uyari';
import { HazirlikListesi } from '@/components/marka-merkezi/hazirlik-listesi';
import { BagliKanallar } from '@/components/tenancy/bagli-kanallar';
import { KitlelerBolumu } from '@/components/marka-merkezi/kitleler-bolumu';
import { IcMenu, type BolumRozetleri } from '@/components/marka-merkezi/ic-menu';
import {
  MM_BOLUMLERI,
  MM_VARLIKLARI,
  bolumCoz,
  mmAdresi,
  varlikCoz,
} from '@/components/marka-merkezi/bolumler';
import { GorsellerIcerik } from '@/components/marka-merkezi/varliklar/gorseller';
import { KreatiflerIcerik } from '@/components/marka-merkezi/varliklar/kreatifler';
import { FormlarIcerik } from '@/components/marka-merkezi/varliklar/formlar';
import { ButceIcerik } from '@/components/marka-merkezi/butce';
import { AiDoldur } from '@/components/bilgi-bankasi/ai-doldur';
import { MarkaSekmesi } from '@/components/bilgi-bankasi/marka-sekmesi';
import { MetinSekmesi } from '@/components/bilgi-bankasi/metin-sekmesi';
import { LogoSekmesi } from '@/components/bilgi-bankasi/logo-sekmesi';

export const metadata = { title: 'Marka Merkezi · Advetics' };
export const dynamic = 'force-dynamic';

/**
 * ═══ MARKA MERKEZİ — BASE'İN TEK KAPISI, KENDİ İÇ MENÜSÜYLE ═══
 *
 * Bir workspace'in kurulumu dört adrese dağılmıştı (bkz. `bolumler.ts`) ve
 * kullanıcı "nereye nereden girdiğimi unutuyorum" dedi. Sayfa artık:
 *
 *   · üstte kırıntı (Base › Marka Merkezi › bölüm) ve hazırlık şeridi,
 *   · solda iç menü: Bağlantılar · Marka · Kitleler · Varlıklar,
 *   · sağda YALNIZCA seçili bölüm.
 *
 * Tek bölüm çiziliyor, dördü birden değil: eski sayfa dördünü alt alta
 * diziyordu ve Varlıklar'a ulaşmak üç ekran kaydırmaktı. Seçim adreste,
 * yani geri tuşu ve paylaşılan bağlantı çalışıyor.
 *
 * Bölümlerin içeriği DEĞİŞMEDİ, yalnızca yeri: Marka bölümü eski Bilgi
 * Bankası'nın sekmeleri, Varlıklar eski üç sayfanın gövdesi. Bileşenlerin
 * yeniden düzeni sonraki aşamalarda.
 */
export default async function MarkaMerkeziPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireSession();
  const params = await searchParams;

  const clientId = sayfaWorkspaceId(session, first(params.musteri));
  if (!clientId) {
    return (
      <WorkspaceGerekli
        ekran="Marka Merkezi"
        neden="Marka Merkezi bir workspace’in hesaplarını, bilgilerini ve kurulum durumunu gösteriyor."
        {...workspaceSecimVerisi(session)}
      />
    );
  }

  const bolum = bolumCoz(first(params.bolum), session.permissions);
  const varlik = varlikCoz(first(params.varlik));

  const [hazirlik, kanallar] = await Promise.all([
    serverApiFetch<WorkspaceHazirlik>(`/clients/${clientId}/hazirlik`).then(
      (v) => ({ ok: true as const, v }),
      (e: unknown) => ({ ok: false as const, hata: hataMetni(e) }),
    ),
    serverApiFetch<ClientChannels>(`/clients/${clientId}/channels`).then(
      (v) => ({ ok: true as const, v }),
      (e: unknown) => ({ ok: false as const, hata: hataMetni(e) }),
    ),
  ]);

  const ad = hazirlik.ok ? hazirlik.v.clientName : kanallar.ok ? kanallar.v.clientName : null;
  const yaz = (izin: Parameters<typeof hasPermission>[1]) => hasPermission(session, izin);

  /*
   * ROZETLER VERİDEN. "Marka 2 eksik" demek için hazırlık listesinin marka
   * ve logo maddelerine, "5 bağlı" için bağlantı gruplarına bakılıyor —
   * ikinci bir sayaç yazılmıyor, aynı veri iki yerde ayrışmasın.
   */
  const rozetler: BolumRozetleri = {};
  if (kanallar.ok) {
    const bagli = kanallar.v.groups.reduce((t, g) => t + g.connected.length, 0);
    rozetler.baglantilar = bagli > 0 ? { metin: `${bagli} bağlı`, ton: 'tamam' } : { metin: 'Bağlı değil', ton: 'eksik' };
  }
  if (hazirlik.ok) {
    const eksik = hazirlik.v.maddeler.filter(
      (m) => (m.kod === 'marka_bilgisi' || m.kod === 'logo') && m.durum === 'eksik',
    ).length;
    rozetler.marka = eksik > 0 ? { metin: `${eksik} eksik`, ton: 'eksik' } : { metin: 'Tamam', ton: 'tamam' };
  }

  const bolumAdi = MM_BOLUMLERI.find((b) => b.kod === bolum)?.ad ?? '';
  const varlikAdi = MM_VARLIKLARI.find((v) => v.kod === varlik)?.ad ?? '';

  return (
    <div className="space-y-5">
      <div>
        {/* KIRINTI: "neredeyim" sorusunun cevabı sayfanın adından önce. */}
        <nav aria-label="Konum" className="mb-1.5 flex flex-wrap items-center gap-1.5 text-sm text-ink-muted">
          <span>Base</span>
          <span aria-hidden="true">›</span>
          <Link href={mmAdresi(clientId, bolum ?? 'marka')} className="hover:text-ink">
            Marka Merkezi
          </Link>
          {bolum && (
            <>
              <span aria-hidden="true">›</span>
              <span className={bolum === 'varliklar' ? '' : 'font-semibold text-ink'}>{bolumAdi}</span>
            </>
          )}
          {bolum === 'varliklar' && (
            <>
              <span aria-hidden="true">›</span>
              <span className="font-semibold text-ink">{varlikAdi}</span>
            </>
          )}
        </nav>
        <SayfaBasligi
          baslik="Marka Merkezi"
          aciklama={
            <>
              {ad && <strong className="font-medium text-ink">{ad}</strong>}
              {ad && ' · '}
              Reklamların, raporların ve AI asistanın okuduğu her şey tek yerde.
            </>
          }
        />
      </div>

      {hazirlik.ok ? (
        <HazirlikListesi veri={hazirlik.v} />
      ) : (
        <Uyari ton="tehlike" baslik="Kurulum durumu alınamadı.">
          {hazirlik.hata}
        </Uyari>
      )}

      {bolum === null ? (
        <Uyari ton="uyari" baslik="Görebileceğin bir bölüm yok.">
          Marka Merkezi’nin bölümleri yetkinin dışında. Yöneticine sor.
        </Uyari>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[15rem_minmax(0,1fr)]">
          <IcMenu
            clientId={clientId}
            aktif={bolum}
            varlik={varlik}
            izinler={session.permissions}
            rozetler={rozetler}
          />

          {/* `key` BÖLÜMDEN: aynı bileşen ağacı korunursa geçiş animasyonu bir
              daha oynamaz ve içerik değiştiği hissedilmez. */}
          <div key={`${bolum}-${varlik}`} className="bolum-gecis min-w-0 space-y-4">
            {bolum === 'baglantilar' && (
              <section aria-labelledby="baglantilar-baslik" className="space-y-3">
                <BolumBasligi
                  id="baglantilar-baslik"
                  baslik="Bağlantılar"
                  aciklama="Bu workspace’in reklam hesapları, sayfaları ve kanalları. Eklediğin an izleme açılır ve son 90 günün verisi çekilmeye başlar."
                />
                {!kanallar.ok ? (
                  <Uyari ton="tehlike" baslik="Bağlantılar alınamadı.">
                    {kanallar.hata}
                  </Uyari>
                ) : yaz('connection.write') ? (
                  <BagliKanallar data={kanallar.v} ajansUyesi={session.managerAccount !== null} />
                ) : (
                  <SaltOkunurKanallar data={kanallar.v} />
                )}
              </section>
            )}

            {bolum === 'marka' && (
              <section aria-labelledby="marka-baslik" className="space-y-4">
                <BolumBasligi
                  id="marka-baslik"
                  baslik="Marka"
                  aciklama="Reklam Oluştur ve AI asistan bu alanları okur. Doldurduğun bilgi bir daha sorulmaz."
                />
                {/* DOLDUR KARTLARIN ÜSTÜNDE: taslak dört kartı birden dolduruyor. */}
                <AiDoldur clientId={clientId} canWrite={yaz('client.write')} />
                <Kart id="marka-bilgileri">
                  <MarkaSekmesi clientId={clientId} canWrite={yaz('client.write')} />
                </Kart>
                <Kart id="bilgi">
                  {/*
                    ESKİ BİLGİ BANKASI'NIN İKİ METNİ. "Hedef Kitle" adı Kitleler
                    bölümündeki hedefleme şablonlarıyla karışıyordu; aynı kolon,
                    yeni ad: "Kime satıyoruz".
                  */}
                  <div className="grid gap-6 xl:grid-cols-2">
                    <MetinSekmesi
                      clientId={clientId}
                      canWrite={yaz('client.write')}
                      alan="bilgiBankasi"
                      baslik="Markayı anlat"
                      aciklama="Ne satıyor, hangi hizmetleri veriyor, sık sorulan sorular. Reklam metni ve AI bu metni bağlam olarak okuyor."
                      placeholder="Örn. 20 yıllık emlak ofisiyiz. Konut satışı ve kiralama yapıyoruz; İzmir Bornova ve Karşıyaka'da ofisimiz var."
                    />
                    <MetinSekmesi
                      clientId={clientId}
                      canWrite={yaz('client.write')}
                      alan="hedefKitle"
                      baslik="Kime satıyoruz"
                      aciklama="Düz dille. Konum, yaş ve ilgi gibi teknik hedefleme Kitleler bölümünde."
                      placeholder="Örn. İzmir ve çevresinde, 25-45 yaş arası, ev almayı düşünen aileler."
                    />
                  </div>
                </Kart>
                {yaz('bulk.read') && (
                  <Kart id="logo">
                    <LogoSekmesi clientId={clientId} canWrite={yaz('bulk.write')} />
                  </Kart>
                )}
              </section>
            )}

            {bolum === 'butce' && <ButceIcerik clientId={clientId} params={params} />}

            {bolum === 'kitleler' && (
              <KitlelerBolumu clientId={clientId} yazabilir={yaz('client.write')} />
            )}

            {bolum === 'varliklar' && (
              <section aria-labelledby="varliklar-baslik" className="space-y-4">
                <BolumBasligi
                  id="varliklar-baslik"
                  baslik={`Varlıklar · ${varlikAdi}`}
                  aciklama="Reklamlarda kullanılan görseller, kreatifler ve formlar."
                />
                {/* Dar ekranda alt menü gizli (iç menüde yer yok); alt başlıklar burada. */}
                <nav aria-label="Varlık türü" className="flex flex-wrap gap-1.5 lg:hidden">
                  {MM_VARLIKLARI.map((v) => (
                    <Link
                      key={v.kod}
                      href={mmAdresi(clientId, 'varliklar', { varlik: v.kod })}
                      aria-current={v.kod === varlik ? 'page' : undefined}
                      className={`rounded-full px-3 py-1.5 text-sm ${
                        v.kod === varlik ? 'bg-ink text-surface' : 'border border-line bg-surface text-ink'
                      }`}
                    >
                      {v.ad}
                    </Link>
                  ))}
                </nav>
                {varlik === 'gorseller' && <GorsellerIcerik clientId={clientId} params={params} />}
                {varlik === 'kreatifler' && <KreatiflerIcerik clientId={clientId} params={params} />}
                {varlik === 'formlar' && <FormlarIcerik clientId={clientId} params={params} />}
              </section>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function BolumBasligi({ id, baslik, aciklama }: { id: string; baslik: string; aciklama: string }) {
  return (
    <div>
      <h2 id={id} className="font-baslik text-lg font-semibold text-ink">
        {baslik}
      </h2>
      <p className="mt-0.5 text-sm text-ink-muted">{aciklama}</p>
    </div>
  );
}

/** Bölüm içindeki kart — çapa hedefi; üst bar altında kalmasın diye `scroll-mt`. */
function Kart({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24 rounded-xl border border-line bg-surface p-5">
      {children}
    </section>
  );
}

function SaltOkunurKanallar({ data }: { data: ClientChannels }) {
  const bagli = data.groups.flatMap((g) => g.connected.map((i) => ({ ...i, kind: g.kind })));
  if (bagli.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-line bg-surface p-6 text-sm text-ink-muted">
        Bu workspace’e bağlı hesap ya da kanal yok. Eklemek için ajansının yöneticisine yaz.
      </p>
    );
  }
  return (
    <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
      {bagli.map((i) => (
        <li key={i.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
          <span className="min-w-0 truncate text-ink">{i.name}</span>
          <span className="shrink-0 text-xs text-ink-muted" translate="no">
            {i.externalId}
          </span>
        </li>
      ))}
    </ul>
  );
}

function hataMetni(e: unknown): string {
  return e instanceof ApiRequestError ? e.message : 'Sunucuya ulaşılamadı.';
}

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
