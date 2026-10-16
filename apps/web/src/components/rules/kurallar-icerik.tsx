import {
  ACTION_LABELS,
  METRIC_META,
  OPERATOR_LABELS,
  OUTCOME_LABELS,
  RULE_LEVEL_LABELS,
  WINDOW_LABELS,
  sec,
  type ActionOutcome,
  type Dil,
  type BildirimKanali,
  type BildirimKanallariYaniti,
  type RuleActionRecord,
  type RuleRecord,
  type RuleRunRecord,
} from '@advetics/shared';
import { serverApiFetch } from '@/lib/api';
import { formatRelative } from '@/lib/format';
import { dilAl } from '@/dil/sunucu';
import { kurallarSozlugu } from '@/dil/sozlukler/kurallar';
import { hataMetni } from '@/lib/sayfa-yardimcilari';
import { baglanti } from '@/lib/baglanti';
import { kuralBildirimMetni } from '@/lib/sinyal';
import { KurallarTablosu, type KuralSatiri } from '@/components/rules/rule-controls';
import { Kart } from '@/components/ui/kart';
import { BosDurum, HataDurumu, Serit } from '@/components/ui/hal';
import { Rozet, type DurumHali } from '@/components/ui/rozet';
import { Tablo } from '@/components/ui/tablo';

export type KurallarSonucu = { durum: 'tamam'; kurallar: RuleRecord[] } | { durum: 'hata'; mesaj: string };

/**
 * Kural editörünün hesap seçicisini besleyen liste. Çağrıyı SAYFA yapıyor:
 * aynı liste başlıktaki "Yeni kural" düğmesine de gidiyor ve iki çağrı iki
 * farklı liste gösterebilirdi.
 */
export type HesapSonucu =
  | { durum: 'tamam'; liste: Array<{ id: string; name: string }> }
  | { durum: 'hata'; mesaj: string };

/** Sunucunun cevabı ya da sunucunun hata cümlesi; "alınamadı" ile "yok" ayrı. */
type Sonuc<T> = { durum: 'tamam'; veri: T } | { durum: 'hata'; mesaj: string };

/**
 * ═══ KURALLAR — İYİLEŞTİR'İN KURALLAR BÖLÜMÜ ═══
 *
 * Bu içerik `/kurallar` sayfasındaydı ve oradan TAŞINDI, yeniden yazılmadı
 * (PLAN.md): koşulun düz Türkçesi, geçmiş ve son turdaki kararlar aynı.
 * 2026-10-14'ten beri birleşik tasarım dilinde (BILESENLER.md): satırlar
 * tablo, eylemler ⋯ menüsünde ("Şimdi çalıştır" dışarıda), düzenleyici ve
 * geçmiş sağdan yan panel. `/kurallar` buraya yönleniyor.
 *
 * SAYFANIN TAŞIDIĞI TEK MESAJ: bu kurallar müşterinin hesabında gerçekten
 * iş yapıyor. Prova/canlı ayrımı listede en görünür şey; kuralın koşulu düz
 * Türkçe yazılı; son turda ne olduğu tek tık uzakta. Sebep modülün temel
 * asimetrisi: yanlış rapor düzeltilebilir, yanlış durdurulan kampanyanın
 * kaçırdığı satış geri gelmez.
 *
 * Kural listesi ÇAĞIRANDAN geliyor: sekme rozeti de aynı sayıyı gösteriyor
 * ve iki ayrı çağrı aynı ekranda iki farklı sayı gösterebilirdi.
 */
export async function KurallarIcerik({
  sonuc,
  hesaplar,
  clientId,
  clientAdi,
  canWrite,
  canActivate,
  acikKural,
  adres,
}: {
  sonuc: KurallarSonucu;
  hesaplar: HesapSonucu;
  clientId: string;
  clientAdi: string;
  canWrite: boolean;
  canActivate: boolean;
  acikKural: string | undefined;
  /** Geçmişi aç/kapa bağlantısı; sekme ve workspace parametresini taşıyan tek üretici. */
  adres: (kural: string | undefined) => string;
}) {
  const dil = await dilAl();
  const d = sec(kurallarSozlugu, dil);
  /*
   * "YALNIZCA BİLDİR" KURALININ KANAL ADLARI. Yalnız kanal seçmiş bir kural
   * varsa soruluyor; düşerse `null` ve satır ad UYDURMADAN "N kanala; adlar
   * alınamadı" diyor (`kuralBildirimMetni`).
   */
  const kanalGerekli =
    sonuc.durum === 'tamam' && sonuc.kurallar.some((r) => r.action.type === 'notify' && (r.action.kanalIdleri?.length ?? 0) > 0);
  const kanallar: BildirimKanali[] | null = kanalGerekli
    ? await serverApiFetch<BildirimKanallariYaniti>(baglanti('/bildirim/kanallar', { clientId })).then(
        (y) => y.kanallar,
        () => null,
      )
    : [];

  /*
   * GEÇMİŞ ÇAĞRILARI HATAYI YUTMUYOR. Eskiden `.catch(() => null)` diyordu ve
   * ekran "Geçmiş alınamadı" yazıyordu ama SEBEBİ yazmıyordu: yetki mi, kota
   * mı, silinmiş kural mı, ayırt edilemiyordu. Sunucunun cümlesi taşınıyor.
   */
  const turlar: Sonuc<RuleRunRecord[]> | null = acikKural
    ? await serverApiFetch<RuleRunRecord[]>(`/rules/${acikKural}/runs`).then(
        (veri): Sonuc<RuleRunRecord[]> => ({ durum: 'tamam', veri }),
        (e: unknown): Sonuc<RuleRunRecord[]> => ({ durum: 'hata', mesaj: hataMetni(e) }),
      )
    : null;
  const sonTur = turlar?.durum === 'tamam' ? turlar.veri[0] : undefined;
  const kararlar: Sonuc<RuleActionRecord[]> | null = sonTur
    ? await serverApiFetch<RuleActionRecord[]>(`/rules/runs/${sonTur.id}/actions`).then(
        (veri): Sonuc<RuleActionRecord[]> => ({ durum: 'tamam', veri }),
        (e: unknown): Sonuc<RuleActionRecord[]> => ({ durum: 'hata', mesaj: hataMetni(e) }),
      )
    : null;

  /*
   * GÖRELİ ZAMAN SUNUCUDA YAZILIYOR. Tablo bir istemci bileşeni; "5 dk önce"
   * orada hesaplansaydı sunucu ile tarayıcı arasında bir dakika geçtiğinde
   * iki farklı metin üretip hidrasyon uyarısı verirdi.
   */
  const satirlar: KuralSatiri[] =
    sonuc.durum === 'tamam'
      ? sonuc.kurallar.map((rule) => ({
          rule,
          // KURALIN NE YAPTIĞI DÜZ TÜRKÇE. JSON koşul dizisini göstermek,
          // kuralı canlıya alacak kişiden onu okuyabilmesini beklemek olurdu.
          aciklama: describe(rule, kanallar, dil),
          sonCalisma: rule.lastRunAt ? formatRelative(rule.lastRunAt, dil) : d.henuzCalismadi,
          sonAksiyon: rule.lastTriggeredAt ? d.sonAksiyon(formatRelative(rule.lastTriggeredAt, dil)) : null,
        }))
      : [];

  // İstemciye fonksiyon geçmiyor: her kuralın geçmiş adresi burada üretiliyor.
  const gecmisAdresleri = Object.fromEntries(satirlar.map((s) => [s.rule.id, adres(s.rule.id)]));

  return (
    <>
      {hesaplar.durum === 'hata' && (
        /*
         * HESAP LİSTESİ HATASI YUTULMUYOR. Eski sayfa `.catch(() => [])`
         * diyordu: çağrı düşünce kural editörünün hesap seçicisi "hiç hesap
         * yok" gibi boş açılıyordu ve kullanıcı kuralı istemeden "Tüm
         * hesaplar" için kuruyordu. Şimdi sebep listenin üstünde yazıyor.
         */
        <Serit ton="hata" baslik={d.hesapOkunamadi}>
          {d.hesapOkunamadiGovde(hesaplar.mesaj)}
        </Serit>
      )}
      {sonuc.durum === 'hata' ? (
        <HataDurumu baslik={d.kurallarAlinamadi} mesaj={sonuc.mesaj} />
      ) : sonuc.kurallar.length === 0 ? (
        <BosDurum
          baslik={d.bosBaslik}
          neden={
            <>
              {d.bosNeden1(clientAdi)} <strong>{d.provaModu}</strong>
              {d.bosNeden2} {canWrite ? d.bosYazabilir : d.bosYazamaz}
            </>
          }
        />
      ) : (
        <Kart dolgu={false}>
          <KurallarTablosu
            satirlar={satirlar}
            clientId={clientId}
            accounts={hesaplar.durum === 'tamam' ? hesaplar.liste : []}
            hesapHatasi={hesaplar.durum === 'hata' ? hesaplar.mesaj : null}
            canWrite={canWrite}
            canActivate={canActivate}
            acikKural={acikKural}
            gecmisAdresleri={gecmisAdresleri}
            kapatAdresi={adres(undefined)}
            gecmis={
              acikKural && turlar
                ? { kuralId: acikKural, icerik: <KuralGecmisi turlar={turlar} kararlar={kararlar} dil={dil} /> }
                : null
            }
          />
        </Kart>
      )}
    </>
  );
}

/**
 * Yan panelin Geçmiş sekmesi. DÖRT HÂL AYRI (CLAUDE.md §3): yükleniyor
 * hâlini tablo çiziyor (adres değişip sunucu cevap verene kadar), burada
 * hata (sunucunun cümlesi), boş (kural hiç çalışmadı) ve sonuç.
 */
function KuralGecmisi({
  turlar,
  kararlar,
  dil,
}: {
  turlar: Sonuc<RuleRunRecord[]>;
  kararlar: Sonuc<RuleActionRecord[]> | null;
  dil: Dil;
}) {
  const d = sec(kurallarSozlugu, dil);
  if (turlar.durum === 'hata') return <HataDurumu baslik={d.gecmisAlinamadi} mesaj={turlar.mesaj} />;
  if (turlar.veri.length === 0) {
    return (
      <BosDurum
        baslik={d.hicCalismadiBaslik}
        neden={d.hicCalismadiNeden}
      />
    );
  }

  const runs = turlar.veri;
  return (
    <div className="grid gap-4">
      <section className="grid gap-2">
        <h3 className="font-baslik m-0 text-14 font-bold text-ink">{d.sonTurlar}</h3>
        <ul className="m-0 grid list-none gap-0 p-0">
          {runs.slice(0, 5).map((run) => (
            <li key={run.id} className="flex items-center justify-between gap-3 border-b border-line py-2.5 last:border-0">
              <span className="min-w-0">
                <b className="block text-13 text-ink">
                  {formatRelative(run.startedAt, dil)}
                  {run.dryRun && <span className="font-normal text-ink-muted"> {d.prova}</span>}
                </b>
                <small className="block text-12 text-ink-muted">
                  {run.error ? (
                    <span className="text-danger-strong">{d.hataOn} {run.error}</span>
                  ) : (
                    <>
                      <span className="font-baslik tabular-nums">{run.evaluatedCount}</span> {d.varlikIncelendi} ·{' '}
                      <span className="font-baslik tabular-nums">{run.matchedCount}</span> {d.eslesti}
                    </>
                  )}
                </small>
              </span>
              <Rozet hal={run.error ? 'hata' : run.actionCount > 0 ? 'ok' : 'taslak'}>
                {run.error ? d.rozetHata : run.actionCount > 0 ? d.aksiyonSayisi(run.actionCount) : d.aksiyonYok}
              </Rozet>
            </li>
          ))}
        </ul>
        {/* SESSİZ KESME YOK: beşten fazla tur varsa kaç tane olduğu yazıyor. */}
        {runs.length > 5 && (
          <small className="text-12 text-ink-muted">{d.turSiniri(runs.length)}</small>
        )}
      </section>

      <section className="grid gap-2">
        <h3 className="font-baslik m-0 text-14 font-bold text-ink">{d.sonTurdakiKararlar}</h3>
        {kararlar === null || kararlar.durum === 'hata' ? (
          <HataDurumu
            baslik={d.kararlarAlinamadi}
            mesaj={kararlar?.durum === 'hata' ? kararlar.mesaj : d.sonTurYok}
          />
        ) : kararlar.veri.length === 0 ? (
          <BosDurum
            baslik={d.kararYokBaslik}
            neden={d.kararYokNeden}
          />
        ) : (
          <div className="rounded-alan border border-line">
            <Tablo
              etiket={d.sonTurdakiKararlar}
              satirlar={kararlar.veri}
              satirAnahtari={(a) => a.id}
              sutunlar={[
                { anahtar: 'varlik', baslik: d.kolonVarlik, hucre: (a) => <b className="text-ink">{a.entityName}</b> },
                {
                  anahtar: 'sonuc',
                  baslik: d.kolonSonuc,
                  hucre: (a) => <Rozet hal={SONUC_HALI[a.outcome]}>{OUTCOME_LABELS[a.outcome]}</Rozet>,
                },
                // GEREKÇE HER SATIRDA. "Kuralım neden bunu durdurdu" ve "neden
                // bunu atladı" aynı yerde cevaplanıyor.
                { anahtar: 'gerekce', baslik: d.kolonGerekce, hucre: (a) => <span className="text-ink-muted">{a.error ?? a.reason}</span> },
              ]}
            />
          </div>
        )}
      </section>
    </div>
  );
}

/*
 * KARARIN DURUM ROZETİ. Yeşil yalnız gerçekten UYGULANAN karar; prova taslak
 * gri, hata kırmızı. Atlanan her karar gri KARE (`dur`): neden atlandığını
 * rozetin metni ve gerekçe sütunu söylüyor. Eski renkli tonlar (sarı uyarı,
 * mavi bilgi) kılavuzda yok. `Record` TAM: yeni bir sonuç türü eklenince
 * derleme burada kırılıyor, satır sessizce rozetsiz kalmıyor.
 */
const SONUC_HALI: Record<ActionOutcome, DurumHali> = {
  applied: 'ok',
  simulated: 'taslak',
  failed: 'hata',
  skipped_cooldown: 'dur',
  skipped_guard: 'dur',
  skipped_stale_data: 'dur',
  skipped_no_budget: 'dur',
  skipped_capped: 'dur',
  skipped_noop: 'dur',
  skipped_no_conversion_signal: 'dur',
  // Frekans koşulu tekil erişim alınamadığı için değerlendirilmedi: ajansın
  // bilmesi gereken bir eksik (sebep satırda), hata değil.
  skipped_no_reach_signal: 'dur',
};

/** Kuralı düz Türkçeye çevirir; tablo satırının altındaki cümle. */
function describe(rule: RuleRecord, kanallar: BildirimKanali[] | null, dil: Dil): string {
  const d = sec(kurallarSozlugu, dil);
  const parts = rule.conditions.map(
    (c) =>
      `${METRIC_META[c.metric].label} ${OPERATOR_LABELS[c.operator]} ${c.value} (${WINDOW_LABELS[c.window].toLowerCase()})`,
  );
  const joined = parts.join(rule.combinator === 'and' ? d.ve : d.veya);
  const action =
    rule.action.type === 'adjust_budget'
      ? (rule.action.percent < 0 ? d.butceAzalt : d.butceArtir)(Math.abs(rule.action.percent))
      : rule.action.type === 'notify'
        ? kuralBildirimMetni(rule.action.kanalIdleri, kanallar, dil)
        : ACTION_LABELS[rule.action.type].toLowerCase();
  return d.aciklamaCumlesi(RULE_LEVEL_LABELS[rule.level], joined, action);
}
