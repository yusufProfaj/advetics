'use client';

import { Fragment, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CHANNEL_KINDS, type ChannelKind } from '@advetics/shared';
import { ApiRequestError, apiFetch } from '@/lib/api';
import { markaMerkeziAdresi, sihirbazAdresi } from '@/lib/panel-adresleri';
import { PlatformLogo, adAccountKanali, profilKanali } from '@/components/platform-logo';
import { Dugme } from '@/components/ui/dugme';

/**
 * ═══ ŞİRKETİN WORKSPACE'LERİ — SATIR, PENCERE DEĞİL ═══
 *
 * Her workspace bir karttı ve karta tıklayınca bir PENCERE açılıyordu:
 * hesap ataması, özel reklam kategorisi, firma bilgileri, ekip sayısı ve
 * arşivleme aynı pencerede. O alanların her birinin ikinci bir evi daha
 * vardı (Marka Merkezi, Kurulum, Ekip) ve aynı bilgi iki yerden
 * düzenlenince hangisinin "asıl" olduğu ekrandan okunmuyordu. Kullanıcının
 * onayladığı yapı (2026-10-13): Ayarlar'da workspace DÜZEYİNDE hiçbir alan
 * düzenlenmiyor, satır Marka Merkezi'ne AÇILIYOR (MIMARI Ç-23).
 *
 * SATIRDA DÖRT EYLEM: Marka Merkezi'nde aç (gezinme), Kurulumu tamamla
 * (aynı workspace'in kurulum sihirbazı), Taşı (workspace'in ŞİRKETİNİ
 * değiştirir — şirket düzeyi bir karar) ve Arşivle (listeden çıkarır). Kapıları sunucuda `PANEL_KAPILARI`
 * ile hesaplanıp buraya geliyor; kapalı eylemin düğmesi hiç çizilmiyor.
 *
 * Google Ads "Yönetici hesabı › Hesaplar" tablosunun karşılığı: ad, kimlik,
 * birkaç sayı, durum, tek birincil eylem.
 */
export interface WorkspaceSatiri {
  id: string;
  name: string;
  slug: string;
  status: string;
  _count: { adAccounts: number; memberships: number };
  adAccounts: Array<{ id: string; platform: string; syncEnabled: boolean }>;
  socialProfiles: Array<{ id: string; profileType: string }>;
}

const DURUM_ETIKET: Record<string, string> = {
  active: 'Aktif',
  paused: 'Duraklatıldı',
  archived: 'Arşivde',
};

type Panel = { id: string; tur: 'tasi' | 'arsivle' } | null;

/** Türkçe küçültme — varsayılan `toLowerCase()` "İ"yi "i̇" yapıyor. */
const kucult = (s: string): string => s.toLocaleLowerCase('tr');

export function WorkspaceSatirlari({
  satirlar,
  arsivleyebilir,
  arsivNedeni,
  tasiyabilir,
  tasiHedefleri,
}: {
  satirlar: WorkspaceSatiri[];
  /** `PANEL_KAPILARI['workspace.arsivle']` — sunucuda hesaplandı. */
  arsivleyebilir: boolean;
  /** Kapı kapalıysa ekranda yazan kısa sebep. */
  arsivNedeni: string;
  /** `PANEL_KAPILARI['workspace.tasi']`. */
  tasiyabilir: boolean;
  /** Taşınabilecek şirketler — aktif şirket HARİÇ (kendine taşımak boş bir işlem). */
  tasiHedefleri: Array<{ id: string; name: string }>;
}) {
  const router = useRouter();
  const [arama, setArama] = useState('');
  const [panel, setPanel] = useState<Panel>(null);
  const [mesgul, setMesgul] = useState<string | null>(null);
  const [hata, setHata] = useState<{ id: string; metin: string } | null>(null);
  const [hedefSirket, setHedefSirket] = useState('');

  const q = kucult(arama.trim());
  const suzulmus = useMemo(
    () => (q === '' ? satirlar : satirlar.filter((s) => kucult(s.name).includes(q) || kucult(s.slug).includes(q))),
    [satirlar, q],
  );

  const tasiAcik = tasiyabilir && tasiHedefleri.length > 0;

  function hataYaz(id: string, e: unknown, yedek: string) {
    setHata({ id, metin: e instanceof ApiRequestError ? e.message : yedek });
  }

  /**
   * MARKA MERKEZİ'NDE AÇ — önce o workspace'e GEÇ, sonra aç.
   *
   * Marka Merkezi adresteki `?musteri=` ile açılıyor; geçiş yine de şart:
   * kenar çubuğu, kapsam seçici ve diğer ekranlar OTURUMDAKİ workspace'i
   * okuyor. Geçmeden açmak, başlıkta A yazıp menüde B'nin verisini
   * gösteren bir panel bırakırdı — eski "Hesapları yönet" düğmesinin
   * yaşadığı hatanın aynısı (Ege'nin kartından Çiftçi Grup'un hesapları).
   */
  async function ac(s: WorkspaceSatiri, hedef: 'marka' | 'sihirbaz' = 'marka') {
    setMesgul(`${hedef === 'marka' ? 'ac' : 'kurulum'}:${s.id}`);
    setHata(null);
    try {
      await apiFetch('/auth/switch-client', { method: 'POST', body: JSON.stringify({ clientId: s.id }) });
      /*
       * KURULUMU TAMAMLA = SİHİRBAZ (MIMARI § 3a). Satırda sayaç YOK: her
       * satırın sayacı dört uç ve hazırlık okuması imzası değişmiş
       * workspace'te AI hazırlığını başlatıyor; Şirketler'i açmak her
       * workspace'te hazırlık başlatmamalı. Sayaç sihirbazın kendisinde.
       */
      router.push(hedef === 'marka' ? markaMerkeziAdresi('kurulum', s.id) : sihirbazAdresi(s.id));
    } catch (e) {
      hataYaz(s.id, e, 'Workspace’e geçilemedi.');
      setMesgul(null);
    }
  }

  /** ARŞİV SİLME DEĞİL: satır, hesaplar ve geçmiş duruyor; aşağıdaki Arşiv'den geri alınır. */
  async function arsivle(s: WorkspaceSatiri) {
    setMesgul(`arsiv:${s.id}`);
    setHata(null);
    try {
      await apiFetch(`/clients/${s.id}`, { method: 'DELETE' });
      setPanel(null);
      router.refresh();
    } catch (e) {
      hataYaz(s.id, e, 'Arşivlenemedi.');
    } finally {
      setMesgul(null);
    }
  }

  /**
   * TAŞI — workspace'i BAŞKA bir şirkete. Hesaplar, kampanyalar ve geçmiş
   * birlikte gidiyor (sunucu 30 tabloda `org_id` yazıyor). Hedef bir
   * listeden seçiliyor ve liste aktif şirketi İÇERMİYOR.
   */
  async function tasi(s: WorkspaceSatiri) {
    if (hedefSirket === '') return;
    setMesgul(`tasi:${s.id}`);
    setHata(null);
    try {
      await apiFetch('/manager-account/workspaces/move', {
        method: 'POST',
        body: JSON.stringify({ clientId: s.id, organizationId: hedefSirket }),
      });
      setPanel(null);
      setHedefSirket('');
      router.refresh();
    } catch (e) {
      hataYaz(s.id, e, 'Workspace taşınamadı.');
    } finally {
      setMesgul(null);
    }
  }

  function panelAc(id: string, tur: 'tasi' | 'arsivle') {
    setHata(null);
    setHedefSirket('');
    setPanel((p) => (p?.id === id && p.tur === tur ? null : { id, tur }));
  }

  return (
    <div className="rounded-xl border border-line bg-surface">
      <div className="flex flex-wrap items-center gap-3 border-b border-line p-3">
        <input
          type="search"
          value={arama}
          onChange={(e) => setArama(e.target.value)}
          placeholder="Workspace adı ya da kısa adıyla ara…"
          aria-label="Workspace ara"
          className="min-w-0 flex-1 rounded-lg border border-line bg-surface px-3 py-1.5 text-sm outline-none focus:border-brand"
        />
        {/* SESSİZ KESME YOK: süzülmüş listede kaçının göründüğü yazılı. */}
        <span className="text-xs text-ink-muted">
          {q === '' ? `${satirlar.length} workspace` : `${satirlar.length} workspace’ten ${suzulmus.length} tanesi gösteriliyor`}
        </span>
      </div>

      {suzulmus.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-ink-muted">“{arama}” ile eşleşen workspace yok.</p>
      ) : (
        /*
         * TABLO KENDİ KABINDA YATAY KAYIYOR, SAYFA KAYMIYOR. Telefonda beş
         * sütun sığmıyor; sütunları alt alta dizmek satırı satır olmaktan
         * çıkarır, sayfanın kendisini kaydırmak ise üstteki sekme çubuğunu
         * da ekran dışına iter.
         */
        <div className="overflow-x-auto">
          <table className="w-full min-w-[40rem] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs text-ink-muted">
                <th className="px-4 py-2">Workspace</th>
                <th className="px-4 py-2">Hesaplar</th>
                <th className="px-4 py-2">Ekip</th>
                <th className="px-4 py-2">Durum</th>
                <th className="px-4 py-2 text-right">
                  <span className="sr-only">Eylemler</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {suzulmus.map((s) => {
                const izlemede = s.adAccounts.filter((a) => a.syncEnabled).length;
                const kanallar = CHANNEL_KINDS.filter(
                  (k: ChannelKind) =>
                    s.adAccounts.some((a) => adAccountKanali(a.platform) === k) ||
                    s.socialProfiles.some((p) => profilKanali(p.profileType) === k),
                );
                const acikPanel = panel?.id === s.id ? panel.tur : null;
                return (
                  <Fragment key={s.id}>
                    <tr className="border-b border-line align-middle last:border-b-0">
                      <td className="px-4 py-3">
                        <span className="block font-medium text-ink">{s.name}</span>
                        <span className="block text-xs text-ink-muted">{s.slug}</span>
                      </td>
                      <td className="px-4 py-3">
                        {/*
                          BOŞ HÂL SEBEBİYLE: "0" bir sayı, "atanmamış" yapılacak
                          bir iş. "Atanmış ama hiçbiri izlemede değil" ise veri
                          gelmemesinin AYRI bir sebebi ve ayrı yazılıyor.
                        */}
                        {s._count.adAccounts === 0 && s.socialProfiles.length === 0 ? (
                          <span className="text-xs text-ink-muted">Hesap atanmamış</span>
                        ) : (
                          <span className="flex flex-wrap items-center gap-1.5">
                            {kanallar.map((k) => (
                              <PlatformLogo key={k} kind={k} className="h-4 w-4" />
                            ))}
                            <span className="text-xs text-ink-muted">
                              <strong className="text-ink">{s._count.adAccounts}</strong> hesap ·{' '}
                              {izlemede} izlemede
                            </span>
                          </span>
                        )}
                        {s._count.adAccounts > 0 && izlemede === 0 && (
                          <span className="mt-0.5 block text-[11px] text-warn-strong">Veri çekilmiyor</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-ink-muted">
                        <strong className="text-ink">{s._count.memberships}</strong> kişi
                      </td>
                      <td className="px-4 py-3">
                        {/* YEŞİL YALNIZ DURUM GÖSTERGESİ (TASARIM-DILI). */}
                        <span
                          className={`inline-flex items-center gap-1.5 text-xs ${s.status === 'active' ? 'text-ok-strong' : 'text-ink-muted'}`}
                        >
                          <span
                            aria-hidden
                            className={`h-1.5 w-1.5 rounded-full ${s.status === 'active' ? 'bg-ok-strong' : 'bg-ink-muted'}`}
                          />
                          {DURUM_ETIKET[s.status] ?? s.status}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1.5">
                          <Dugme
                            ton="birincil"
                            boyut="kucuk"
                            bekliyor={mesgul === `ac:${s.id}`}
                            disabled={mesgul !== null}
                            onClick={() => void ac(s)}
                          >
                            Marka Merkezi’nde aç
                          </Dugme>
                          <Dugme
                            ton="ikincil"
                            boyut="kucuk"
                            bekliyor={mesgul === `kurulum:${s.id}`}
                            disabled={mesgul !== null}
                            onClick={() => void ac(s, 'sihirbaz')}
                          >
                            Kurulumu tamamla
                          </Dugme>
                          {tasiAcik && (
                            <Dugme
                              ton="sade"
                              boyut="kucuk"
                              aria-expanded={acikPanel === 'tasi'}
                              disabled={mesgul !== null}
                              onClick={() => panelAc(s.id, 'tasi')}
                            >
                              Taşı
                            </Dugme>
                          )}
                          {arsivleyebilir && (
                            <Dugme
                              ton="sade"
                              boyut="kucuk"
                              aria-expanded={acikPanel === 'arsivle'}
                              disabled={mesgul !== null}
                              onClick={() => panelAc(s.id, 'arsivle')}
                            >
                              Arşivle
                            </Dugme>
                          )}
                        </div>
                      </td>
                    </tr>

                    {(acikPanel !== null || hata?.id === s.id) && (
                      <tr className="border-b border-line bg-surface-muted/50">
                        <td colSpan={5} className="px-4 py-3">
                          {hata?.id === s.id && (
                            <p role="alert" className="mb-2 text-sm text-danger-strong">
                              {hata.metin}
                            </p>
                          )}

                          {acikPanel === 'arsivle' && (
                            <div className="flex flex-wrap items-center justify-between gap-3">
                              <p className="max-w-prose text-sm text-ink">
                                <strong>{s.name}</strong> listeden kalkar. Hesaplar ve geçmiş veri silinmez;
                                aşağıdaki Arşiv’den geri alabilirsin.
                              </p>
                              <div className="flex gap-2">
                                <Dugme ton="ikincil" boyut="kucuk" onClick={() => setPanel(null)}>
                                  Vazgeç
                                </Dugme>
                                <Dugme
                                  ton="tehlike"
                                  boyut="kucuk"
                                  bekliyor={mesgul === `arsiv:${s.id}`}
                                  onClick={() => void arsivle(s)}
                                >
                                  Arşivle
                                </Dugme>
                              </div>
                            </div>
                          )}

                          {acikPanel === 'tasi' && (
                            <div className="flex flex-wrap items-center gap-2">
                              <label htmlFor={`tasi-${s.id}`} className="text-sm text-ink">
                                <strong>{s.name}</strong> şu şirkete taşınsın:
                              </label>
                              <select
                                id={`tasi-${s.id}`}
                                value={hedefSirket}
                                onChange={(e) => setHedefSirket(e.target.value)}
                                disabled={mesgul !== null}
                                className="min-w-[14rem] rounded-lg border border-line bg-surface px-2.5 py-1.5 text-sm outline-none focus:border-brand"
                              >
                                <option value="">Şirket seç…</option>
                                {tasiHedefleri.map((h) => (
                                  <option key={h.id} value={h.id}>
                                    {h.name}
                                  </option>
                                ))}
                              </select>
                              <Dugme
                                ton="ikincil"
                                boyut="kucuk"
                                disabled={hedefSirket === ''}
                                bekliyor={mesgul === `tasi:${s.id}`}
                                onClick={() => void tasi(s)}
                              >
                                Taşı
                              </Dugme>
                              <p className="w-full text-xs text-ink-muted">
                                Reklam hesapları, kampanyalar ve geçmiş veri birlikte taşınır.
                              </p>
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* KAPI KAPALIYSA SEBEBİ YAZIYOR, düğme sessizce kaybolmuyor. */}
      {!arsivleyebilir && (
        <p className="border-t border-line px-4 py-2 text-[11px] text-ink-muted">{arsivNedeni}</p>
      )}
    </div>
  );
}
