'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  CHANNEL_HINTS,
  CHANNEL_LABELS,
  type ChannelKind,
  type ConnectionSummary,
} from '@advetics/shared';
import type { ClientSetupResult } from '@advetics/shared';
import { ApiRequestError, apiFetch } from '@/lib/api';
import { atamaBildirimi, type AtamaYaniti } from '@/lib/atama-bildirimi';
import {
  havuzlariCikar,
  havuzSuz,
  KANALLAR,
  workspaceAcilacaklar,
  workspaceAdi,
  type HavuzOgesi,
} from '@/lib/havuz';
import { PlatformLogo } from '@/components/platform-logo';

interface Musteri {
  id: string;
  name: string;
}

/**
 * HAVUZ KARTLARI — bağlantı ekranının atama yüzü.
 *
 * ESKİ DÜZEN: her bağlantının altında bütün hesaplar SATIR SATIR listeleniyordu.
 * 284 hesapta ekran metrelerce uzuyor ve "hangi hesap boşta" sorusu ancak
 * kaydırarak cevaplanabiliyordu.
 *
 * YENİ DÜZEN: kanal başına tek kart, üstünde havuzda kaç hesap beklediği.
 * Liste ancak istendiğinde ve POP-UP olarak açılıyor — ayrı bir sayfaya
 * gitmek, kullanıcıyı bağlam değiştirip geri dönmeye zorluyordu.
 */
export function HavuzKartlari({
  connections,
  clients,
  canManage,
  workspaceAcabilir,
}: {
  connections: ConnectionSummary[];
  clients: Musteri[];
  canManage: boolean;
  /** `client.write` — toplu workspace açma ancak onunla. */
  workspaceAcabilir: boolean;
}) {
  const [acikKanal, setAcikKanal] = useState<ChannelKind | null>(null);

  const havuzlar = useMemo(() => havuzlariCikar(connections), [connections]);

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {KANALLAR.map((k) => (
          <HavuzKarti
            key={k}
            kind={k}
            adet={havuzlar[k].length}
            canManage={canManage}
            onAc={() => setAcikKanal(k)}
          />
        ))}
      </div>

      {acikKanal && (
        <HavuzModal
          kind={acikKanal}
          ogeler={havuzlar[acikKanal]}
          clients={clients}
          workspaceAcabilir={workspaceAcabilir}
          onKapat={() => setAcikKanal(null)}
        />
      )}
    </>
  );
}

function HavuzKarti({
  kind,
  adet,
  canManage,
  onAc,
}: {
  kind: ChannelKind;
  adet: number;
  canManage: boolean;
  onAc: () => void;
}) {
  return (
    <section className="rounded-xl border border-line bg-surface p-4">
      <div className="flex items-start gap-2.5">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-line bg-surface">
          <PlatformLogo kind={kind} className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-ink">{CHANNEL_LABELS[kind]} havuzu</h3>
          <p className="mt-0.5 text-[11px] leading-snug text-ink-muted">{CHANNEL_HINTS[kind]}</p>
        </div>
      </div>

      <p className="mt-3 text-2xl font-semibold text-ink">
        {adet}
        <span className="ml-1 text-xs font-normal text-ink-muted">hesap boşta</span>
      </p>

      {/* SIFIRDA DA DÜĞME DURUYOR ama kapalı ve sebebi altında yazılı:
          gizlemek, "buradan nasıl atanıyor" diye aramaya yol açardı. */}
      <button
        type="button"
        onClick={onAc}
        disabled={!canManage || adet === 0}
        className="mt-3 w-full rounded-lg border border-line px-3 py-2 text-xs font-medium text-ink transition hover:bg-surface-sunken disabled:opacity-40"
      >
        Havuzdan hesap ata
      </button>
      {adet === 0 && (
        <p className="mt-1.5 text-[11px] text-ink-muted">Bu kanalda atanmamış hesap yok.</p>
      )}
    </section>
  );
}

/**
 * HAVUZ SEÇİCİ — POP-UP, ayrı sayfa DEĞİL.
 *
 * Ayrı sayfaya gitmek kullanıcıyı bağlam değiştirip geri dönmeye zorluyordu;
 * atama tek tıklık bir iş ve sayfayı terk etmeyi hak etmiyor.
 *
 * ARAMA HER KANALDA VAR. 284 hesaplı bir havuzda aradığını kaydırarak bulmak,
 * yanlış hesabı atamanın en kolay yolu.
 */
function HavuzModal({
  kind,
  ogeler,
  clients,
  workspaceAcabilir,
  onKapat,
}: {
  kind: ChannelKind;
  ogeler: HavuzOgesi[];
  clients: Musteri[];
  workspaceAcabilir: boolean;
  onKapat: () => void;
}) {
  const router = useRouter();
  const [arama, setArama] = useState('');
  const [hedef, setHedef] = useState<string>(clients[0]?.id ?? '');
  const [bekleyen, setBekleyen] = useState<string | null>(null);
  const [hata, setHata] = useState<string | null>(null);
  const [bildirim, setBildirim] = useState<string | null>(null);
  const kutuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') onKapat();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onKapat]);

  const suzulmus = useMemo(() => havuzSuz(ogeler, arama), [ogeler, arama]);

  /*
   * ═══ HER BİRİNE WORKSPACE AÇ ═══
   *
   * Aday listesi ARAMADAN BAĞIMSIZ: arama bir görünüm, toplu işlem bir
   * karar. Arama kutusunda bir şey yazılıyken düğmeye basıp yalnızca
   * görünenlere workspace açmak, kullanıcının ne yaptığını bilmediği bir
   * kısmi işlem olurdu.
   *
   * İKİ ADIM: önce kaç workspace açılacağı yazıyor, sonra onay. Açılan
   * workspace geri alınabilir ama tek tek; bir yanlış tık on workspace'lik
   * bir temizlik demekti.
   *
   * SIRAYLA, PARALEL DEĞİL: her istek sunucuda bir kurulum sihirbazı turu
   * (workspace + atama + izleme + geçmiş kuyruğu). Hepsini birden atmak
   * paylaşımlı sunucuda bir yük dalgası ve kuyrukta aynı anda on yapı
   * taraması demekti.
   */
  const adaylar = useMemo(() => workspaceAcilacaklar(ogeler), [ogeler]);
  const [topluOnay, setTopluOnay] = useState(false);
  const [toplu, setToplu] = useState<{
    sira: number;
    toplam: number;
    acilan: string[];
    hatalar: Array<{ ad: string; sebep: string }>;
    bitti: boolean;
  } | null>(null);

  async function herBirineWorkspaceAc(): Promise<void> {
    const liste = adaylar;
    setTopluOnay(false);
    setHata(null);
    setBildirim(null);
    const acilan: string[] = [];
    const hatalar: Array<{ ad: string; sebep: string }> = [];
    setToplu({ sira: 0, toplam: liste.length, acilan, hatalar, bitti: false });
    for (const [i, o] of liste.entries()) {
      const ad = workspaceAdi(o);
      try {
        const r = await apiFetch<ClientSetupResult>('/clients/setup', {
          method: 'POST',
          body: JSON.stringify({ name: ad, adAccountIds: [o.id] }),
        });
        /*
         * WORKSPACE AÇILDI AMA HESAP ATANAMADIYSA BU BİR BAŞARI DEĞİL.
         * Sihirbaz kısmi başarıyı geri almıyor ve sebebi `failures` içinde
         * dönüyor; onu yutmak "açtım ama boş" workspace'i sessiz bırakırdı.
         */
        const atanamadi = r?.failures.find((f) => f.kind === 'adAccount');
        if (atanamadi) hatalar.push({ ad, sebep: `workspace açıldı, hesap atanamadı: ${atanamadi.reason}` });
        else acilan.push(ad);
      } catch (e) {
        hatalar.push({ ad, sebep: e instanceof ApiRequestError ? e.message : 'İstek başarısız oldu.' });
      }
      setToplu({ sira: i + 1, toplam: liste.length, acilan: [...acilan], hatalar: [...hatalar], bitti: false });
    }
    setToplu({ sira: liste.length, toplam: liste.length, acilan, hatalar, bitti: true });
    router.refresh();
  }

  async function ata(oge: HavuzOgesi): Promise<void> {
    if (!hedef) {
      setHata('Önce bir workspace seç.');
      return;
    }
    setBekleyen(oge.id);
    setHata(null);
    setBildirim(null);
    try {
      // UÇ ÖĞENİN KENDİSİNDE (`havuz.ts`): burada seçmek, YouTube kanalının
      // hub aboneliğini kuran ucu atlamanın en kolay yoluydu.
      const res = await apiFetch<AtamaYaniti>(oge.atamaYolu, {
        method: 'PATCH',
        body: JSON.stringify({ clientId: hedef }),
      });
      /*
       * HAVUZDAKİ HESAP DA VERİ TAŞIYABİLİR. "Havuz" hesabın kimseye atanmamış
       * olması demek; DAHA ÖNCE bir müşteride bulunmuş ve oradan kaldırılmış
       * olabilir. O hâlde eski müşterinin kampanya ve metrik satırları hâlâ
       * duruyor ve bu atama onları taşıyor — sayı burada da yazılmalı.
       */
      setBildirim(atamaBildirimi(res ?? {}, true));
      // ATAMA İZLEMEYİ AÇIP 90 GÜNLÜK GEÇMİŞİ KUYRUĞA ALIYOR.
      router.refresh();
    } catch (e) {
      setHata(e instanceof ApiRequestError ? e.message : 'Atama başarısız oldu.');
    } finally {
      setBekleyen(null);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${CHANNEL_LABELS[kind]} havuzu`}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onMouseDown={(e) => {
        if (!kutuRef.current?.contains(e.target as Node)) onKapat();
      }}
    >
      <div
        ref={kutuRef}
        className="flex max-h-[80vh] w-full max-w-lg flex-col rounded-xl border border-line bg-surface shadow-xl"
      >
        <div className="border-b border-line px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-ink">
              <PlatformLogo kind={kind} className="h-4 w-4" />
              {CHANNEL_LABELS[kind]} havuzu
            </h2>
            <button
              type="button"
              onClick={onKapat}
              className="text-xs text-ink-muted transition hover:text-ink"
            >
              Kapat
            </button>
          </div>

          {clients.length === 0 ? (
            <p className="mt-2 text-[11px] text-danger">
              Henüz workspace yok — atama yapabilmek için önce bir workspace oluştur.
            </p>
          ) : (
            <label className="mt-2 block">
              <span className="text-[11px] text-ink-muted">Atanacak workspace</span>
              <select
                value={hedef}
                onChange={(e) => setHedef(e.target.value)}
                className="mt-1 w-full rounded-lg border border-line bg-surface px-2.5 py-1.5 text-sm"
              >
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
          )}

          <input
            type="search"
            value={arama}
            onChange={(e) => setArama(e.target.value)}
            placeholder="Hesap adı ya da kimliğiyle ara…"
            className="mt-2 w-full rounded-lg border border-line bg-surface px-2.5 py-1.5 text-sm"
          />

          {/* SESSİZ KESME YOK: kaç sonuç gösterildiği ve toplam yazılı. */}
          <p className="mt-1.5 text-[11px] text-ink-muted">
            {suzulmus.length} / {ogeler.length} hesap
          </p>

          {workspaceAcabilir && adaylar.length > 0 && toplu === null && (
            <div className="mt-2 rounded-lg border border-line bg-surface-muted/50 px-3 py-2">
              {topluOnay ? (
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs text-ink">
                    {adaylar.length} workspace açılacak, her biri bir hesapla.
                  </p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setTopluOnay(false)}
                      className="rounded-lg border border-line px-2.5 py-1 text-[11px] text-ink transition hover:bg-surface-muted"
                    >
                      Vazgeç
                    </button>
                    <button
                      type="button"
                      onClick={() => void herBirineWorkspaceAc()}
                      className="rounded-lg bg-brand px-2.5 py-1 text-[11px] font-semibold text-white transition"
                    >
                      Onayla
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs text-ink-muted">
                    Şirketin kendi bağlantısından {adaylar.length} hesap bekliyor.
                  </p>
                  <button
                    type="button"
                    onClick={() => setTopluOnay(true)}
                    disabled={bekleyen !== null}
                    className="rounded-lg bg-brand px-2.5 py-1 text-[11px] font-semibold text-white transition disabled:opacity-40"
                  >
                    Her birine workspace aç
                  </button>
                </div>
              )}
            </div>
          )}

          {/* İLERLEME VE SONUÇ — hangi hesabın açıldığı, hangisinin neden
              açılamadığı AYRI AYRI. "Tamamlandı" deyip eksiklerini saklamak,
              eksik workspace'i aylarca fark ettirmezdi. */}
          {toplu && (
            <div className="mt-2 rounded-lg border border-line px-3 py-2 text-xs">
              <p className="text-ink">
                {toplu.bitti
                  ? `${toplu.acilan.length} workspace açıldı${toplu.hatalar.length > 0 ? `, ${toplu.hatalar.length} açılamadı` : ''}.`
                  : `Açılıyor: ${toplu.sira} / ${toplu.toplam}`}
              </p>
              {toplu.hatalar.length > 0 && (
                <ul className="mt-1 space-y-0.5 text-danger">
                  {toplu.hatalar.map((h) => (
                    <li key={h.ad}>
                      {h.ad}: {h.sebep}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          {hata && <p className="mb-2 text-xs text-danger">{hata}</p>}
          {bildirim && <p className="mb-2 text-xs text-ink-muted">{bildirim}</p>}

          {suzulmus.length === 0 ? (
            <p className="py-6 text-center text-sm text-ink-muted">Aramaya uyan hesap yok.</p>
          ) : (
            <ul className="space-y-1.5">
              {suzulmus.map((o) => (
                <li
                  key={o.id}
                  className="flex items-center justify-between gap-2 rounded-lg border border-line px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm text-ink">{o.name}</p>
                    <p className="truncate text-[11px] text-ink-muted">
                      {o.externalId}
                      {/* BAĞLANTI ETİKETİ AD VE KİMLİKTEN SONRA GELİYOR ÇÜNKÜ
                          İKİSİ DE AYNI OLABİLİYOR: aynı reklam hesabı iki
                          şirket altında iki satır açabiliyor (tekil anahtar
                          `[platform, externalId, orgId]`) ve üretimde iki
                          "Biltaş · 3421122929" yan yana çıktı. Ayıran tek şey
                          satırın hangi bağlantıdan geldiği. */}
                      {o.baglanti.etiket && ` · ${o.baglanti.etiket}`}
                      {/* SAHİP YAZILI: ajansın hesabı her şirkete, şirketinki
                          yalnızca kendi workspace'lerine atanabiliyor. Bunu
                          atamaya basınca öğrenmek, girişte değil kullanım
                          anında doğrulama olurdu (CLAUDE.md). */}
                      {` · ${o.baglanti.sahip === 'ajans' ? 'Ajans bağlantısı' : 'Şirket bağlantısı'}`}
                    </p>
                    {/* KALDIRILMIŞ BAĞLANTININ SATIRI ATANABİLİR AMA VERİ
                        ÇEKMEZ: token'ı silinmiş bir bağlantıya bağlı. Bunu
                        söylememek, kullanıcıyı "atadım ama veri gelmiyor"
                        turuna sokar. */}
                    {o.baglanti.durum === 'revoked' && (
                      <p className="truncate text-[11px] text-warn-strong">
                        Bağlantısı kaldırılmış — atansa da veri çekmez
                      </p>
                    )}
                  </div>
                  {/* YÖNETİCİ (MCC) HESABI LİSTEDE DURUYOR ama atanamıyor —
                      reklam yayınlamıyor ve sebebi yazılı. */}
                  {o.isManager ? (
                    <span className="shrink-0 text-[11px] text-ink-muted">Yönetici (MCC)</span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void ata(o)}
                      disabled={bekleyen !== null || clients.length === 0}
                      className="shrink-0 rounded-lg bg-brand px-2.5 py-1 text-[11px] font-semibold text-white transition disabled:opacity-40"
                    >
                      {bekleyen === o.id ? 'Atanıyor…' : 'Ata'}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
