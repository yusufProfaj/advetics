'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  OZET_KITLESI_ADI,
  YORUM_DURUMU_ADI,
  aralikMetni,
  isoHaftaAraligi,
  type HaftalikOzetOnizleme,
  type HaftalikOzetPlani,
  type OzetKitlesi,
} from '@advetics/shared';
import { AliciListesiAlani } from '@/components/alici-listesi-alani';
import { markaMerkeziAdresi } from '@/lib/panel-adresleri';
import { Halka } from '@/components/yukleniyor';
import { apiFetch } from '@/lib/api';
import {
  cerceveIcerigi,
  haftaSec,
  haftaSecenekleri,
  kanalDurumMetni,
  musteriGonderimMetni,
  onizlemeYolu,
  ozetHali,
  zamanMetni,
} from '@/lib/haftalik-ozet';

/**
 * ═══ RAPORLAR › HAFTALIK ÖZET (Paket B, MIMARI § 7, taslak.html) ═══
 *
 * MAİL PANELDE İKİNCİ KEZ YAZILMIYOR: API'nin ürettiği HTML yalıtılmış bir
 * çerçevede (`sandbox`, betik YOK) gösteriliyor. Ekranda ayrı bir şablon,
 * gönderilen ile görülenin zamanla ayrışması demekti.
 *
 * DÖRT HÂL AYRI: yükleniyor, hata (sunucunun cümlesi), boş hafta ("harcama
 * yok, gönderilmeyecek") ve dolu. Ajans görünümü yalnız `rule.read` ile
 * (sunucu da ayrıca reddediyor); müşteri hesabı kendi özetini görür.
 */
export function HaftalikOzetSekmesi({
  clientId,
  haftaParam,
  ajansGorur,
  planYetkisi,
}: {
  clientId: string;
  haftaParam: string | undefined;
  ajansGorur: boolean;
  planYetkisi: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  // Seçenekler sayfa açılışında bir kez: gece yarısı açık kalan sekme
  // seçiciyi kendiliğinden kaydırmasın.
  const secenekler = useMemo(() => haftaSecenekleri(new Date()), []);
  const { kod: hafta, duzeltildi } = haftaSec(haftaParam, secenekler);
  const [kitle, setKitle] = useState<OzetKitlesi>(ajansGorur ? 'ajans' : 'musteri');
  const [veri, setVeri] = useState<HaftalikOzetOnizleme | null>(null);
  const [hata, setHata] = useState<string | null>(null);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [deneme, setDeneme] = useState(0);

  useEffect(() => {
    let iptal = false;
    setYukleniyor(true);
    setHata(null);
    apiFetch<HaftalikOzetOnizleme>(onizlemeYolu(clientId, kitle, hafta))
      .then((v) => {
        if (!iptal) setVeri(v);
      })
      .catch((e: unknown) => {
        // Hata YUTULMUYOR: sunucunun cümlesi ekranda (boş özetle karışmasın).
        if (!iptal) setHata(e instanceof Error ? e.message : 'Bağlantı kurulamadı.');
      })
      .finally(() => {
        if (!iptal) setYukleniyor(false);
      });
    return () => {
      iptal = true;
    };
  }, [clientId, kitle, hafta, deneme]);

  function haftaDegistir(kod: string): void {
    const p = new URLSearchParams(searchParams?.toString() ?? '');
    p.set('hafta', kod);
    router.replace(`${pathname}?${p.toString()}`);
  }

  const hal = ozetHali({ yukleniyor, hata, veri });
  const aralik = isoHaftaAraligi(hafta)!;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink-muted">Geçen haftanın bir önceki haftaya göre özeti, her pazartesi sabahı</p>
        <label className="flex items-center gap-2 text-sm">
          <span className="text-ink-muted">Hafta</span>
          <select
            value={hafta}
            onChange={(e) => haftaDegistir(e.target.value)}
            className="rounded-lg border border-line bg-surface px-2.5 py-1.5 text-sm"
          >
            {secenekler.map((s) => (
              <option key={s.kod} value={s.kod}>
                {s.etiket}
              </option>
            ))}
          </select>
        </label>
      </div>
      {duzeltildi && (
        <p role="status" className="text-xs text-ink-muted">
          Bağlantıdaki hafta gösterilemiyor (tamamlanmamış ya da çok eski); {aralikMetni(aralik)} açıldı.
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section className="min-w-0 rounded-xl border border-line bg-surface">
          <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
            {ajansGorur ? (
              <div role="group" aria-label="Görünüm" className="flex gap-1">
                {(['musteri', 'ajans'] as const).map((k) => (
                  <button
                    key={k}
                    type="button"
                    aria-pressed={kitle === k}
                    onClick={() => setKitle(k)}
                    className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                      kitle === k ? 'bg-ink text-white' : 'text-ink-muted hover:text-ink'
                    }`}
                  >
                    {OZET_KITLESI_ADI[k]}
                  </button>
                ))}
              </div>
            ) : (
              <span className="text-sm font-semibold text-ink">{OZET_KITLESI_ADI.musteri}</span>
            )}
            {veri && hal !== 'hata' && (
              <small className="ml-auto text-xs text-ink-muted">
                {zamanMetni(veri.ozet.uretildi)} üretildi · gönderilenle aynı
              </small>
            )}
            {yukleniyor && veri && <Halka className="h-3.5 w-3.5" />}
          </div>

          {hal === 'yukleniyor' && (
            <div aria-busy="true" className="space-y-2 p-4">
              {[40, 90, 75, 60].map((w) => (
                <span key={w} className="block h-3.5 rounded bg-line/60" style={{ width: `${w}%` }} />
              ))}
            </div>
          )}

          {hal === 'hata' && (
            <div role="alert" className="flex flex-wrap items-center gap-2 p-4 text-sm text-danger-strong">
              <strong>Özet hazırlanamadı.</strong>
              <span>{hata}</span>
              <button
                type="button"
                onClick={() => setDeneme((n) => n + 1)}
                className="rounded-lg border border-line px-3 py-1.5 text-xs font-semibold text-ink"
              >
                Yeniden dene
              </button>
            </div>
          )}

          {hal === 'bos' && (
            <div className="px-4 py-10 text-center">
              <p className="text-base font-semibold text-ink">Bu hafta harcama yok</p>
              <p className="mx-auto mt-1 max-w-md text-sm text-ink-muted">
                {aralikMetni(aralik)} ve önceki hafta reklam harcaması kaydedilmedi. Boş özet gönderilmez; müşteriye giden plan bu hafta
                &ldquo;Atlandı&rdquo; yazar.
              </p>
            </div>
          )}

          {hal === 'dolu' && veri && <MailOnizleme veri={veri} />}
        </section>

        <div className="flex min-w-0 flex-col gap-4">
          {planYetkisi && <MusteriPlaniKarti clientId={clientId} gonderim={veri?.gonderim.musteri ?? null} />}
          {ajansGorur && (
            <section className="rounded-xl border border-line bg-surface">
              <div className="border-b border-line px-4 py-3">
                <h2 className="text-sm font-semibold text-ink">Ajans kanalları</h2>
              </div>
              <div className="space-y-2 px-4 py-3 text-sm">
                {kitle !== 'ajans' ? (
                  <p className="text-ink-muted">Kanal durumu ajans görünümünde.</p>
                ) : veri && veri.gonderim.kanallar.length > 0 ? (
                  <ul className="space-y-1.5">
                    {veri.gonderim.kanallar.map((k) => (
                      <li key={k.kanalId} className="flex items-center gap-2">
                        <Nokta durum={k.durum === 'gonderildi' ? 'iyi' : k.durum === 'vazgecildi' || k.durum === 'basarisiz' ? 'kotu' : 'notr'} />
                        <span className="font-medium text-ink">{k.ad}</span>
                        <span className="text-ink-muted">· {kanalDurumMetni(k.durum)}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-ink-muted">Haftalık özeti alan kanal yok. Slack, Teams ya da e-posta kanalında &ldquo;Haftalık özet&rdquo; seçilince pazartesi sabahı oraya da gider.</p>
                )}
                <Link href={markaMerkeziAdresi('workspace', clientId, 'bildirimler')} className="inline-block text-xs font-semibold text-ink underline">
                  Marka Merkezi › Bildirimler
                </Link>
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

function Nokta({ durum }: { durum: 'iyi' | 'kotu' | 'notr' }) {
  // Yeşil YALNIZ durum noktası (kılavuz); kötü kırmızı, nötr gri.
  const renk = durum === 'iyi' ? 'bg-ok' : durum === 'kotu' ? 'bg-brand' : 'bg-ink-muted';
  return <span aria-hidden="true" className={`inline-block h-2 w-2 shrink-0 rounded-full ${renk}`} />;
}

function MailOnizleme({ veri }: { veri: HaftalikOzetOnizleme }) {
  const cerceve = useRef<HTMLIFrameElement>(null);
  const [yukseklik, setYukseklik] = useState(900);
  const ajans = veri.kitle === 'ajans';

  /*
   * ÇERÇEVE İÇERİĞİ KADAR UZUN. `allow-same-origin` yalnız yüksekliği
   * ölçmek için; betik izni YOK, yani mail HTML'i hiçbir kod çalıştıramaz.
   * Ölçülemezse sabit yükseklik ve çerçevenin kendi kaydırması kalır.
   */
  function olc(): void {
    try {
      const h = cerceve.current?.contentDocument?.body?.scrollHeight;
      if (h && h > 0) setYukseklik(h + 8);
    } catch {
      /* ölçülemedi: sabit yükseklik kalıyor */
    }
  }

  return (
    <div>
      <div className="flex flex-col gap-0.5 border-b border-line px-4 py-3 text-xs text-ink-muted">
        <span>
          Konu: <b className="text-ink">{veri.eposta.konu}</b>
        </span>
        {!ajans && (
          <span>
            Kime: {veri.gonderim.musteri.alicilar.length > 0 ? veri.gonderim.musteri.alicilar.join(', ') : 'rapor alıcısı tanımlı değil'}
          </span>
        )}
        <span>{musteriGonderimMetni(veri.gonderim.musteri)}</span>
      </div>
      <div className="bg-line/30 p-2 sm:p-4">
        <iframe
          ref={cerceve}
          title={`Haftalık özet maili, ${OZET_KITLESI_ADI[veri.kitle]}`}
          sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
          srcDoc={cerceveIcerigi(veri.eposta.html)}
          onLoad={olc}
          className="block w-full rounded-lg border-0 bg-white"
          style={{ height: yukseklik }}
        />
      </div>
      {ajans && (
        <div className="space-y-3 border-t border-line px-4 py-4">
          {veri.kisa && (
            <div>
              <h3 className="mb-1.5 text-sm font-semibold text-ink">Slack ve Teams&apos;e giden kısa sürüm</h3>
              <div className="rounded-lg border border-line px-3 py-2.5 text-sm">
                <p className="font-semibold text-ink">{veri.kisa.baslik}</p>
                <ul className="mt-1 space-y-0.5 text-ink">
                  {veri.kisa.satirlar.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}
          <p className="text-xs text-ink-muted">
            Yorum durumu: {YORUM_DURUMU_ADI[veri.ozet.yorum.durum]}
            {veri.ozet.yorum.not ? ` (${veri.ozet.yorum.not})` : ''}
          </p>
          {veri.ozet.hatalar.length > 0 && (
            <ul role="alert" className="space-y-0.5 text-xs text-danger-strong">
              {veri.ozet.hatalar.map((h, i) => (
                <li key={i}>{h.mesaj}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

const SAATLER = Array.from({ length: 24 }, (_, i) => i);

/**
 * Müşteriye giden özet planı: aç/kapat, saat, alıcılar, "Kendime gönder".
 * VARSAYILAN KAPALI (MIMARI Ç-B2): mail müşteriye danışmanın adresinden
 * gidiyor ve kimse açmadan başlamamalı. Açmak sunucuda SMTP doğrulamasını
 * istiyor; reddin cümlesi burada görünüyor (giriş anında doğrulama).
 */
function MusteriPlaniKarti({
  clientId,
  gonderim,
}: {
  clientId: string;
  gonderim: HaftalikOzetOnizleme['gonderim']['musteri'] | null;
}) {
  const [plan, setPlan] = useState<HaftalikOzetPlani | null>(null);
  const [hata, setHata] = useState<string | null>(null);
  const [kaydediliyor, setKaydediliyor] = useState(false);
  const [saat, setSaat] = useState(9);
  const [alicilar, setAlicilar] = useState<string[]>([]);
  const [denemeSonucu, setDenemeSonucu] = useState<{ tur: 'tamam' | 'hata'; metin: string } | null>(null);
  const [gonderiliyor, setGonderiliyor] = useState(false);

  useEffect(() => {
    let iptal = false;
    setHata(null);
    apiFetch<HaftalikOzetPlani>(`/haftalik-ozet/plan?clientId=${encodeURIComponent(clientId)}`)
      .then((p) => {
        if (iptal) return;
        setPlan(p);
        setSaat(p.saat);
        setAlicilar(p.toEmails);
      })
      .catch((e: unknown) => {
        if (!iptal) setHata(e instanceof Error ? e.message : 'Plan okunamadı.');
      });
    return () => {
      iptal = true;
    };
  }, [clientId]);

  async function kaydet(etkin: boolean, s = saat, a = alicilar): Promise<void> {
    setKaydediliyor(true);
    setHata(null);
    try {
      const p = await apiFetch<HaftalikOzetPlani>('/haftalik-ozet/plan', {
        method: 'PUT',
        body: JSON.stringify({ clientId, etkin, saat: s, toEmails: a }),
      });
      setPlan(p);
    } catch (e) {
      setHata(e instanceof Error ? e.message : 'Kaydedilemedi.');
    } finally {
      setKaydediliyor(false);
    }
  }

  async function kendimeGonder(): Promise<void> {
    setGonderiliyor(true);
    setDenemeSonucu(null);
    try {
      const r = await apiFetch<{ to: string[]; reddedilen: Array<{ adres: string; sebep: string }> }>('/haftalik-ozet/deneme', {
        method: 'POST',
        body: JSON.stringify({ clientId, kitle: 'musteri' }),
      });
      setDenemeSonucu(
        r.reddedilen.length > 0
          ? { tur: 'hata', metin: `Reddedildi: ${r.reddedilen.map((x) => `${x.adres} (${x.sebep})`).join(', ')}` }
          : { tur: 'tamam', metin: `${r.to.join(', ')} adresine gönderildi. Gelen kutunda kontrol et.` },
      );
    } catch (e) {
      setDenemeSonucu({ tur: 'hata', metin: e instanceof Error ? e.message : 'Gönderilemedi.' });
    } finally {
      setGonderiliyor(false);
    }
  }

  const etkin = plan?.etkin ?? false;
  return (
    <section className="rounded-xl border border-line bg-surface">
      <div className="flex items-center gap-2 border-b border-line px-4 py-3">
        <h2 className="text-sm font-semibold text-ink">Müşteriye giden özet</h2>
        <button
          type="button"
          role="switch"
          aria-checked={etkin}
          aria-label="Müşteriye giden özet"
          disabled={plan === null || kaydediliyor}
          onClick={() => void kaydet(!etkin)}
          className={`relative ml-auto h-[22px] w-10 shrink-0 rounded-full border border-line transition-colors disabled:opacity-50 ${
            etkin ? 'bg-ink' : 'bg-line/60'
          }`}
        >
          <span
            className={`absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white transition-transform motion-reduce:transition-none ${
              etkin ? 'translate-x-[18px]' : ''
            }`}
          />
        </button>
      </div>
      <div className="flex items-center gap-2 border-b border-line px-4 py-2.5 text-xs">
        <Nokta durum={etkin ? 'iyi' : 'notr'} />
        <span className="text-ink-muted">
          {plan === null && !hata
            ? 'Okunuyor…'
            : etkin
              ? 'Açık. Her pazartesi müşteriye gönderilir.'
              : 'Kapalı. Açınca her pazartesi müşteriye gönderilir.'}
        </span>
      </div>
      {hata && (
        <p role="alert" className="border-b border-line px-4 py-2.5 text-xs text-danger-strong">
          {hata}
        </p>
      )}
      {plan && (
        <div className="space-y-3 px-4 py-3 text-sm">
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-ink">Saat (pazartesi)</span>
            <select
              value={saat}
              disabled={kaydediliyor}
              onChange={(e) => {
                const s = Number(e.target.value);
                setSaat(s);
                if (plan.kurulu) void kaydet(etkin, s);
              }}
              className="w-full rounded-lg border border-line bg-surface px-2.5 py-1.5"
            >
              {SAATLER.map((s) => (
                <option key={s} value={s}>
                  {String(s).padStart(2, '0')}:00
                </option>
              ))}
            </select>
          </label>
          <AliciListesiAlani
            degerler={alicilar}
            onChange={(a) => {
              setAlicilar(a);
              if (plan.kurulu) void kaydet(etkin, saat, a);
            }}
            etiket="Alıcılar"
            yardim="Boş bırakılırsa workspace’in rapor alıcıları"
            bosVarsayilan={plan.cozulenAliciListesi}
          />
          {plan.cozulenAliciListesi.length === 0 && (
            <p role="alert" className="text-xs text-danger-strong">
              Alıcı yok: plan açılsa da mail gidemez. Alıcı ekle ya da Marka Merkezi&apos;nde rapor alıcısı tanımla.
            </p>
          )}
          <Satir etiket="Gönderen" deger={plan.gonderen ? [plan.gonderen.ad, plan.gonderen.eposta].filter(Boolean).join(' · ') : 'Açan kişinin e-posta kimliği'} />
          {plan.senderReady === false && (
            <p role="alert" className="text-xs text-danger-strong">E-posta kimliği doğrulanmadı; plan açılamaz ya da gönderemez.</p>
          )}
          <Satir
            etiket="Son gönderim"
            deger={plan.son ? `${zamanMetni(plan.son.zaman)} · ${plan.son.durum === 'sent' ? 'Gönderildi' : plan.son.durum === 'skipped' ? 'Atlandı' : 'Başarısız'}` : 'Henüz yok'}
          />
          {plan.son?.hata && <p className="text-xs text-danger-strong">{plan.son.hata}</p>}
          <Satir etiket="Sıradaki" deger={plan.siradaki ? zamanMetni(plan.siradaki) : etkin ? '-' : 'Kapalı'} />
          {gonderim && <p className="text-xs text-ink-muted">Bu hafta: {musteriGonderimMetni(gonderim)}</p>}
          <button
            type="button"
            onClick={() => void kendimeGonder()}
            disabled={gonderiliyor}
            className="w-full rounded-lg border border-line px-3 py-2 text-sm font-semibold text-ink hover:border-ink disabled:opacity-50"
          >
            {gonderiliyor ? 'Gönderiliyor…' : 'Kendime gönder'}
          </button>
          {denemeSonucu && (
            <p role={denemeSonucu.tur === 'hata' ? 'alert' : 'status'} className={`text-xs ${denemeSonucu.tur === 'hata' ? 'text-danger-strong' : 'text-ink-muted'}`}>
              {denemeSonucu.metin}
            </p>
          )}
        </div>
      )}
    </section>
  );
}

function Satir({ etiket, deger }: { etiket: string; deger: string }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
      <span className="text-xs text-ink-muted">{etiket}</span>
      <span className="text-right text-ink">{deger}</span>
    </div>
  );
}
