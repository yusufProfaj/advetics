'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import {
  NIYET_KATALOGU,
  sonucEtiketi,
  type HazirlikGorseli,
  type HazirlikHesabi,
  type HazirlikProfili,
  type ReklamHazirligi,
} from '@advetics/shared';
import { API_URL } from '@/lib/api';
import { Dugme, Kutu, dugmeSinifi } from '../ui';
import {
  ADIMLAR,
  BASLIK_SINIRI,
  BOS_TASLAK,
  EN_COK_FIKIR,
  GORUNEN_METIN,
  SURE_SECENEKLERI,
  eksikler,
  gorselDegistir,
  onizlemeNiyetleri,
  toplamUstSinir,
  type AdimNo,
  type YeniReklamTaslagi,
} from './akis';

/**
 * Yeni Reklam Oluştur — Acemi akışı, panelin İÇİNDE (TASARIM.md § 03-04).
 *
 * ÖNİZLEME: bu bileşen Meta'ya HİÇBİR ŞEY göndermiyor. Yayın motoru (§ 11)
 * ve derleyici (§ 06) henüz yok; "Yayına al" düğmesi kilitli ve nedenini
 * yazıyor. Kilitli düğmeyi gizlemek yerine göstermek bilinçli: kullanıcı
 * akışın sonunu görüp değerlendirebilsin, ama bir şey yayınlandığını sanmasın.
 *
 * Veri modülün kendi ucundan geliyor (`GET /reklam/hazirlik`): eski
 * Hızlı Reklam'ın yedi isteği yerine tek okuma. Hazırlık bir kez yapılır, reklam beş
 * dakika: Marka Merkezi'nde duran hiçbir bilgi burada yeniden sorulmuyor.
 */
export function YeniReklamAkisi({
  clientId,
  workspaceAdi,
  hazirlik,
}: {
  clientId: string;
  workspaceAdi: string;
  hazirlik: ReklamHazirligi;
}) {
  const { hesaplar, sayfalar } = hazirlik;
  const gorseller = hazirlik.gorseller.satirlar;
  const gorselToplam = hazirlik.gorseller.toplam;
  const { yasalUyari, metinSablonlari } = hazirlik.marka;
  const kitleOzetiMetni = hazirlik.varsayilanKitle ? `${hazirlik.varsayilanKitle.ozet}.` : null;
  // Tek hesap/tek sayfa varsa seçili açılıyor: SORULACAK bir şey yok. Birden
  // çoksa ilkine DÜŞÜLMÜYOR — yanlış hesaba yayın en pahalı sessiz hata.
  const [t, setT] = useState<YeniReklamTaslagi>({
    ...BOS_TASLAK,
    reklamHesabiId: hesaplar.length === 1 ? hesaplar[0]!.id : null,
    sayfaId: sayfalar.length === 1 ? sayfalar[0]!.id : null,
  });
  const [adim, setAdim] = useState<AdimNo>(0);
  const guncelle = (p: Partial<YeniReklamTaslagi>) => setT((o) => ({ ...o, ...p }));

  const eksik = useMemo(() => eksikler(t, yasalUyari), [t, yasalUyari]);
  const hesap = hesaplar.find((h) => h.id === t.reklamHesabiId) ?? null;
  const sayfa = sayfalar.find((s) => s.id === t.sayfaId) ?? null;
  const niyet = t.niyet ? NIYET_KATALOGU[t.niyet] : null;
  const para = (n: number) =>
    new Intl.NumberFormat('tr-TR', { style: 'currency', currency: hesap?.paraBirimi ?? 'TRY', maximumFractionDigits: 0 }).format(n);
  const secGorseller = t.gorseller
    .map((id) => gorseller.find((g) => g.id === id))
    .filter((g): g is HazirlikGorseli => !!g);

  const adimEksik = (a: number) => eksik.some((e) => e.adim === a);

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_18rem]">
      <div className="min-w-0 space-y-4">
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
                    : i < adim && !adimEksik(i)
                      ? 'border-ok/40 text-ok-strong'
                      : 'border-line text-ink-muted hover:text-ink'
                }`}
              >
                {i + 1}. {ad}
              </button>
            </li>
          ))}
        </ol>

        <section className="rounded-xl border border-line bg-surface p-5">
          {adim === 0 && (
            <AdimAmac t={t} guncelle={guncelle} hesaplar={hesaplar} sayfalar={sayfalar} />
          )}
          {adim === 1 && (
            <div className="space-y-3">
              <Soru baslik="Ne göstereceksin?">
                Her görsel ayrı bir fikir olur, en çok {EN_COK_FIKIR}. Kare, dikey ve yatay kesitleri biz
                çıkarıyoruz.
              </Soru>
              {gorseller.length === 0 ? (
                <Kutu
                  ton="uyari"
                  baslik="Görsel Arşivi boş"
                  eylem={
                    <Link
                      href={`/marka-merkezi?bolum=varliklar&musteri=${clientId}`}
                      className={dugmeSinifi('ikincil', true)}
                    >
                      Görsel yükle
                    </Link>
                  }
                >
                  Görseller Marka Merkezi › Varlıklar’da tutuluyor.
                </Kutu>
              ) : (
                <>
                  <p className="text-xs text-ink-muted">
                    {t.gorseller.length} / {EN_COK_FIKIR} seçili · arşivdeki son {gorseller.length} görsel
                    gösteriliyor (toplam {gorselToplam}).
                  </p>
                  <div className="grid grid-cols-[repeat(auto-fill,minmax(8.5rem,1fr))] gap-2.5">
                    {gorseller.map((g) => {
                      const sira = t.gorseller.indexOf(g.id);
                      const dolu = sira === -1 && t.gorseller.length >= EN_COK_FIKIR;
                      return (
                        <button
                          key={g.id}
                          type="button"
                          disabled={dolu}
                          onClick={() => guncelle({ gorseller: gorselDegistir(t.gorseller, g.id) })}
                          aria-pressed={sira !== -1}
                          className={`relative overflow-hidden rounded-lg border-2 text-left disabled:opacity-40 ${
                            sira !== -1 ? 'border-brand' : 'border-transparent hover:border-line'
                          }`}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={`${API_URL}${g.onizlemeAdresi}`}
                            alt={g.ad}
                            className="aspect-square w-full bg-surface-sunken object-cover"
                          />
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
                    })}
                  </div>
                </>
              )}
            </div>
          )}
          {adim === 2 && (
            <div className="space-y-4">
              <Soru baslik="Ne yazacaksın?">Bütün fikirlerde aynı metin kullanılır.</Soru>
              <Alan id="yr-baslik" etiket="Başlık" not={`${t.baslik.length} / ${BASLIK_SINIRI}`}>
                <input
                  id="yr-baslik"
                  value={t.baslik}
                  maxLength={BASLIK_SINIRI}
                  onChange={(e) => guncelle({ baslik: e.target.value })}
                  className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm"
                />
              </Alan>
              <Alan
                id="yr-metin"
                etiket="Ana metin"
                not={
                  t.metin.length > GORUNEN_METIN
                    ? `İlk ${GORUNEN_METIN} karakter akışta görünür, gerisi "devamını gör" altında.`
                    : `${t.metin.length} karakter`
                }
              >
                <textarea
                  id="yr-metin"
                  rows={5}
                  value={t.metin}
                  onChange={(e) => guncelle({ metin: e.target.value })}
                  className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm"
                />
              </Alan>
              {metinSablonlari.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-xs font-semibold text-ink-muted">Marka Merkezi’ndeki metinler</p>
                  <div className="flex flex-wrap gap-1.5">
                    {metinSablonlari.map((m, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => guncelle({ metin: m })}
                        className="max-w-full truncate rounded-full border border-line px-3 py-1 text-xs hover:bg-surface-muted"
                        title={m}
                      >
                        {m.slice(0, 48)}
                        {m.length > 48 ? '…' : ''}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {yasalUyari && (
                <Kutu
                  ton={eksik.some((e) => e.metin.startsWith('Zorunlu')) ? 'uyari' : 'iyi'}
                  baslik="Zorunlu yasal uyarı"
                  eylem={
                    !t.metin.includes(yasalUyari) ? (
                      <Dugme
                        ton="ikincil"
                        kucuk
                        onClick={() => guncelle({ metin: `${t.metin.trimEnd()}\n\n${yasalUyari}`.trimStart() })}
                      >
                        Metne ekle
                      </Dugme>
                    ) : undefined
                  }
                >
                  {yasalUyari}
                </Kutu>
              )}
            </div>
          )}
          {adim === 3 && (
            <div className="space-y-3">
              <Soru baslik="Ne kadar harcamak istiyorsun?">
                Günlük bütçe{hesap ? `, ${hesap.paraBirimi}` : ''}. Yayından sonra değiştirebilirsin.
              </Soru>
              <div className="grid grid-cols-[repeat(auto-fill,minmax(10rem,1fr))] gap-2.5">
                {[250, 500, 1000].map((g) => (
                  <Secenek key={g} secili={t.gunlukButce === g} onClick={() => guncelle({ gunlukButce: g })}>
                    <b className="block text-lg tabular-nums">{para(g)}</b>
                    <span className="text-xs text-ink-muted">günde</span>
                  </Secenek>
                ))}
              </div>
              <Alan id="yr-butce" etiket="Başka bir tutar">
                <input
                  id="yr-butce"
                  type="number"
                  min={1}
                  inputMode="numeric"
                  value={t.gunlukButce ?? ''}
                  onChange={(e) => guncelle({ gunlukButce: e.target.value === '' ? null : Number(e.target.value) })}
                  className="w-40 rounded-lg border border-line bg-surface px-3 py-2 text-sm tabular-nums"
                />
              </Alan>
              <p className="text-xs text-ink-muted">
                Hesabın Meta’daki en düşük bütçesi yayından önce okunup burada gösterilecek. Şu an okunmuyor.
              </p>
            </div>
          )}
          {adim === 4 && (
            <div className="space-y-3">
              <Soru baslik="Ne zamana kadar?" />
              <div className="grid grid-cols-[repeat(auto-fill,minmax(11rem,1fr))] gap-2.5">
                {SURE_SECENEKLERI.map((s) => {
                  const toplam = toplamUstSinir(t.gunlukButce, s);
                  return (
                    <Secenek key={String(s)} secili={t.sureGun === s} onClick={() => guncelle({ sureGun: s })}>
                      <b className="block text-sm">{s ? `${s} gün` : 'Ben durdurana kadar'}</b>
                      <span className="text-xs text-ink-muted">
                        {toplam !== null
                          ? `Toplam en çok ${para(toplam)}`
                          : t.gunlukButce
                            ? `Her gün ${para(t.gunlukButce)}`
                            : 'Önce bütçe seç'}
                      </span>
                    </Secenek>
                  );
                })}
              </div>
            </div>
          )}
          {adim === 5 && (
            <GozdenGecir
              t={t}
              workspaceAdi={workspaceAdi}
              sayfaAdi={sayfa?.ad ?? null}
              hesapAdi={hesap?.ad ?? null}
              gorseller={secGorseller}
              kitleOzetiMetni={kitleOzetiMetni}
              para={para}
              eksikVar={eksik.length > 0}
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
              <Dugme onClick={() => setAdim((adim + 1) as AdimNo)} disabled={adim === 0 && !t.niyet}>
                {adim === 4 ? 'Gözden geçir' : 'Devam et'}
              </Dugme>
            )}
          </div>
        </section>
      </div>

      <aside className="lg:sticky lg:top-4 lg:self-start">
        <div className="rounded-xl border border-line bg-surface p-4 text-sm">
          <h2 className="mb-2 text-sm font-semibold">Bu reklam ne yapacak?</h2>
          <dl className="divide-y divide-line">
            <Ozet ad="Amaç" deger={niyet?.ekranAdi ?? 'Seçilmedi'} />
            <Ozet
              ad="Sonuç"
              deger={niyet?.meta ? sonucEtiketi(niyet.meta.optimizationGoal) : '-'}
            />
            <Ozet ad="Hesap" deger={hesap?.ad ?? 'Seçilmedi'} />
            <Ozet ad="Fikir" deger={`${t.gorseller.length} görsel`} />
            <Ozet ad="Bütçe" deger={t.gunlukButce ? `${para(t.gunlukButce)} / gün` : 'Seçilmedi'} />
            <Ozet ad="Süre" deger={t.sureGun ? `${t.sureGun} gün` : 'Süresiz'} />
          </dl>
          {eksik.length > 0 ? (
            <ul className="mt-3 space-y-1 text-xs">
              {eksik.map((e) => (
                <li key={e.metin}>
                  <button type="button" onClick={() => setAdim(e.adim)} className="text-warn-strong hover:underline">
                    {e.metin}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-xs font-semibold text-ok-strong">Gözden geçirmeye hazır</p>
          )}
        </div>
      </aside>
    </div>
  );
}

function AdimAmac({
  t,
  guncelle,
  hesaplar,
  sayfalar,
}: {
  t: YeniReklamTaslagi;
  guncelle: (p: Partial<YeniReklamTaslagi>) => void;
  hesaplar: HazirlikHesabi[];
  sayfalar: HazirlikProfili[];
}) {
  return (
    <div className="space-y-4">
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
            <Secenek key={n.kod} secili={t.niyet === n.kod} onClick={() => guncelle({ niyet: n.kod })}>
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
      <div className="grid gap-3 sm:grid-cols-2">
        <Alan id="yr-hesap" etiket="Reklam hesabı">
          <select
            id="yr-hesap"
            value={t.reklamHesabiId ?? ''}
            onChange={(e) => guncelle({ reklamHesabiId: e.target.value || null })}
            className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm"
          >
            <option value="">Seç ({hesaplar.length} hesap)</option>
            {hesaplar.map((h) => (
              <option key={h.id} value={h.id}>
                {h.ad} · {h.paraBirimi}
              </option>
            ))}
          </select>
        </Alan>
        <Alan id="yr-sayfa" etiket="Facebook sayfası">
          <select
            id="yr-sayfa"
            value={t.sayfaId ?? ''}
            onChange={(e) => guncelle({ sayfaId: e.target.value || null })}
            className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm"
          >
            <option value="">Seç ({sayfalar.length} sayfa)</option>
            {sayfalar.map((s) => (
              <option key={s.id} value={s.id}>
                {s.ad}
              </option>
            ))}
          </select>
        </Alan>
      </div>
    </div>
  );
}

function GozdenGecir({
  t,
  workspaceAdi,
  sayfaAdi,
  hesapAdi,
  gorseller,
  kitleOzetiMetni,
  para,
  eksikVar,
}: {
  t: YeniReklamTaslagi;
  workspaceAdi: string;
  sayfaAdi: string | null;
  hesapAdi: string | null;
  gorseller: HazirlikGorseli[];
  kitleOzetiMetni: string | null;
  para: (n: number) => string;
  eksikVar: boolean;
}) {
  const niyet = t.niyet ? NIYET_KATALOGU[t.niyet] : null;
  const toplam = toplamUstSinir(t.gunlukButce, t.sureGun);
  return (
    <div className="space-y-4">
      <Soru baslik="Gözden geçir ve yayınla">
        Meta’ya gidecek her şey burada. Yayın önce duraklatılmış kurar, geri okur, fark yoksa açar.
      </Soru>

      <Blok harf="A" baslik="Meta’nın gözünden">
        {gorseller.length === 0 ? (
          <p className="text-sm text-ink-muted">Görsel seçilmedi.</p>
        ) : (
          <div className="flex gap-3 overflow-x-auto pb-1">
            {gorseller.map((g, i) => (
              <figure key={g.id} className="w-44 shrink-0 rounded-xl border border-line bg-surface-muted p-2 text-xs">
                <figcaption className="mb-1.5 font-semibold">
                  {sayfaAdi ?? workspaceAdi} <span className="font-normal text-ink-muted">· Sponsorlu</span>
                </figcaption>
                <p className="mb-1.5 line-clamp-3 text-ink-muted">{t.metin || 'Ana metin boş'}</p>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`${API_URL}${g.onizlemeAdresi}`} alt="" className="aspect-square w-full rounded-md object-cover" />
                <p className="mt-1.5 truncate font-semibold">{t.baslik || 'Başlık boş'}</p>
                <p className="text-ink-muted">Fikir {i + 1}</p>
              </figure>
            ))}
          </div>
        )}
        <p className="mt-2 text-xs text-ink-muted">
          Gerçek önizleme Meta’nın kendi çizimiyle gelecek (prova). Bu kutular yaklaşık görünüm.
        </p>
      </Blok>

      <Blok harf="B" baslik="Plan">
        <div className="grid gap-2.5 sm:grid-cols-3">
          <PlanKutusu ad="Kime">
            {kitleOzetiMetni ?? 'Varsayılan kitle yok: Türkiye geneli.'} Konum kesin; yaş ve ilgiyi Meta ipucu olarak
            kullanır ve kitleyi genişletebilir.
          </PlanKutusu>
          <PlanKutusu ad="Nerede">Otomatik yerleşim: Facebook, Instagram, Reels, hikâye.</PlanKutusu>
          <PlanKutusu ad="Ne kadar">
            {t.gunlukButce ? `${para(t.gunlukButce)} / gün` : 'Bütçe seçilmedi'}
            {t.sureGun ? `, ${t.sureGun} gün` : ', süresiz'}. Ödeme {hesapAdi ?? 'reklam hesabından'}.
          </PlanKutusu>
        </div>
      </Blok>

      <Blok harf="C" baslik="Kapattıklarımız">
        <ul className="list-disc space-y-1 pl-5 text-sm text-ink-muted">
          <li>Başka markaların reklamlarıyla yan yana gösterim kapalı.</li>
          <li>Meta’nın yapay zekâyla görseli ve metni değiştirmesi kapalı.</li>
          <li>Reklam önce duraklatılmış kurulur; geri okunmadan harcama başlamaz.</li>
        </ul>
      </Blok>

      <Blok harf="D" baslik="Yayından sonra değişmez">
        <ul className="list-disc space-y-1 pl-5 text-sm text-ink-muted">
          <li>Amaç: {niyet?.ekranAdi ?? 'seçilmedi'}.</li>
          {t.niyet === 'FORM' && <li>Formun soruları ve onay kutuları.</li>}
        </ul>
      </Blok>

      <Blok harf="F" baslik="Para">
        <dl className="flex flex-wrap gap-6 tabular-nums">
          <div>
            <dt className="text-xs text-ink-muted">Günlük</dt>
            <dd className="text-lg font-semibold">{t.gunlukButce ? para(t.gunlukButce) : '-'}</dd>
          </div>
          <div>
            <dt className="text-xs text-ink-muted">Toplam en çok</dt>
            <dd className="text-lg font-semibold">{toplam !== null ? para(toplam) : 'Süresiz'}</dd>
          </div>
        </dl>
      </Blok>

      <div className="flex flex-wrap items-center justify-end gap-3 border-t border-line pt-4">
        <p className="mr-auto max-w-prose text-xs text-ink-muted">
          Önizleme: yayın motoru henüz bağlı değil, bu ekran Meta’ya hiçbir şey göndermez.
        </p>
        <Dugme disabled title={eksikVar ? 'Önce eksikleri tamamla' : 'Yayın motoru henüz bağlı değil'}>
          Yayına al
        </Dugme>
      </div>
    </div>
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
  children,
}: {
  secili: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={secili}
      className={`rounded-xl border-[1.5px] p-3.5 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand ${
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

function Blok({ harf, baslik, children }: { harf: string; baslik: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-line p-3.5">
      <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted">{harf}</span>
        {baslik}
      </h3>
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

function Ozet({ ad, deger }: { ad: string; deger: string }) {
  return (
    <div className="flex justify-between gap-3 py-1.5 text-xs">
      <dt className="text-ink-muted">{ad}</dt>
      <dd className="text-right font-semibold">{deger}</dd>
    </div>
  );
}
