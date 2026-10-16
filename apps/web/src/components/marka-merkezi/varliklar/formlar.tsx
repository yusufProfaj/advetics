import Link from 'next/link';
import {
  FORM_TYPE_META,
  LEAD_FORM_STATUS_LABELS,
  trTelefonOnerisi,
  type LeadFormRecord,
  type LeadFormStatus,
} from '@advetics/shared';
import { hasPermission, requireSession } from '@/lib/session';
import { ApiRequestError, serverApiFetch } from '@/lib/api';
import { formatRelative } from '@/lib/format';
import { hesaplarAdresi, kapi, varliklarAdresi } from '@/lib/panel-adresleri';
import { FormBuilder } from '@/components/forms/form-builder';
import { KART_BAGLANTISI, Kart } from '@/components/ui/kart';
import { dugmeSinifi } from '@/components/ui/dugme';
import { AdHucresi, Tablo, SayfalamaCubugu } from '@/components/ui/tablo';
import { Rozet, type DurumHali } from '@/components/ui/rozet';
import { BosDurum, HataDurumu, Serit } from '@/components/ui/hal';
import { dilAl } from '@/dil/sunucu';
import { sec } from '@advetics/shared';
import { varliklarSozlugu } from '@/dil/sozlukler/varliklar';


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
  const dil = await dilAl();
  const dd = sec(varliklarSozlugu, dil);
  const d = dd.formlar;

  // SESSİZCE İLK WORKSPACE'E DÜŞÜLMÜYOR — gerekçe `lib/sayfa-workspace.ts`.

  const canWrite = kapi(session, 'varlik.yaz');
  // Yayınlama bu modülün kapı tablosunda değil (formun kendi akışı): uçla aynı izin.
  const canPublish = hasPermission(session, 'bulk.publish');
  const hataMetni = (e: unknown) => (e instanceof ApiRequestError ? e.message : dd.sunucuyaUlasilamadi);

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

  /*
   * OLUŞTURUCU YALNIZ ADRESTE `form` VARKEN AÇIK (2026-10-14, taslak
   * `#varlik`): `?form=yeni` yeni form, `?form=<id>` düzenleme. Eskiden
   * oluşturucu her zaman listenin ÜSTÜNDE açık duruyordu ve formu olan
   * workspace'te liste ekranın altına itiliyordu; "Yeni form" artık başlığın
   * sağında, sayfanın birincil eylemi.
   */
  const olusturucuAcik = editId !== undefined;
  const listeAdresi = varliklarAdresi('formlar', clientId);

  return (
    <div className="grid gap-5">
      {!formSonucu.ok && <HataDurumu baslik={d.listeAlinamadi} mesaj={formSonucu.hata} />}

      {!baglantiSonucu.ok ? (
        <Serit ton="hata" baslik={d.sayfalarOkunamadi}>
          {baglantiSonucu.hata}
        </Serit>
      ) : pages.length === 0 ? (
        <BosDurum
          baslik={d.onceSayfa}
          neden={d.onceSayfaNeden}
          eylem={
            /* Sayfa ataması bir WORKSPACE işi: Kurulum'un hesaplar bloğu. */
            <Link href={hesaplarAdresi(clientId)} className={dugmeSinifi('koyu', 'kucuk')}>
              {d.kurulumdaSayfaAta}
            </Link>
          }
        />
      ) : !canWrite ? (
        olusturucuAcik && <Serit baslik={d.yetkiYok}>{d.yoneticineSor}</Serit>
      ) : olusturucuAcik ? (
        <Kart
          baslik={editing ? editing.name : d.yeniForm}
          eylem={
            <Link href={listeAdresi} scroll={false} className={dugmeSinifi('hayalet', 'kucuk')}>
              {d.kapat}
            </Link>
          }
        >
          {editId !== 'yeni' && !editing && formSonucu.ok && (
            <div className="mb-4">
              <Serit baslik={d.bulunamadi}>{d.bulunamadiNeden}</Serit>
            </div>
          )}
          <FormBuilder
            key={editing?.id ?? 'new'}
            clientId={clientId}
            pages={pages}
            existing={editing}
            canPublish={canPublish}
            telefonOnerisi={telefon}
          />
        </Kart>
      ) : null}

      {formSonucu.ok &&
        baglantiSonucu.ok &&
        pages.length > 0 &&
        forms.length === 0 &&
        !olusturucuAcik && (
          <BosDurum
            baslik={d.bosBaslik}
            neden={d.bosNeden(pages.map((p) => p.name).join(', '))}
            eylem={
              canWrite ? (
                <Link href={varliklarAdresi('formlar', clientId, { form: 'yeni' })} scroll={false} className={dugmeSinifi('koyu', 'kucuk')}>
                  {d.formOlustur}
                </Link>
              ) : undefined
            }
          />
        )}

      {forms.length > 0 && (
        <Kart baslik={d.formlarin} baslikEki={`${forms.length}`} dolgu={false}>
          <Tablo<LeadFormRecord>
            etiket={d.tabloEtiket}
            satirlar={forms}
            satirAnahtari={(f) => f.id}
            sutunlar={[
              {
                anahtar: 'ad',
                baslik: 'Form',
                hucre: (f) => (
                  <AdHucresi
                    ad={
                      <>
                        {f.name}
                        {/* SÜRÜM ROZETİ yalnızca 1'den büyükse. Her formun
                            yanında "v1" yazmak, sürümlemeyi kullanıcının
                            düşünmesi gereken bir şeymiş gibi gösterirdi. */}
                        {f.version > 1 && (
                          <span className="ml-2 rounded-full bg-surface-sunken px-2 py-0.5 text-11 font-semibold text-ink-muted">
                            {d.surum(f.version)}
                          </span>
                        )}
                      </>
                    }
                    alt={
                      <>
                        {f.socialProfileName} · {FORM_TYPE_META[f.formType].label}
                        {f.error && <span className="text-danger-strong"> · {f.error}</span>}
                        {/* GERİ OKUMA: form Meta'da açık ama gönderilenden
                            farklı ya da doğrulanamadı. "Yayında" yazısının
                            yanında KIRMIZI: KVKK kutusunun düşmüş olması
                            sessiz kalmamalı. */}
                        {f.readbackWarning && <span className="text-danger-strong"> · {f.readbackWarning}</span>}
                      </>
                    }
                  />
                ),
              },
              {
                anahtar: 'durum',
                baslik: d.sutunDurum,
                hucre: (f) => <Rozet hal={FORM_DURUM_HALI[f.status]}>{LEAD_FORM_STATUS_LABELS[f.status]}</Rozet>,
              },
              { anahtar: 'soru', baslik: d.sutunSoru, sayi: true, hucre: (f) => f.prefillQuestions.length },
              { anahtar: 'zaman', baslik: d.sutunOlusturuldu, ikincil: true, hucre: (f) => formatRelative(f.createdAt, dil) },
              {
                anahtar: 'eylem',
                baslik: <span className="sr-only">{d.sutunEylem}</span>,
                sayi: true,
                hucre: (f) =>
                  canWrite ? (
                    <Link href={varliklarAdresi('formlar', clientId, { form: f.id })} scroll={false} className={KART_BAGLANTISI}>
                      {f.status === 'published' ? d.goruntule : d.duzenle}
                    </Link>
                  ) : null,
              },
            ]}
          />
          <SayfalamaCubugu bas={1} son={forms.length} toplam={forms.length} />
        </Kart>
      )}
    </div>
  );
}

/**
 * Form durumu → durum rozeti. YEŞİL YALNIZ "Yayında"; yayın belirsiz ya da
 * düşmüşse kırmızı (kullanıcının bakması gereken iş), taslak ve yeni sürümü
 * olan gri. `Record` olduğu için yeni bir durum eklenince derleme burayı ister.
 */
const FORM_DURUM_HALI: Record<LeadFormStatus, DurumHali> = {
  draft: 'taslak',
  publishing: 'taslak',
  uncertain: 'hata',
  published: 'ok',
  superseded: 'dur',
  failed: 'hata',
};

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}
