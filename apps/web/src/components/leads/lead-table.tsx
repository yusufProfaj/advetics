'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
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

/**
 * ═══ POTANSİYEL MÜŞTERİ LİSTESİ ═══
 *
 * Kullanıcının isteği birebir: "formun ismi - cevapları - lead tarihi".
 * Eski düzende üçü de vardı ama üçü de görünmüyordu — form adı tek satırlık
 * gri bir dizenin ortasına sıkışmıştı, tarih "3 gün önce" diye göreliydi ve
 * CEVAPLAR ancak satıra tıklayınca açılıyordu. Yani ekranın taşıdığı asıl
 * bilgi (kişi ne yazdı) varsayılan olarak gizliydi.
 *
 * Bugün satır kartı: solda kişi ve cevapları, sağda form ve tarih.
 *
 * DURUM DEĞİŞİKLİĞİ TEK TIKLA ve satırdan çıkmadan. Ajansın günlük işi bu:
 * ara, konuş, durumu ilerlet. Detay sayfasına gidip dönmek gereken bir akış,
 * 40 kayıtta 80 sayfa yüklemesi demek.
 *
 * DEĞİŞİKLİK ANINDA GÖRÜNÜYOR (iyimser güncelleme) ama hata olursa GERİ
 * ALINIYOR. Sunucuyu beklemek her tıklamada yarım saniyelik donma demek;
 * hatayı yutmak ise ajansın "arandı" işaretlediği kaydın hâlâ "yeni" olması.
 */

/**
 * Kartta doğrudan gösterilen cevap sayısı.
 *
 * Cevapların tamamını her satırda açmak, on kayıtlık bir listeyi ekrana
 * sığmaz hâle getiriyor; hiç göstermemek ise kullanıcının istediği bilgiyi
 * tıklama arkasına saklamak. İlk üç cevap ad/telefon/e-posta DIŞINDAKİ
 * sorular — asıl ayırt edici bilgi orada (bütçe, şehir, ilgilenilen ürün).
 */
const ONDE_GOSTERILEN_CEVAP = 3;

/** Ad, telefon ve e-posta kartın üstünde zaten yazıyor — cevaplarda tekrar etmesin. */
const ILETISIM_ALANLARI = new Set([
  'full_name',
  'first_name',
  'last_name',
  'email',
  'phone_number',
  'phone',
]);

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
  const [acik, setAcik] = useState<string | null>(null);

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

  async function setStatus(lead: LeadRecord, status: LeadStatus): Promise<void> {
    const previous = lead.status;
    setBusy(lead.id);
    setError(null);
    // İyimser: değişiklik anında görünüyor.
    setRows((cur) => cur.map((r) => (r.id === lead.id ? { ...r, status } : r)));
    try {
      await apiFetch(`/leads/${lead.id}`, {
        method: 'PUT',
        body: JSON.stringify({ status }),
      });
      startTransition(() => router.refresh());
    } catch (err) {
      // GERİ AL. Hatayı yutmak, ajansın "arandı" sandığı kaydın hâlâ "yeni"
      // olması demek — ve o kişi bir daha aranmaz.
      setRows((cur) => cur.map((r) => (r.id === lead.id ? { ...r, status: previous } : r)));
      setError(err instanceof ApiRequestError ? err.message : 'Durum değiştirilemedi.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-3">
      {/* DURUM HATTI — rozetler filtreden bağımsız sayıyor. */}
      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={() => navigate({ durum: null })}
          className={chip(activeStatus === null)}
        >
          Tümü{' '}
          <span className="opacity-60">
            {Object.values(initial.byStatus).reduce((a, b) => a + b, 0)}
          </span>
        </button>
        {LEAD_STATUSES.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => navigate({ durum: s })}
            title={LEAD_STATUS_META[s].hint}
            className={chip(activeStatus === s)}
          >
            {LEAD_STATUS_META[s].label}{' '}
            <span className="opacity-60">{initial.byStatus[s]}</span>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            navigate({ ara: search.trim() || null });
          }}
          className="flex-1"
        >
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Ad, e-posta ya da telefonda ara"
            className="w-full rounded-lg border border-line bg-surface px-2.5 py-1.5 text-sm outline-none focus:border-brand"
          />
        </form>

        {forms.length > 0 && (
          <select
            value={activeFormId ?? ''}
            onChange={(e) => navigate({ form: e.target.value || null })}
            className="rounded-lg border border-line bg-surface px-2.5 py-1.5 text-sm outline-none focus:border-brand"
          >
            <option value="">Tüm formlar</option>
            {forms.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {error && (
        <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-xs text-danger-strong ring-1 ring-inset ring-danger/30">
          {error}
        </p>
      )}

      <ul className="space-y-2">
        {rows.map((lead) => (
          <li key={lead.id}>
            <Kart
              lead={lead}
              acik={acik === lead.id}
              onAc={() => setAcik(acik === lead.id ? null : lead.id)}
              canWrite={canWrite}
              busy={busy !== null || isPending}
              onDurum={(s) => void setStatus(lead, s)}
            />
          </li>
        ))}
      </ul>

      {/* SESSİZ KESME YOK: kaç kayıt gösterildiği ve toplamın kaç olduğu yazıyor. */}
      <p className="text-[11px] text-ink-muted">
        {rows.length} kayıt gösteriliyor
        {initial.total > rows.length && ` · toplam ${initial.total}. Aramayı daralt.`}
      </p>
    </div>
  );
}

function Kart({
  lead,
  acik,
  onAc,
  canWrite,
  busy,
  onDurum,
}: {
  lead: LeadRecord;
  acik: boolean;
  onAc: () => void;
  canWrite: boolean;
  busy: boolean;
  onDurum: (s: LeadStatus) => void;
}) {
  /*
   * CEVAPLARDAN İLETİŞİM ALANLARI ÇIKARILIYOR.
   *
   * Ad, telefon ve e-posta kartın üstünde zaten yazıyor; cevaplarda ikinci
   * kez göstermek, asıl ayırt edici cevabı (bütçe, şehir, ürün) üç tekrarın
   * arkasına itiyordu.
   */
  const cevaplar = lead.fields.filter((f) => !ILETISIM_ALANLARI.has(f.name.toLowerCase()));
  const onde = cevaplar.slice(0, ONDE_GOSTERILEN_CEVAP);
  const gizli = cevaplar.length - onde.length;

  return (
    <article className="flex min-w-0 flex-col gap-3 rounded-2xl border border-line bg-surface p-3 sm:flex-row sm:gap-4 sm:p-4">
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <DurumRozeti status={lead.status} />
          {/* KAYIT NEREDEN GELDİ — teşhis için, meraktan değil. */}
          {lead.source === 'reconcile' && (
            <span className="rounded-md bg-warn-soft px-1.5 py-0.5 text-[11px] font-medium text-warn-strong ring-1 ring-inset ring-warn/30">
              taramayla geldi
            </span>
          )}
        </div>

        <p className="truncate text-sm font-semibold text-ink">
          {lead.fullName ?? lead.email ?? lead.phone ?? 'Adsız kayıt'}
        </p>

        {/*
          TELEFON VE E-POSTA TIKLANABİLİR.

          Ajansın bu ekrandaki ilk işi aramak. Numarayı seçip kopyalamak,
          günde kırk kayıtta kırk kez yapılan bir angarya.
        */}
        <p className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-0.5 text-xs">
          {lead.phone && (
            <a
              href={`tel:${lead.phone.replace(/\s/g, '')}`}
              className="font-medium text-ink underline underline-offset-2 transition hover:text-brand-strong"
            >
              {lead.phone}
            </a>
          )}
          {lead.email && (
            <a
              href={`mailto:${lead.email}`}
              className="truncate font-medium text-ink underline underline-offset-2 transition hover:text-brand-strong"
            >
              {lead.email}
            </a>
          )}
        </p>

        {/* ═══ CEVAPLAR KARTTA — TIKLAMA ARKASINDA DEĞİL ═══ */}
        {onde.length > 0 && (
          <dl className="flex min-w-0 flex-wrap gap-x-4 gap-y-1 text-[11px]">
            {onde.map((f, i) => (
              <div key={i} className="min-w-0">
                <dt className="truncate text-ink-muted">{f.label}</dt>
                <dd className="truncate font-medium text-ink">{f.value}</dd>
              </div>
            ))}
          </dl>
        )}

        {(gizli > 0 || lead.campaignName || lead.note) && (
          <div>
            <button
              type="button"
              onClick={onAc}
              aria-expanded={acik}
              className="rounded text-[11px] font-medium text-ink-muted underline underline-offset-2 transition hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            >
              {acik
                ? 'Detayı kapat'
                : /* SAYI YAZIYOR: "detay" tek başına, arkasında ne olduğunu
                     söylemiyor ve tıklanmıyor. */
                  gizli > 0
                  ? `${gizli} cevap daha`
                  : 'Kampanya ve not'}
            </button>
          </div>
        )}

        {acik && (
          <div className="rounded-xl bg-surface-sunken px-3 py-2.5">
            <dl className="grid gap-1.5 sm:grid-cols-2">
              {cevaplar.map((f, i) => (
                <div key={i} className="min-w-0">
                  <dt className="text-[11px] uppercase tracking-wide text-ink-muted">
                    {f.label}
                  </dt>
                  <dd className="break-words text-sm text-ink">{f.value}</dd>
                </div>
              ))}
            </dl>
            {lead.campaignName && (
              <p className="mt-2 text-[11px] text-ink-muted">
                Kampanya: <span className="text-ink">{lead.campaignName}</span>
              </p>
            )}
            {lead.note && (
              <p className="mt-2 rounded-md bg-surface px-2.5 py-1.5 text-xs text-ink">
                {lead.note}
              </p>
            )}
          </div>
        )}
      </div>

      {/* ═══ SAĞ BÖLGE: HANGİ FORM, NE ZAMAN, HANGİ DURUM ═══ */}
      <div className="flex w-full shrink-0 flex-col gap-2 border-t border-line/60 pt-3 sm:w-52 sm:border-l sm:border-t-0 sm:pl-4 sm:pt-0">
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-wide text-ink-muted">Form</p>
          {/*
            FORM ADI OLMAYAN KAYIT SESSİZ KALMIYOR.

            Meta Ads Manager'da kurulmuş formların adı bir süre boş geliyordu
            ve kart sahipsiz görünüyordu: kayıt var, nereden geldiği yok.
            Sebep artık yazılı.
          */}
          <p className="truncate text-sm font-medium text-ink" title={lead.leadFormName ?? ''}>
            {lead.leadFormName ?? 'Form adı alınamadı'}
          </p>
          {lead.socialProfileName && (
            <p className="truncate text-[11px] text-ink-muted">{lead.socialProfileName}</p>
          )}
        </div>

        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-wide text-ink-muted">Tarih</p>
          {/*
            MUTLAK TARİH ÖNCE, GÖRELİ SONRA.

            "3 gün önce" tazelik sorusunun cevabı; kaydın hangi güne ait
            olduğu ise takvimde aranıyor ve göreli zamandan çıkarılamıyor.
          */}
          <p className="text-sm font-medium tabular-nums text-ink">
            {formatTarih(lead.submittedAt)}
          </p>
          <p className="text-[11px] text-ink-muted">{formatRelative(lead.submittedAt)}</p>
        </div>

        {canWrite ? (
          <label className="mt-auto block">
            <span className="sr-only">Durum</span>
            <select
              value={lead.status}
              disabled={busy}
              onChange={(e) => onDurum(e.target.value as LeadStatus)}
              className="w-full rounded-lg border border-line bg-surface px-2 py-1.5 text-xs outline-none focus:border-brand disabled:opacity-50"
            >
              {LEAD_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {LEAD_STATUS_META[s].label}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>
    </article>
  );
}

/**
 * DURUM ROZETİ — renk TEK BAŞINA anlam taşımıyor, metin de var.
 *
 * Tonlar `LEAD_STATUS_META` içindeki anlamdan türüyor; ikinci bir eşleme
 * yazmak, bir durum eklendiğinde birinin güncellenmemesi demek olurdu.
 */
const TON_SINIFI: Record<'neutral' | 'active' | 'good' | 'bad', string> = {
  neutral: 'bg-info-soft text-info-strong ring-info/30',
  active: 'bg-warn-soft text-warn-strong ring-warn/30',
  good: 'bg-ok-soft text-ok-strong ring-ok/30',
  bad: 'bg-surface-sunken text-ink-muted ring-line',
};

function DurumRozeti({ status }: { status: LeadStatus }) {
  const meta = LEAD_STATUS_META[status];
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-md px-1.5 py-0.5 text-[11px] font-medium ring-1 ring-inset ${TON_SINIFI[meta.tone]}`}
      title={meta.hint}
    >
      {meta.label}
    </span>
  );
}

function chip(active: boolean): string {
  return `rounded-lg border px-2.5 py-1 text-xs font-medium transition ${
    active ? 'border-brand bg-brand-soft text-ink' : 'border-line text-ink-muted hover:bg-surface-sunken'
  }`;
}
