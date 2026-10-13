'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useId, useState, type ReactNode } from 'react';
import type { RuleRecord } from '@advetics/shared';
import { ApiRequestError, apiFetch } from '@/lib/api';
import { Dugme } from '@/components/ui/dugme';
import { AcilirMenu, IKON_TETIK, MenuAyraci, MenuOgesi } from '@/components/ui/acilir-menu';
import { Ikon } from '@/components/ui/ikon';
import { Pencere, YanPanel } from '@/components/ui/pencere';
import { Rozet } from '@/components/ui/rozet';
import { BolumluSecici, Sekmeler } from '@/components/ui/sekmeler';
import { AdHucresi, AracCubugu, SayfalamaCubugu, Tablo, type TabloSutunu } from '@/components/ui/tablo';
import { BosDurum, Serit, Yukleniyor } from '@/components/ui/hal';
import { KuralKaydetEylemleri, RuleEditor, type KuralFormDurumu } from './rule-editor';

type Hesap = { id: string; name: string };

/** Yan panelin genişliği: koşul satırı dört alan taşıyor, 400 piksel dar kalıyordu. */
const PANEL_GENISLIGI = 480;

const BOS_FORM: KuralFormDurumu = { kaydedilebilir: false, bekliyor: false };

/** Sunucuda hazırlanmış tablo satırı (göreli zamanlar ve düz Türkçe açıklama orada). */
export interface KuralSatiri {
  rule: RuleRecord;
  aciklama: string;
  sonCalisma: string;
  sonAksiyon: string | null;
}

type Mod = 'canli' | 'prova' | 'kapali';
type Suzgec = 'tumu' | Mod;

function modu(r: RuleRecord): Mod {
  if (!r.enabled) return 'kapali';
  return r.dryRun ? 'prova' : 'canli';
}

/** Taslaktaki rozet: Canlı yeşil (durum göstergesi), Prova gri, Kapalı gri kare. */
function ModRozeti({ rule }: { rule: RuleRecord }) {
  const m = modu(rule);
  if (m === 'kapali') return <Rozet hal="dur">Kapalı</Rozet>;
  return m === 'prova' ? <Rozet hal="taslak">Prova</Rozet> : <Rozet hal="ok">Canlı</Rozet>;
}

type Onay = { tur: 'canli' | 'sil'; rule: RuleRecord };
type Bildirim = { kuralAdi: string; ton: 'bilgi' | 'hata'; metin: string };

/**
 * ═══ KURAL TABLOSU (İyileştir › Kurallar) ═══
 *
 * Satır eylemleri: "Şimdi çalıştır" DIŞARIDA (en sık kullanılan, provada ne
 * olacağını görmenin yolu), geri kalanı ⋯ menüsünde; Sil en altta ve kırmızı.
 *
 * CANLIYA ALMA ONAY İSTİYOR. Tek tıkla canlıya geçen bir düğme, `rule.activate`
 * yetkisini ayrı tutmanın anlamını zayıflatırdı: yetki sahibi olmak niyet
 * etmek demek değil. Onay metni kuralın ne yapacağını tekrar söylüyor.
 * SİLME DE ONAY İSTİYOR: eskiden satırda ayrı duran düğme artık menünün
 * içinde, "Düzenle"nin iki satır altında; yanlış satıra tıklamak kuralı geri
 * dönüşsüz siliyordu.
 *
 * DÜZENLEYİCİ VE GEÇMİŞ AYNI YAN PANELDE, İKİ SEKME. Geçmiş ADRESTE
 * (`?kural=<id>`): sunucu yalnız açık kuralın turlarını çekiyor ve bağlantı
 * paylaşılınca aynı geçmiş açılıyor. Panel kapanınca adres eski hâline
 * dönüyor; dönmeseydi sayfa yenilenince kapatılan panel geri açılırdı.
 */
export function KurallarTablosu({
  satirlar,
  clientId,
  accounts,
  hesapHatasi,
  canWrite,
  canActivate,
  acikKural,
  gecmisAdresleri,
  kapatAdresi,
  gecmis,
}: {
  satirlar: KuralSatiri[];
  clientId: string;
  accounts: Hesap[];
  hesapHatasi: string | null;
  canWrite: boolean;
  canActivate: boolean;
  acikKural: string | undefined;
  /** Kural kimliği → geçmişi açık adres (sunucudaki `adres(id)`). */
  gecmisAdresleri: Record<string, string>;
  /** Geçmiş kapalı adres (sunucudaki `adres(undefined)`). */
  kapatAdresi: string;
  /** Adresteki kuralın sunucuda çizilmiş geçmişi. */
  gecmis: { kuralId: string; icerik: ReactNode } | null;
}) {
  const router = useRouter();
  const formId = useId();

  const [suzgec, setSuzgec] = useState<Suzgec>('tumu');
  const [panel, setPanel] = useState<{ id: string; sekme: 'kural' | 'gecmis' } | null>(
    acikKural ? { id: acikKural, sekme: 'gecmis' } : null,
  );
  // Her "Düzenle" formu SIFIRDAN açıyor; vazgeçilen yarım düzenleme geri gelmemeli.
  const [acilis, setAcilis] = useState(0);
  const [formDurumu, setFormDurumu] = useState<KuralFormDurumu>(BOS_FORM);
  const [mesgul, setMesgul] = useState<{ id: string; tur: 'run' | 'mode' | 'delete' } | null>(null);
  const [bildirim, setBildirim] = useState<Bildirim | null>(null);
  const [onay, setOnay] = useState<Onay | null>(null);
  const [onayHatasi, setOnayHatasi] = useState<string | null>(null);

  /*
   * ADRES PANELİ AÇAR. Geri/ileri tuşu ya da paylaşılan bağlantı `?kural=`
   * taşıyorsa panel o kuralın Geçmiş sekmesinde açılıyor.
   */
  useEffect(() => {
    if (acikKural) setPanel({ id: acikKural, sekme: 'gecmis' });
  }, [acikKural]);

  const secili = panel ? satirlar.find((s) => s.rule.id === panel.id) : undefined;

  function gecmisAc(id: string) {
    setPanel({ id, sekme: 'gecmis' });
    if (acikKural !== id && gecmisAdresleri[id]) router.push(gecmisAdresleri[id], { scroll: false });
  }

  function duzenle(id: string) {
    setAcilis((n) => n + 1);
    setFormDurumu(BOS_FORM);
    setPanel({ id, sekme: 'kural' });
  }

  function kapat() {
    setPanel(null);
    if (acikKural) router.push(kapatAdresi, { scroll: false });
  }

  async function islem(rule: RuleRecord, tur: 'run' | 'mode' | 'delete', fn: () => Promise<string | null>): Promise<boolean> {
    setMesgul({ id: rule.id, tur });
    setBildirim(null);
    try {
      const metin = await fn();
      if (metin) setBildirim({ kuralAdi: rule.name, ton: 'bilgi', metin });
      router.refresh();
      return true;
    } catch (err) {
      const metin = err instanceof ApiRequestError ? err.message : 'İşlem başarısız.';
      setBildirim({ kuralAdi: rule.name, ton: 'hata', metin });
      setOnayHatasi(metin);
      return false;
    } finally {
      setMesgul(null);
    }
  }

  const calistir = (rule: RuleRecord) =>
    islem(rule, 'run', async () => {
      const res = await apiFetch<{ matchedCount: number; actionCount: number }>(`/rules/${rule.id}/run`, {
        method: 'POST',
      });
      return `${res.matchedCount} varlık koşulu sağladı · ${res.actionCount} aksiyon${
        rule.dryRun ? ' (prova: hiçbir şeye dokunulmadı)' : ' uygulandı'
      }`;
    });

  const modDegistir = (rule: RuleRecord, dryRun: boolean) =>
    islem(rule, 'mode', async () => {
      await apiFetch(`/rules/${rule.id}/mode`, { method: 'PATCH', body: JSON.stringify({ dryRun }) });
      return dryRun ? 'Kural provaya alındı.' : 'Kural canlıya alındı.';
    });

  const sil = (rule: RuleRecord) =>
    islem(rule, 'delete', async () => {
      await apiFetch(`/rules/${rule.id}`, { method: 'DELETE' });
      return 'Kural silindi.';
    });

  async function onayla() {
    if (!onay) return;
    setOnayHatasi(null);
    // Başarısızlıkta pencere AÇIK kalıyor ve sunucunun cümlesini gösteriyor.
    const tamam = onay.tur === 'canli' ? await modDegistir(onay.rule, false) : await sil(onay.rule);
    if (tamam) {
      if (onay.tur === 'sil' && panel?.id === onay.rule.id) kapat();
      setOnay(null);
    }
  }

  const sayilar: Record<Suzgec, number> = { tumu: satirlar.length, canli: 0, prova: 0, kapali: 0 };
  for (const s of satirlar) sayilar[modu(s.rule)] += 1;
  const gorunen = suzgec === 'tumu' ? satirlar : satirlar.filter((s) => modu(s.rule) === suzgec);

  const sutunlar: Array<TabloSutunu<KuralSatiri>> = [
    {
      anahtar: 'kural',
      baslik: 'Kural',
      hucre: (s) => (
        <AdHucresi
          ad={
            // Yazabilen kişi düzenleyiciye, yazamayan geçmişe iner: yazamayana
            // kaydedemeyeceği bir form açmak boşuna olurdu.
            <button
              type="button"
              className="text-left font-semibold text-ink hover:text-brand-strong hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
              onClick={() => (canWrite ? duzenle(s.rule.id) : gecmisAc(s.rule.id))}
            >
              {s.rule.name}
            </button>
          }
          alt={s.aciklama}
        />
      ),
    },
    { anahtar: 'mod', baslik: 'Mod', hucre: (s) => <ModRozeti rule={s.rule} /> },
    { anahtar: 'hesap', baslik: 'Hesap', ikincil: true, hucre: (s) => s.rule.adAccountName ?? 'Tüm hesaplar' },
    {
      anahtar: 'son',
      baslik: 'Son çalışma',
      ikincil: true,
      hucre: (s) => (
        <span className="block whitespace-nowrap">
          {s.sonCalisma}
          {s.sonAksiyon && <small className="block text-12 text-ink-muted">{s.sonAksiyon}</small>}
        </span>
      ),
    },
    {
      anahtar: 'eylem',
      baslik: <span className="sr-only">Eylemler</span>,
      hucre: (s) => (
        <RuleControls
          rule={s.rule}
          canWrite={canWrite}
          canActivate={canActivate}
          mesgul={mesgul?.id === s.rule.id ? mesgul.tur : null}
          kilitli={mesgul !== null}
          onCalistir={() => void calistir(s.rule)}
          onDuzenle={() => duzenle(s.rule.id)}
          onGecmis={() => gecmisAc(s.rule.id)}
          onProva={() => void modDegistir(s.rule, true)}
          onCanli={() => {
            setOnayHatasi(null);
            setOnay({ tur: 'canli', rule: s.rule });
          }}
          onSil={() => {
            setOnayHatasi(null);
            setOnay({ tur: 'sil', rule: s.rule });
          }}
        />
      ),
    },
  ];

  const sekme = panel?.sekme ?? 'gecmis';
  const gecmisHazir = Boolean(secili && gecmis && gecmis.kuralId === secili.rule.id);

  return (
    <>
      <Tablo
        etiket="Otomatik kurallar"
        sutunlar={sutunlar}
        satirlar={gorunen}
        satirAnahtari={(s) => s.rule.id}
        aracCubugu={
          <>
            <AracCubugu sag={<span className="text-12 text-ink-muted">Saatte bir değerlendiriliyor</span>}>
              <BolumluSecici<Suzgec>
                etiket="Kural modu"
                secili={suzgec}
                onSec={setSuzgec}
                secenekler={(
                  [
                    ['tumu', 'Tümü'],
                    ['canli', 'Canlı'],
                    ['prova', 'Prova'],
                    ['kapali', 'Kapalı'],
                  ] as const
                ).map(([deger, ad]) => ({
                  deger,
                  etiket: (
                    <>
                      {ad}
                      <span className="ml-1.5 font-baslik tabular-nums text-ink-muted">{sayilar[deger]}</span>
                    </>
                  ),
                }))}
              />
            </AracCubugu>
            {/* SONUÇ SATIRIN ÜSTÜNDE DEĞİL TABLONUN ÜSTÜNDE: hangi kuralın sonucu olduğu başlıkta yazıyor. */}
            {bildirim && (
              <div className="px-4 pt-3">
                <Serit
                  ton={bildirim.ton === 'hata' ? 'hata' : 'bilgi'}
                  baslik={bildirim.kuralAdi}
                  eylemler={
                    <Dugme ton="hayalet" boyut="kucuk" onClick={() => setBildirim(null)}>
                      Kapat
                    </Dugme>
                  }
                >
                  {bildirim.metin}
                </Serit>
              </div>
            )}
          </>
        }
        bos={
          <BosDurum
            baslik="Bu süzgeçte kural yok"
            neden={`${satirlar.length} kuralın hiçbiri bu modda değil. “Tümü”ne dönünce hepsi görünür.`}
            eylem={
              <Dugme ton="ikincil" boyut="kucuk" onClick={() => setSuzgec('tumu')}>
                Tümünü göster
              </Dugme>
            }
          />
        }
      />
      {/* SESSİZ KESME YOK: süzgeçte kaç kural göründüğü her zaman yazıyor. */}
      <div className="flex flex-wrap items-center">
        <span className="px-4 text-12 text-ink-muted">Yeni kurallar prova modunda başlar; hiçbir şeye dokunmaz.</span>
        <div className="ml-auto">
          <SayfalamaCubugu bas={gorunen.length === 0 ? 0 : 1} son={gorunen.length} toplam={gorunen.length} />
        </div>
      </div>

      <YanPanel
        acik={Boolean(secili)}
        onKapat={kapat}
        baslik={secili?.rule.name ?? 'Kural'}
        genislik={PANEL_GENISLIGI}
        altEylemler={
          secili && canWrite && sekme === 'kural' ? (
            <KuralKaydetEylemleri formId={formId} durum={formDurumu} onVazgec={kapat} />
          ) : undefined
        }
      >
        {secili && (
          <>
            <Sekmeler
              etiket="Kural paneli"
              secili={sekme}
              onSec={(d) => (d === 'kural' ? setPanel({ id: secili.rule.id, sekme: 'kural' }) : gecmisAc(secili.rule.id))}
              secenekler={[
                ...(canWrite ? [{ deger: 'kural', etiket: 'Kural' }] : []),
                { deger: 'gecmis', etiket: 'Geçmiş' },
              ]}
            />
            {/* İki sekme de DOM'da kalıyor: sekme değiştirmek yarım düzenlemeyi silmemeli. */}
            {canWrite && (
              <div hidden={sekme !== 'kural'}>
                <RuleEditor
                  key={`${secili.rule.id}-${acilis}`}
                  formId={formId}
                  clientId={clientId}
                  accounts={accounts}
                  hesapHatasi={hesapHatasi}
                  existing={secili.rule}
                  onDurum={setFormDurumu}
                  onDone={kapat}
                />
              </div>
            )}
            <div hidden={sekme !== 'gecmis'}>
              {/* Adres değişti, sunucu henüz bu kuralın geçmişini çizmedi: yükleniyor. */}
              {gecmisHazir ? gecmis!.icerik : <Yukleniyor etiket="Geçmiş yükleniyor" />}
            </div>
          </>
        )}
      </YanPanel>

      <Pencere
        acik={onay !== null}
        onKapat={() => setOnay(null)}
        genislik="dar"
        baslik={onay?.tur === 'sil' ? 'Kural silinsin mi?' : 'Kural canlıya alınsın mı?'}
        altEylemler={
          <>
            <Dugme ton="ikincil" onClick={() => setOnay(null)}>
              Vazgeç
            </Dugme>
            {onay?.tur === 'sil' ? (
              <Dugme ton="tehlike" onClick={() => void onayla()} bekliyor={mesgul?.tur === 'delete'}>
                Sil
              </Dugme>
            ) : (
              <Dugme onClick={() => void onayla()} bekliyor={mesgul?.tur === 'mode'}>
                Anladım, canlıya al
              </Dugme>
            )}
          </>
        }
      >
        {onay && (
          <div className="grid gap-3 text-14 text-ink">
            {onay.tur === 'sil' ? (
              <p className="m-0">
                <strong>{onay.rule.name}</strong> silinecek ve bir daha çalışmayacak. Bu geri alınamaz.
              </p>
            ) : (
              <>
                <p className="m-0 font-semibold">Bu kural workspace’in hesabında gerçekten çalışacak.</p>
                <p className="m-0 text-ink-muted">
                  Bundan sonra saatlik değerlendirmede eşleşen varlıklara{' '}
                  <strong className="text-ink">
                    {onay.rule.action.type === 'pause'
                      ? 'duraklatma'
                      : onay.rule.action.type === 'resume'
                        ? 'yeniden başlatma'
                        : onay.rule.action.type === 'adjust_budget'
                          ? 'bütçe değişikliği'
                          : 'bildirim'}
                  </strong>{' '}
                  uygulanacak. Önce &quot;Şimdi çalıştır&quot; ile provada ne olacağını görmeni öneririm.
                </p>
              </>
            )}
            {onayHatasi && (
              <Serit ton="hata" baslik="İşlem yapılamadı.">
                {onayHatasi}
              </Serit>
            )}
          </div>
        )}
      </Pencere>
    </>
  );
}

/**
 * Bir kuralın satır eylemleri: "Şimdi çalıştır" dışarıda, diğerleri ⋯
 * menüsünde. Yazma yetkisi yoksa yalnız Geçmiş kalıyor (eskiden de
 * düğmelerin hepsi `canWrite` arkasındaydı, geçmiş bağlantısı herkese açıktı).
 */
export function RuleControls({
  rule,
  canWrite,
  canActivate,
  mesgul,
  kilitli,
  onCalistir,
  onDuzenle,
  onGecmis,
  onProva,
  onCanli,
  onSil,
}: {
  rule: RuleRecord;
  canWrite: boolean;
  canActivate: boolean;
  /** Bu satırda süren işlem. */
  mesgul: 'run' | 'mode' | 'delete' | null;
  /** Herhangi bir satırda işlem sürüyor: aynı anda ikinci bir yazma yok. */
  kilitli: boolean;
  onCalistir: () => void;
  onDuzenle: () => void;
  onGecmis: () => void;
  onProva: () => void;
  onCanli: () => void;
  onSil: () => void;
}) {
  return (
    <span className="flex items-center justify-end gap-1.5">
      {canWrite && (
        <Dugme ton="ikincil" boyut="kucuk" onClick={onCalistir} disabled={kilitli} bekliyor={mesgul === 'run'}>
          Şimdi çalıştır
        </Dugme>
      )}
      <AcilirMenu
        tasma="portal"
        etiket={`${rule.name} eylemleri`}
        hizala="sag"
        genislik="w-52"
        tetik={({ acik: _acik, ...o }) => (
          <button type="button" {...o} aria-label={`${rule.name}: diğer eylemler`} className={IKON_TETIK}>
            <Ikon ad="nokta3" />
          </button>
        )}
      >
        {canWrite && <MenuOgesi onClick={onDuzenle}>Düzenle</MenuOgesi>}
        <MenuOgesi onClick={onGecmis}>Geçmiş</MenuOgesi>
        {canWrite &&
          canActivate &&
          (rule.dryRun ? (
            <MenuOgesi onClick={onCanli} devreDisi={kilitli}>
              Canlıya al
            </MenuOgesi>
          ) : (
            <MenuOgesi onClick={onProva} devreDisi={kilitli}>
              Provaya al
            </MenuOgesi>
          ))}
        {canWrite && (
          <>
            <MenuAyraci />
            <MenuOgesi tehlike onClick={onSil} devreDisi={kilitli}>
              Sil
            </MenuOgesi>
          </>
        )}
      </AcilirMenu>
    </span>
  );
}

/**
 * Yeni kural düğmesi: sayfa başlığının sağındaki TEK birincil eylem. Tıklanınca
 * boş düzenleyici sağdan yan panelde açılıyor. Yazma yetkisi yoksa düğme
 * KAPALI ve nedeni yanında yazıyor; görünmeyen bir düğme "bu sayfada kural
 * kurulamıyor mu?" sorusunu cevapsız bırakırdı.
 */
export function NewRuleButton({
  clientId,
  accounts,
  etiket = 'Yeni kural',
  hesapHatasi = null,
  kapaliNedeni,
}: {
  clientId: string;
  accounts: Hesap[];
  etiket?: string;
  /** Hesap listesi okunamadıysa sunucunun mesajı; düzenleyicide seçicinin altında. */
  hesapHatasi?: string | null;
  /** Verilirse düğme kapalı ve bu cümle yanında. */
  kapaliNedeni?: string;
}) {
  const formId = useId();
  const [acik, setAcik] = useState(false);
  const [acilis, setAcilis] = useState(0);
  const [formDurumu, setFormDurumu] = useState<KuralFormDurumu>(BOS_FORM);

  if (kapaliNedeni) {
    return (
      <span className="inline-flex items-center gap-2">
        <small className="text-12 text-ink-muted">{kapaliNedeni}</small>
        <Dugme disabled>{etiket}</Dugme>
      </span>
    );
  }

  return (
    <>
      <Dugme
        ikon={<Ikon ad="arti" />}
        onClick={() => {
          // Her açılış boş form: kapatılan yarım taslak bir sonraki kurala sızmasın.
          setAcilis((n) => n + 1);
          setFormDurumu(BOS_FORM);
          setAcik(true);
        }}
      >
        {etiket}
      </Dugme>
      <YanPanel
        acik={acik}
        onKapat={() => setAcik(false)}
        baslik="Yeni kural"
        genislik={PANEL_GENISLIGI}
        altEylemler={<KuralKaydetEylemleri formId={formId} durum={formDurumu} onVazgec={() => setAcik(false)} />}
      >
        <RuleEditor
          key={acilis}
          formId={formId}
          clientId={clientId}
          accounts={accounts}
          hesapHatasi={hesapHatasi}
          onDurum={setFormDurumu}
          onDone={() => setAcik(false)}
        />
      </YanPanel>
    </>
  );
}
