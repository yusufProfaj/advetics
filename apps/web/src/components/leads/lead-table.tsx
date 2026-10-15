'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, useTransition, type KeyboardEvent } from 'react';
import {
  LEAD_STATUSES,
  LEAD_STATUS_META,
  type LeadFormRecord,
  type LeadListResult,
  type LeadRecord,
  type LeadStatus,
} from '@advetics/shared';
import { ApiRequestError, apiFetch } from '@/lib/api';
import { formatRelative, formatTarih } from '@/lib/format';
import { bekleyenKayit, whatsappAdresi } from '@/lib/lead-bekleme';
import { telefonE164 } from '@advetics/shared';
import {
  DURUM_KISA_ADI,
  KALITE_SECENEKLERI,
  asamaSatirlari,
  geriAlinamayanlar,
  geriAlmaBitisMs,
  geriAlmaKalanDk,
  rozetGorunumu,
} from '@/lib/geri-besleme';
import { SecimCipi, SuzgecMenusu } from '@/components/suzgec-menusu';
import { Alan, MetinAlani } from '@/components/ui/alan';
import { Dugme } from '@/components/ui/dugme';
import { BosDurum, Serit } from '@/components/ui/hal';
import { YanPanel } from '@/components/ui/pencere';
import { Rozet, type DurumHali } from '@/components/ui/rozet';
import { BolumluSecici } from '@/components/ui/sekmeler';

/**
 * ═══ POTANSİYEL MÜŞTERİ LİSTESİ: TABLO + YAN PANEL ═══
 *
 * Kullanıcının isteği birebir: "formun ismi - cevapları - lead tarihi".
 * Eski düzende üçü de vardı ama üçü de görünmüyordu: form adı tek satırlık
 * gri bir dizenin ortasına sıkışmıştı, tarih "3 gün önce" diye göreliydi ve
 * CEVAPLAR ancak satıra tıklayınca açılıyordu.
 *
 * Bugün (kullanıcı kararı 2026-10-14, onaylı taslak `#leads`) SÜTUNLU TABLO:
 * kişi, ilk cevaplar, form, durum, tarih aynı satırda; satıra tıklayınca
 * sağdan YAN PANEL açılıyor: bütün cevaplar, "bu kişi müşteri oldu mu?"
 * seçici, not ve Meta'ya bildirilenler. Kart listesi kırk kayıtta sayfayı
 * kilometrelerce uzatıyordu; tablo taranıyor, ayrıntı sayfadan çıkmadan.
 *
 * DURUM DEĞİŞİKLİĞİ TEK TIKLA ve sayfadan çıkmadan. Ajansın günlük işi bu:
 * ara, konuş, durumu ilerlet.
 *
 * DEĞİŞİKLİK ANINDA GÖRÜNÜYOR (iyimser güncelleme) ama hata olursa GERİ
 * ALINIYOR. Sunucuyu beklemek her tıklamada yarım saniyelik donma demek;
 * hatayı yutmak ise ajansın "arandı" işaretlediği kaydın hâlâ "yeni" olması.
 */

/**
 * Tabloda doğrudan gösterilen cevap sayısı.
 *
 * Cevapların tamamını her satırda açmak, on kayıtlık bir listeyi ekrana
 * sığmaz hâle getiriyor; hiç göstermemek ise kullanıcının istediği bilgiyi
 * tıklama arkasına saklamak. İlk üç cevap ad/telefon/e-posta DIŞINDAKİ
 * sorular: asıl ayırt edici bilgi orada (bütçe, şehir, ilgilenilen ürün).
 */
const ONDE_GOSTERILEN_CEVAP = 3;

/** Ad, telefon ve e-posta kişi sütununda zaten yazıyor; cevaplarda tekrar etmesin. */
const ILETISIM_ALANLARI = new Set([
  'full_name',
  'first_name',
  'last_name',
  'email',
  'phone_number',
  'phone',
]);

/**
 * DURUM ROZETİ: renk TEK BAŞINA anlam taşımıyor, metin de var. Ton
 * `LEAD_STATUS_META` içindeki anlamdan türüyor; ikinci bir eşleme yazmak,
 * bir durum eklendiğinde birinin güncellenmemesi demek olurdu. Yeşil yalnız
 * "müşteri oldu"da (yeşil = durum göstergesi, kılavuz); kaybedilen gri kare.
 */
const TON_HALI: Record<'neutral' | 'active' | 'good' | 'bad', DurumHali> = {
  neutral: 'taslak',
  active: 'taslak',
  good: 'ok',
  bad: 'dur',
};

const ILETISIM_BAGI =
  'font-semibold text-ink underline underline-offset-2 transition-colors hover:text-brand-strong';

export function LeadTable({
  initial,
  clientId,
  forms,
  activeStatus,
  activeSearch,
  activeFormId,
  canWrite,
}: {
  initial: LeadListResult;
  clientId: string;
  forms: LeadFormRecord[];
  activeStatus: string | null;
  activeSearch: string;
  activeFormId: string | null;
  canWrite: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [rows, setRows] = useState<LeadRecord[]>(initial.rows);
  const [search, setSearch] = useState(activeSearch);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** Yan paneldeki kayıt. Panel kapanırken içerik kaybolmasın diye son kayıt `gosterilen`de kalıyor. */
  const [acik, setAcik] = useState<string | null>(null);
  const [gosterilen, setGosterilen] = useState<string | null>(null);

  // Sunucu yeni liste gönderince (süzgeç, yenileme) satırlar ondan.
  useEffect(() => setRows(initial.rows), [initial.rows]);
  /*
   * GERİ ALMA PENCERESİ (Paket E, Ç-6): son işaretin önceki durumu ve anı.
   * "Geri al" yalnız 15 dakika içinde: sunucu işareti o kadar bekletiyor ve
   * pencerede geri alınan aşama Meta'ya hiç gitmiyor. Sonrasında göstermek,
   * gitmiş bir olayı geri alınmış sandırırdı.
   */
  const [sonIsaret, setSonIsaret] = useState<{ leadId: string; onceki: LeadStatus; zamanMs: number } | null>(null);

  /*
   * PENCERE KAPANINCA "GERİ AL" KAYBOLUR (Ajan 4 N-1). Kalan süre render
   * anında hesaplanıyordu ve yeniden render ettiren bir saat yoktu: kart
   * hareketsiz kalınca düğme 15 dakikadan sonra da görünüyor, o arada olay
   * Meta'ya gitmiş oluyordu. Zamanlayıcı her dakika yeniden çizdiriyor ve
   * pencere bitince işareti siliyor. İkinci kat: tıklama yine de geç
   * kalırsa sunucunun cevabı (`geriAlinamayanlar`) ekrana yazılıyor.
   */
  const [, setSaat] = useState(0);
  useEffect(() => {
    if (!sonIsaret) return;
    const bitis = geriAlmaBitisMs(sonIsaret.zamanMs);
    const tik = setInterval(() => setSaat((n) => n + 1), 60_000);
    const son = setTimeout(() => setSonIsaret(null), Math.max(0, bitis - Date.now()));
    return () => {
      clearInterval(tik);
      clearTimeout(son);
    };
  }, [sonIsaret]);

  function navigate(patch: Record<string, string | null>): void {
    const params = new URLSearchParams();
    params.set('musteri', clientId);
    const merged: Record<string, string | null> = {
      durum: activeStatus,
      ara: activeSearch || null,
      form: activeFormId,
      ...patch,
    };
    for (const [k, v] of Object.entries(merged)) if (v) params.set(k, v);
    startTransition(() => router.push(`/potansiyel-musteriler?${params.toString()}`));
  }

  async function setStatus(lead: LeadRecord, status: LeadStatus, geriAlma = false): Promise<void> {
    const previous = lead.status;
    setBusy(lead.id);
    setError(null);
    // İyimser: değişiklik anında görünüyor.
    setRows((cur) => cur.map((r) => (r.id === lead.id ? { ...r, status } : r)));
    try {
      const guncel = await apiFetch<LeadRecord>(`/leads/${lead.id}`, {
        method: 'PUT',
        body: JSON.stringify({ status }),
      });
      // Sunucunun döndürdüğü kayıt Meta rozetini de taşıyor ("iletilecek").
      setRows((cur) => cur.map((r) => (r.id === lead.id ? { ...r, ...guncel } : r)));
      setSonIsaret(geriAlma ? null : { leadId: lead.id, onceki: previous, zamanMs: Date.now() });
      // Geri alma geç kaldıysa (olay gönderildi ya da yolda) SÖYLENİYOR:
      // durum değişti ama Meta'daki olay silinemiyor.
      const kalan = geriAlma ? geriAlinamayanlar(guncel.geriBesleme, status) : [];
      if (kalan.length > 0) {
        setError(`Durum geri alındı ama ${kalan.join(', ')} Meta’ya zaten gönderildi; Meta’daki bildirim geri alınamıyor.`);
      }
      startTransition(() => router.refresh());
    } catch (err) {
      // GERİ AL. Hatayı yutmak, ajansın "arandı" sandığı kaydın hâlâ "yeni"
      // olması demek: ve o kişi bir daha aranmaz.
      setRows((cur) => cur.map((r) => (r.id === lead.id ? { ...r, status: previous } : r)));
      setError(err instanceof ApiRequestError ? err.message : 'Durum değiştirilemedi.');
    } finally {
      setBusy(null);
    }
  }

  function ac(id: string) {
    setGosterilen(id);
    setAcik(id);
  }
  function satirTusu(e: KeyboardEvent<HTMLTableRowElement>, id: string) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      ac(id);
    }
  }

  const toplamHepsi = Object.values(initial.byStatus).reduce((a, b) => a + b, 0);
  // Yalnız GÖSTERİLEN satırlardan: sayaç aynı satırda "N kayıt gösteriliyor" diyor.
  const gecikenSayisi = rows.filter((l) => bekleyenKayit(l.status, l.submittedAt)?.gecikti).length;
  const secilenForm = forms.find((f) => f.id === activeFormId);
  const paneldeki = rows.find((r) => r.id === gosterilen) ?? null;

  return (
    <section className="min-w-0 rounded-kart border border-line bg-surface">
      {/* DURUM HATTI: sayılar süzgeçten bağımsız; form süzgeci ve arama aynı çubukta. */}
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
        <SecimCipi secili={activeStatus === null} sayi={toplamHepsi} onClick={() => navigate({ durum: null })}>
          Tümü
        </SecimCipi>
        {LEAD_STATUSES.map((s) => (
          <SecimCipi
            key={s}
            secili={activeStatus === s}
            sayi={initial.byStatus[s]}
            title={LEAD_STATUS_META[s].hint}
            onClick={() => navigate({ durum: s })}
          >
            {DURUM_KISA_ADI[s]}
          </SecimCipi>
        ))}
        <span className="flex-1" />
        {forms.length > 0 && (
          <SuzgecMenusu
            etiket="Form"
            deger={secilenForm?.name ?? (activeFormId ? 'Seçili form' : 'Tüm formlar')}
            secili={Boolean(activeFormId)}
            onKaldir={() => navigate({ form: null })}
            secenekler={[
              { ad: 'Tüm formlar', aktif: !activeFormId, onSec: () => navigate({ form: null }) },
              ...forms.map((f) => ({ ad: f.name, aktif: activeFormId === f.id, onSec: () => navigate({ form: f.id }) })),
            ]}
          />
        )}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            navigate({ ara: search.trim() || null });
          }}
          className="flex min-w-0 flex-[0_1_240px]"
        >
          <label className="flex h-8 min-w-0 flex-1 items-center gap-2 rounded-full border border-line-strong bg-surface px-3">
            <span aria-hidden className="text-ink-soluk">
              ⌕
            </span>
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Ad, e-posta ya da telefon"
              aria-label="Ad, e-posta ya da telefonda ara"
              className="min-w-0 flex-1 border-0 bg-transparent text-13 text-ink outline-none placeholder:text-ink-soluk"
            />
          </label>
        </form>
      </div>

      {error && (
        <div className="border-b border-line p-4">
          <Serit ton="hata" baslik="Durum kaydedilemedi">
            {error}
          </Serit>
        </div>
      )}

      {rows.length === 0 ? (
        /* SÜZGEÇ BOŞ: kayıt VAR ama bu süzgece uyan yok. "Henüz kayıt yok" ayrı hâl, sayfada. */
        <div className="p-4">
          <BosDurum
            baslik="Bu süzgece uyan kayıt yok"
            neden={`Workspace'te ${toplamHepsi} kayıt var; seçili durum, form ya da arama hiçbirini içermiyor.`}
            eylem={
              <Dugme
                ton="ikincil"
                boyut="kucuk"
                onClick={() => navigate({ durum: null, form: null, ara: null })}
              >
                Süzgeçleri temizle
              </Dugme>
            }
          />
        </div>
      ) : (
        <div className={`overflow-x-auto transition-opacity motion-reduce:transition-none ${isPending ? 'opacity-60' : ''}`}>
          <table className="w-full border-collapse text-[13.5px]" aria-label="Potansiyel müşteriler">
            <thead>
              <tr>
                {['Kişi', 'İlk cevaplar', 'Form', 'Durum', 'Tarih'].map((b) => (
                  <th
                    key={b}
                    scope="col"
                    className="whitespace-nowrap border-b border-line px-4 py-2.5 text-left text-12 font-semibold normal-case tracking-normal text-ink-muted"
                  >
                    {b}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((lead) => (
                <Satir key={lead.id} lead={lead} onAc={() => ac(lead.id)} onTus={(e) => satirTusu(e, lead.id)} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* SESSİZ KESME YOK: kaç kayıt gösterildiği ve toplamın kaç olduğu yazıyor. */}
      <div className="flex flex-wrap items-center justify-end gap-4 px-4 py-2.5 text-[12.5px] text-ink-muted">
        <span className="mr-auto">Satıra tıkla: bütün cevaplar ve durum yan panelde.</span>
        <span className="tabular-nums">
          {rows.length} kayıt gösteriliyor
          {initial.total > rows.length && ` · toplam ${initial.total}. Aramayı daralt.`}
          {gecikenSayisi > 0 && <strong className="font-semibold text-danger-strong"> · {gecikenSayisi} yeni kayıt 1 saati geçti</strong>}
        </span>
      </div>

      <KayitPaneli
        lead={paneldeki}
        acik={acik !== null && paneldeki !== null}
        onKapat={() => setAcik(null)}
        canWrite={canWrite}
        busy={busy !== null || isPending}
        onDurum={(s) => paneldeki && void setStatus(paneldeki, s)}
        durumHatasi={error}
        onKaydedildi={(guncel) => setRows((cur) => cur.map((r) => (r.id === guncel.id ? { ...r, ...guncel } : r)))}
        geriAl={
          paneldeki && sonIsaret?.leadId === paneldeki.id
            ? { onceki: sonIsaret.onceki, zamanMs: sonIsaret.zamanMs, yap: () => void setStatus(paneldeki, sonIsaret.onceki, true) }
            : null
        }
      />
    </section>
  );
}

function cevaplariAyir(lead: LeadRecord) {
  /*
   * CEVAPLARDAN İLETİŞİM ALANLARI ÇIKARILIYOR: ad, telefon ve e-posta kişi
   * sütununda zaten yazıyor; cevaplarda ikinci kez göstermek, asıl ayırt
   * edici cevabı (bütçe, şehir, ürün) üç tekrarın arkasına itiyordu.
   */
  const cevaplar = lead.fields.filter((f) => !ILETISIM_ALANLARI.has(f.name.toLowerCase()));
  return { cevaplar, onde: cevaplar.slice(0, ONDE_GOSTERILEN_CEVAP) };
}

function Satir({
  lead,
  onAc,
  onTus,
}: {
  lead: LeadRecord;
  onAc: () => void;
  onTus: (e: KeyboardEvent<HTMLTableRowElement>) => void;
}) {
  const rozet = rozetGorunumu(lead.geriBesleme);
  const { cevaplar, onde } = cevaplariAyir(lead);
  const gizli = cevaplar.length - onde.length;
  const td = 'border-b border-line px-4 py-3 align-top';
  return (
    <tr
      tabIndex={0}
      onClick={onAc}
      onKeyDown={onTus}
      aria-label={`${lead.fullName ?? lead.email ?? lead.phone ?? 'Adsız kayıt'}: ayrıntıyı aç`}
      className="cursor-pointer hover:bg-surface-muted focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand"
    >
      <td className={td}>
        <b className="block max-w-[16rem] truncate font-semibold text-ink">
          {lead.fullName ?? lead.email ?? lead.phone ?? 'Adsız kayıt'}
        </b>
        {/*
          TELEFON VE E-POSTA TIKLANABİLİR: ajansın bu ekrandaki ilk işi
          aramak. Bağlantıya tıklamak satırı (yan paneli) açmıyor.
        */}
        <small className="flex min-w-0 flex-wrap gap-x-3 text-12 text-ink-muted">
          {lead.phone && (
            <a href={`tel:${lead.phone.replace(/\s/g, '')}`} onClick={(e) => e.stopPropagation()} className={ILETISIM_BAGI}>
              {lead.phone}
            </a>
          )}
          {whatsappAdresi(lead.phone, telefonE164) && (
            <a href={whatsappAdresi(lead.phone, telefonE164)!} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className={ILETISIM_BAGI}>
              WhatsApp
            </a>
          )}
          {lead.email && (
            <a href={`mailto:${lead.email}`} onClick={(e) => e.stopPropagation()} className={`truncate ${ILETISIM_BAGI}`}>
              {lead.email}
            </a>
          )}
        </small>
      </td>
      {/* ═══ İLK CEVAPLAR TABLODA: tıklama arkasında değil ═══ */}
      <td className={`${td} max-w-[22rem]`}>
        {onde.length === 0 ? (
          <span className="text-ink-muted">—</span>
        ) : (
          <span className="block truncate text-ink" title={onde.map((f) => `${f.label}: ${f.value}`).join(' · ')}>
            {onde.map((f) => f.value).join(' · ')}
          </span>
        )}
        {gizli > 0 && <small className="text-12 text-ink-muted">{gizli} cevap daha</small>}
      </td>
      <td className={td}>
        {/*
          FORM ADI OLMAYAN KAYIT SESSİZ KALMIYOR: Meta Ads Manager'da kurulmuş
          formların adı bir süre boş geliyordu ve kayıt sahipsiz görünüyordu.
        */}
        <span className="block max-w-[14rem] truncate text-ink" title={lead.leadFormName ?? ''}>
          {lead.leadFormName ?? 'Form adı alınamadı'}
        </span>
        {lead.socialProfileName && <small className="block truncate text-12 text-ink-muted">{lead.socialProfileName}</small>}
      </td>
      <td className={td}>
        <span className="grid justify-items-start gap-1">
          <DurumRozeti status={lead.status} />
          {/* META ROZETİ (Paket E): yalnız sorun ya da bekleme varken dikkat çekiyor. */}
          {rozet && (
            <small className={`max-w-[12rem] truncate text-12 ${rozet.ton === 'sorun' ? 'text-danger-strong' : 'text-ink-muted'}`} title={rozet.metin}>
              {rozet.metin}
            </small>
          )}
          {/* BEKLEME: ilk temas hızı kaydın değerini belirliyor; bir saati geçen kırmızı. */}
          {(() => {
            const b = bekleyenKayit(lead.status, lead.submittedAt);
            return b ? (
              <small className={`text-12 ${b.gecikti ? 'font-semibold text-danger-strong' : 'text-ink-muted'}`} data-bekleme={b.gecikti ? 'gecikti' : 'yeni'}>
                {b.metin}
              </small>
            ) : null;
          })()}
          {/* KAYIT NEREDEN GELDİ: teşhis için, meraktan değil. */}
          {lead.source === 'reconcile' && <small className="text-12 text-ink-muted">taramayla geldi</small>}
        </span>
      </td>
      <td className={`${td} whitespace-nowrap`}>
        {/*
          MUTLAK TARİH ÖNCE, GÖRELİ SONRA: "3 gün önce" tazelik sorusunun
          cevabı; kaydın hangi güne ait olduğu ise takvimde aranıyor.
        */}
        <span className="block tabular-nums text-ink">{formatTarih(lead.submittedAt)}</span>
        <small className="text-12 text-ink-muted">{formatRelative(lead.submittedAt)}</small>
      </td>
    </tr>
  );
}

/**
 * ═══ KAYIT YAN PANELİ ═══
 *
 * Bütün cevaplar, "bu kişi müşteri oldu mu?" (dört seçenekli bölümlü
 * seçici), not ve Meta'ya bildirilenler. Seçim TEK TIKLA uygulanıyor (eski
 * kart davranışı) ve 15 dakika "Geri al" duruyor; "Kaydet" yalnız NOTU
 * yazıyor. Not durumla birlikte gidiyor çünkü uç ikisini tek gövdede
 * alıyor; durum AYNI kaldığında sunucu geçmiş satırı ve Meta aşaması
 * üretmiyor (`durumDegisti` aynı durumda hiçbir şey yapmıyor).
 */
function KayitPaneli({
  lead,
  acik,
  onKapat,
  canWrite,
  busy,
  onDurum,
  onKaydedildi,
  geriAl,
  durumHatasi,
}: {
  /**
   * DURUM HATASI PANELDE DE. Durum yalnız bu panelden değişiyor ve hata
   * şeridi tablonun üstündeydi: panelin perdesi onu örtüyor, durum sessizce
   * geri dönüyor ve kullanıcı sebebi ancak paneli kapatınca görüyordu.
   */
  durumHatasi: string | null;
  lead: LeadRecord | null;
  acik: boolean;
  onKapat: () => void;
  canWrite: boolean;
  busy: boolean;
  onDurum: (s: LeadStatus) => void;
  onKaydedildi: (l: LeadRecord) => void;
  geriAl: { onceki: LeadStatus; zamanMs: number; yap: () => void } | null;
}) {
  const [not, setNot] = useState(lead?.note ?? '');
  const [kaydediliyor, setKaydediliyor] = useState(false);
  const [notHatasi, setNotHatasi] = useState<string | null>(null);
  // Panel başka bir kayda geçince not alanı o kaydın notuyla başlıyor.
  useEffect(() => {
    setNot(lead?.note ?? '');
    setNotHatasi(null);
  }, [lead?.id, lead?.note]);

  const asamalar = asamaSatirlari(lead?.geriBesleme);
  const kalanDk = geriAl ? geriAlmaKalanDk(geriAl.zamanMs, Date.now()) : null;
  const cevaplar = lead ? cevaplariAyir(lead).cevaplar : [];
  const notDegisti = (lead?.note ?? '') !== not.trim();
  const kalite = KALITE_SECENEKLERI.some((s) => s.durum === lead?.status);

  async function notuKaydet() {
    if (!lead) return;
    setKaydediliyor(true);
    setNotHatasi(null);
    try {
      const guncel = await apiFetch<LeadRecord>(`/leads/${lead.id}`, {
        method: 'PUT',
        body: JSON.stringify({ status: lead.status, note: not.trim() }),
      });
      onKaydedildi(guncel);
    } catch (err) {
      setNotHatasi(err instanceof ApiRequestError ? err.message : 'Not kaydedilemedi.');
    } finally {
      setKaydediliyor(false);
    }
  }

  return (
    <YanPanel
      acik={acik}
      onKapat={onKapat}
      genislik={440}
      baslik={lead ? (lead.fullName ?? lead.email ?? lead.phone ?? 'Adsız kayıt') : 'Kayıt'}
      altEylemler={
        <>
          <Dugme ton="ikincil" onClick={onKapat}>
            Kapat
          </Dugme>
          {canWrite && (
            <Dugme onClick={() => void notuKaydet()} bekliyor={kaydediliyor} disabled={!notDegisti}>
              Kaydet
            </Dugme>
          )}
        </>
      }
    >
      {lead && (
        <>
          <p className="m-0 text-12 text-ink-muted">
            {lead.leadFormName ?? 'Form adı alınamadı'} · {formatTarih(lead.submittedAt)} ({formatRelative(lead.submittedAt)})
          </p>

          {/*
            ═══ "BU KİŞİ MÜŞTERİ OLDU MU?" (Paket E, MIMARI § 9) ═══
            Lead durumunun KENDİSİ, yanında ikinci bir alan değil: iki alan
            olsaydı ajans kişiyi iki yerde işaretler ve Meta'ya hangisinin
            gittiği ekrandan anlaşılmazdı (Ç-1). "Yeni" seçenek değil: bir
            kaydı geri "yeni" yapmanın yolu "Geri al".
          */}
          {canWrite ? (
            <fieldset className="m-0 grid gap-1.5 border-0 p-0" disabled={busy}>
              <legend className="mb-1.5 text-13 font-semibold text-ink">Bu kişi müşteri oldu mu?</legend>
              <div className="max-w-full overflow-x-auto">
                <BolumluSecici
                  etiket="Bu kişi müşteri oldu mu?"
                  secili={kalite ? lead.status : ('' as LeadStatus)}
                  onSec={(d) => d !== lead.status && onDurum(d)}
                  secenekler={KALITE_SECENEKLERI.map((s) => ({
                    deger: s.durum,
                    etiket: s.durum === 'lost' ? DURUM_KISA_ADI.lost : s.etiket,
                  }))}
                />
              </div>
              <small className="text-12 text-ink-muted">
                {KALITE_SECENEKLERI.find((s) => s.durum === lead.status)?.ipucu ?? `Şu an: ${DURUM_KISA_ADI[lead.status]}`}
              </small>
              {durumHatasi && (
                <Serit ton="hata" baslik="Durum kaydedilemedi">
                  {durumHatasi}
                </Serit>
              )}
              {geriAl && kalanDk !== null && (
                <p role="status" className="m-0 text-12 text-ink-muted">
                  {lead.geriBesleme?.tur === 'bekliyor' ? `${kalanDk} dk içinde Meta’ya iletilecek. ` : ''}
                  <button type="button" onClick={geriAl.yap} className="font-semibold text-ink underline underline-offset-2">
                    Geri al ({DURUM_KISA_ADI[geriAl.onceki]})
                  </button>
                </p>
              )}
            </fieldset>
          ) : (
            <div className="flex items-center gap-2 text-13">
              <span className="text-ink-muted">Durum</span>
              <DurumRozeti status={lead.status} />
            </div>
          )}

          <dl className="m-0 grid grid-cols-[minmax(0,.9fr)_minmax(0,1.1fr)] gap-x-3 gap-y-2 text-13">
            {lead.phone && (
              <>
                <dt className="text-ink-muted">Telefon</dt>
                <dd className="m-0">
                  <a href={`tel:${lead.phone.replace(/\s/g, '')}`} className={ILETISIM_BAGI}>
                    {lead.phone}
                  </a>
                  {whatsappAdresi(lead.phone, telefonE164) && (
                    <>
                      {' · '}
                      <a href={whatsappAdresi(lead.phone, telefonE164)!} target="_blank" rel="noreferrer" className={ILETISIM_BAGI}>
                        WhatsApp
                      </a>
                    </>
                  )}
                </dd>
              </>
            )}
            {lead.email && (
              <>
                <dt className="text-ink-muted">E-posta</dt>
                <dd className="m-0 break-words">
                  <a href={`mailto:${lead.email}`} className={ILETISIM_BAGI}>
                    {lead.email}
                  </a>
                </dd>
              </>
            )}
            {cevaplar.map((f, i) => (
              <div key={i} className="contents">
                <dt className="text-ink-muted">{f.label}</dt>
                <dd className="m-0 break-words font-semibold text-ink">{f.value}</dd>
              </div>
            ))}
            {lead.campaignName && (
              <>
                <dt className="text-ink-muted">Kampanya</dt>
                <dd className="m-0 font-semibold text-ink">{lead.campaignName}</dd>
              </>
            )}
            {lead.socialProfileName && (
              <>
                <dt className="text-ink-muted">Sayfa</dt>
                <dd className="m-0 font-semibold text-ink">{lead.socialProfileName}</dd>
              </>
            )}
            <dt className="text-ink-muted">Geliş yolu</dt>
            <dd className="m-0 font-semibold text-ink">
              {lead.source === 'reconcile' ? 'Periyodik tarama' : lead.source === 'manual' ? 'Elle çekildi' : 'Anlık bildirim'}
            </dd>
          </dl>

          {canWrite ? (
            <Alan etiket="Not" ipucu="Ajansın notu; müşteriye gitmiyor." hata={notHatasi ?? undefined}>
              {(id, aciklamaId, hatali) => (
                <MetinAlani
                  id={id}
                  aria-describedby={aciklamaId}
                  hatali={hatali}
                  value={not}
                  maxLength={2000}
                  onChange={(e) => setNot(e.target.value)}
                  placeholder="Görüşme notu"
                />
              )}
            </Alan>
          ) : (
            lead.note && (
              <div className="grid gap-1">
                <span className="text-13 font-semibold text-ink">Not</span>
                <p className="m-0 whitespace-pre-wrap text-13 text-ink">{lead.note}</p>
              </div>
            )
          )}

          {/* HANGİ AŞAMA META'YA GİTTİ: "gönderilemedi" hangi aşama ve neden. */}
          <div className="grid gap-1.5">
            <span className="text-13 font-semibold text-ink">Meta'ya bildirilenler</span>
            {asamalar.length === 0 ? (
              <small className="text-12 text-ink-muted">
                {lead.geriBesleme?.tur === 'kapali' || !lead.geriBesleme
                  ? 'Bildirim kapalı ya da bu kayıt için henüz bir sonuç gönderilmedi.'
                  : 'Henüz gönderilen aşama yok.'}
              </small>
            ) : (
              <ul className="m-0 grid list-none gap-1.5 p-0">
                {asamalar.map((a) => (
                  <li key={a.ad} className="flex flex-wrap items-center justify-between gap-2 border-b border-line py-1.5 text-12 last:border-b-0">
                    <span className="font-semibold text-ink">{a.ad}</span>
                    <Rozet hal={a.sorun ? 'hata' : 'taslak'}>{a.durum}</Rozet>
                    {a.sorun && a.hata && <small className="w-full text-12 text-danger-strong">Meta: “{a.hata}”</small>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </YanPanel>
  );
}

function DurumRozeti({ status }: { status: LeadStatus }) {
  const meta = LEAD_STATUS_META[status];
  return (
    <span title={meta.hint}>
      {/* Soru ve süzgeçle AYNI ad: aynı durumun iki adı olmasın. */}
      <Rozet hal={TON_HALI[meta.tone]}>{DURUM_KISA_ADI[status]}</Rozet>
    </span>
  );
}
