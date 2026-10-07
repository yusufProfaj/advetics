'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import {
  ATIF_SECENEKLERI,
  NIYET_KATALOGU,
  OZEL_KATEGORI_ETIKETLERI,
  enCokHarcama,
  etkinKategoriler,
  hedeflemeUret,
  sonucEtiketi,
  tutarAyristir,
  tutarGoster,
  type AtifDurumu,
  type HazirlikGorseli,
  type OzelKategori,
  type ReklamHazirligi,
  type ReklamTaslakKaydi,
  type TaslakAlanlari,
} from '@advetics/shared';
import { API_URL, ApiRequestError, apiFetch } from '@/lib/api';
import { Dugme, Kutu, dugmeSinifi } from '../ui';
import { YayinPaneli } from './yayin-paneli';
import { ProvaBlogu } from './prova-blogu';
import {
  ADIMLAR,
  BASLIK_SINIRI,
  BUTUN_TURKIYE,
  EN_COK_FIKIR,
  GORUNEN_METIN,
  bugun,
  ekranDegerleri,
  gorselDegistir,
  gunEkle,
  kavramlarKur,
  onizlemeNiyetleri,
  tarihGoster,
  type AdimNo,
} from './akis';

type Degisiklik = Partial<Record<keyof TaslakAlanlari, { deger: unknown; kaynak: 'kullanici' | 'marka_merkezi' } | null>>;

/**
 * Kayıt hâlleri AYRI: "kaydediliyor", "kaydedildi" ve "kaydedilemedi"
 * aynı boş alana çevrilmiyor (CLAUDE.md `.catch(() => setX([]))` yasağı).
 * Hatada sunucunun kendi cümlesi görünür.
 */
type KayitHali =
  | { tur: 'sakin' }
  | { tur: 'kaydediliyor' }
  | { tur: 'kaydedildi'; surum: number }
  | { tur: 'hata'; mesaj: string };

const KULLANICI = 'kullanici' as const;

/**
 * Yeni Reklam Oluştur — Acemi akışı (TASARIM.md § 03-04).
 *
 * TASLAK SUNUCUDA: her seçim yeni, değişmez bir sürüm olarak yazılıyor ve
 * "yayına ne kaldı" listesi sunucudan geliyor. Metin alanları alan
 * BIRAKILINCA kaydediliyor (her tuşta değil): her tuş bir sürüm olsaydı
 * taslak başına yüzlerce satır birikirdi.
 *
 * Gerçek yayın kapalı (Meta provası yok); ajans yöneticisi Gözden geçir'de
 * TEST KİPİYLE deneyebiliyor (`yayin-paneli.tsx`).
 */
export function YeniReklamAkisi({
  clientId,
  workspaceAdi,
  hazirlik,
  ilkTaslak,
  ilkAtif,
  yonetici,
}: {
  clientId: string;
  workspaceAdi: string;
  hazirlik: ReklamHazirligi;
  ilkTaslak: ReklamTaslakKaydi;
  ilkAtif: AtifDurumu | null;
  /** Ajans yöneticisi: test kipi düğmesi yalnız ona. Sunucu ayrıca denetliyor. */
  yonetici: boolean;
}) {
  const router = useRouter();
  const [taslak, setTaslak] = useState(ilkTaslak);
  const [kayit, setKayit] = useState<KayitHali>({ tur: 'sakin' });
  const [adim, setAdim] = useState<AdimNo>(0);
  const d = ekranDegerleri(taslak.alanlar);

  // Yazı alanları yerel; BIRAKILINCA kaydediliyor.
  const [baslik, setBaslik] = useState(d.baslik);
  const [metin, setMetin] = useState(d.metin);
  const [adres, setAdres] = useState(d.hedefAdres ?? '');
  const [tutarMetni, setTutarMetni] = useState('');
  const [tutarHatasi, setTutarHatasi] = useState<string | null>(null);

  const hesap = hazirlik.hesaplar.find((h) => h.id === d.hesap) ?? null;
  const paraBirimi = hesap?.paraBirimi ?? 'TRY';
  const saatDilimi = hesap?.saatDilimi ?? 'Europe/Istanbul';

  // Sıralı kayıt: iki istek üst üste binerse eski cevap yeniyi ezmesin.
  const sira = useRef(0);
  async function kaydet(degisiklikler: Degisiklik) {
    const benim = ++sira.current;
    setKayit({ tur: 'kaydediliyor' });
    try {
      const yeni = await apiFetch<ReklamTaslakKaydi>(`/reklam/taslaklar/${taslak.id}/surum`, {
        method: 'PUT',
        body: JSON.stringify({ degisiklikler }),
      });
      if (benim !== sira.current) return;
      setTaslak(yeni);
      setKayit({ tur: 'kaydedildi', surum: yeni.aktifSurumNo });
    } catch (e) {
      if (benim !== sira.current) return;
      setKayit({ tur: 'hata', mesaj: e instanceof ApiRequestError ? e.message : 'Sunucuya ulaşılamadı.' });
    }
  }

  /*
   * MARKA MERKEZİ'NDEN ÖNDEN DOLDURMA: konum taslakta yoksa ve varsayılan
   * kitle varsa bir kez yazılıyor, kaynağı "Marka Merkezi'nden". Yalnız
   * taslak AÇILIRKEN — kullanıcı konumu sonradan silerse geri gelmesin.
   */
  const doldurulduMu = useRef(false);
  useEffect(() => {
    if (doldurulduMu.current) return;
    doldurulduMu.current = true;
    const konumlar = hazirlik.varsayilanKitle?.konumlar ?? [];
    if (!ilkTaslak.alanlar.konumlar && konumlar.length > 0) {
      void kaydet({ konumlar: { deger: konumlar, kaynak: 'marka_merkezi' } });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const kavramKaydet = (gorseller: string[], b = baslik, m = metin) =>
    kaydet({ kavramlar: gorseller.length ? { deger: kavramlarKur(gorseller, b, m), kaynak: KULLANICI } : null });

  const niyet = d.niyet ? NIYET_KATALOGU[d.niyet] : null;
  const eksikAdim = (a: number) => taslak.eksikler.some((e) => e.adim === a && e.kod !== 'OK-17');

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_18rem]">
      <div className="min-w-0 space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <ol className="flex flex-wrap gap-1.5" aria-label="Adımlar">
            {ADIMLAR.map((ad, i) => (
              <li key={ad}>
                <button
                  type="button"
                  onClick={() => setAdim(i as AdimNo)}
                  aria-current={i === adim ? 'step' : undefined}
                  className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                    i === adim
                      ? 'border-brand text-brand-strong'
                      : i < adim && !eksikAdim(i)
                        ? 'border-ok/40 text-ok-strong'
                        : 'border-line text-ink-muted hover:text-ink'
                  }`}
                >
                  {i + 1}. {ad}
                </button>
              </li>
            ))}
          </ol>
          <KayitDurumu hal={kayit} />
        </div>

        <section className="rounded-xl border border-line bg-surface p-5">
          {adim === 0 && (
            <div className="space-y-5">
              <Soru baslik="Bu reklamdan ne istiyorsun?">
                Bir tane seç. Kampanya amacını, optimizasyonu ve düğmeyi buna göre biz kuruyoruz.
              </Soru>
              <div className="grid grid-cols-[repeat(auto-fill,minmax(13rem,1fr))] gap-2.5">
                {onizlemeNiyetleri().map((n) =>
                  n.tur === 'yonlendirme' ? (
                    <Link
                      key={n.kod}
                      href="/auto-boost"
                      className="flex flex-col gap-1 rounded-xl border border-dashed border-line p-3.5 text-sm hover:border-brand"
                    >
                      <b>{n.ekranAdi}</b>
                      <span className="text-xs text-ink-muted">{n.neAlacaksin}</span>
                      <span className="text-xs font-semibold text-brand-strong">Akıllı Boost’a git</span>
                    </Link>
                  ) : (
                    <Secenek
                      key={n.kod}
                      secili={d.niyet === n.kod}
                      onClick={() => kaydet({ niyet: { deger: n.kod, kaynak: KULLANICI } })}
                    >
                      {n.kanit === 'belge' && (
                        <span className="mb-1 inline-block rounded-full bg-surface-sunken px-2 py-0.5 text-[11px] text-ink-muted">
                          Canlıda doğrulanmadı
                        </span>
                      )}
                      <b className="block text-sm">{n.ekranAdi}</b>
                      <span className="text-xs text-ink-muted">{n.neAlacaksin}</span>
                    </Secenek>
                  ),
                )}
              </div>

              {d.niyet === 'SITE' && (
                <Alan id="yr-adres" etiket="Site adresi">
                  <input
                    id="yr-adres"
                    type="url"
                    inputMode="url"
                    placeholder="https://"
                    value={adres}
                    onChange={(e) => setAdres(e.target.value)}
                    onBlur={() => adres !== (d.hedefAdres ?? '') && kaydet({ hedefAdres: { deger: adres.trim() || null, kaynak: KULLANICI } })}
                    className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm"
                  />
                </Alan>
              )}
              {d.niyet === 'FORM' && (
                <Kutu ton="uyari" baslik="Form şablonu henüz yok">
                  Form, Marka Merkezi’nde onaylı bir şablondan kurulacak. Şablon ekranı sıradaki işte.
                </Kutu>
              )}

              <div className="grid gap-3 sm:grid-cols-2">
                <Alan id="yr-hesap" etiket="Reklam hesabı">
                  <select
                    id="yr-hesap"
                    value={d.hesap ?? ''}
                    onChange={(e) => kaydet({ reklamHesabiId: e.target.value ? { deger: e.target.value, kaynak: KULLANICI } : null })}
                    className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm"
                  >
                    <option value="">Seç ({hazirlik.hesaplar.length} hesap)</option>
                    {hazirlik.hesaplar.map((h) => (
                      <option key={h.id} value={h.id}>
                        {h.ad} · {h.paraBirimi}
                      </option>
                    ))}
                  </select>
                </Alan>
                <Alan id="yr-sayfa" etiket="Facebook sayfası">
                  <select
                    id="yr-sayfa"
                    value={d.sayfa ?? ''}
                    onChange={(e) => kaydet({ sayfaId: e.target.value ? { deger: e.target.value, kaynak: KULLANICI } : null })}
                    className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm"
                  >
                    <option value="">Seç ({hazirlik.sayfalar.length} sayfa)</option>
                    {hazirlik.sayfalar.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.ad}
                      </option>
                    ))}
                  </select>
                </Alan>
              </div>

              <KonumSecimi
                konumlar={d.konumlar}
                kaynak={d.konumKaynagi}
                kitle={hazirlik.varsayilanKitle}
                clientId={clientId}
                kaydet={kaydet}
              />

              <KategoriSorusu
                taban={hazirlik.ozelKategoriTabani}
                ek={d.ekKategoriler}
                kaydet={(ek) => kaydet({ ekKategoriler: { deger: ek, kaynak: KULLANICI } })}
              />
            </div>
          )}

          {adim === 1 && (
            <div className="space-y-3">
              <Soru baslik="Ne göstereceksin?">
                Her görsel ayrı bir fikir olur, en çok {EN_COK_FIKIR}. Kare, dikey ve yatay kesitleri biz çıkarıyoruz.
              </Soru>
              {hazirlik.gorseller.satirlar.length === 0 ? (
                <Kutu
                  ton="uyari"
                  baslik="Görsel Arşivi boş"
                  eylem={
                    <Link href={`/marka-merkezi?bolum=varliklar&musteri=${clientId}`} className={dugmeSinifi('ikincil', true)}>
                      Görsel yükle
                    </Link>
                  }
                >
                  Görseller Marka Merkezi › Varlıklar’da tutuluyor.
                </Kutu>
              ) : (
                <>
                  <p className="text-xs text-ink-muted">
                    {d.gorseller.length} / {EN_COK_FIKIR} seçili · arşivdeki son {hazirlik.gorseller.satirlar.length} görsel
                    gösteriliyor (toplam {hazirlik.gorseller.toplam}).
                  </p>
                  <div className="grid grid-cols-[repeat(auto-fill,minmax(8.5rem,1fr))] gap-2.5">
                    {hazirlik.gorseller.satirlar.map((g) => (
                      <GorselKutusu
                        key={g.id}
                        g={g}
                        sira={d.gorseller.indexOf(g.id)}
                        dolu={d.gorseller.length >= EN_COK_FIKIR}
                        onClick={() => kavramKaydet(gorselDegistir(d.gorseller, g.id))}
                      />
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {adim === 2 && (
            <div className="space-y-4">
              <Soru baslik="Ne yazacaksın?">Bütün fikirlerde aynı metin kullanılır.</Soru>
              {d.gorseller.length === 0 && (
                <Kutu ton="uyari" baslik="Önce görsel seç">Metin, seçilen görsellerle birlikte kaydediliyor.</Kutu>
              )}
              <Alan id="yr-baslik" etiket="Başlık" not={`${baslik.length} / ${BASLIK_SINIRI}`}>
                <input
                  id="yr-baslik"
                  value={baslik}
                  maxLength={BASLIK_SINIRI}
                  disabled={d.gorseller.length === 0}
                  onChange={(e) => setBaslik(e.target.value)}
                  onBlur={() => baslik !== d.baslik && kavramKaydet(d.gorseller)}
                  className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm disabled:opacity-50"
                />
              </Alan>
              <Alan
                id="yr-metin"
                etiket="Ana metin"
                not={
                  metin.length > GORUNEN_METIN
                    ? `İlk ${GORUNEN_METIN} karakter akışta görünür, gerisi "devamını gör" altında.`
                    : `${metin.length} karakter`
                }
              >
                <textarea
                  id="yr-metin"
                  rows={5}
                  value={metin}
                  disabled={d.gorseller.length === 0}
                  onChange={(e) => setMetin(e.target.value)}
                  onBlur={() => metin !== d.metin && kavramKaydet(d.gorseller)}
                  className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm disabled:opacity-50"
                />
              </Alan>
              {hazirlik.marka.metinSablonlari.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-xs font-semibold text-ink-muted">Marka Merkezi’ndeki metinler</p>
                  <div className="flex flex-wrap gap-1.5">
                    {hazirlik.marka.metinSablonlari.map((m, i) => (
                      <button
                        key={i}
                        type="button"
                        disabled={d.gorseller.length === 0}
                        onClick={() => {
                          setMetin(m);
                          void kavramKaydet(d.gorseller, baslik, m);
                        }}
                        className="max-w-full truncate rounded-full border border-line px-3 py-1 text-xs hover:bg-surface-muted disabled:opacity-50"
                        title={m}
                      >
                        {m.length > 48 ? `${m.slice(0, 48)}…` : m}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {hazirlik.marka.yasalUyari && (
                <Kutu
                  ton={taslak.eksikler.some((e) => e.kod === 'YASAL-UYARI') ? 'uyari' : 'iyi'}
                  baslik="Zorunlu yasal uyarı"
                  eylem={
                    taslak.eksikler.some((e) => e.kod === 'YASAL-UYARI') ? (
                      <Dugme
                        ton="ikincil"
                        kucuk
                        onClick={() => {
                          const yeni = `${metin.trimEnd()}\n\n${hazirlik.marka.yasalUyari}`.trimStart();
                          setMetin(yeni);
                          void kavramKaydet(d.gorseller, baslik, yeni);
                        }}
                      >
                        Metne ekle
                      </Dugme>
                    ) : undefined
                  }
                >
                  {hazirlik.marka.yasalUyari}
                </Kutu>
              )}
            </div>
          )}

          {adim === 3 && (
            <div className="space-y-4">
              <Soru baslik="Ne kadar harcamak istiyorsun?">
                Tutar {paraBirimi === 'TRY' ? 'TL' : paraBirimi} cinsinden. Yayından sonra değiştirebilirsin.
              </Soru>
              <div className="flex gap-2" role="group" aria-label="Bütçe türü">
                {(['gunluk', 'toplam'] as const).map((tip) => (
                  <Secenek
                    key={tip}
                    secili={d.butce?.tip === tip}
                    onClick={() => d.butce && kaydet({ butce: { deger: { ...d.butce, tip }, kaynak: KULLANICI } })}
                    devreDisi={!d.butce}
                  >
                    <b className="text-sm">{tip === 'gunluk' ? 'Günlük' : 'Toplam'}</b>
                  </Secenek>
                ))}
              </div>
              <Alan id="yr-tutar" etiket={d.butce?.tip === 'toplam' ? 'Toplam bütçe' : 'Günlük bütçe'} not={tutarHatasi ?? undefined}>
                <input
                  id="yr-tutar"
                  inputMode="decimal"
                  placeholder={d.butce ? tutarGoster(BigInt(d.butce.micros), paraBirimi) : 'Örnek: 500'}
                  value={tutarMetni}
                  onChange={(e) => setTutarMetni(e.target.value)}
                  onBlur={() => {
                    if (!tutarMetni.trim()) return;
                    const r = tutarAyristir(tutarMetni, paraBirimi);
                    if (r.tur === 'hata') return setTutarHatasi(r.mesaj);
                    setTutarHatasi(null);
                    setTutarMetni('');
                    void kaydet({
                      butce: { deger: { tip: d.butce?.tip ?? 'gunluk', micros: r.micros.toString() }, kaynak: KULLANICI },
                    });
                  }}
                  className="w-48 rounded-lg border border-line bg-surface px-3 py-2 text-sm tabular-nums"
                />
              </Alan>
              {d.butce && (
                <p className="text-sm">
                  Kayıtlı: <b>{tutarGoster(BigInt(d.butce.micros), paraBirimi)}</b>{' '}
                  {d.butce.tip === 'gunluk' ? 'günlük' : 'toplam'}.
                </p>
              )}
              <p className="text-xs text-ink-muted">
                Meta bazı günler günlük bütçenin üzerinde harcayabilir; bir haftada günlük bütçenin 7 katını geçmez.
              </p>
            </div>
          )}

          {adim === 4 && (
            <SureAdimi
              takvim={d.takvim}
              toplam={d.butce?.tip === 'toplam'}
              bugun={bugun(saatDilimi)}
              kaydet={(t) => kaydet({ takvim: { deger: t, kaynak: KULLANICI } })}
            />
          )}

          {adim === 5 && (
            <GozdenGecir
              taslak={taslak}
              hazirlik={hazirlik}
              workspaceAdi={workspaceAdi}
              paraBirimi={paraBirimi}
              ilkAtif={ilkAtif}
              adimaGit={setAdim}
              yonetici={yonetici}
              onDegisti={() => router.refresh()}
            />
          )}

          <div className="mt-5 flex items-center justify-between gap-3">
            {adim > 0 ? (
              <Dugme ton="ikincil" onClick={() => setAdim((adim - 1) as AdimNo)}>
                Geri
              </Dugme>
            ) : (
              <span />
            )}
            {adim < 5 && (
              <Dugme onClick={() => setAdim((adim + 1) as AdimNo)}>{adim === 4 ? 'Gözden geçir' : 'Devam et'}</Dugme>
            )}
          </div>
        </section>
      </div>

      <aside className="lg:sticky lg:top-4 lg:self-start">
        <div className="rounded-xl border border-line bg-surface p-4 text-sm">
          <h2 className="mb-2 text-sm font-semibold">Bu reklam ne yapacak?</h2>
          <dl className="divide-y divide-line">
            <Ozet ad="Amaç" deger={niyet?.ekranAdi ?? 'Seçilmedi'} />
            <Ozet ad="Sonuç" deger={niyet?.meta ? sonucEtiketi(niyet.meta.optimizationGoal) : '-'} />
            <Ozet ad="Hesap" deger={hesap?.ad ?? 'Seçilmedi'} />
            <Ozet ad="Konum" deger={d.konumlar.length ? d.konumlar.map((k) => k.etiket).join(', ') : 'Seçilmedi'} />
            <Ozet ad="Fikir" deger={`${d.gorseller.length} görsel`} />
            <Ozet
              ad="Bütçe"
              deger={d.butce ? `${tutarGoster(BigInt(d.butce.micros), paraBirimi)} ${d.butce.tip === 'gunluk' ? '/ gün' : 'toplam'}` : 'Seçilmedi'}
            />
            <Ozet ad="Süre" deger={d.takvim ? (d.takvim.bitis ? `${tarihGoster(d.takvim.bitis)}’e kadar` : 'Durdurana kadar') : 'Seçilmedi'} />
          </dl>
          <EksikListesi eksikler={taslak.eksikler} adimaGit={setAdim} />
        </div>
      </aside>
    </div>
  );
}

function KayitDurumu({ hal }: { hal: KayitHali }) {
  if (hal.tur === 'sakin') return null;
  if (hal.tur === 'kaydediliyor') return <span className="text-xs text-ink-muted">Kaydediliyor…</span>;
  if (hal.tur === 'kaydedildi') return <span className="text-xs text-ok-strong">Kaydedildi · sürüm {hal.surum}</span>;
  return (
    <span role="alert" className="text-xs font-semibold text-danger-strong">
      Kaydedilemedi: {hal.mesaj}
    </span>
  );
}

function EksikListesi({
  eksikler,
  adimaGit,
}: {
  eksikler: ReklamTaslakKaydi['eksikler'];
  adimaGit: (a: AdimNo) => void;
}) {
  // Prova eksiği kullanıcının yapabileceği bir şey değil; ayrı satırda.
  const kullanicinin = eksikler.filter((e) => e.kod !== 'OK-17');
  return (
    <div className="mt-3 space-y-1 text-xs">
      {kullanicinin.length === 0 ? (
        <p className="font-semibold text-ok-strong">Senin tarafında eksik yok</p>
      ) : (
        <ul className="space-y-1">
          {kullanicinin.map((e, i) => (
            <li key={`${e.kod}-${i}`}>
              <button type="button" onClick={() => adimaGit(e.adim)} className="text-left text-warn-strong hover:underline">
                {e.metin}
              </button>
            </li>
          ))}
        </ul>
      )}
      {eksikler.some((e) => e.kod === 'OK-17') && (
        <p className="text-ink-muted">Meta’nın ön kontrolü Gözden geçir’de.</p>
      )}
    </div>
  );
}

function KonumSecimi({
  konumlar,
  kaynak,
  kitle,
  clientId,
  kaydet,
}: {
  konumlar: ReturnType<typeof ekranDegerleri>['konumlar'];
  kaynak: string | null;
  kitle: ReklamHazirligi['varsayilanKitle'];
  clientId: string;
  kaydet: (d: Degisiklik) => Promise<void>;
}) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold">Reklam nerede görünsün?</p>
      {konumlar.length > 0 ? (
        <p className="text-sm">
          {konumlar.map((k) => k.etiket).join(', ')}
          {kaynak === 'marka_merkezi' && <span className="ml-2 text-xs text-ink-muted">Marka Merkezi’nden</span>}
        </p>
      ) : (
        <p className="text-sm text-warn-strong">Konum seçilmedi. Konum seçilmeden reklam kurulmaz.</p>
      )}
      <div className="flex flex-wrap gap-2">
        {kitle && kitle.konumlar.length > 0 && kaynak !== 'marka_merkezi' && (
          <Dugme ton="ikincil" kucuk onClick={() => kaydet({ konumlar: { deger: kitle.konumlar, kaynak: 'marka_merkezi' } })}>
            Marka Merkezi’ndeki kitle: {kitle.ad}
          </Dugme>
        )}
        <Dugme ton="ikincil" kucuk onClick={() => kaydet({ konumlar: { deger: [BUTUN_TURKIYE], kaynak: KULLANICI } })}>
          Bütün Türkiye
        </Dugme>
        {!kitle && (
          <Link href={`/marka-merkezi?bolum=kitleler&musteri=${clientId}`} className={dugmeSinifi('sade', true)}>
            Marka Merkezi’nde kitle tanımla
          </Link>
        )}
      </div>
    </div>
  );
}

const KATEGORI_SECENEKLERI: OzelKategori[] = ['HOUSING', 'EMPLOYMENT', 'FINANCIAL_PRODUCTS_SERVICES', 'ISSUES_ELECTIONS_POLITICS'];

/**
 * Özel kategori sorusu — hiçbir şık SEÇİLİ GELMEZ. Taban (müşteri kartı)
 * kilitli çip: taslakta düşürülemez, yalnız ek eklenebilir.
 */
function KategoriSorusu({
  taban,
  ek,
  kaydet,
}: {
  taban: OzelKategori[];
  ek: OzelKategori[] | null;
  kaydet: (ek: OzelKategori[]) => Promise<void>;
}) {
  const etkin = etkinKategoriler(taban, ek ?? []);
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold">
        Bu reklam konut, iş ilanı, kredi ya da finans ürünü, siyasi ya da toplumsal bir konu içeriyor mu?
      </p>
      {taban.length > 0 && (
        <p className="text-xs text-ink-muted">
          Bu workspace {taban.map((k) => OZEL_KATEGORI_ETIKETLERI[k].toLocaleLowerCase('tr-TR')).join(', ')} olarak kayıtlı.
          Yaş ve cinsiyet seçilemez. Kaydı yalnız ajans yöneticisi değiştirebilir.
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Secenek secili={ek !== null && ek.length === 0} onClick={() => kaydet([])}>
          <span className="text-sm">{taban.length ? 'Başka bir şey yok' : 'Hayır'}</span>
        </Secenek>
        {KATEGORI_SECENEKLERI.filter((k) => !taban.includes(k)).map((k) => (
          <Secenek
            key={k}
            secili={!!ek?.includes(k)}
            onClick={() => kaydet(ek?.includes(k) ? ek.filter((x) => x !== k) : [...(ek ?? []), k])}
          >
            <span className="text-sm">{OZEL_KATEGORI_ETIKETLERI[k]}</span>
          </Secenek>
        ))}
      </div>
      {etkin.some((k) => k !== 'ISSUES_ELECTIONS_POLITICS') && (
        <p className="text-xs text-ink-muted">Bu reklam türünde yaş 18 ve üstü herkes, cinsiyet seçilemez.</p>
      )}
    </div>
  );
}

function SureAdimi({
  takvim,
  toplam,
  bugun: bugunT,
  kaydet,
}: {
  takvim: { baslangic: string; bitis: string | null } | null;
  toplam: boolean;
  bugun: string;
  kaydet: (t: { baslangic: string; bitis: string | null }) => Promise<void>;
}) {
  const bas = takvim?.baslangic ?? null;
  return (
    <div className="space-y-4">
      <Soru baslik="Ne zaman başlasın, ne zamana kadar?" />
      <div className="flex flex-wrap items-end gap-3">
        <Secenek secili={bas === bugunT} onClick={() => kaydet({ baslangic: bugunT, bitis: takvim?.bitis ?? null })}>
          <span className="text-sm">Bugün başlasın</span>
        </Secenek>
        <Alan id="yr-bas" etiket="Ya da başlangıç günü">
          <input
            id="yr-bas"
            type="date"
            min={bugunT}
            value={bas ?? ''}
            onChange={(e) => e.target.value && kaydet({ baslangic: e.target.value, bitis: takvim?.bitis ?? null })}
            className="rounded-lg border border-line bg-surface px-3 py-2 text-sm"
          />
        </Alan>
      </div>
      {bas ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(11rem,1fr))] gap-2.5">
          {[7, 14, 30, null].map((gun) => {
            const bitis = gun === null ? null : gunEkle(bas, gun - 1);
            const kapali = gun === null && toplam;
            return (
              <Secenek
                key={String(gun)}
                secili={takvim?.bitis === bitis}
                devreDisi={kapali}
                onClick={() => kaydet({ baslangic: bas, bitis })}
              >
                <b className="block text-sm">{gun ? `${gun} gün` : 'Ben durdurana kadar'}</b>
                <span className="text-xs text-ink-muted">
                  {kapali ? 'Toplam bütçede Meta bitiş tarihi istiyor.' : bitis ? `${tarihGoster(bitis)}’e kadar` : 'Bitiş yok'}
                </span>
              </Secenek>
            );
          })}
        </div>
      ) : (
        <p className="text-sm text-ink-muted">Önce başlangıç gününü seç.</p>
      )}
    </div>
  );
}

function GozdenGecir({
  taslak,
  hazirlik,
  workspaceAdi,
  paraBirimi,
  ilkAtif,
  adimaGit,
  yonetici,
  onDegisti,
}: {
  taslak: ReklamTaslakKaydi;
  hazirlik: ReklamHazirligi;
  workspaceAdi: string;
  paraBirimi: string;
  ilkAtif: AtifDurumu | null;
  adimaGit: (a: AdimNo) => void;
  yonetici: boolean;
  onDegisti: () => void;
}) {
  const d = ekranDegerleri(taslak.alanlar);
  const niyet = d.niyet ? NIYET_KATALOGU[d.niyet] : null;
  const sayfa = hazirlik.sayfalar.find((s) => s.id === d.sayfa) ?? null;
  const gorseller = d.gorseller
    .map((id) => hazirlik.gorseller.satirlar.find((g) => g.id === id))
    .filter((g): g is HazirlikGorseli => !!g);
  const kategoriler = etkinKategoriler(hazirlik.ozelKategoriTabani, d.ekKategoriler ?? []);

  // Kime: derleyicinin KENDİ hedefleme üreticisi, ekranda ikinci bir kural yok.
  const hedef = d.konumlar.length
    ? hedeflemeUret({
        konumlar: d.konumlar,
        enDusukYas: 18,
        ipucuYas: null,
        ipucuCinsiyet: null,
        advantageAudience: 1,
        kategoriler,
      })
    : null;
  const harcama =
    d.butce && d.takvim
      ? (() => {
          try {
            return enCokHarcama({ tip: d.butce.tip, micros: BigInt(d.butce.micros), seviye: 'kampanya' }, d.takvim);
          } catch {
            return null;
          }
        })()
      : null;
  const para = (m: bigint) => tutarGoster(m, paraBirimi);
  const kullaniciEksigi = taslak.eksikler.filter((e) => e.kod !== 'OK-17');

  return (
    <div className="space-y-4">
      <Soru baslik="Gözden geçir ve yayınla">
        Meta’ya gidecek her şey burada. Yayın önce duraklatılmış kurar, geri okur, fark yoksa açar.
      </Soru>

      <ProvaBlogu taslakId={taslak.id} ozet={taslak.icerikOzeti} kullaniciEksigi={kullaniciEksigi.length} />

      <Blok baslik="Meta’nın gözünden">
        {gorseller.length === 0 ? (
          <p className="text-sm text-ink-muted">Görsel seçilmedi.</p>
        ) : (
          <div className="flex gap-3 overflow-x-auto pb-1">
            {gorseller.map((g, i) => (
              <figure key={g.id} className="w-44 shrink-0 rounded-xl border border-line bg-surface-muted p-2 text-xs">
                <figcaption className="mb-1.5 font-semibold">
                  {sayfa?.ad ?? workspaceAdi} <span className="font-normal text-ink-muted">· Sponsorlu</span>
                </figcaption>
                <p className="mb-1.5 line-clamp-3 text-ink-muted">{d.metin || 'Ana metin boş'}</p>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`${API_URL}${g.onizlemeAdresi}`} alt="" className="aspect-square w-full rounded-md object-cover" />
                <p className="mt-1.5 truncate font-semibold">{d.baslik || 'Başlık boş'}</p>
                <p className="text-ink-muted">Fikir {i + 1}</p>
              </figure>
            ))}
          </div>
        )}
        <p className="mt-2 text-xs text-ink-muted">Meta’nın kendi önizlemesi prova ile gelecek; bunlar yaklaşık görünüm.</p>
      </Blok>

      <Blok baslik="Plan">
        <div className="grid gap-2.5 sm:grid-cols-3">
          <PlanKutusu ad="Kime">
            {d.konumlar.length ? `${d.konumlar.map((k) => k.etiket).join(', ')}, 18 yaş ve üstü.` : 'Konum seçilmedi.'} Meta
            bu sınırların içinde reklamı en çok kime göstereceğine kendisi karar verir.
          </PlanKutusu>
          <PlanKutusu ad="Nerede">Otomatik yerleşim: Facebook, Instagram, Reels, hikâye.</PlanKutusu>
          <PlanKutusu ad="Ne kadar">
            {d.butce ? `${para(BigInt(d.butce.micros))} ${d.butce.tip === 'gunluk' ? 'günlük' : 'toplam'}` : 'Bütçe seçilmedi'}
            {d.takvim ? (d.takvim.bitis ? `, ${tarihGoster(d.takvim.bitis)}’e kadar.` : ', durdurana kadar.') : '.'}
          </PlanKutusu>
        </div>
      </Blok>

      <Blok baslik="Kapattıklarımız ve Meta’nın dayattıkları">
        <ul className="list-disc space-y-1 pl-5 text-sm text-ink-muted">
          <li>Başka markaların reklamlarıyla yan yana gösterim kapalı.</li>
          <li>Meta’nın yapay zekâyla görseli ve metni değiştirmesi kapalı.</li>
          <li>Reklam önce duraklatılmış kurulur; geri okunmadan harcama başlamaz.</li>
          {kategoriler.length > 0 && (
            <li>
              {kategoriler.map((k) => OZEL_KATEGORI_ETIKETLERI[k]).join(', ')}: yaş ve cinsiyet seçilemez, bir noktanın
              çevresi en az 17 km.
            </li>
          )}
          {hedef?.tur === 'tamam' && hedef.kapatilanlar.map((k) => <li key={k}>Kullanılmayacak: {k}</li>)}
        </ul>
      </Blok>

      <Blok baslik="Yayından sonra değişmez">
        <ul className="list-disc space-y-1 pl-5 text-sm text-ink-muted">
          <li>Amaç: {niyet?.ekranAdi ?? 'seçilmedi'}.</li>
          {kategoriler.length > 0 && <li>Özel reklam kategorisi ve ülkesi.</li>}
        </ul>
      </Blok>

      <Blok baslik="Para">
        {harcama ? (
          <dl className="flex flex-wrap gap-6 tabular-nums">
            {harcama.ortalama !== null && <ParaSatiri ad="Ortalama" deger={para(harcama.ortalama)} />}
            {harcama.enCok !== null && <ParaSatiri ad="En çok" deger={para(harcama.enCok)} />}
            {harcama.haftalikTavan !== null && <ParaSatiri ad="Bir haftada en çok" deger={para(harcama.haftalikTavan)} />}
            {harcama.ayYaklasik !== null && <ParaSatiri ad="Bir ayda yaklaşık" deger={para(harcama.ayYaklasik)} />}
          </dl>
        ) : (
          <p className="text-sm text-ink-muted">Bütçe ve süre seçilince hesaplanır.</p>
        )}
      </Blok>

      <AtifBlogu ilk={ilkAtif} />

      {kullaniciEksigi.length > 0 && (
        <p className="text-xs text-ink-muted">
          Önce:{' '}
          <button type="button" className="text-warn-strong underline" onClick={() => adimaGit(kullaniciEksigi[0]!.adim)}>
            {kullaniciEksigi[0]!.metin}
          </button>
        </p>
      )}
      <YayinPaneli taslak={taslak} yonetici={yonetici} kullaniciEksigi={kullaniciEksigi.length} onDegisti={onDegisti} />
    </div>
  );
}

/**
 * Atıf standardı (OK-16). Seçilmeden yayın yok ve "önerilen değer
 * uygulanır" denmiyor: hiçbir seçenek seçili gelmez. Yöneticide seçim
 * burada; diğerlerinde kimin çözeceği yazıyor.
 */
function AtifBlogu({ ilk }: { ilk: AtifDurumu | null }) {
  const [durum, setDurum] = useState(ilk);
  const [secim, setSecim] = useState<AtifDurumu['standart']>(null);
  const [hata, setHata] = useState<string | null>(null);
  const [bekliyor, setBekliyor] = useState(false);

  if (durum === null) {
    return (
      <Blok baslik="Sonuç sayma kuralı">
        <p className="text-sm text-danger-strong">Atıf standardı okunamadı; yayın öncesi yeniden denenecek.</p>
      </Blok>
    );
  }
  if (durum.standart) {
    const s = ATIF_SECENEKLERI.find((x) => x.kod === durum.standart);
    return (
      <Blok baslik="Sonuç sayma kuralı">
        <p className="text-sm">{s?.baslik ?? durum.standart}</p>
        <p className="text-xs text-ink-muted">Ajans geneli ayar; bütün yeni reklamlara yazılır.</p>
      </Blok>
    );
  }
  return (
    <Blok baslik="Sonuç sayma kuralı">
      <p className="text-sm text-warn-strong">
        Atıf standardı henüz seçilmedi. Ajans yöneticisi seçene kadar yeni reklam yayınlanamaz.
      </p>
      {durum.secebilir ? (
        <fieldset className="mt-2 space-y-2">
          <legend className="text-xs font-semibold">Sonuçlar hangi pencereyle sayılsın?</legend>
          {ATIF_SECENEKLERI.map((s) => (
            <label key={s.kod} className="flex cursor-pointer gap-2 rounded-lg border border-line p-2.5 text-sm">
              <input type="radio" name="atif" checked={secim === s.kod} onChange={() => setSecim(s.kod)} />
              <span>
                <b className="block">{s.baslik}</b>
                <span className="text-xs text-ink-muted">{s.aciklama}</span>
              </span>
            </label>
          ))}
          <p className="text-xs text-ink-muted">Bu seçim yeni reklam setlerine yazılır; kurulmuş reklamlar değişmez.</p>
          {hata && (
            <p role="alert" className="text-xs text-danger-strong">
              {hata}
            </p>
          )}
          <Dugme
            kucuk
            disabled={!secim || bekliyor}
            onClick={async () => {
              setBekliyor(true);
              setHata(null);
              try {
                setDurum(
                  await apiFetch<AtifDurumu>('/reklam/ajans-ayari/atif', {
                    method: 'PUT',
                    body: JSON.stringify({ standart: secim }),
                  }),
                );
              } catch (e) {
                setHata(e instanceof ApiRequestError ? e.message : 'Sunucuya ulaşılamadı.');
              } finally {
                setBekliyor(false);
              }
            }}
          >
            Kaydet
          </Dugme>
        </fieldset>
      ) : (
        <p className="mt-1 text-xs text-ink-muted">Kim çözer: ajans yöneticisi.</p>
      )}
    </Blok>
  );
}

function GorselKutusu({ g, sira, dolu, onClick }: { g: HazirlikGorseli; sira: number; dolu: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      disabled={sira === -1 && dolu}
      onClick={onClick}
      aria-pressed={sira !== -1}
      className={`relative overflow-hidden rounded-lg border-2 text-left disabled:opacity-40 ${
        sira !== -1 ? 'border-brand' : 'border-transparent hover:border-line'
      }`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`${API_URL}${g.onizlemeAdresi}`} alt={g.ad} className="aspect-square w-full bg-surface-sunken object-cover" />
      {sira !== -1 && (
        <span className="absolute left-1.5 top-1.5 rounded-full bg-brand px-2 py-0.5 text-[11px] font-semibold text-white">
          Fikir {sira + 1}
        </span>
      )}
      <span className="block truncate px-1.5 py-1 text-[11px] text-ink-muted">
        {g.genislik}×{g.yukseklik}
      </span>
    </button>
  );
}

function Soru({ baslik, children }: { baslik: string; children?: React.ReactNode }) {
  return (
    <div>
      <h2 className="text-lg font-bold">{baslik}</h2>
      {children && <p className="mt-0.5 text-sm text-ink-muted">{children}</p>}
    </div>
  );
}

function Secenek({
  secili,
  onClick,
  devreDisi = false,
  children,
}: {
  secili: boolean;
  onClick: () => void;
  devreDisi?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={devreDisi}
      aria-pressed={secili}
      className={`rounded-xl border-[1.5px] p-3.5 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand disabled:cursor-not-allowed disabled:opacity-50 ${
        secili ? 'border-brand bg-brand-soft' : 'border-line bg-surface hover:border-ink-muted/40'
      }`}
    >
      {children}
    </button>
  );
}

function Alan({ id, etiket, not, children }: { id: string; etiket: string; not?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="text-xs font-semibold">
        {etiket}
      </label>
      {children}
      {not && <p className="text-xs text-ink-muted">{not}</p>}
    </div>
  );
}

function Blok({ baslik, children }: { baslik: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-line p-3.5">
      <h3 className="mb-2 text-sm font-semibold">{baslik}</h3>
      {children}
    </section>
  );
}

function PlanKutusu({ ad, children }: { ad: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg bg-surface-muted p-2.5 text-sm">
      <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-ink-muted">{ad}</p>
      {children}
    </div>
  );
}

function ParaSatiri({ ad, deger }: { ad: string; deger: string }) {
  return (
    <div>
      <dt className="text-xs text-ink-muted">{ad}</dt>
      <dd className="text-lg font-semibold">{deger}</dd>
    </div>
  );
}

function Ozet({ ad, deger }: { ad: string; deger: string }) {
  return (
    <div className="flex justify-between gap-3 py-1.5 text-xs">
      <dt className="text-ink-muted">{ad}</dt>
      <dd className="text-right font-semibold">{deger}</dd>
    </div>
  );
}
