'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CAMPAIGN_GOALS,
  GOAL_META,
  GOAL_PLATFORM_SUPPORT,
  matchRatio,
  type AssetKind,
  type AssetRecord,
  type CampaignGoal,
  type CreativeRecord,
  type DraftGroupRecord,
  type PublishCheck,
} from '@advetics/shared';
import { platformKisaAdi, videoMu, videoOraniUygun } from '@advetics/shared';
import { API_URL, ApiRequestError, apiFetch } from '@/lib/api';
import { CoveragePanel } from './coverage-panel';
import { Sihirbaz, type SihirbazAdimi } from './sihirbaz';
import { CropStudio } from './crop-studio';

/**
 * Basit yüzey — tek ekran, sıralı bloklar.
 *
 * ESKİ SİHİRBAZDAN FARKLARI ve her birinin gerekçesi:
 *
 *   · PLATFORM SORULMUYOR. Hedef kartının altında hangi platformlarda
 *     çalışacağı YAZIYOR. Kullanıcı Meta'nın ne yaptığını bilmiyor; ona
 *     platform sormak cevabını bilmediği bir soruyu sormak.
 *
 *   · "KONTROL ET" KAPISI YOK. Eski akışta kullanıcı her şeyi doldurup bir
 *     düğmeye basıyor ve ancak o zaman eksikleri öğreniyordu. Burada eksikler
 *     yazarken görünüyor; taslak oluşturulduktan sonra da sunucu kontrolü
 *     kendiliğinden çalışıyor.
 *
 *   · TASLAK TEK SEFERDE OLUŞUYOR. Eski akışta taslak görsel yüklenirken
 *     sessizce kaydediliyordu ve metin yazıp çıkan kullanıcı yazdığını
 *     kaybediyordu. Burada kayıt tek bir eylemle yapılıyor, yarım durum yok.
 *
 *   · ÜÇ ORAN KUTUSU YOK. Kreatif bir görsel HAVUZU: hangi görselin hangi
 *     yerleşime gideceğine `coverageFor` ölçülen boyutlardan karar veriyor.
 */

type Step = 'form' | 'created';

/**
 * SÜRE SEÇENEKLERİ.
 *
 * Yedi gün varsayılan: bir haftadan kısası Meta'nın öğrenme evresini
 * tamamlamasına yetmiyor ve kampanya kapandığında elde karşılaştırılabilir
 * bir sonuç kalmıyor.
 *
 * SÜRESİZ LİSTENİN SONUNDA ve ne demek olduğu etiketinde yazıyor —
 * "unutulan kampanya" bu üründe en pahalı kullanıcı hatası.
 */
const SURE_SECENEKLERI = [
  { value: '7', label: '7 gün' },
  { value: '14', label: '14 gün' },
  { value: '30', label: '30 gün' },
  { value: '0', label: 'Süresiz — sen durdurana kadar' },
] as const;

const BUDGET_PRESETS = [
  { label: 'Küçük başla', value: '100', hint: 'Sonuçları görmek için yeterli.' },
  { label: 'Dengeli', value: '250', hint: 'Çoğu kampanyanın başladığı yer.' },
  { label: 'Hızlı sonuç', value: '500', hint: 'Daha çok kişiye daha çabuk ulaşır.' },
] as const;

export function SimpleAdBuilder({
  clientId,
  accounts,
  pages,
  libraryAssets,
  libraryTotal,
  clientWebsite,
}: {
  clientId: string;
  accounts: Array<{ id: string; name: string; currency: string }>;
  pages: Array<{ id: string; name: string }>;
  libraryAssets: AssetRecord[];
  libraryTotal: number;
  /** Workspace kartındaki site adresi — web kampanyasında ön dolgu. */
  clientWebsite: string | null;
}) {
  const router = useRouter();

  const [goal, setGoal] = useState<CampaignGoal | null>(null);

  /**
   * HEDEF SEÇİLİNCE AD VE ADRES KENDİLİĞİNDEN DOLUYOR.
   *
   * `useEffect` DEĞİL, seçim anında: effect yazsaydık kullanıcının elle
   * değiştirdiği adı bir sonraki render'da geri ezerdi. Karar tek bir yerde
   * ve yalnızca hedef DEĞİŞTİĞİNDE çalışıyor.
   */
  function hedefSec(secilen: CampaignGoal): void {
    setGoal(secilen);
    setName(otomatikAd(secilen));
    // SİTE ADRESİ WORKSPACE KARTINDAN. Kullanıcı isterse değiştiriyor; boş bir
    // kutu bırakmak, zaten bildiğimiz bir bilgiyi ona yazdırmak olurdu.
    if (secilen === 'website' && clientWebsite) setLinkUrl((cur) => cur || clientWebsite);
  }
  /**
   * KAMPANYA ADI KENDİLİĞİNDEN YAZILIYOR.
   *
   * Yalnızca ajansın gördüğü bir etiket ve kullanıcıdan istemek, sonucu
   * değiştirmeyen bir yazma işiydi. Hedef seçildiğinde doluyor; kullanıcı
   * yine de değiştirebiliyor (oluşturulan kampanya kartında görünüyor).
   *
   * TARİH İÇERİYOR: aynı hedefle ikinci bir kampanya kurulduğunda listede
   * birbirinden ayırt edilebilsin.
   */
  const [name, setName] = useState('');
  const [adAccountId, setAdAccountId] = useState(accounts[0]?.id ?? '');
  const [pageId, setPageId] = useState(pages[0]?.id ?? '');
  const [primaryText, setPrimaryText] = useState('');
  const [headline, setHeadline] = useState('');
  const [description, setDescription] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [assetIds, setAssetIds] = useState<string[]>([]);
  const [dailyBudget, setDailyBudget] = useState<string>(BUDGET_PRESETS[1].value);
  /** Kırpma stüdyosuna girilen kaynak görsel. */
  const [cropSource, setCropSource] = useState<AssetRecord | null>(null);
  /** Stüdyodan dönen görseller — sayfa yenilenene kadar arşiv listesine eklenir. */
  const [uretilenler, setUretilenler] = useState<AssetRecord[]>([]);
  /** Bu ekrandan yüklenen görseller — sekme değiştirmeden. */
  const [yukleniyor, setYukleniyor] = useState(false);
  const [yuklemeNotu, setYuklemeNotu] = useState<string | null>(null);
  const [durationDays, setDurationDays] = useState('7');

  const [step, setStep] = useState<Step>('form');
  /** Sihirbazda kaçıncı adım — 0 tabanlı. */
  const [adim, setAdim] = useState(0);
  /**
   * SAYFAYA BAĞLI WHATSAPP NUMARASI — TEYİT İÇİN.
   *
   * Kullanıcının isteği: "whatsapp numarasının doğru olup olmadığını teyit
   * etmem için gözükmesini istiyorum". Reklam numarayı SORMUYOR (Meta onu
   * sayfadan alıyor) ama hangi hatta mesaj düşeceği yayından ÖNCE
   * görünmeli — yanlış hat, ancak müşteri "hiç mesaj gelmiyor" dediğinde
   * fark ediliyor.
   *
   * ÜÇ HÂL AYRI: okunuyor / numara yok / okunamadı.
   */
  const [whatsapp, setWhatsapp] = useState<
    { durum: 'bekliyor' } | { durum: 'geldi'; numara: string | null; hata: string | null }
  >({ durum: 'bekliyor' });
  const [group, setGroup] = useState<DraftGroupRecord | null>(null);
  const [check, setCheck] = useState<PublishCheck | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const currency = accounts.find((a) => a.id === adAccountId)?.currency ?? 'TRY';

  /**
   * Eksikler YAZARKEN hesaplanıyor, düğmeye basınca değil.
   *
   * Bu liste sunucunun kontrolünün yerini almıyor — sunucu son söz sahibi ve
   * taslak oluşturulduktan sonra `check` yine çalışıyor. Buradaki amaç
   * kullanıcının bir düğmeye basıp "olmadı" öğrenmesini engellemek.
   */
  const eksikler = useMemo(() => {
    const list: string[] = [];
    if (!goal) list.push('Ne istediğini seç.');
    if (!primaryText.trim()) list.push('Reklamın ana metnini yaz.');
    if (goal === 'website' && !linkUrl.trim()) list.push('Web sitesi adresini yaz.');
    if (assetIds.length === 0) list.push('En az bir görsel seç.');
    return list;
  }, [goal, name, primaryText, linkUrl, assetIds]);

  /**
   * Kullanılabilir görseller — SEÇİLEMEYEN GÖRSELİN SEBEBİ YAZIYOR.
   *
   * Arşiv her oranı kabul ediyor (Google 1.91:1 ve 4:5 istiyor, logo 4:1) ama
   * Meta reklamı kare, 9:16 ve 16:9 kovalarına oturuyor. Telefondan çekilmiş
   * 4:3 bir fotoğraf hiçbirine girmiyor ve bunu tıklamadan önce görmeli.
   */
  /**
   * Gösterilecek görseller — ARŞİV + BU OTURUMDA ÜRETİLENLER.
   *
   * Kırpma sonrası `router.refresh()` beklemek, kullanıcının az önce
   * ürettiği görselleri birkaç saniye görememesi demek. Üretilenler listeye
   * ÖNDEN ekleniyor; mükerrer olanlar (arşivde zaten vardı) elenmiş hâlde.
   */
  const gosterilen = useMemo(() => {
    const arsivKimlikleri = new Set(libraryAssets.map((a) => a.id));
    return [...uretilenler.filter((a) => !arsivKimlikleri.has(a.id)), ...libraryAssets];
  }, [libraryAssets, uretilenler]);

  /**
   * SEÇİLEBİLİRLİK TÜRE GÖRE. Görsel üç orana oturmak zorunda (eksik kova =
   * kapalı yerleşim), video ise bir ARALIĞA giriyor ve Meta yerleşim başına
   * kendisi kırpıyor. Aynı kuralı ikisine birden uygulamak 4:5 videoyu
   * seçilemez yapıyordu ve altındaki "kırpıp kullan" görsel kırpıcısına
   * gidiyor, yani videoda kaçış yolu da yoktu.
   */
  const secilebilir = useCallback(
    (a: { kind: AssetKind; width: number; height: number }) =>
      videoMu(a.kind)
        ? videoOraniUygun(a.width, a.height)
        : matchRatio(a.width, a.height) !== null,
    [],
  );

  const uymayanSayisi = gosterilen.filter((a) => !secilebilir(a)).length;

  /**
   * ═══ GÖRSEL BU EKRANDAN YÜKLENİYOR ═══
   *
   * Kullanıcının bildirdiği hâl: "illa arşive yüklemem gerekiyorsa sekme
   * değiştirmeyim, kampanya kurma ekranından görseli ekleyebileceğim şekilde
   * yapmanı istiyorum".
   *
   * Eski ekran boş arşivde yalnızca "Kütüphane → Görsel Arşivi bölümünden
   * yükleyebilirsin" yazıyordu: kullanıcı yazdığı metni kaybetmemek için
   * yeni sekme açıyor, yüklüyor, geri dönüyor ve listeyi tazelemek için
   * sayfayı yeniliyordu — yazdığı her şey gidiyordu.
   *
   * AYNI UÇ KULLANILIYOR (`POST /assets`): ikinci bir yükleme yolu yazmak,
   * mükerrer kontrolünü ve boyut sınırını ikinci kez yazmak olurdu.
   * Yüklenen görsel arşive de giriyor — burada yüklemek onu "tek seferlik"
   * yapmıyor.
   */
  /*
   * NUMARA YALNIZCA WHATSAPP HEDEFİNDE VE SAYFA BELLİYKEN çekiliyor.
   * Her sayfa yüklemesinde çağırmak, kullanılmayacak bir Graph isteği
   * demekti.
   */
  useEffect(() => {
    if (goal !== 'whatsapp' || !pageId) return;
    let birakildi = false;
    setWhatsapp({ durum: 'bekliyor' });
    void apiFetch<{ number: string | null; error: string | null }>(
      `/connections/social-profiles/${pageId}/whatsapp`,
    )
      .then((r) => {
        if (!birakildi) setWhatsapp({ durum: 'geldi', numara: r.number, hata: r.error });
      })
      .catch((e: unknown) => {
        if (birakildi) return;
        // HATA YUTULMUYOR: "numara yok" ile "okuyamadık" ayrı hâller.
        setWhatsapp({
          durum: 'geldi',
          numara: null,
          hata: e instanceof ApiRequestError ? e.message : 'Numara okunamadı.',
        });
      });
    return () => {
      birakildi = true;
    };
  }, [goal, pageId]);

  async function gorselYukle(files: FileList | null, kind: 'image' | 'video' = 'image'): Promise<void> {
    if (!files || files.length === 0) return;
    setYukleniyor(true);
    setYuklemeNotu(null);
    setError(null);

    let eklendi = 0;
    let mukerrer = 0;

    for (const file of Array.from(files)) {
      const form = new FormData();
      form.append('file', file);
      try {
        // `apiFetch` JSON gövdesi kuruyor; multipart için doğrudan fetch.
        // Content-Type ELLE VERİLMİYOR: tarayıcı boundary'yi kendisi ekliyor.
        const res = await fetch(`${API_URL}/assets?clientId=${clientId}&kind=${kind}`, {
          method: 'POST',
          credentials: 'include',
          body: form,
        });
        if (!res.ok) {
          const b = (await res.json().catch(() => null)) as { message?: string } | null;
          throw new Error(b?.message ?? `${file.name} yüklenemedi`);
        }
        const result = (await res.json()) as { asset: AssetRecord; duplicate: boolean };
        /*
         * MÜKERRER GÖRSEL DE SEÇİLİYOR. Aynı dosyayı ikinci kez yükleyen
         * kullanıcı onu kullanmak istiyor; "zaten vardı" deyip seçmemek,
         * listede aramasına yol açardı.
         */
        if (result.duplicate) mukerrer++;
        else {
          eklendi++;
          setUretilenler((cur) => [result.asset, ...cur]);
        }
        setAssetIds((cur) => (cur.includes(result.asset.id) ? cur : [...cur, result.asset.id]));
      } catch (err) {
        // HATA YUTULMUYOR: sunucunun kendi cümlesi (boyut, biçim, kota)
        // ekranda görünmeli.
        setError(err instanceof Error ? err.message : 'Görsel yüklenemedi.');
      }
    }

    setYuklemeNotu(
      [eklendi > 0 ? `${eklendi} görsel eklendi` : null, mukerrer > 0 ? `${mukerrer} zaten arşivdeydi` : null]
        .filter(Boolean)
        .join(' · ') || null,
    );
    setYukleniyor(false);
  }

  /**
   * ═══ METİNLERİ YAPAY ZEKÂ DOLDURUYOR ═══
   *
   * Kullanıcının isteği: "metinleri oluşturmak istersem de yapay zeka ile
   * doldur diyeyim doldursun bütün metinleri".
   *
   * ÜÇ ALANI BİRDEN dolduruyor: ana metin, başlık ve açıklama birbirine
   * bağlı bir bütün ve ayrı ayrı üretmek üç farklı reklam gibi konuşan bir
   * metin çıkarırdı.
   *
   * YAZILANI EZİYOR VE BU AÇIKÇA YAZILI (düğmenin altında). Sessizce
   * birleştirmek, kullanıcının yazdığı cümleyi bulamaması demekti.
   */
  async function metinleriDoldur(): Promise<void> {
    if (!goal) return;
    setBusy('ai');
    setError(null);
    try {
      const r = await apiFetch<{
        primaryText: string;
        headline: string;
        description: string;
      }>('/creatives/metin-onerisi', {
        method: 'POST',
        body: JSON.stringify({
          clientId,
          goal,
          campaignName: name.trim() || undefined,
          linkUrl: linkUrl.trim() || undefined,
          // SEÇİLİ GÖRSELLER MODELE GİDİYOR: metin gördüğü şeyden doğsun.
          // Üçle sınırlı — sunucu da aynı sınırı uyguluyor.
          assetIds: assetIds.slice(0, 3),
        }),
      });
      setPrimaryText(r.primaryText);
      setHeadline(r.headline);
      setDescription(r.description);
    } catch (err) {
      setError(
        err instanceof ApiRequestError ? err.message : 'Metinler oluşturulamadı.',
      );
    } finally {
      setBusy(null);
    }
  }

  async function olustur(): Promise<void> {
    if (!goal) return;
    setBusy('create');
    setError(null);
    try {
      /**
       * ÖNCE KREATİF, SONRA AĞAÇ.
       *
       * İki çağrı çünkü kreatif kütüphaneye ait: aynı metin ve görsel ikinci
       * bir kampanyada yeniden kullanılabilsin. Tek çağrıya sıkıştırmak,
       * kreatifi kampanyaya bağlıymış gibi göstermek olurdu.
       */
      const creative = await apiFetch<CreativeRecord>('/creatives', {
        method: 'POST',
        body: JSON.stringify({
          clientId,
          name: name.trim(),
          texts: {
            primaryText: primaryText.trim(),
            headlines: headline.trim() ? [headline.trim()] : [],
            longHeadlines: [],
            descriptions: description.trim() ? [description.trim()] : [],
          },
          assetIds,
        }),
      });

      const created = await apiFetch<DraftGroupRecord>('/draft-campaigns/simple', {
        method: 'POST',
        body: JSON.stringify({
          clientId,
          name: name.trim(),
          goal,
          targets: [{ platform: 'meta', adAccountId, dailyBudget }],
          socialProfileId: pageId,
          creativeIds: [creative.id],
          durationDays: Number(durationDays),
          linkUrl: linkUrl.trim() || undefined,
        }),
      });

      setGroup(created);
      setStep('created');

      // KONTROL KENDİLİĞİNDEN ÇALIŞIYOR. Kullanıcının ayrı bir düğmeye
      // basması gerekmiyor; "hazır mı" sorusunun cevabı hemen ekranda.
      const first = created.campaigns[0];
      if (first) setCheck(await apiFetch<PublishCheck>(`/draft-campaigns/${first.id}/check`));
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Taslak oluşturulamadı');
    } finally {
      setBusy(null);
    }
  }

  async function yayinla(): Promise<void> {
    if (!group?.campaigns[0]) return;
    setBusy('publish');
    setError(null);
    try {
      /**
       * GRUP YAYINI — her platform BAĞIMSIZ.
       *
       * Uç nokta hata fırlatmıyor: Meta çıkıp Google düştüğünde tek bir hata
       * göstermek, yayına girmiş ve o anda para harcamaya başlamış kampanyayı
       * gizlemek olurdu. Yanıt her platformun kendi durumunu taşıyor.
       */
      const result = await apiFetch<DraftGroupRecord>(
        `/draft-campaigns/${group.campaigns[0].id}/publish-group`,
        { method: 'POST' },
      );
      setGroup(result);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Reklam yayınlanamadı');
    } finally {
      setBusy(null);
    }
  }

  if (step === 'created' && group) {
    return (
      <Sonuc
        group={group}
        check={check}
        busy={busy}
        error={error}
        onPublish={yayinla}
        onReset={() => {
          setStep('form');
          setGroup(null);
          setCheck(null);
        }}
      />
    );
  }

  /**
   * ═══ SİHİRBAZIN ADIMLARI ═══
   *
   * Sıra kullanıcının tarif ettiği akış: hedef → görsel → metin → bütçe →
   * özet. Ayarlar (hesap/sayfa/adres) kendi adımı DEĞİL: çoğu workspace'te
   * hiç çizilmiyor ve tek seçenekli bir adım, cevabı belli bir soruyu ayrı
   * bir ekrana koymak olurdu — hedefin hemen altında duruyor.
   *
   * HER ADIM KENDİ TAMAMLANMA KOŞULUNU TAŞIYOR ve eksikse SEBEBİ yazılı:
   * kapalı bir "Devam" düğmesi tek başına "bozuk" olarak okunuyor.
   */
  const adimlar: SihirbazAdimi[] = [
    {
      ad: 'Hedef',
      baslik: 'Ne olsun?',
      altBaslik: 'Reklamın işi ne: form mu, mesaj mı, site ziyareti mi.',
      tamam: goal !== null,
      eksik: 'Önce bir hedef seç.',
      icerik: (
        <div className="space-y-5">

          <div className="grid gap-2 sm:grid-cols-3">
            {CAMPAIGN_GOALS.map((g) => (
              <button
                key={g}
                type="button"
                onClick={() => hedefSec(g)}
                className={`rounded-xl border p-3 text-left transition ${
                  goal === g ? 'border-brand bg-brand-soft' : 'border-line hover:bg-surface-sunken'
                }`}
              >
                <span className="block text-sm font-semibold text-ink">{GOAL_META[g].label}</span>
                <span className="mt-1 block text-xs text-ink-muted">{GOAL_META[g].promise}</span>
                {/* PLATFORM SORU DEĞİL, SONUÇ. */}
                <span className="mt-2 block text-[11px] font-medium text-ink-muted">
                  {platformEtiketi(g)}
                </span>
              </button>
            ))}
          </div>
{(accounts.length > 1 || pages.length > 1 || goal === 'website') && (
            <Blok no={2} baslik="Ayarlar" altBaslik="Gerisini biz dolduruyoruz.">
              <div className="grid gap-3 sm:grid-cols-2">
                {accounts.length > 1 && (
                  <Alan label="Reklam hesabı">
                    <select
                      value={adAccountId}
                      onChange={(e) => setAdAccountId(e.target.value)}
                      className={input}
                    >
                      {accounts.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name}
                        </option>
                      ))}
                    </select>
                  </Alan>
                )}
                {pages.length > 1 && (
                  <Alan label="Hangi sayfa adına yayınlansın">
                    <select
                      value={pageId}
                      onChange={(e) => setPageId(e.target.value)}
                      className={input}
                    >
                      {pages.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </Alan>
                )}

                {goal === 'website' && (
                  <Alan
                    label="Web sitesi adresi"
                    ipucu="Workspace kartından geldi; başka bir sayfaya göndermek istersen değiştir."
                  >
                    <input
                      value={linkUrl}
                      onChange={(e) => setLinkUrl(e.target.value)}
                      placeholder="https://siteniz.com/urun"
                      className={input}
                    />
                  </Alan>
                )}
              </div>
            </Blok>
          )}
        </div>
      ),
    },
    {
      ad: 'Görsel',
      baslik: 'Reklamda ne görünsün?',
      altBaslik: 'Bilgisayarından yükle ya da arşivden seç. Hangisinin nereye gideceğine biz karar veririz.',
      tamam: assetIds.length > 0,
      eksik: 'En az bir görsel seç.',
      icerik: <div className="space-y-4">
        {/* 3. Görseller — HAVUZ, oran kutusu değil */}
        <>
          {/*
            YÜKLEME KUTUSU HER ZAMAN BURADA — boş arşivde de, dolu arşivde de.
            Eski ekran boşken yalnızca "Görsel Arşivi'nden yükleyebilirsin"
            yazıyordu: kullanıcı sekme değiştirip geri döndüğünde yazdığı
            metni kaybediyordu.
          */}
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <label
              className={`inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-ink transition hover:bg-surface-sunken ${
                yukleniyor ? 'pointer-events-none opacity-50' : ''
              }`}
            >
              <input
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                disabled={yukleniyor}
                onChange={(e) => {
                  void gorselYukle(e.target.files);
                  // AYNI DOSYAYI TEKRAR SEÇEBİLMEK İÇİN: input değeri
                  // temizlenmezse `change` bir daha tetiklenmiyor.
                  e.target.value = '';
                }}
              />
              {yukleniyor ? 'Yükleniyor…' : 'Bilgisayardan görsel yükle'}
            </label>
            {/*
              ═══ VİDEO AYNI ADIMDAN ═══

              Ayrı bir sekmeye ya da ayrı bir kampanya tipine koymak,
              kullanıcıyı "videolu reklam nasıl veriliyor" diye aratırdı.
              Aynı adım, iki düğme.
            */}
            <label
              className={`inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-ink transition hover:bg-surface-sunken focus-within:ring-2 focus-within:ring-brand ${
                yukleniyor ? 'pointer-events-none opacity-50' : ''
              }`}
            >
              <input
                type="file"
                accept="video/mp4,video/quicktime"
                className="hidden"
                disabled={yukleniyor}
                onChange={(e) => {
                  void gorselYukle(e.target.files, 'video');
                  e.target.value = '';
                }}
              />
              Video yükle
            </label>
            {/* YÜKLENEN DOSYA KENDİLİĞİNDEN SEÇİLİYOR: yükleyip bir de
                listeden bulup tıklamak gereksiz bir adım. */}
            <span className="text-[11px] text-ink-muted">
              Yüklenen dosya arşive de eklenir ve kendiliğinden seçilir. Video ile görsel
              aynı reklamda kullanılamıyor; video seçersen görseller bırakılır.
            </span>
            {yuklemeNotu && (
              <span className="text-[11px] text-ok-strong">{yuklemeNotu}</span>
            )}
          </div>

          {gosterilen.length === 0 ? (
            <p className="rounded-lg bg-surface-sunken px-3 py-2 text-xs text-ink-muted">
              Henüz görsel yok. Yukarıdaki düğmeyle bilgisayarından yükleyebilir ya da
              <strong> Kütüphane → Görsel Arşivi</strong> bölümünü kullanabilirsin.
            </p>
          ) : (
            <>
              <ul className="grid gap-2 sm:grid-cols-6">
                {gosterilen.map((a) => {
                  const video = videoMu(a.kind);
                  const oran = matchRatio(a.width, a.height);
                  const uygun = secilebilir(a);
                  const secili = assetIds.includes(a.id);
                  return (
                    <li key={a.id}>
                      <button
                        type="button"
                        disabled={!uygun}
                        onClick={() =>
                          /*
                            ═══ VİDEO VE GÖRSEL BİR ARADA SEÇİLEMİYOR ═══

                            Meta tek kreatifte ikisini kabul etmiyor ve
                            ikisini birden göndermek "Invalid parameter" ile
                            dönüyor. Kullanıcıya yayın anında hata vermek
                            yerine SEÇİM ANINDA diğerini bırakıyoruz —
                            doğrulama kullanım anında değil giriş anında.
                          */
                          setAssetIds((prev) => {
                            if (prev.includes(a.id)) return prev.filter((x) => x !== a.id);
                            const secilenVideo = videoMu(a.kind);
                            const kalan = prev.filter((id) => {
                              const o = gosterilen.find((x) => x.id === id);
                              return o ? videoMu(o.kind) === secilenVideo : false;
                            });
                            // VİDEO TEK: ikinci bir video seçmek, hangisinin
                            // oynatılacağını belirsiz bırakırdı.
                            return secilenVideo ? [a.id] : [...kalan, a.id];
                          })
                        }
                        title={
                          uygun
                            ? `${a.name} · ${a.width}×${a.height}`
                            : `${a.name} · ${a.width}×${a.height} — bu oran Meta reklamında kullanılamıyor`
                        }
                        className={`block w-full overflow-hidden rounded-lg border-2 bg-surface-sunken transition ${
                          secili
                            ? 'border-brand'
                            : uygun
                              ? 'border-transparent hover:border-line'
                              : 'cursor-not-allowed border-transparent opacity-35'
                        }`}
                      >
                        {/*
                          VİDEO `<video>` İLE ÇİZİLİYOR, `<img>` İLE DEĞİL.
                          Tarayıcı ilk kareyi kendisi gösteriyor; sunucuda
                          küçük resim üretmek ffmpeg demekti ve bu paylaşımlı
                          VPS'e sistem ikilisi kurmak yasak (CLAUDE.md §1).

                          `preload="metadata"`: bütün dosyayı indirmeden ilk
                          kare geliyor. `preload="auto"` altı videolu bir
                          arşivde yüzlerce megabayt indirirdi.
                        */}
                        {video ? (
                          <video
                            src={`${API_URL}${a.previewUrl}`}
                            className="aspect-square w-full bg-black object-contain"
                            preload="metadata"
                            muted
                            playsInline
                          />
                        ) : (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img
                          src={`${API_URL}${a.previewUrl}`}
                          alt={a.name}
                          className="aspect-square w-full object-contain"
                          loading="lazy"
                        />
                        )}
                        <span className="block truncate px-1 pb-1 text-[10px] text-ink-muted">
                          {secili ? `✓ ${assetIds.indexOf(a.id) + 1}.` : uygun ? a.name : 'oran uymuyor'}
                        </span>
                      </button>

                      {/* KIRPMA HER GÖRSELDE VAR, yalnızca uymayanlarda değil.
                          Kare bir fotoğraftan dikey üretmek de anlamlı: dikey
                          görsel yoksa Hikâyeler yerleşimi hiç açılmıyor.

                          VİDEODA YOK: kırpıcı görsel kırpıyor ve videoya
                          basıldığında yapacağı bir şey yok. Çalışmayan bir
                          düğme göstermek, kullanıcıyı olmayan bir çözüme
                          gönderir. */}
                      {!video && (
                        <button
                          type="button"
                          onClick={() => setCropSource(a)}
                          className="mt-0.5 w-full text-[10px] text-brand-strong underline"
                        >
                          {oran ? 'kırp' : 'kırpıp kullan'}
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>

              {/* SESSİZ ELEME YOK: kaç görsel gösteriliyor, kaçı neden
                  kullanılamıyor ve toplam kaç tane var — üçü de yazıyor.
                  ARTIK ÇÖZÜMÜ DE SÖYLÜYOR: uymayan görsel çöp değil,
                  kırpılabilir. */}
              <p className="mt-2 text-[11px] text-ink-muted">
                {gosterilen.length} görsel gösteriliyor
                {libraryTotal > libraryAssets.length && ` (arşivde toplam ${libraryTotal})`}.
                {uymayanSayisi > 0 &&
                  ` Soluk görünen ${uymayanSayisi} tanesi Meta reklamına uymayan oranlarda — ` +
                    'görselleri altlarındaki "kırpıp kullan" ile çevirebilirsin.'}
              </p>

              {cropSource && (
                <div className="mt-3">
                  <CropStudio
                    clientId={clientId}
                    source={cropSource}
                    onCancel={() => setCropSource(null)}
                    onDone={(uretilen) => {
                      /**
                       * ÜRETİLEN GÖRSELLER KENDİLİĞİNDEN SEÇİLİYOR.
                       *
                       * Kullanıcı zaten "bunu kullanacağım" diyerek kırptı;
                       * bir de listeden tek tek seçmesini istemek, aracın
                       * kurtardığı işi geri vermek olurdu.
                       */
                      setUretilenler((prev) => [
                        ...uretilen.filter((u) => !prev.some((p) => p.id === u.id)),
                        ...prev,
                      ]);
                      setAssetIds((prev) => [
                        ...new Set([...prev, ...uretilen.map((u) => u.id)]),
                      ]);
                      setCropSource(null);
                      // Arşiv listesi de tazelensin: sayfa yenilenince
                      // görseller sunucudan gelir ve yerel liste erir.
                      router.refresh();
                    }}
                  />
                </div>
              )}
            </>
          )}
        </>

        {/* 4. Metin + önizleme */}
      </div>,
    },
    {
      ad: 'Metin',
      baslik: 'Ne yazalım?',
      altBaslik: 'Yaz ya da yapay zekâya yazdır; görsellere bakarak yazıyor.',
      tamam: primaryText.trim().length > 0,
      eksik: 'Ana metni yaz ya da yapay zekâya yazdır.',
      icerik: <div className="space-y-4">
        <>
          {/*
            ═══ YAPAY ZEKÂ İLE DOLDUR ═══
            Kullanıcının isteği: "metinleri oluşturmak istersem de yapay
            zeka ile doldur diyeyim doldursun bütün metinleri". Üç alan
            birden doldurulıyor — ayrı ayrı üretmek üç farklı reklam gibi
            konuşan bir metin çıkarırdı.
          */}
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void metinleriDoldur()}
              disabled={!goal || busy !== null}
              className="rounded-lg border border-brand/40 bg-brand/5 px-3 py-1.5 text-xs font-medium text-brand-strong transition hover:bg-brand/10 disabled:opacity-40"
            >
              {busy === 'ai' ? 'Yazılıyor…' : 'Yapay zekâ ile doldur'}
            </button>
            {/* EZDİĞİ AÇIKÇA YAZILI: sessizce birleştirmek, kullanıcının
                yazdığı cümleyi bulamaması demekti. */}
            <span className="text-[11px] text-ink-muted">
              {!goal
                ? 'Önce ne istediğini seç.'
                : assetIds.length > 0
                  ? 'Seçtiğin görsellere bakarak yazar; yazdıklarının üzerine yazılır.'
                  : 'Üç alanı da yeniden yazar; yazdıklarının üzerine yazılır. Görsel seçersen onlara da bakar.'}
            </span>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="space-y-3">
              <MetinAlani
                label="Ana metin"
                ipucu="Reklamın üstünde görünen yazı."
                value={primaryText}
                onChange={setPrimaryText}
                limit={125}
                rows={4}
              />
              <MetinAlani
                label="Başlık"
                ipucu="Görselin altında kalın yazıyla görünür."
                value={headline}
                onChange={setHeadline}
                limit={40}
              />
              <MetinAlani
                label="Açıklama"
                ipucu="Başlığın altında küçük yazı. Boş bırakılabilir."
                value={description}
                onChange={setDescription}
                limit={30}
              />
            </div>

            <Onizleme
              pageName={pages.find((p) => p.id === pageId)?.name ?? 'Sayfan'}
              primaryText={primaryText}
              headline={headline}
              description={description}
              goal={goal}
              asset={gosterilen.find((a) => a.id === assetIds[0])}
            />
          </div>
        </>

        {/* 5. Bütçe — HAZIR KARTLAR */}
      </div>,
    },
    {
      ad: 'Bütçe',
      baslik: 'Günde ne kadar harcayalım?',
      altBaslik: 'Her gün bu kadar harcanır; istediğin an durdurabilirsin.',
      tamam: Number(dailyBudget) > 0,
      eksik: 'Günlük bütçe gir.',
      icerik: <div className="space-y-4">
        <>
          <div className="grid gap-2 sm:grid-cols-3">
            {BUDGET_PRESETS.map((p) => (
              <button
                key={p.value}
                type="button"
                onClick={() => setDailyBudget(p.value)}
                className={`rounded-xl border p-3 text-left transition ${
                  dailyBudget === p.value
                    ? 'border-brand bg-brand-soft'
                    : 'border-line hover:bg-surface-sunken'
                }`}
              >
                <span className="block text-sm font-semibold text-ink">
                  {p.value} {currency}
                  <span className="font-normal text-ink-muted"> / gün</span>
                </span>
                <span className="mt-0.5 block text-xs text-ink-muted">{p.label}</span>
                <span className="mt-1 block text-[11px] text-ink-muted">{p.hint}</span>
              </button>
            ))}
          </div>

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Alan label={`Başka bir tutar (${currency})`}>
              <input
                value={dailyBudget}
                onChange={(e) => setDailyBudget(e.target.value)}
                inputMode="decimal"
                className={input}
              />
            </Alan>
            {/*
              ═══ SÜRE: SEÇENEK, YAZILAN SAYI DEĞİL ═══

              Eski hâl bir sayı kutusuydu ve "0 yazarsan süresiz olur"
              diyordu — süresiz kampanya, KEŞFEDİLMESİ gereken bir
              davranıştı. Kullanıcının istediği kurgu birebir: "süresiz mi
              belirli bir süre mi açık kalacağını seçersin".

              SÜRESİZ AÇIKÇA SEÇİLİYOR ve ne demek olduğu yanında yazıyor:
              bu üründe "unutulan kampanya" en pahalı kullanıcı hatası.
            */}
            <Alan label="Ne kadar yayında kalsın">
              <select
                value={durationDays}
                onChange={(e) => setDurationDays(e.target.value)}
                className={input}
              >
                {SURE_SECENEKLERI.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </Alan>
          </div>

          {/* NE SEÇTİĞİMİZİ SÖYLÜYORUZ. "Biz hallederiz" demek yeterli
              değil: kullanıcı neyin kararını devrettiğini bilmeli. */}
          <p className="mt-3 text-xs text-ink-muted">{bizNeSectik(goal)}</p>
        </>
      </div>,
    },
    {
      ad: 'Özet',
      baslik: 'Son bir kez bakalım',
      altBaslik: 'Yayına almadan önce ne kurulacağını gör.',
      tamam: eksikler.length === 0,
      eksik: eksikler[0],
      icerik: (
        <Ozet
          goal={goal}
          name={name}
          onName={setName}
          adAccount={accounts.find((a) => a.id === adAccountId)?.name ?? '—'}
          page={pages.find((p) => p.id === pageId)?.name ?? '—'}
          gorselSayisi={assetIds.length}
          primaryText={primaryText}
          headline={headline}
          dailyBudget={dailyBudget}
          currency={currency}
          durationDays={durationDays}
          linkUrl={linkUrl}
          whatsapp={whatsapp}
          eksikler={eksikler}
        />
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <Sihirbaz
        adimlar={adimlar}
        aktif={adim}
        onAktif={setAdim}
        sonAdimDugmesi={
          <button
            type="button"
            onClick={olustur}
            disabled={eksikler.length > 0 || busy !== null}
            className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 disabled:opacity-40"
          >
            {busy === 'create' ? 'Hazırlanıyor…' : 'Reklamı hazırla'}
          </button>
        }
      />

      {error && (
        <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger-strong ring-1 ring-inset ring-danger/30">
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * Oluşturulmuş taslak ve yayın.
 *
 * KISMİ BAŞARI BURADA GÖRÜNÜYOR: her platform kendi satırında, kendi
 * durumuyla ve kendi hatasıyla. Tek bir "yayınlandı/yayınlanamadı" göstermek,
 * yayına girmiş ve para harcamaya başlamış bir kampanyayı gizlemek olurdu.
 */
function Sonuc({
  group,
  check,
  busy,
  error,
  onPublish,
  onReset,
}: {
  group: DraftGroupRecord;
  check: PublishCheck | null;
  busy: string | null;
  error: string | null;
  onPublish: () => void;
  onReset: () => void;
}) {
  const yayinlanan = group.campaigns.filter((c) => c.status === 'published');
  const hepsiYayinda = yayinlanan.length === group.campaigns.length;

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-line bg-surface p-4">
        <h2 className="text-sm font-semibold text-ink">{group.name}</h2>

        <ul className="mt-3 space-y-2">
          {group.campaigns.map((c) => (
            <li
              key={c.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-surface-sunken px-3 py-2"
            >
              <div className="min-w-0">
                <p className="text-xs font-medium text-ink">
                  {platformKisaAdi(c.platform)}
                  <span className="ml-1.5 font-normal text-ink-muted">{c.adAccountName}</span>
                </p>
                {c.error && <p className="mt-0.5 text-[11px] text-danger-strong">{c.error}</p>}
              </div>
              <span className={`shrink-0 text-[11px] font-medium ${durumRengi(c.status)}`}>
                {DURUM[c.status]}
              </span>
            </li>
          ))}
        </ul>
      </section>

      {check && !hepsiYayinda && (
        <section className="rounded-xl border border-line bg-surface p-4">
          <p className="rounded-lg bg-surface-sunken px-3 py-2 text-sm font-medium text-ink">
            {check.summary}
          </p>

          {/* KAPSAMA ENGELLERİN ÜSTÜNDE.
              Engel metinleri "Yatay yerleşim için uygun görsel yok" diyor;
              hangi yuvanın boş olduğunu görmeden bu cümle soyut kalıyor.
              Tablo önce, açıklama sonra. */}
          {check.assetCoverage.length > 0 && (
            <div className="mt-3">
              <CoveragePanel coverage={check.assetCoverage} />
            </div>
          )}

          {check.blockers.map((b) => (
            <p
              key={b}
              className="mt-2 rounded-lg bg-danger-soft px-3 py-2 text-xs text-danger-strong ring-1 ring-inset ring-danger/30"
            >
              {b}
            </p>
          ))}
          {check.warnings.map((w) => (
            <p
              key={w}
              className="mt-2 rounded-lg bg-warn-soft px-3 py-2 text-xs text-warn-strong ring-1 ring-inset ring-warn/30"
            >
              {w}
            </p>
          ))}

          <button
            type="button"
            onClick={onPublish}
            disabled={!check.ok || busy !== null}
            className="mt-3 rounded-lg bg-brand px-3.5 py-2 text-sm font-semibold text-white disabled:opacity-40"
          >
            {busy === 'publish' ? 'Yayınlanıyor…' : 'Yayınla'}
          </button>
        </section>
      )}

      {hepsiYayinda && (
        <div className="rounded-xl border border-ok/30 bg-ok-soft p-4">
          <h3 className="text-sm font-semibold text-ok-strong">Reklamın yayında</h3>
          <p className="mt-1 text-sm text-ok-strong">
            Meta reklamı onaylayana kadar birkaç saat geçebilir. Onaylandığında yayına girer ve
            harcamaya başlar. Sonuçları <strong>Genel Bakış</strong> ekranından izleyebilirsin.
          </p>
        </div>
      )}

      {error && (
        <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger-strong ring-1 ring-inset ring-danger/30">
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={onReset}
        className="rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-ink hover:bg-surface-sunken"
      >
        Yeni reklam oluştur
      </button>
    </div>
  );
}

const DURUM: Record<string, string> = {
  draft: 'Hazır, yayınlanmadı',
  publishing: 'Yayınlanıyor…',
  published: 'Yayında',
  failed: 'Başarısız',
};

function durumRengi(status: string): string {
  if (status === 'published') return 'text-ok-strong';
  if (status === 'failed') return 'text-danger-strong';
  return 'text-ink-muted';
}

/**
 * Hedefin hangi platformlarda çalıştığı.
 *
 * Kaynak `GOAL_PLATFORM_SUPPORT` — sunucunun kullandığı tablonun aynısı. İki
 * yerde ayrı liste tutmak, arayüzün "Google'da da çıkar" deyip sunucunun onu
 * atlaması demek olurdu.
 */
/**
 * ═══ ÖZET ADIMI ═══
 *
 * Yayına almadan önce NE KURULACAĞINI tek ekranda gösteriyor. Eski akışta
 * böyle bir durak yoktu: kullanıcı beş bloğu doldurup düğmeye basıyor ve
 * ne kurulduğunu ancak sonuç ekranında görüyordu.
 *
 * ═══ WHATSAPP NUMARASI BURADA TEYİT EDİLİYOR ═══
 *
 * Kullanıcının isteği birebir: "whatsapp numarasının doğru olup olmadığını
 * teyit etmem için gözükmesini istiyorum". Numara SORULMUYOR (Meta onu
 * sayfaya bağlı WhatsApp hesabından alıyor) ama hangi hatta mesaj düşeceği
 * yayından ÖNCE görünmeli — yanlış hat, ancak müşteri "hiç mesaj gelmiyor"
 * dediğinde fark ediliyor.
 *
 * ÜÇ HÂL AYRI AYRI YAZILIYOR ve üçünün yapılacak işi farklı:
 *   · numara geldi   → teyit et
 *   · okunamadı      → Ads Manager'dan bak (kampanya yine kurulabilir)
 *   · çağrı düştü    → sebep platformun kendi cümlesiyle
 */
function Ozet({
  goal,
  name,
  onName,
  adAccount,
  page,
  gorselSayisi,
  primaryText,
  headline,
  dailyBudget,
  currency,
  durationDays,
  linkUrl,
  whatsapp,
  eksikler,
}: {
  goal: CampaignGoal | null;
  name: string;
  onName: (v: string) => void;
  adAccount: string;
  page: string;
  gorselSayisi: number;
  primaryText: string;
  headline: string;
  dailyBudget: string;
  currency: string;
  durationDays: string;
  linkUrl: string;
  whatsapp:
    | { durum: 'bekliyor' }
    | { durum: 'geldi'; numara: string | null; hata: string | null };
  eksikler: string[];
}) {
  const sure = SURE_SECENEKLERI.find((o) => o.value === durationDays)?.label ?? `${durationDays} gün`;
  const toplam =
    Number(durationDays) > 0 ? Number(dailyBudget) * Number(durationDays) : null;

  return (
    <div className="space-y-4">
      {/* AD DÜZENLENEBİLİR AMA ZORUNLU DEĞİL: kendiliğinden dolduruldu,
          isteyen değiştiriyor. */}
      <Alan label="Kampanya adı" ipucu="Yalnızca sen göreceksin.">
        <input value={name} onChange={(e) => onName(e.target.value)} className={input} />
      </Alan>

      <dl className="grid gap-x-6 gap-y-2.5 rounded-xl bg-surface-sunken px-4 py-3 sm:grid-cols-2">
        <Satir etiket="Hedef" deger={goal ? GOAL_META[goal].label : '—'} />
        <Satir etiket="Reklam hesabı" deger={adAccount} />
        <Satir etiket="Sayfa" deger={page} />
        <Satir etiket="Görsel" deger={`${gorselSayisi} adet`} />
        <Satir
          etiket="Bütçe"
          deger={
            toplam === null
              ? `${dailyBudget} ${currency}/gün · süresiz`
              : `${dailyBudget} ${currency}/gün · ${sure} · toplam ${toplam} ${currency}`
          }
        />
        {goal === 'website' && <Satir etiket="Adres" deger={linkUrl || '—'} />}
      </dl>

      {goal === 'whatsapp' && (
        <div className="rounded-xl border border-line px-4 py-3">
          <p className="text-xs font-semibold text-ink">Mesajlar nereye düşecek?</p>
          {whatsapp.durum === 'bekliyor' ? (
            <p className="mt-1 text-xs text-ink-muted">Numara okunuyor…</p>
          ) : whatsapp.numara ? (
            <>
              <p className="mt-1 text-sm font-semibold tabular-nums text-ink">
                {whatsapp.numara}
              </p>
              <p className="mt-1 text-[11px] text-ink-muted">
                Sayfaya bağlı WhatsApp hesabı. Yanlışsa Meta Business Suite’ten sayfanın
                WhatsApp bağlantısını değiştir.
              </p>
            </>
          ) : (
            /*
              "OKUNAMADI" KAMPANYAYI ENGELLEMİYOR ve bu kasıtlı: numara Meta
              tarafında zaten tanımlı olabilir, biz yalnızca okuyamıyoruz.
              Engellemek, çalışan bir kurulumu durdurmak olurdu.
            */
            <>
              <p className="mt-1 text-xs text-warn-strong">
                {whatsapp.hata ?? 'Bu sayfada bağlı WhatsApp numarası okunamadı.'}
              </p>
              <p className="mt-1 text-[11px] text-ink-muted">
                Kampanya yine kurulabilir: Meta numarayı sayfadan kendisi alıyor. Hangi
                numara olduğunu Meta Business Suite’ten doğrulayabilirsin.
              </p>
            </>
          )}
        </div>
      )}

      <div className="rounded-xl border border-line px-4 py-3">
        <p className="text-xs font-semibold text-ink">Reklam metni</p>
        {headline && <p className="mt-1 text-sm font-medium text-ink">{headline}</p>}
        <p className="mt-0.5 whitespace-pre-line text-xs text-ink-muted">{primaryText}</p>
      </div>

      {eksikler.length > 0 && (
        <div className="rounded-xl bg-warn-soft px-4 py-3 ring-1 ring-inset ring-warn/30">
          <p className="text-xs font-medium text-warn-strong">Yayına almadan önce:</p>
          <ul className="mt-1 space-y-0.5">
            {eksikler.map((e) => (
              <li key={e} className="text-xs text-warn-strong">
                · {e}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function Satir({ etiket, deger }: { etiket: string; deger: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-xs text-ink-muted">{etiket}</dt>
      <dd className="min-w-0 truncate text-xs font-medium text-ink" title={deger}>
        {deger}
      </dd>
    </div>
  );
}

function platformEtiketi(goal: CampaignGoal): string {
  const calisanlar = (['meta', 'google'] as const).filter(
    (p) => GOAL_PLATFORM_SUPPORT[goal][p].support === 'yes',
  );
  const adlar = calisanlar.map((p) => (p === 'meta' ? 'Facebook · Instagram' : 'Google'));
  return adlar.join(' · ');
}

/** Bizim kullanıcı adına verdiğimiz kararların düz Türkçe özeti. */
/**
 * NE SEÇTİĞİMİZİ SÖYLEYEN CÜMLE.
 *
 * `null` HEDEF DE GEÇERLİ BİR GİRDİ: sihirbazın adım dizisi hedef
 * seçilmeden de kuruluyor ve bir `!` ile tipi susturmak, gerçekten null
 * olduğu bir anda çalışma zamanında patlamak demekti.
 */
function bizNeSectik(goal: CampaignGoal | null): string {
  if (!goal) return '';
  const ortak =
    'Kitle: Türkiye, 18+, daraltma yok. Yerleşim: seçtiğin görsel oranlarına göre. ' +
    'Teklif: en düşük maliyet.';
  switch (goal) {
    case 'form':
      return `Hedef: potansiyel müşteri, form dolduranlara göre optimize. ${ortak}`;
    case 'whatsapp':
      return `Hedef: potansiyel müşteri, mesaj yazanlara göre optimize. ${ortak}`;
    case 'website':
      return `Hedef: trafik, sayfayı gerçekten açanlara göre optimize. ${ortak}`;
  }
}

function Onizleme({
  pageName,
  primaryText,
  headline,
  description,
  goal,
  asset,
}: {
  pageName: string;
  primaryText: string;
  headline: string;
  description: string;
  /** Hedef seçilmeden de çiziliyor: önizleme boş bir çerçeve olarak duruyor. */
  goal: CampaignGoal | null;
  asset: AssetRecord | undefined;
}) {
  const cta =
    goal === 'whatsapp'
      ? 'WhatsApp’tan Mesaj Gönder'
      : goal === 'form'
        ? 'Kaydol'
        : 'Daha Fazla Bilgi';

  return (
    <div>
      <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-ink-muted">
        Önizleme
      </p>
      <div className="overflow-hidden rounded-xl border border-line bg-surface">
        <div className="flex items-center gap-2 p-3">
          <span className="h-8 w-8 shrink-0 rounded-full bg-surface-sunken" />
          <div className="min-w-0">
            <p className="truncate text-xs font-semibold text-ink">{pageName}</p>
            <p className="text-[10px] text-ink-muted">Sponsorlu</p>
          </div>
        </div>

        <p className="whitespace-pre-wrap px-3 pb-2 text-xs text-ink">
          {primaryText || 'Ana metin burada görünecek.'}
        </p>

        <div className="aspect-square w-full bg-surface-sunken">
          {asset && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`${API_URL}${asset.previewUrl}`}
              alt=""
              className="h-full w-full object-cover"
            />
          )}
        </div>

        <div className="flex items-center justify-between gap-2 bg-surface-sunken p-3">
          <div className="min-w-0">
            <p className="truncate text-xs font-semibold text-ink">{headline || 'Başlık'}</p>
            {description && (
              <p className="truncate text-[11px] text-ink-muted">{description}</p>
            )}
          </div>
          <span className="shrink-0 rounded bg-surface px-2 py-1 text-[10px] font-medium text-ink ring-1 ring-line">
            {cta}
          </span>
        </div>
      </div>
      <p className="mt-1 text-[11px] text-ink-muted">
        Yaklaşık görünüm. Gerçek reklam yerleşime göre biraz farklı olabilir.
      </p>
    </div>
  );
}

function MetinAlani({
  label,
  ipucu,
  value,
  onChange,
  limit,
  rows,
}: {
  label: string;
  ipucu: string;
  value: string;
  onChange: (v: string) => void;
  limit: number;
  rows?: number;
}) {
  // SAYAC KIRPILMA SINIRINA GÖRE, teknik sınıra göre değil.
  const asildi = value.length > limit;
  return (
    <label className="block">
      <span className="mb-1 flex items-baseline justify-between">
        <span className="text-[11px] font-medium uppercase tracking-wide text-ink-muted">
          {label}
        </span>
        <span className={`text-[11px] ${asildi ? 'text-warn-strong' : 'text-ink-muted'}`}>
          {value.length}/{limit}
        </span>
      </span>
      {rows ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={rows}
          className={input}
        />
      ) : (
        <input value={value} onChange={(e) => onChange(e.target.value)} className={input} />
      )}
      <span className="mt-0.5 block text-[11px] text-ink-muted">
        {asildi ? `${limit} karakterden sonrası akışta kısaltılır.` : ipucu}
      </span>
    </label>
  );
}

function Blok({
  no,
  baslik,
  altBaslik,
  children,
}: {
  no: number;
  baslik: string;
  altBaslik?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-line bg-surface p-4">
      <div className="mb-3 flex items-baseline gap-2">
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand text-[11px] font-bold text-white">
          {no}
        </span>
        <div>
          <h2 className="text-sm font-semibold text-ink">{baslik}</h2>
          {altBaslik && <p className="text-xs text-ink-muted">{altBaslik}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}

function Alan({
  label,
  ipucu,
  children,
}: {
  label: string;
  ipucu?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-ink-muted">
        {label}
      </span>
      {children}
      {ipucu && <span className="mt-0.5 block text-[11px] text-ink-muted">{ipucu}</span>}
    </label>
  );
}

const input =
  'w-full rounded-lg border border-line bg-surface px-2.5 py-1.5 text-sm outline-none focus:border-brand';

/**
 * KAMPANYA ADI — hedef + tarih.
 *
 * Kullanıcıdan istenmeyen tek "isim" alanı buydu ve sonucu hiç
 * değiştirmiyordu: ad yalnızca ajansın listesinde görünüyor, müşteriye ve
 * Meta'ya giden hiçbir şeyi etkilemiyor.
 *
 * TARİH ŞART: aynı hedefle ikinci bir kampanya kurulduğunda listede
 * birbirinden ayırt edilebilsin. Saat yok — aynı gün iki kampanya kuran
 * kullanıcı zaten ikisini de görüyor ve adı elle değiştirebiliyor.
 */
export function otomatikAd(goal: CampaignGoal, now = new Date()): string {
  const gun = now.toLocaleDateString('tr-TR', { day: '2-digit', month: 'short' });
  return `${GOAL_META[goal].label} — ${gun}`;
}
