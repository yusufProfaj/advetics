'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  ACTION_LABELS,
  METRIC_META,
  OPERATOR_LABELS,
  RULE_ACTIONS,
  RULE_LEVELS,
  RULE_LEVEL_LABELS,
  RULE_METRICS,
  RULE_OPERATORS,
  RULE_WINDOWS,
  WINDOW_LABELS,
  KANAL_DURUM_ADI,
  type BildirimKanallariYaniti,
  type RuleCondition,
  type RuleRecord,
} from '@advetics/shared';
import { ApiRequestError, apiFetch } from '@/lib/api';
import { baglanti } from '@/lib/baglanti';
import { kaydedilecekKanallar, kanalAdi, kanalSecimi } from '@/lib/sinyal';
import { markaMerkeziAdresi } from '@/lib/panel-adresleri';
import { Dugme } from '@/components/ui/dugme';
import { Alan, FormIzgarasi, Girdi, Secim } from '@/components/ui/alan';
import { Serit } from '@/components/ui/hal';
import { CipEkle } from '@/components/ui/tablo';
import { KART_BAGLANTISI } from '@/components/ui/kart';

/**
 * Kural düzenleyici.
 *
 * TASARIM KARARI: kuralın ne yapacağı düz Türkçe bir cümle olarak ekranda
 * duruyor ve girdilerle birlikte güncelleniyor. Sebep, bu modülün temel
 * asimetrisi: anlamadığı bir kuralı canlıya alan kişi müşterinin
 * kampanyalarını durdurabilir. Formu doldurabilmek yeterli değil, ne
 * yazdığını okuyabilmek gerekiyor.
 *
 * YAN PANELİN İÇİNDE YAŞIYOR (birleşik tasarım, 2026-10-14): form sayfanın
 * ortasında açılan bir kutu değil, sağdan `YanPanel`. Kaydet düğmesi panelin
 * SAĞ ALTINDA (`YanPanel altEylemler`) ve formun DIŞINDA; bu yüzden form bir
 * `id` taşıyor ve düğme ona `form=` ile bağlanıyor (`KuralKaydetEylemleri`).
 * Kaydedilebilirlik ve bekleme durumu `onDurum` ile yukarı bildiriliyor:
 * düğme formun durumunu kendisi bilemez, ayrı hesaplarsa ikisi ayrışır.
 */

const EMPTY_CONDITION: RuleCondition = {
  metric: 'cpa',
  operator: 'gt',
  value: 250,
  window: 'last_7d',
};

export interface KuralFormDurumu {
  kaydedilebilir: boolean;
  bekliyor: boolean;
}

export function RuleEditor({
  clientId,
  accounts,
  existing,
  onDone,
  formId,
  onDurum,
  hesapHatasi = null,
}: {
  clientId: string;
  accounts: Array<{ id: string; name: string }>;
  existing?: RuleRecord;
  onDone: () => void;
  /** Panelin altındaki Kaydet düğmesi bu kimlikle forma bağlanıyor. */
  formId: string;
  onDurum: (d: KuralFormDurumu) => void;
  /** Hesap listesi okunamadıysa sunucunun mesajı; seçicinin altında yazılıyor. */
  hesapHatasi?: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState(existing?.name ?? '');
  const [adAccountId, setAdAccountId] = useState(existing?.adAccountId ?? '');
  const [level, setLevel] = useState<RuleRecord['level']>(existing?.level ?? 'campaign');
  const [combinator, setCombinator] = useState<'and' | 'or'>(existing?.combinator ?? 'and');
  const [conditions, setConditions] = useState<RuleCondition[]>(
    existing?.conditions ?? [EMPTY_CONDITION],
  );
  const [actionType, setActionType] = useState<RuleRecord['action']['type']>(
    existing?.action.type ?? 'pause',
  );
  const [percent, setPercent] = useState(
    existing?.action.type === 'adjust_budget' ? String(existing.action.percent) : '-20',
  );
  const [maxBudget, setMaxBudget] = useState(
    existing?.action.type === 'adjust_budget' && existing.action.maxBudget !== undefined
      ? String(existing.action.maxBudget)
      : '',
  );
  const [minImpressions, setMinImpressions] = useState(
    String(existing?.guard.minImpressions ?? 1000),
  );
  const [minClicks, setMinClicks] = useState(String(existing?.guard.minClicks ?? 20));
  const [minDaysWithData, setMinDaysWithData] = useState(
    String(existing?.guard.minDaysWithData ?? 0),
  );
  const [cooldownMinutes, setCooldownMinutes] = useState(
    String(existing?.cooldownMinutes ?? 1440),
  );
  const [maxActionsPerRun, setMaxActionsPerRun] = useState(
    String(existing?.maxActionsPerRun ?? 20),
  );

  /*
   * BİLDİRİM KANALLARI ("Yalnızca bildir", Paket A). Seçim kural kaydında
   * `action.kanalIdleri`; kanalsız kural "yalnız kural geçmişine yazılır".
   * Liste OKUNAMAZSA eski seçim KORUNUYOR: boş listeyle kaydetmek, düşen bir
   * çağrı yüzünden kuralın kanallarını sessizce silmek olurdu.
   */
  const [kanalIdleri, setKanalIdleri] = useState<string[]>(
    existing?.action.type === 'notify' ? (existing.action.kanalIdleri ?? []) : [],
  );
  const [kanallar, setKanallar] = useState<
    { tur: 'okunmadi' } | { tur: 'okunuyor' } | { tur: 'hata'; mesaj: string } | { tur: 'geldi'; veri: BildirimKanallariYaniti }
  >({ tur: 'okunmadi' });

  useEffect(() => {
    if (actionType !== 'notify' || kanallar.tur !== 'okunmadi') return;
    setKanallar({ tur: 'okunuyor' });
    apiFetch<BildirimKanallariYaniti>(baglanti('/bildirim/kanallar', { clientId })).then(
      (veri) => setKanallar({ tur: 'geldi', veri }),
      (e: unknown) => setKanallar({ tur: 'hata', mesaj: e instanceof ApiRequestError ? e.message : 'Sunucuya ulaşılamadı.' }),
    );
  }, [actionType, kanallar.tur, clientId]);

  /** Kayda gidecek seçim; silinmiş kanallar çıkıyor ve sayısı SÖYLENİYOR (`kaydedilecekKanallar`). */
  const kanalKaydi = kaydedilecekKanallar(kanalIdleri, kanallar.tur === 'geldi' ? kanallar.veri.kanallar : null);

  const budgetConditionAtWrongLevel =
    level !== 'campaign' && conditions.some((c) => c.metric === 'budget_spent_ratio');

  // Eski düğmenin `disabled` koşulunun AYNISI; artık düğme panelin altında.
  const kaydedilebilir = !busy && name.trim().length > 0 && !budgetConditionAtWrongLevel;
  useEffect(() => {
    onDurum({ kaydedilebilir, bekliyor: busy });
  }, [kaydedilebilir, busy, onDurum]);

  /*
   * KAYITLI HESAP LİSTEDE YOKSA SEÇENEK OLARAK EKLENİYOR. Hesap listesi
   * düştüğünde (ya da hesap artık bu workspace'e atanmamışsa) seçici
   * "Tüm hesaplar" GÖSTERİYOR ama durum hâlâ eski hesabı taşıyordu: ekran
   * bir şey, kayıt başka bir şey söylüyordu.
   */
  const hesapSecenekleri =
    existing?.adAccountId && !accounts.some((a) => a.id === existing.adAccountId)
      ? [...accounts, { id: existing.adAccountId, name: existing.adAccountName ?? 'Kayıtlı hesap' }]
      : accounts;

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const action =
        actionType === 'adjust_budget'
          ? {
              type: 'adjust_budget' as const,
              percent: Number(percent),
              ...(maxBudget.trim() ? { maxBudget: Number(maxBudget) } : {}),
            }
          : actionType === 'notify'
            ? {
                type: 'notify' as const,
                kanalIdleri: kanalKaydi.idler,
              }
            : { type: actionType };

      const body = {
        name: name.trim(),
        clientId,
        adAccountId: adAccountId || null,
        level,
        conditions,
        combinator,
        action,
        guard: {
          minImpressions: Number(minImpressions),
          minClicks: Number(minClicks),
          minSpend: 0,
          minDaysWithData: Number(minDaysWithData),
        },
        cooldownMinutes: Number(cooldownMinutes),
        maxActionsPerRun: Number(maxActionsPerRun),
        maxDataAgeHours: existing?.maxDataAgeHours ?? 36,
        enabled: existing?.enabled ?? true,
      };

      if (existing) {
        await apiFetch(`/rules/${existing.id}`, { method: 'PUT', body: JSON.stringify(body) });
      } else {
        await apiFetch('/rules', { method: 'POST', body: JSON.stringify(body) });
      }
      onDone();
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Kural kaydedilemedi.');
    } finally {
      setBusy(false);
    }
  }

  function patchCondition(index: number, patch: Partial<RuleCondition>): void {
    setConditions((cs) => cs.map((c, i) => (i === index ? { ...c, ...patch } : c)));
  }

  return (
    <form
      id={formId}
      className="grid gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        if (kaydedilebilir) void save();
      }}
    >
      {existing && !existing.dryRun && (
        // CANLI BİR KURALI DÜZENLEMEK ONU PROVAYA DÖNDÜRÜYOR. Sunucu bunu
        // koşul ya da aksiyon değiştiğinde yapıyor; kullanıcı bunu kaydettikten
        // SONRA öğrenmemeli.
        <Serit baslik="Bu kural canlı.">
          Koşulu ya da aksiyonu değiştirirsen kural provaya döner ve yeniden canlıya alman gerekir.
        </Serit>
      )}

      <Alan etiket="Kural adı">
        <Girdi value={name} onChange={(e) => setName(e.target.value)} placeholder="EBM koruması" />
      </Alan>

      <FormIzgarasi>
        {/*
          HESAP LİSTESİ OKUNAMADIYSA SEBEP SEÇİCİNİN ALTINDA. Liste boş açılınca
          kullanıcı "hiç hesap yok" sanıp kuralı bütün hesaplar için kuruyordu.
        */}
        <Alan
          etiket="Reklam hesabı"
          hata={hesapHatasi ? `Reklam hesapları okunamadı: ${hesapHatasi} Kural bütün hesaplara uygulanır.` : undefined}
        >
          {(id, aciklamaId, hatali) => (
            <Secim
              id={id}
              aria-describedby={aciklamaId}
              hatali={hatali}
              value={adAccountId}
              onChange={(e) => setAdAccountId(e.target.value)}
            >
              <option value="">Tüm hesaplar</option>
              {hesapSecenekleri.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Secim>
          )}
        </Alan>

        <Alan etiket="Seviye">
          <Secim value={level} onChange={(e) => setLevel(e.target.value as RuleRecord['level'])}>
            {RULE_LEVELS.map((l) => (
              <option key={l} value={l}>
                {RULE_LEVEL_LABELS[l]}
              </option>
            ))}
          </Secim>
        </Alan>
      </FormIzgarasi>

      <Alan etiket="Koşullar nasıl birleşsin">
        <Secim value={combinator} onChange={(e) => setCombinator(e.target.value as 'and' | 'or')}>
          <option value="and">Hepsi sağlanmalı (VE)</option>
          <option value="or">Biri yeterli (VEYA)</option>
        </Secim>
      </Alan>

      {/* Koşullar */}
      <fieldset className="grid gap-2">
        <legend className="mb-1.5 text-13 font-semibold text-ink">Koşullar</legend>
        {conditions.map((c, i) => (
          <div key={i} className="grid grid-cols-2 gap-2 rounded-alan border border-line p-2.5">
            <Secim
              aria-label={`Koşul ${i + 1} metriği`}
              value={c.metric}
              onChange={(e) => patchCondition(i, { metric: e.target.value as RuleCondition['metric'] })}
              title={METRIC_META[c.metric].hint}
            >
              {RULE_METRICS.map((m) => (
                <option key={m} value={m}>
                  {METRIC_META[m].label}
                </option>
              ))}
            </Secim>

            <Secim
              aria-label={`Koşul ${i + 1} karşılaştırması`}
              value={c.operator}
              onChange={(e) => patchCondition(i, { operator: e.target.value as RuleCondition['operator'] })}
            >
              {RULE_OPERATORS.map((o) => (
                <option key={o} value={o}>
                  {OPERATOR_LABELS[o]}
                </option>
              ))}
            </Secim>

            <Girdi
              aria-label={`Koşul ${i + 1} değeri`}
              type="text"
              inputMode="decimal"
              className="font-baslik tabular-nums"
              value={String(c.value)}
              onChange={(e) => patchCondition(i, { value: Number(e.target.value.replace(',', '.')) || 0 })}
            />

            <Secim
              aria-label={`Koşul ${i + 1} zaman penceresi`}
              value={c.window}
              onChange={(e) => patchCondition(i, { window: e.target.value as RuleCondition['window'] })}
            >
              {RULE_WINDOWS.map((w) => (
                <option key={w} value={w}>
                  {WINDOW_LABELS[w]}
                </option>
              ))}
            </Secim>

            {conditions.length > 1 && (
              <Dugme
                ton="tehlike"
                boyut="kucuk"
                className="col-span-2 justify-self-end"
                onClick={() => setConditions((cs) => cs.filter((_, j) => j !== i))}
              >
                Kaldır
              </Dugme>
            )}
          </div>
        ))}

        {conditions.length < 5 && (
          <span className="justify-self-start">
            <CipEkle onClick={() => setConditions((cs) => [...cs, EMPTY_CONDITION])}>+ Koşul ekle</CipEkle>
          </span>
        )}

        {budgetConditionAtWrongLevel && (
          <p role="alert" className="m-0 text-12 text-danger-strong">
            Bütçe tüketimi koşulu yalnızca kampanya seviyesinde kullanılabilir: bütçe kampanya/hesap seviyesinde
            tanımlı, tek bir reklamın bütçe tüketimi yok.
          </p>
        )}
      </fieldset>

      {/* Aksiyon */}
      <Alan etiket="Aksiyon">
        <Secim value={actionType} onChange={(e) => setActionType(e.target.value as RuleRecord['action']['type'])}>
          {RULE_ACTIONS.map((a) => (
            <option key={a} value={a}>
              {ACTION_LABELS[a]}
            </option>
          ))}
        </Secim>
      </Alan>

      {actionType === 'adjust_budget' && (
        <FormIzgarasi>
          <Alan etiket="Değişim (%)">
            <Girdi
              className="font-baslik tabular-nums"
              value={percent}
              onChange={(e) => setPercent(e.target.value)}
              placeholder="-20"
            />
          </Alan>
          {/* Yüzdesel artışın bileşik etkisi hızlı: günde %20 artan bir
              bütçe bir haftada 3,5 katına çıkıyor. */}
          <Alan
            etiket="Bütçe tavanı (opsiyonel)"
            ipucu="Artış kuralında tavan koymazsan bütçe her turda büyümeye devam eder."
          >
            {(id, aciklamaId) => (
              <Girdi
                id={id}
                aria-describedby={aciklamaId}
                className="font-baslik tabular-nums"
                value={maxBudget}
                onChange={(e) => setMaxBudget(e.target.value)}
                placeholder="boş = tavan yok"
              />
            )}
          </Alan>
        </FormIzgarasi>
      )}

      {actionType === 'notify' && (
        <div className="rounded-alan border border-line">
          <p className="m-0 border-b border-line px-3 py-2 text-13 font-semibold text-ink">Bildirim nereye gitsin?</p>
          {kanallar.tur === 'okunuyor' && (
            <p role="status" className="m-0 px-3 py-2.5 text-12 text-ink-muted">
              Kanallar okunuyor…
            </p>
          )}
          {kanallar.tur === 'hata' && (
            <p role="alert" className="m-0 px-3 py-2.5 text-12 text-danger-strong">
              Bildirim kanalları alınamadı: {kanallar.mesaj} Kuralın kayıtlı kanal seçimi ({kanalIdleri.length}) değiştirilmeden korunur.
            </p>
          )}
          {kanallar.tur === 'geldi' && kanallar.veri.kanallar.length === 0 && (
            <div className="px-3 py-2.5 text-12">
              <p className="m-0 text-ink">
                <strong>Bu workspace’te bildirim kanalı yok.</strong> Kural çalışır ve eşleşmeleri kural geçmişine yazar, ama
                kimseye haber gitmez.
              </p>
              <Link href={markaMerkeziAdresi('workspace', clientId, 'bildirimler')} className={`${KART_BAGLANTISI} mt-1.5 inline-block`}>
                Kanal ekle
              </Link>
            </div>
          )}
          {kanallar.tur === 'geldi' &&
            kanallar.veri.kanallar.map((k) => {
              const sec = kanalSecimi(k);
              const secili = kanalIdleri.includes(k.id);
              return (
                <label
                  key={k.id}
                  className={`flex items-start gap-2.5 border-t border-line px-3 py-2.5 text-12 first-of-type:border-t-0 ${
                    sec.secilebilir || secili ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'
                  }`}
                >
                  <input
                    type="checkbox"
                    className="mt-0.5 accent-[var(--brand-primary)]"
                    checked={secili}
                    // Seçilemeyen ama ZATEN seçili kanal kaldırılabiliyor; eklenemiyor.
                    disabled={!sec.secilebilir && !secili}
                    onChange={(e) =>
                      setKanalIdleri((x) => (e.target.checked ? [...x, k.id] : x.filter((y) => y !== k.id)))
                    }
                  />
                  <span className="min-w-0 flex-1">
                    <b className="text-ink">{kanalAdi(k)}</b>
                    {sec.not && <span className="block text-ink-muted">{sec.not}</span>}
                  </span>
                  <span className="shrink-0 text-ink-muted">{KANAL_DURUM_ADI[k.durum]}</span>
                </label>
              );
            })}
          {kanalKaydi.kayip > 0 && (
            <p className="m-0 border-t border-line px-3 py-2 text-12 text-danger-strong">
              {kanalKaydi.kayip} seçili kanal artık yok (silinmiş); kaydedince kuraldan çıkar.
            </p>
          )}
          {kanallar.tur === 'geldi' && kanallar.veri.kanallar.length > 0 && kanalIdleri.length === 0 && (
            <p className="m-0 border-t border-line px-3 py-2 text-12 text-ink-muted">
              Kanal seçilmedi: eşleşmeler yalnız kural geçmişine yazılır.
            </p>
          )}
        </div>
      )}

      {/* Korumalar. `<details>` kapanınca içeriği DOM'da tutuyor (CLAUDE.md §3 Tasarım). */}
      <details className="rounded-alan border border-line">
        <summary className="cursor-pointer px-3 py-2.5 text-13 font-semibold text-ink">Güvenlik eşikleri</summary>
        <div className="border-t border-line p-3">
          <FormIzgarasi>
            <Alan etiket="En az gösterim">
              <Girdi type="number" className="font-baslik tabular-nums" value={minImpressions} onChange={(e) => setMinImpressions(e.target.value)} />
            </Alan>
            <Alan etiket="En az tıklama">
              <Girdi type="number" className="font-baslik tabular-nums" value={minClicks} onChange={(e) => setMinClicks(e.target.value)} />
            </Alan>
            <Alan etiket="Pencerede en az kaç gün veri">
              <Girdi type="number" className="font-baslik tabular-nums" value={minDaysWithData} onChange={(e) => setMinDaysWithData(e.target.value)} />
            </Alan>
            <Alan etiket="Bekleme süresi (dk)">
              <Girdi type="number" className="font-baslik tabular-nums" value={cooldownMinutes} onChange={(e) => setCooldownMinutes(e.target.value)} />
            </Alan>
            <Alan etiket="Tek turda azami aksiyon">
              <Girdi type="number" className="font-baslik tabular-nums" value={maxActionsPerRun} onChange={(e) => setMaxActionsPerRun(e.target.value)} />
            </Alan>
          </FormIzgarasi>
        </div>
        <p className="m-0 border-t border-line px-3 py-2 text-12 text-ink-muted">
          Örneklem eşikleri kuralın gürültüyle tetiklenmesini engelliyor: 3 tıklama almış bir reklamın EBM&apos;si
          sonsuzdur ve eşik olmadan durdurulur. Bekleme süresi aynı varlığın açılıp kapanmasını engelliyor; Meta böyle
          bir reklamı öğrenme aşamasına geri atıyor.
        </p>
      </details>

      {/* Kuralın düz Türkçe özeti */}
      <Serit ton="bilgi" baslik="Bu kural şunu yapacak">
        {summarize({ level, conditions, combinator, actionType, percent })}
      </Serit>

      {error && (
        <Serit ton="hata" baslik="Kural kaydedilemedi.">
          {error}
        </Serit>
      )}

      <p className="m-0 text-12 text-ink-muted">
        Yeni kurallar <strong>prova modunda</strong> başlar: ne yapacaklarını gösterir ama hiçbir şeye dokunmazlar.
        Canlıya almak ayrı bir yetki gerektiriyor.
      </p>
    </form>
  );
}

/**
 * Yan panelin sağ altındaki Vazgeç + Kaydet. Kaydet formun DIŞINDA ve ona
 * `form=` ile bağlı; kapalı/bekleyen hâli formun bildirdiği durumdan.
 */
export function KuralKaydetEylemleri({
  formId,
  durum,
  onVazgec,
}: {
  formId: string;
  durum: KuralFormDurumu;
  onVazgec: () => void;
}) {
  return (
    <>
      <Dugme ton="ikincil" onClick={onVazgec} disabled={durum.bekliyor}>
        Vazgeç
      </Dugme>
      <Dugme type="submit" form={formId} disabled={!durum.kaydedilebilir} bekliyor={durum.bekliyor}>
        Kaydet
      </Dugme>
    </>
  );
}

/**
 * Kuralı düz Türkçeye çevirir.
 *
 * Formu doldurabilmek, kuralın ne yaptığını anlamak demek değil. Bu cümle
 * kullanıcının yazdığını okumasını sağlıyor; canlıya alma kararı bunun
 * üzerine veriliyor.
 */
function summarize(p: {
  level: RuleRecord['level'];
  conditions: RuleCondition[];
  combinator: 'and' | 'or';
  actionType: RuleRecord['action']['type'];
  percent: string;
}): string {
  const parts = p.conditions.map(
    (c) =>
      `${METRIC_META[c.metric].label} ${OPERATOR_LABELS[c.operator]} ${c.value} (${WINDOW_LABELS[c.window].toLowerCase()})`,
  );
  const joined = parts.join(p.combinator === 'and' ? ' VE ' : ' VEYA ');

  const action =
    p.actionType === 'adjust_budget'
      ? `bütçesini %${Math.abs(Number(p.percent) || 0)} ${Number(p.percent) < 0 ? 'azalt' : 'artır'}`
      : p.actionType === 'pause'
        ? 'duraklat'
        : p.actionType === 'resume'
          ? 'yeniden başlat'
          : 'yalnızca bildir';

  return `${RULE_LEVEL_LABELS[p.level]} bazında, ${joined} olan varlıkları ${action}.`;
}
