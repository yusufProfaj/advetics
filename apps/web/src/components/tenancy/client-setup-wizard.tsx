'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { formatNumber } from '@/lib/format';
import { atamaBildirimi } from '@/lib/atama-bildirimi';
import { useRouter } from 'next/navigation';
import {
  CHANNEL_HINTS,
  CHANNEL_LABELS,
  type ChannelKind,
  type ClientSetupResult,
  type ConnectionSummary,
} from '@advetics/shared';
import { ApiRequestError, apiFetch } from '@/lib/api';
import { havuzlariCikar, havuzSuz, KANALLAR } from '@/lib/havuz';
import { PlatformLogo } from '@/components/platform-logo';

/**
 * MÜŞTERİ KURULUM SİHİRBAZI — tek ekranda, pop-up.
 *
 * Şikâyet aynen şuydu: "ilk önce ekliyorum sonra izle diyorum sonra facebook
 * instagram ekliyorum hepsi angarya". Beş adımlık akış tek forma indi:
 * ad → kanallar → (isteğe bağlı) giriş hesabı → Kur.
 *
 * ADIM ADIM (stepper) DEĞİL, TEK KAYDIRMA. Adımlara bölmek her adım için bir
 * "İleri" tıklaması ekliyor ve şikâyetin kendisi tıklama sayısıydı. Bölümler
 * katlanabilir; yalnızca ad zorunlu, gerisi açılıp kapanıyor.
 *
 * SONUÇ EKRANDA KALIYOR. Kurulum kısmi başarabilir (bir hesap atanamayabilir)
 * ve sunucu sebebini `failures` içinde dönüyor; modalı hemen kapatmak o
 * bilgiyi çöpe atardı — kullanıcı eksiği ancak veri gelmediğinde fark ederdi.
 */
export function ClientSetupWizard({ connections }: { connections: ConnectionSummary[] }) {
  const [acik, setAcik] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setAcik(true)}
        className="rounded-lg bg-brand px-3.5 py-2 text-sm font-semibold text-white transition"
      >
        + Yeni müşteri
      </button>
      {acik && <Modal connections={connections} onKapat={() => setAcik(false)} />}
    </>
  );
}

function Modal({
  connections,
  onKapat,
}: {
  connections: ConnectionSummary[];
  onKapat: () => void;
}) {
  const router = useRouter();
  const kutuRef = useRef<HTMLDivElement>(null);

  const [ad, setAd] = useState('');
  const [iletisimAcik, setIletisimAcik] = useState(false);
  const [iletisim, setIletisim] = useState({
    contactName: '',
    contactEmail: '',
    contactPhone: '',
    website: '',
    address: '',
    taxOffice: '',
    taxNumber: '',
    iban: '',
    notes: '',
  });

  const [secili, setSecili] = useState<Set<string>>(new Set());
  const [kullaniciAcik, setKullaniciAcik] = useState(false);
  const [kullanici, setKullanici] = useState({ email: '', fullName: '', password: '' });

  const [busy, setBusy] = useState(false);
  const [hata, setHata] = useState<string | null>(null);
  const [sonuc, setSonuc] = useState<ClientSetupResult | null>(null);

  const havuzlar = useMemo(() => havuzlariCikar(connections), [connections]);

  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') onKapat();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onKapat]);

  function degistir(id: string): void {
    setSecili((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  async function kur(): Promise<void> {
    const temizAd = ad.trim();
    if (temizAd.length < 2) {
      setHata('Müşteri adı en az 2 karakter olmalı.');
      return;
    }

    /*
     * SEÇİLENLER TİPİNE GÖRE İKİ LİSTEYE AYRILIYOR. Sunucu reklam hesabı ve
     * sosyal profili ayrı alanlarda bekliyor; tek listede göndermek, sunucunun
     * hangi tabloya bakacağını bilememesi demekti.
     */
    const tumu = KANALLAR.flatMap((k) => havuzlar[k]);
    const adAccountIds = tumu.filter((o) => o.reklamHesabi && secili.has(o.id)).map((o) => o.id);
    const socialProfileIds = tumu
      .filter((o) => !o.reklamHesabi && secili.has(o.id))
      .map((o) => o.id);

    const kullaniciDolu =
      kullaniciAcik && kullanici.email.trim() !== '' && kullanici.password !== '';

    setBusy(true);
    setHata(null);
    try {
      const r = await apiFetch<ClientSetupResult>('/clients/setup', {
        method: 'POST',
        body: JSON.stringify({
          name: temizAd,
          ...iletisim,
          adAccountIds,
          socialProfileIds,
          ...(kullaniciDolu
            ? {
                clientUser: {
                  email: kullanici.email.trim(),
                  fullName: kullanici.fullName.trim() || temizAd,
                  password: kullanici.password,
                },
              }
            : {}),
        }),
      });
      setSonuc(r);
      // Liste sunucuda render ediliyor; yenilemeden yeni müşteri görünmez.
      router.refresh();
    } catch (e) {
      setHata(e instanceof ApiRequestError ? e.message : 'Kurulum başarısız oldu.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Yeni müşteri kurulumu"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onMouseDown={(e) => {
        if (!kutuRef.current?.contains(e.target as Node)) onKapat();
      }}
    >
      <div
        ref={kutuRef}
        className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-xl border border-line bg-surface shadow-xl"
      >
        <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3.5">
          <h2 className="text-sm font-semibold text-ink">
            {sonuc ? 'Kurulum tamamlandı' : 'Yeni müşteri kurulumu'}
          </h2>
          <button
            type="button"
            onClick={onKapat}
            className="text-xs text-ink-muted transition hover:text-ink"
          >
            Kapat
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {sonuc ? (
            <SonucOzeti sonuc={sonuc} />
          ) : (
            <div className="space-y-4">
              <label className="block">
                <span className="text-sm font-medium text-ink">Müşteri adı</span>
                <input
                  autoFocus
                  value={ad}
                  onChange={(e) => setAd(e.target.value)}
                  placeholder="Örn. Mia Yapı"
                  className="mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm"
                />
                {/* Zaman dilimi ve para birimi SORULMUYOR — varsayılan
                    gönderiliyor ve sonradan değiştirilebiliyor. İlk adımda
                    sormak akışı kilitliyordu. */}
                <span className="mt-1 block text-[11px] text-ink-muted">
                  Zaman dilimi Europe/Istanbul, para birimi TRY olarak
                  ayarlanıyor — sonradan değiştirilebilir.
                </span>
              </label>

              <Bolum
                baslik="İletişim ve fatura bilgisi"
                alt="İsteğe bağlı. Rapor e-postası bu adrese gidiyor."
                acik={iletisimAcik}
                onDegistir={() => setIletisimAcik((v) => !v)}
              >
                <div className="grid gap-2 sm:grid-cols-2">
                  <Alan
                    etiket="Yetkili adı"
                    value={iletisim.contactName}
                    onChange={(v) => setIletisim((s) => ({ ...s, contactName: v }))}
                  />
                  <Alan
                    etiket="E-posta"
                    type="email"
                    value={iletisim.contactEmail}
                    onChange={(v) => setIletisim((s) => ({ ...s, contactEmail: v }))}
                  />
                  <Alan
                    etiket="Telefon"
                    value={iletisim.contactPhone}
                    onChange={(v) => setIletisim((s) => ({ ...s, contactPhone: v }))}
                  />
                  <Alan
                    etiket="Web sitesi"
                    value={iletisim.website}
                    onChange={(v) => setIletisim((s) => ({ ...s, website: v }))}
                  />
                  <Alan
                    etiket="Vergi dairesi"
                    value={iletisim.taxOffice}
                    onChange={(v) => setIletisim((s) => ({ ...s, taxOffice: v }))}
                  />
                  <Alan
                    etiket="Vergi no"
                    value={iletisim.taxNumber}
                    onChange={(v) => setIletisim((s) => ({ ...s, taxNumber: v }))}
                  />
                </div>
              </Bolum>

              <KanalSecimi havuzlar={havuzlar} secili={secili} onDegistir={degistir} />

              <Bolum
                baslik="Müşteri giriş hesabı"
                alt="İsteğe bağlı. Müşteri yalnızca kendi workspace'ini görür."
                acik={kullaniciAcik}
                onDegistir={() => setKullaniciAcik((v) => !v)}
              >
                <div className="grid gap-2 sm:grid-cols-2">
                  <Alan
                    etiket="E-posta"
                    type="email"
                    value={kullanici.email}
                    onChange={(v) => setKullanici((s) => ({ ...s, email: v }))}
                  />
                  <Alan
                    etiket="Ad soyad"
                    value={kullanici.fullName}
                    onChange={(v) => setKullanici((s) => ({ ...s, fullName: v }))}
                  />
                  <Alan
                    etiket="Parola (en az 10 karakter)"
                    type="password"
                    value={kullanici.password}
                    onChange={(v) => setKullanici((s) => ({ ...s, password: v }))}
                  />
                </div>
                {/* PAROLA ELDEN İLETİLİYOR ve bu bir kısıt: davet e-postası
                    altyapısı yok. Kullanıcıya söylenmezse parolayı nasıl
                    ileteceğini bilemez. */}
                <p className="mt-2 text-[11px] text-ink-muted">
                  Davet e-postası gönderilmiyor — parolayı müşteriye sen
                  ileteceksin.
                </p>
              </Bolum>
            </div>
          )}
        </div>

        {!sonuc && (
          <div className="border-t border-line px-5 py-3.5">
            {hata && <p className="mb-2 text-xs text-danger">{hata}</p>}
            <div className="flex items-center justify-between gap-3">
              <p className="text-[11px] text-ink-muted">
                {secili.size > 0
                  ? `${secili.size} kanal seçildi — kurulumda izleme açılıp son 90 günün verisi çekilecek.`
                  : 'Kanal seçmeden de kurabilirsin; sonradan eklenebilir.'}
              </p>
              <button
                type="button"
                onClick={() => void kur()}
                disabled={busy || ad.trim().length < 2}
                className="shrink-0 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white transition disabled:opacity-40"
              >
                {busy ? 'Kuruluyor…' : 'Kur'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * KURULUM SONUCU — kısmi başarı SESSİZ KALMIYOR.
 *
 * Sunucu atanamayan her kaydı sebebiyle dönüyor. Modalı kapatıp "kuruldu"
 * demek, eksiği ancak veri gelmediğinde fark ettirirdi ve o noktada sebebin
 * aranacağı yer de kaybolurdu.
 */
function SonucOzeti({ sonuc }: { sonuc: ClientSetupResult }) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-ink">
        <strong>{sonuc.name}</strong> oluşturuldu.
      </p>
      <ul className="space-y-1 text-sm text-ink-muted">
        <li>{sonuc.assignedAccounts} reklam hesabı atandı</li>
        <li>{sonuc.assignedProfiles} sayfa / kanal atandı</li>
        <li>
          Giriş hesabı {sonuc.userCreated ? 'oluşturuldu' : 'oluşturulmadı'}
        </li>
      </ul>

      {sonuc.assignedAccounts + sonuc.assignedProfiles > 0 && (
        <p className="rounded-lg bg-surface-sunken px-3 py-2 text-[11px] text-ink-muted">
          İzleme açıldı ve son 90 günün verisi kuyruğa alındı. Veri birkaç
          dakika içinde Genel Bakış’ta görünmeye başlar.
        </p>
      )}

      {/*
        HAVUZDAN GELEN HESABIN GEÇMİŞİ SESSİZ TAŞINMIYOR.

        Havuzdaki bir hesap "hiç kullanılmamış" demek değil: başka bir
        müşteriden kaldırılmış olabilir ve kampanyaları, kreatifleri, geçmiş
        metrikleri hâlâ orada duruyor. Kurulum onları buraya taşıyor — yani
        BAŞKA bir müşterinin raporundaki rakam bu ekranda değişiyor. Sessiz
        kalması, iki ekran arasındaki bağı tamamen koparırdı.
      */}
      {(sonuc.movedRows > 0 || Object.keys(sonuc.leftBehind).length > 0) && (
        <div className="rounded-lg border border-warn/40 bg-warn/5 px-3 py-2">
          {sonuc.movedRows > 0 && (
            <p className="text-[11px] text-ink">
              {formatNumber(sonuc.movedRows)} kayıt eski müşteriden bu müşteriye
              taşındı — kampanyalar, kreatifler ve geçmiş metrikler dahil. Eski
              müşterinin raporundaki rakamlar buna göre değişti.
            </p>
          )}
          {Object.keys(sonuc.leftBehind).length > 0 && (
            <p className="mt-1 text-[11px] text-ink-muted">
              Eski müşteride kalanlar:{' '}
              {Object.entries(sonuc.leftBehind)
                .map(([etiket, n]) => `${formatNumber(n)} ${etiket}`)
                .join(', ')}
              . Bunlar birinin kararı (bütçe, kural, taslak) ve taşınmıyor.
            </p>
          )}
        </div>
      )}

      {/*
        HAVUZDAN GELEN HESABIN GEÇMİŞİ DE TAŞINDI — ve bu yazılmak zorunda.
        Havuzdaki bir hesap "hiç kullanılmamış" demek değil: başka bir
        müşteriden kaldırılmış olabilir ve kampanyaları, kreatifleri, geçmiş
        metrikleri onun altında duruyordu. Atama onları buraya taşıdı, yani
        BAŞKA bir müşterinin raporundaki rakam da değişti. Söylenmezse iki
        ekran arasında hiçbir bağ kalmıyor.
      */}
      {atamaBildirimi(sonuc, true) && (
        <p className="rounded-lg border border-line bg-surface-sunken px-3 py-2 text-[11px] text-ink-muted">
          {atamaBildirimi(sonuc, true)}
        </p>
      )}

      {sonuc.failures.length > 0 && (
        <div className="rounded-lg border border-danger/40 bg-danger/5 px-3 py-2">
          <p className="text-xs font-semibold text-danger">
            {sonuc.failures.length} adım tamamlanamadı
          </p>
          <ul className="mt-1 space-y-1">
            {sonuc.failures.map((f) => (
              <li key={`${f.kind}-${f.id}`} className="text-[11px] text-danger">
                {f.reason}
              </li>
            ))}
          </ul>
          <p className="mt-1.5 text-[11px] text-ink-muted">
            Müşteri oluşturuldu; eksik kalanları “Bağlı kanallar” ekranından
            ekleyebilirsin.
          </p>
        </div>
      )}
    </div>
  );
}

function KanalSecimi({
  havuzlar,
  secili,
  onDegistir,
}: {
  havuzlar: ReturnType<typeof havuzlariCikar>;
  secili: Set<string>;
  onDegistir: (id: string) => void;
}) {
  const [acikKanal, setAcikKanal] = useState<ChannelKind | null>(null);
  const [arama, setArama] = useState('');

  const toplam = KANALLAR.reduce((n, k) => n + havuzlar[k].length, 0);

  return (
    <section className="rounded-lg border border-line">
      <div className="border-b border-line px-3 py-2.5">
        <p className="text-sm font-medium text-ink">Kanallar</p>
        <p className="text-[11px] text-ink-muted">
          {toplam === 0
            ? 'Havuzda atanabilecek hesap yok — Platform Bağlantıları’ndan Meta ya da Google Ads bağla.'
            : 'Seçtiğin hesapların izlemesi kurulumda açılıyor.'}
        </p>
      </div>

      <div className="divide-y divide-line">
        {KANALLAR.map((k) => {
          const ogeler = havuzlar[k];
          const secimSayisi = ogeler.filter((o) => secili.has(o.id)).length;
          const bu = acikKanal === k;
          const liste = bu ? havuzSuz(ogeler, arama) : [];

          return (
            <div key={k}>
              <button
                type="button"
                onClick={() => {
                  setAcikKanal(bu ? null : k);
                  setArama('');
                }}
                disabled={ogeler.length === 0}
                className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left transition hover:bg-surface-sunken disabled:opacity-50"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <PlatformLogo kind={k} className="h-4 w-4 shrink-0" />
                  <span className="min-w-0">
                  <span className="block text-sm text-ink">{CHANNEL_LABELS[k]}</span>
                  <span className="block text-[11px] text-ink-muted">
                    {ogeler.length === 0 ? 'havuzda hesap yok' : `${ogeler.length} hesap boşta`}
                  </span>
                  </span>
                </span>
                <span className="shrink-0 text-[11px] font-medium text-brand-strong">
                  {secimSayisi > 0 ? `${secimSayisi} seçili` : bu ? 'kapat' : 'seç'}
                </span>
              </button>

              {bu && (
                <div className="border-t border-line bg-surface-sunken px-3 py-2.5">
                  <p className="mb-1.5 text-[11px] text-ink-muted">{CHANNEL_HINTS[k]}</p>
                  <input
                    type="search"
                    value={arama}
                    onChange={(e) => setArama(e.target.value)}
                    placeholder="Ara…"
                    className="w-full rounded-lg border border-line bg-surface px-2.5 py-1.5 text-sm"
                  />
                  {/* SESSİZ KESME YOK. */}
                  <p className="mt-1 text-[11px] text-ink-muted">
                    {liste.length} / {ogeler.length} hesap
                  </p>
                  <ul className="mt-1.5 max-h-48 space-y-1 overflow-y-auto">
                    {liste.map((o) => (
                      <li key={o.id}>
                        <label
                          className={`flex items-center gap-2 rounded-lg bg-surface px-2.5 py-1.5 ${
                            o.isManager ? 'opacity-50' : 'cursor-pointer'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={secili.has(o.id)}
                            onChange={() => onDegistir(o.id)}
                            // YÖNETİCİ (MCC) HESABI SEÇİLEMİYOR ama listede
                            // duruyor: gizlemek, aradığını bulamayan
                            // kullanıcıya sistemin bozuk olduğunu düşündürürdü.
                            disabled={o.isManager}
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm text-ink">{o.name}</span>
                            <span className="block truncate text-[11px] text-ink-muted">
                              {o.isManager ? 'Yönetici (MCC) — atanamaz' : o.externalId}
                            </span>
                          </span>
                        </label>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function Bolum({
  baslik,
  alt,
  acik,
  onDegistir,
  children,
}: {
  baslik: string;
  alt: string;
  acik: boolean;
  onDegistir: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-line">
      <button
        type="button"
        onClick={onDegistir}
        aria-expanded={acik}
        className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left transition hover:bg-surface-sunken"
      >
        <span>
          <span className="block text-sm font-medium text-ink">{baslik}</span>
          <span className="block text-[11px] text-ink-muted">{alt}</span>
        </span>
        <span className="shrink-0 text-[11px] text-ink-muted">{acik ? 'kapat' : 'aç'}</span>
      </button>
      {acik && <div className="border-t border-line px-3 py-2.5">{children}</div>}
    </section>
  );
}

function Alan({
  etiket,
  value,
  onChange,
  type = 'text',
}: {
  etiket: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <label className="block">
      <span className="text-[11px] text-ink-muted">{etiket}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-0.5 w-full rounded-lg border border-line bg-surface px-2.5 py-1.5 text-sm"
      />
    </label>
  );
}
