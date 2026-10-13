'use client';

import { useCallback, useEffect, useState } from 'react';
import { AliciListesiAlani } from '@/components/alici-listesi-alani';
import {
  AYIN_GUNU_MAX,
  HAFTA_GUNLERI,
  PLAN_SONUC_LABELS,
  SIKLIK_LABELS,
  PLAN_SIKLIKLARI,
  pencerelerIcin,
  planZamaniMetni,
  varsayilanPencere,
  type PlanSikligi,
  type RaporPlaniOzeti,
} from '@advetics/shared';
import { ApiRequestError, apiFetch } from '@/lib/api';
import { Alan, FormIzgarasi, Secim } from '@/components/ui/alan';
import { Dugme } from '@/components/ui/dugme';
import { BosDurum, HataDurumu, Serit, Yukleniyor } from '@/components/ui/hal';
import { YanPanel } from '@/components/ui/pencere';
import { Rozet } from '@/components/ui/rozet';

/**
 * ═══ PLANLA — DÜZENLİ RAPOR GÖNDERİMİ ═══
 *
 * `docs/DURUM.md` §7'de "Zamanlanmış (otomatik) rapor gönderimi ❌" olarak
 * duran maddenin arayüzü.
 *
 * EKRANIN TAŞIDIĞI TEK MESAJ: burada kurulan şey MÜŞTERİYE GİDEN, TEKRARLAYAN
 * bir mail. Tek seferlik gönderimde kullanıcı sonucu hemen görüyor; burada
 * göremiyor — ilk mail haftaya gidiyor. Bu yüzden modal, kaydetmeden ÖNCE ne
 * olacağını tam cümleyle yazıyor ("Her Pazartesi 09:00'da …").
 *
 * YAN PANEL (onaylı taslak `#raporlar`, 2026-10-14): açılışı rapor
 * başlığındaki ⋯ menüsünden ("Planla") ve rapor bölümündeki plan çipinden.
 * Portal, Esc, odak tuzağı ve DOM'da kalma ortak bileşende (`YanPanel`);
 * eski elle yazılmış pencere `fixed inset-0` tuzağına üç kez düşmüştü.
 */

interface Props {
  clientId: string;
  /** Şablon seçimi rapor ekranındaki seçiciyle aynı olsun diye taşınıyor. */
  templateId: string | null;
  acik: boolean;
  onKapat: () => void;
  /** Plan listesi değişince (kaydet, duraklat, sil): plan çipi kendini tazelesin. */
  onDegisti?: () => void;
}

const SAATLER = Array.from({ length: 24 }, (_, i) => i);

export function RaporPlanla({ clientId, templateId, acik, onKapat, onDegisti }: Props) {
  const [planlar, setPlanlar] = useState<RaporPlaniOzeti[] | null>(null);
  const [yukleniyor, setYukleniyor] = useState(false);
  const [hata, setHata] = useState<string | null>(null);
  const [kaydediliyor, setKaydediliyor] = useState(false);

  // Form durumu
  const [frequency, setFrequency] = useState<PlanSikligi>('weekly');
  const [dayOfWeek, setDayOfWeek] = useState(1);
  const [dayOfMonth, setDayOfMonth] = useState(1);
  const [hour, setHour] = useState(9);
  const [rangeKey, setRangeKey] = useState(varsayilanPencere('weekly'));
  // AD ÇOĞUL: `toEmail` adında bir dizi, okuyanı yanıltıyordu.
  const [alicilar, setAlicilar] = useState<string[]>([]);
  const [attachPdf, setAttachPdf] = useState(true);
  const [duzenlenen, setDuzenlenen] = useState<string | null>(null);

  const secilebilir = pencerelerIcin(frequency);

  useEffect(() => {
    if (!acik) return;
    void listeyiGetir();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [acik]);

  /*
   * SIKLIK DEĞİŞİNCE PENCERE DE DEĞİŞEBİLİR.
   *
   * "Haftada 1 + Son 7 gün" kurup "Ayda 1"e geçen kullanıcıda "Son 7 gün"
   * artık geçersiz (matris onu haftalığa özel tutuyor). Seçimi olduğu gibi
   * bırakmak, kaydete basınca sunucudan hata almak demekti — CLAUDE.md:
   * "Doğrulama kullanım anında değil, giriş anında."
   */
  useEffect(() => {
    if (!secilebilir.some((p) => p.key === rangeKey)) {
      setRangeKey(varsayilanPencere(frequency));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frequency]);

  async function listeyiGetir() {
    setYukleniyor(true);
    setHata(null);
    try {
      setPlanlar(await apiFetch<RaporPlaniOzeti[]>(`/reports/schedules?clientId=${clientId}`));
    } catch (err) {
      /*
       * HATA YUTULMUYOR. CLAUDE.md: ".catch(() => setX([])) YASAK" —
       * "henüz aramadım", "arıyorum", "sonuç yok" ve "çağrı düştü" dördü
       * ayrı iş ve ayrı gösterilmeli.
       */
      setPlanlar(null);
      setHata(err instanceof ApiRequestError ? err.message : 'Planlamalar okunamadı.');
    } finally {
      setYukleniyor(false);
    }
  }

  function formuSifirla() {
    setDuzenlenen(null);
    setFrequency('weekly');
    setDayOfWeek(1);
    setDayOfMonth(1);
    setHour(9);
    setRangeKey(varsayilanPencere('weekly'));
    setAlicilar([]);
    setAttachPdf(true);
  }

  function duzenlemeyeAl(p: RaporPlaniOzeti) {
    setDuzenlenen(p.id);
    setFrequency(p.frequency);
    setDayOfWeek(p.dayOfWeek ?? 1);
    setDayOfMonth(p.dayOfMonth ?? 1);
    setHour(p.hour);
    setRangeKey(p.rangeKey);
    setAlicilar(p.toEmails);
    setAttachPdf(p.attachPdf);
  }

  async function kaydet() {
    setKaydediliyor(true);
    setHata(null);
    try {
      const govde = {
        clientId,
        frequency,
        dayOfWeek: frequency === 'weekly' ? dayOfWeek : null,
        dayOfMonth: frequency === 'monthly' ? dayOfMonth : null,
        hour,
        rangeKey,
        templateId,
        toEmails: alicilar,
        attachPdf,
        enabled: true,
      };
      await apiFetch(
        duzenlenen ? `/reports/schedules/${duzenlenen}` : '/reports/schedules',
        { method: duzenlenen ? 'PATCH' : 'POST', body: JSON.stringify(govde) },
      );
      formuSifirla();
      await listeyiGetir();
      onDegisti?.();
    } catch (err) {
      setHata(err instanceof ApiRequestError ? err.message : 'Planlama kaydedilemedi.');
    } finally {
      setKaydediliyor(false);
    }
  }

  async function durumDegistir(p: RaporPlaniOzeti) {
    setHata(null);
    try {
      await apiFetch(`/reports/schedules/${p.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          clientId: p.clientId,
          frequency: p.frequency,
          dayOfWeek: p.dayOfWeek,
          dayOfMonth: p.dayOfMonth,
          hour: p.hour,
          rangeKey: p.rangeKey,
          templateId: p.templateId,
          toEmails: p.toEmails,
          attachPdf: p.attachPdf,
          enabled: !p.enabled,
        }),
      });
      await listeyiGetir();
      onDegisti?.();
    } catch (err) {
      setHata(err instanceof ApiRequestError ? err.message : 'Değiştirilemedi.');
    }
  }

  async function sil(p: RaporPlaniOzeti) {
    setHata(null);
    try {
      await apiFetch(`/reports/schedules/${p.id}?clientId=${p.clientId}`, { method: 'DELETE' });
      await listeyiGetir();
      onDegisti?.();
    } catch (err) {
      setHata(err instanceof ApiRequestError ? err.message : 'Silinemedi.');
    }
  }

  const secilenPencere = secilebilir.find((p) => p.key === rangeKey);

  return (
    <YanPanel
      acik={acik}
      onKapat={onKapat}
      genislik={520}
      baslik="Düzenli rapor gönderimi"
      altEylemler={
        <>
          {duzenlenen && (
            <Dugme ton="ikincil" onClick={formuSifirla}>
              Vazgeç
            </Dugme>
          )}
          <Dugme onClick={() => void kaydet()} bekliyor={kaydediliyor}>
            {duzenlenen ? 'Güncelle' : 'Planlamayı kur'}
          </Dugme>
        </>
      }
    >
      <p className="m-0 text-13 text-ink-muted">
        Rapor seçtiğin sıklıkta otomatik hazırlanıp workspace’e mail atılır. Mail SENİN adresinden gider.
      </p>

      {hata && (
        <Serit ton="hata" baslik="İşlem yapılamadı">
          {hata}
        </Serit>
      )}

      {/* ── MEVCUT PLANLAR: dört hâl ayrı (yükleniyor, hata yukarıda, boş, dolu) ── */}
      <div className="grid gap-2">
        <h3 className="m-0 font-baslik text-14 font-bold text-ink">Kurulu planlar</h3>
        {yukleniyor && <Yukleniyor satir={2} etiket="Planlar yükleniyor" />}
        {!yukleniyor && planlar === null && hata === null && (
          <HataDurumu baslik="Planlar okunamadı" mesaj="Sunucu sebep bildirmedi." onTekrar={() => void listeyiGetir()} />
        )}
        {!yukleniyor && planlar !== null && planlar.length === 0 && (
          <BosDurum baslik="Kurulu plan yok" neden="Bu workspace için kurulu planlama yok. Aşağıdan ilkini kur." />
        )}
        {!yukleniyor && planlar !== null && planlar.length > 0 && (
          <ul className="m-0 grid list-none gap-2 p-0">
            {planlar.map((p) => (
              <li key={p.id} className="grid gap-1.5 rounded-alan border border-line px-3 py-2.5 text-13">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <b className="font-semibold text-ink">{planZamaniMetni(p)}</b>
                  <Rozet hal={p.enabled ? 'ok' : 'dur'}>{p.enabled ? 'Açık' : 'Duraklatıldı'}</Rozet>
                </div>
                <p className="m-0 text-12 text-ink-muted">
                  {pencereEtiketi(p.rangeKey)} ·{' '}
                  {p.cozulenAliciListesi.length > 0 ? p.cozulenAliciListesi.join(', ') : 'alıcı yok'}
                  {p.attachPdf ? ' · PDF ekli' : ''}
                </p>
                {p.nextRunAt && p.enabled && (
                  <p className="m-0 text-12 text-ink-muted">Bir sonraki: {tarihMetni(p.nextRunAt)}</p>
                )}
                {/*
                  UYARI YALNIZCA KESİN BİLGİDE.

                  `senderReady` üç hâlli: `null` "bilinmiyor" demek ve
                  başkasının planında çıkıyor (e-posta kimliği satırını RLS
                  yalnızca sahibine gösteriyor). Eskiden `!p.senderReady`
                  yazıyordu, yani `null` da uyarı üretiyordu: ÇALIŞAN bir plan
                  "çalışmayacak" diye işaretleniyordu.
                */}
                {p.senderReady === false && (
                  <p className="m-0 border-l-4 border-l-danger pl-2 text-12 text-ink">
                    {p.createdByEmail ?? 'Planı kuran kişinin'} e-posta kimliği doğrulanmamış, bu plan çalışmayacak.
                  </p>
                )}
                {p.lastStatus && (
                  <p className={`m-0 text-12 ${p.lastStatus === 'failed' ? 'text-danger-strong' : 'text-ink-muted'}`}>
                    Son tur: {PLAN_SONUC_LABELS[p.lastStatus]}
                    {p.lastRunAt ? ` · ${tarihMetni(p.lastRunAt)}` : ''}
                    {p.lastSentTo ? ` · ${p.lastSentTo}` : ''}
                    {p.lastError ? `: ${p.lastError}` : ''}
                  </p>
                )}
                <div className="flex flex-wrap gap-1.5">
                  <Dugme ton="ikincil" boyut="kucuk" onClick={() => duzenlemeyeAl(p)}>
                    Düzenle
                  </Dugme>
                  <Dugme ton="ikincil" boyut="kucuk" onClick={() => void durumDegistir(p)}>
                    {p.enabled ? 'Duraklat' : 'Sürdür'}
                  </Dugme>
                  <Dugme ton="tehlike" boyut="kucuk" onClick={() => void sil(p)}>
                    Sil
                  </Dugme>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* ── YENİ / DÜZENLE ── */}
      <div className="grid gap-3.5 border-t border-line pt-4">
        <h3 className="m-0 font-baslik text-14 font-bold text-ink">{duzenlenen ? 'Planlamayı düzenle' : 'Yeni planlama'}</h3>

        <FormIzgarasi>
          <Alan etiket="Sıklık">
            {(id) => (
              <Secim id={id} value={frequency} onChange={(e) => setFrequency(e.target.value as PlanSikligi)}>
                {PLAN_SIKLIKLARI.map((s) => (
                  <option key={s} value={s}>
                    {SIKLIK_LABELS[s]}
                  </option>
                ))}
              </Secim>
            )}
          </Alan>

          {frequency === 'weekly' ? (
            <Alan etiket="Haftanın günü">
              {(id) => (
                <Secim id={id} value={dayOfWeek} onChange={(e) => setDayOfWeek(Number(e.target.value))}>
                  {HAFTA_GUNLERI.map((g) => (
                    <option key={g.no} value={g.no}>
                      {g.ad}
                    </option>
                  ))}
                </Secim>
              )}
            </Alan>
          ) : (
            /*
              KISIT SÖYLENİYOR. CLAUDE.md: "Tahmin etmektense kısıtla ... ve
              kısıtı kullanıcıya SÖYLE."
            */
            <Alan
              etiket={`Ayın günü (1-${AYIN_GUNU_MAX})`}
              ipucu="28’den büyük günler her ayda bulunmuyor. Şubat’ta rapor atlanırdı."
            >
              {(id, aciklamaId) => (
                <Secim
                  id={id}
                  aria-describedby={aciklamaId}
                  value={dayOfMonth}
                  onChange={(e) => setDayOfMonth(Number(e.target.value))}
                >
                  {Array.from({ length: AYIN_GUNU_MAX }, (_, i) => i + 1).map((g) => (
                    <option key={g} value={g}>
                      {g}
                    </option>
                  ))}
                </Secim>
              )}
            </Alan>
          )}

          <Alan etiket="Saat (İstanbul)">
            {(id) => (
              <Secim id={id} value={hour} onChange={(e) => setHour(Number(e.target.value))}>
                {SAATLER.map((s) => (
                  <option key={s} value={s}>
                    {String(s).padStart(2, '0')}:00
                  </option>
                ))}
              </Secim>
            )}
          </Alan>

          {/*
            YALNIZCA UYUMLU DÖNEMLER. Haftalık bir planda "Geçen ay" aynı
            raporu ayda dört kez göndermek demek; listede hiç görünmüyor.
          */}
          <Alan etiket="Rapor dönemi" ipucu={secilenPencere?.aciklama}>
            {(id, aciklamaId) => (
              <Secim id={id} aria-describedby={aciklamaId} value={rangeKey} onChange={(e) => setRangeKey(e.target.value)}>
                {secilebilir.map((p) => (
                  <option key={p.key} value={p.key}>
                    {p.label}
                  </option>
                ))}
              </Secim>
            )}
          </Alan>
        </FormIzgarasi>

        {/* Rapor gönderme ekranıyla AYNI bileşen: ayrıştırma kuralı iki yerde
            yazılsaydı plan başka bir listeye gönderirdi. */}
        <AliciListesiAlani
          etiket="Alıcılar (boş bırakılırsa workspace’in kayıtlı adresleri kullanılır)"
          degerler={alicilar}
          onChange={setAlicilar}
        />

        <label className="flex items-center gap-2 text-13 text-ink">
          <input type="checkbox" checked={attachPdf} onChange={(e) => setAttachPdf(e.target.checked)} className="accent-[var(--text)]" />
          PDF raporu ekle
        </label>

        {/*
          ═══ NE OLACAĞI TAM CÜMLEYLE ═══
          Tek seferlik gönderimde kullanıcı sonucu hemen görüyor; burada
          göremiyor: ilk mail haftaya gidiyor. Kaydetmeden önce kurduğu şeyi
          okuyabilmeli.
        */}
        <p className="m-0 rounded-alan bg-surface-muted px-3 py-2 text-13 text-ink">
          {planZamaniMetni({ frequency, dayOfWeek, dayOfMonth, hour })}’da, <strong>{secilenPencere?.label}</strong>{' '}
          dönemini kapsayan rapor{' '}
          <strong>{alicilar.length > 0 ? alicilar.join(', ') : 'workspace’in kayıtlı adreslerine'}</strong>{' '}
          gönderilecek.
        </p>
        <p className="m-0 text-12 text-ink-muted">
          Dönemde hiç harcama yoksa mail gönderilmez. Sıfırlarla dolu bir rapor müşteriye “sistem bozulmuş” diye
          okunuyor. Atlanan tur bu listede sebebiyle görünür.
        </p>
      </div>
    </YanPanel>
  );
}

/**
 * ═══ PLAN ÇİPİ: rapor bölümünde "Planlı: her ayın 1'i, 09:00" ═══
 *
 * "Planla" yazan bir düğme plan KURULU olup olmadığını göstermiyordu ve
 * kullanıcı her seferinde açıp bakıyordu. Çip açılışta planları okuyor ve
 * ilk açık planın zamanını yazıyor; tıklayınca aynı yan panel açılıyor.
 * Okunamadıysa "Plan durumu okunamadı" diyor: "plan yok" demek, kurulu bir
 * planı ikinci kez kurdururdu.
 */
export function PlanCipi({ clientId, templateId }: { clientId: string; templateId: string | null }) {
  const [acik, setAcik] = useState(false);
  const [durum, setDurum] = useState<
    { tur: 'yukleniyor' } | { tur: 'hata'; mesaj: string } | { tur: 'hazir'; planlar: RaporPlaniOzeti[] }
  >({ tur: 'yukleniyor' });

  const oku = useCallback(async () => {
    try {
      const planlar = await apiFetch<RaporPlaniOzeti[]>(`/reports/schedules?clientId=${clientId}`);
      setDurum({ tur: 'hazir', planlar });
    } catch (err) {
      setDurum({ tur: 'hata', mesaj: err instanceof ApiRequestError ? err.message : 'Planlar okunamadı.' });
    }
  }, [clientId]);

  useEffect(() => {
    void oku();
  }, [oku]);

  const aciklar = durum.tur === 'hazir' ? durum.planlar.filter((p) => p.enabled) : [];
  const metin =
    durum.tur === 'yukleniyor'
      ? 'okunuyor'
      : durum.tur === 'hata'
        ? 'durum okunamadı'
        : aciklar.length === 0
          ? 'yok'
          : `${planZamaniMetni(aciklar[0]!)}${aciklar.length > 1 ? ` +${aciklar.length - 1}` : ''}`;

  return (
    <>
      <button
        type="button"
        onClick={() => setAcik(true)}
        title={durum.tur === 'hata' ? durum.mesaj : 'Düzenli gönderimi aç'}
        className={`inline-flex h-[30px] max-w-[20rem] items-center gap-1.5 whitespace-nowrap rounded-full bg-surface-sunken px-3 text-[12.5px] font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${
          durum.tur === 'hata' ? 'text-danger-strong' : 'text-ink'
        }`}
      >
        <span className={durum.tur === 'hata' ? '' : 'text-ink-muted'}>Planlı:</span>
        <b className="min-w-0 truncate">{metin}</b>
      </button>
      <RaporPlanla
        clientId={clientId}
        templateId={templateId}
        acik={acik}
        onKapat={() => setAcik(false)}
        onDegisti={() => void oku()}
      />
    </>
  );
}

function pencereEtiketi(key: string): string {
  return (
    pencerelerIcin('weekly').concat(pencerelerIcin('monthly')).find((p) => p.key === key)?.label ??
    key
  );
}

function tarihMetni(iso: string): string {
  return new Date(iso).toLocaleString('tr-TR', {
    timeZone: 'Europe/Istanbul',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  });
}
