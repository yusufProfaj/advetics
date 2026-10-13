import Link from 'next/link';
import {
  FORM_TYPE_META,
  LEAD_FORM_STATUS_LABELS,
  trTelefonOnerisi,
  type LeadFormRecord,
} from '@advetics/shared';
import { hasPermission, requireSession } from '@/lib/session';
import { ApiRequestError, serverApiFetch } from '@/lib/api';
import { formatRelative } from '@/lib/format';
import { hesaplarAdresi, kapi, varliklarAdresi } from '@/lib/panel-adresleri';
import { FormBuilder } from '@/components/forms/form-builder';
import { Uyari } from '@/components/ui/uyari';


/**
 * Formlar kütüphanesi.
 *
 * BU EKRANIN TAŞIDIĞI TEK ZOR FİKİR: yayınlanmış form değiştirilemiyor.
 *
 * Meta'nın kuralı ve hukuki bir sebebi var — kullanıcı belirli bir onay
 * metnini kabul ederek veri verdi. Arayüzün işi bunu kullanıcı "Düzenle"ye
 * basmadan ÖNCE söylemek; sonradan söylemek, istemediği bir şeyi yapmış
 * olması demek.
 */
/**
 * BASE › VARLIKLAR › FORMLAR (2026-10-13). Eski `/kutuphane/formlar` ve
 * Marka Merkezi'nin Varlıklar bölümü buraya yönleniyor. Başlık ve workspace
 * kapısı Varlıklar sayfasında.
 *
 * OKUMA HATASI "SAYFA YOK" DEĞİL: sayfa listesi `.catch(() => [])` ile
 * alınıyordu ve bağlantı listesi düştüğünde ekran "Önce bir Facebook sayfası
 * gerekiyor" diyordu — sayfası zaten atanmış kullanıcıyı olmayan bir işe
 * gönderen yanlış bir cümle. Düşen çağrı kendi cümlesiyle yazıyor.
 */
export async function FormlarIcerik({
  clientId,
  params,
}: {
  clientId: string;
  params: Record<string, string | string[] | undefined>;
}) {
  const session = await requireSession();

  // SESSİZCE İLK WORKSPACE'E DÜŞÜLMÜYOR — gerekçe `lib/sayfa-workspace.ts`.

  const canWrite = kapi(session, 'varlik.yaz');
  // Yayınlama bu modülün kapı tablosunda değil (formun kendi akışı): uçla aynı izin.
  const canPublish = hasPermission(session, 'bulk.publish');
  const hataMetni = (e: unknown) => (e instanceof ApiRequestError ? e.message : 'Sunucuya ulaşılamadı.');

  const [baglantiSonucu, formSonucu, telefon] = await Promise.all([
    serverApiFetch<
      Array<{ socialProfiles: Array<{ id: string; name: string; profileType: string }> }>
    >(`/connections?clientId=${clientId}`).then(
      (v) => ({ ok: true as const, v }),
      (e: unknown) => ({ ok: false as const, hata: hataMetni(e) }),
    ),
    serverApiFetch<LeadFormRecord[]>(`/lead-forms?clientId=${clientId}`).then(
      (v) => ({ ok: true as const, v }),
      (e: unknown) => ({ ok: false as const, hata: hataMetni(e) }),
    ),
    // Yalnız ÖNERİ: okunamazsa "Bizi ara" numarası boş gelir ve kullanıcı
    // yazar; form ekranı bundan bağımsız çalışmalı. Boş liste değil, boş öneri.
    serverApiFetch<{ contactPhone: string | null }>(`/clients/${clientId}`).then(
      (c) => trTelefonOnerisi(c.contactPhone),
      () => null,
    ),
  ]);

  // FORM SAYFAYA AİT. Meta'da `leadgen_forms` sayfanın altında yaşıyor;
  // Instagram hesabı tek başına form barındıramıyor.
  const pages = (baglantiSonucu.ok ? baglantiSonucu.v : [])
    .flatMap((c) => c.socialProfiles ?? [])
    .filter((p) => p.profileType === 'facebook_page');

  const forms = formSonucu.ok ? formSonucu.v : [];
  const editId = first(params.form);
  const editing = editId ? forms.find((f) => f.id === editId) : undefined;

  return (
    <div className="space-y-5">
      {!formSonucu.ok && (
        <Uyari ton="tehlike" baslik="Form listesi alınamadı.">
          {formSonucu.hata}
        </Uyari>
      )}

      {!baglantiSonucu.ok ? (
        <Uyari ton="tehlike" baslik="Sayfalar okunamadı; form oluşturulamıyor.">
          {baglantiSonucu.hata}
        </Uyari>
      ) : pages.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line bg-surface p-8 text-center">
          <h2 className="text-sm font-semibold text-ink">Önce bir Facebook sayfası gerekiyor</h2>
          <p className="mx-auto mt-2 max-w-md text-xs text-ink-muted">
            Anlık form sayfaya ait — reklam hesabına değil. Instagram hesabı tek başına
            yeterli değil.
          </p>
          {/* Sayfa ataması bir WORKSPACE işi: Kurulum'un hesaplar bloğu. */}
          <Link
            href={hesaplarAdresi(clientId)}
            className="mt-4 inline-block rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-white"
          >
            Kurulum’da sayfa ata
          </Link>
        </div>
      ) : canWrite ? (
        <FormBuilder
          key={editing?.id ?? 'new'}
          clientId={clientId}
          pages={pages}
          existing={editing}
          canPublish={canPublish}
          telefonOnerisi={telefon}
        />
      ) : (
        <div className="rounded-xl bg-warn-soft px-4 py-3 text-sm text-warn-strong ring-1 ring-inset ring-warn/30">
          Form oluşturmak için yetkin yok.
        </div>
      )}

      {forms.length > 0 && (
        <section className="rounded-xl border border-line bg-surface">
          <h2 className="border-b border-line px-4 py-3 text-sm font-semibold text-ink">
            Formların
          </h2>
          <ul>
            {forms.map((f) => (
              <li
                key={f.id}
                className="flex flex-wrap items-center justify-between gap-2 border-b border-line/60 px-4 py-2.5 last:border-0"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink">
                    {f.name}
                    {/* SÜRÜM ROZETİ yalnızca 1'den büyükse. Her formun yanında
                        "v1" yazmak, sürümlemeyi kullanıcının düşünmesi gereken
                        bir şeymiş gibi gösterirdi. */}
                    {f.version > 1 && (
                      <span className="ml-2 rounded bg-surface-sunken px-1.5 py-0.5 text-[10px] text-ink-muted">
                        {f.version}. sürüm
                      </span>
                    )}
                  </p>
                  <p className="text-[11px] text-ink-muted">
                    {f.socialProfileName} · {FORM_TYPE_META[f.formType].label} ·{' '}
                    {LEAD_FORM_STATUS_LABELS[f.status]} · {f.prefillQuestions.length} soru ·{' '}
                    {formatRelative(f.createdAt)}
                    {f.error && <span className="text-danger-strong"> · {f.error}</span>}
                    {/* GERİ OKUMA: form Meta'da açık ama gönderilenden farklı
                        ya da doğrulanamadı. "Yayında" yazısının yanında
                        KIRMIZI: KVKK kutusunun düşmüş olması sessiz kalmamalı. */}
                    {f.readbackWarning && <span className="text-danger-strong"> · {f.readbackWarning}</span>}
                  </p>
                </div>
                {canWrite && (
                  <Link
                    href={varliklarAdresi('formlar', clientId, { form: f.id })}
                    className="shrink-0 rounded-lg border border-line px-2.5 py-1 text-xs font-medium text-ink hover:bg-surface-sunken"
                  >
                    {f.status === 'published' ? 'Görüntüle' : 'Düzenle'}
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}
