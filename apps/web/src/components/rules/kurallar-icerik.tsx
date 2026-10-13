import {
  ACTION_LABELS,
  METRIC_META,
  OPERATOR_LABELS,
  OUTCOME_LABELS,
  RULE_LEVEL_LABELS,
  WINDOW_LABELS,
  type ActionOutcome,
  type BildirimKanali,
  type BildirimKanallariYaniti,
  type RuleActionRecord,
  type RuleRecord,
  type RuleRunRecord,
} from '@advetics/shared';
import { serverApiFetch } from '@/lib/api';
import { formatRelative } from '@/lib/format';
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
          aciklama: describe(rule, kanallar),
          sonCalisma: rule.lastRunAt ? formatRelative(rule.lastRunAt) : 'henüz çalışmadı',
          sonAksiyon: rule.lastTriggeredAt ? `son aksiyon ${formatRelative(rule.lastTriggeredAt)}` : null,
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
        <Serit ton="hata" baslik="Reklam hesapları okunamadı.">
          {hesaplar.mesaj} Yeni kuralda hesap seçilemez; kural bütün hesaplara uygulanır.
        </Serit>
      )}
      {sonuc.durum === 'hata' ? (
        <HataDurumu baslik="Kurallar alınamadı." mesaj={sonuc.mesaj} />
      ) : sonuc.kurallar.length === 0 ? (
        <BosDurum
          baslik="Bu workspace’te kural yok"
          neden={
            <>
              Kurallar {clientAdi} hesabını sürekli izler ve tanımladığın eşikler aşıldığında kampanyayı duraklatır,
              yeniden başlatır ya da bütçesini değiştirir. Yeni kurallar <strong>prova modunda</strong> başlar: ne
              yapacaklarını gösterir ama hiçbir şeye dokunmazlar.{' '}
              {canWrite
                ? 'Başlıktaki “Yeni kural” ile ilkini kur.'
                : 'Kural oluşturmak için yetkin yok; yöneticinden rule.write izni isteyebilirsin.'}
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
                ? { kuralId: acikKural, icerik: <KuralGecmisi turlar={turlar} kararlar={kararlar} /> }
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
}: {
  turlar: Sonuc<RuleRunRecord[]>;
  kararlar: Sonuc<RuleActionRecord[]> | null;
}) {
  if (turlar.durum === 'hata') return <HataDurumu baslik="Geçmiş alınamadı." mesaj={turlar.mesaj} />;
  if (turlar.veri.length === 0) {
    return (
      <BosDurum
        baslik="Bu kural henüz hiç çalışmadı"
        neden="Kurallar saatte bir değerlendiriliyor; ilk tur bittiğinde burada görünür. Beklemeden görmek için “Şimdi çalıştır”."
      />
    );
  }

  const runs = turlar.veri;
  return (
    <div className="grid gap-4">
      <section className="grid gap-2">
        <h3 className="font-baslik m-0 text-14 font-bold text-ink">Son turlar</h3>
        <ul className="m-0 grid list-none gap-0 p-0">
          {runs.slice(0, 5).map((run) => (
            <li key={run.id} className="flex items-center justify-between gap-3 border-b border-line py-2.5 last:border-0">
              <span className="min-w-0">
                <b className="block text-13 text-ink">
                  {formatRelative(run.startedAt)}
                  {run.dryRun && <span className="font-normal text-ink-muted"> (prova)</span>}
                </b>
                <small className="block text-12 text-ink-muted">
                  {run.error ? (
                    <span className="text-danger-strong">hata: {run.error}</span>
                  ) : (
                    <>
                      <span className="font-baslik tabular-nums">{run.evaluatedCount}</span> varlık incelendi ·{' '}
                      <span className="font-baslik tabular-nums">{run.matchedCount}</span> eşleşti
                    </>
                  )}
                </small>
              </span>
              <Rozet hal={run.error ? 'hata' : run.actionCount > 0 ? 'ok' : 'taslak'}>
                {run.error ? 'Hata' : run.actionCount > 0 ? `${run.actionCount} aksiyon` : 'Aksiyon yok'}
              </Rozet>
            </li>
          ))}
        </ul>
        {/* SESSİZ KESME YOK: beşten fazla tur varsa kaç tane olduğu yazıyor. */}
        {runs.length > 5 && (
          <small className="text-12 text-ink-muted">Son 5 tur gösteriliyor, toplam {runs.length}.</small>
        )}
      </section>

      <section className="grid gap-2">
        <h3 className="font-baslik m-0 text-14 font-bold text-ink">Son turdaki kararlar</h3>
        {kararlar === null || kararlar.durum === 'hata' ? (
          <HataDurumu
            baslik="Son turun kararları alınamadı."
            mesaj={kararlar?.durum === 'hata' ? kararlar.mesaj : 'Son tur bulunamadı.'}
          />
        ) : kararlar.veri.length === 0 ? (
          <BosDurum
            baslik="Hiçbir varlık koşulu sağlamadı"
            neden="Kural çalıştı, yapacak bir şey bulamadı."
          />
        ) : (
          <div className="rounded-alan border border-line">
            <Tablo
              etiket="Son turdaki kararlar"
              satirlar={kararlar.veri}
              satirAnahtari={(a) => a.id}
              sutunlar={[
                { anahtar: 'varlik', baslik: 'Varlık', hucre: (a) => <b className="text-ink">{a.entityName}</b> },
                {
                  anahtar: 'sonuc',
                  baslik: 'Sonuç',
                  hucre: (a) => <Rozet hal={SONUC_HALI[a.outcome]}>{OUTCOME_LABELS[a.outcome]}</Rozet>,
                },
                // GEREKÇE HER SATIRDA. "Kuralım neden bunu durdurdu" ve "neden
                // bunu atladı" aynı yerde cevaplanıyor.
                { anahtar: 'gerekce', baslik: 'Gerekçe', hucre: (a) => <span className="text-ink-muted">{a.error ?? a.reason}</span> },
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
function describe(rule: RuleRecord, kanallar: BildirimKanali[] | null): string {
  const parts = rule.conditions.map(
    (c) =>
      `${METRIC_META[c.metric].label} ${OPERATOR_LABELS[c.operator]} ${c.value} (${WINDOW_LABELS[c.window].toLowerCase()})`,
  );
  const joined = parts.join(rule.combinator === 'and' ? ' VE ' : ' VEYA ');
  const action =
    rule.action.type === 'adjust_budget'
      ? `bütçesini %${Math.abs(rule.action.percent)} ${rule.action.percent < 0 ? 'azalt' : 'artır'}`
      : rule.action.type === 'notify'
        ? kuralBildirimMetni(rule.action.kanalIdleri, kanallar)
        : ACTION_LABELS[rule.action.type].toLowerCase();
  return `${RULE_LEVEL_LABELS[rule.level]} bazında, ${joined} olanları ${action}.`;
}
