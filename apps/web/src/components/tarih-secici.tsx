'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ApiRequestError, apiFetch } from '@/lib/api';
import { dugmeSinifi } from '@/components/ui/dugme';
import { bicimKodu, type Dil } from '@advetics/shared';
import { useDil, useSozluk } from '@/dil/saglayici';
import { tarihSozlugu } from '@/dil/sozlukler/tarih';
import {
  KARSILASTIRMA_SECENEKLERI,
  karsilastirmaEtiketi,
  onAyarEtiketi,
  MAX_GUN,
  RANGE_PRESETS,
  gunEkle,
  gunSayisi,
  enEskiGunGerekli,
  karsilastirmaPenceresi,
  today,
  type IsoDay,
  type KarsilastirmaKipi,
  type OnAyarKodu,
  type ResolvedRange,
} from '@/lib/date-range';

/**
 * TARİH ARALIĞI SEÇİCİ — Google Ads deseni.
 *
 * Yatay çip şeridinin yerini aldı. Şerit altı sabit pencere gösterebiliyordu;
 * on bir ön ayar + özel aralık + karşılaştırma o biçime sığmıyor.
 *
 * SEÇİM YİNE URL'E YAZILIYOR. Bileşen istemci tarafında ama durumu kendinde
 * TUTMUYOR: "Uygula"ya basınca `router.push` ile adres çubuğuna yazıyor ve
 * sayfa sunucuda yeniden render ediliyor. Bu, paylaşılabilir bağlantıyı ve
 * sunucu tarafı render'ı koruyor — ikisi de `date-range.ts` yorumunda
 * gerekçelendirilmiş kararlar.
 *
 * DİĞER SÜZGEÇLER KORUNUYOR. `useSearchParams` ile mevcut adres okunuyor ve
 * yalnızca tarih anahtarları değiştiriliyor. Sıfırdan bir sorgu dizesi kurmak,
 * hesap/kampanya/arama süzgeçlerini sessizce düşürürdü — bu depoda "aralık
 * bazen kayboluyor" belirtisinin kaynağı tam olarak böyle bir düşürmeydi.
 */
export function TarihSecici({
  aralik,
  enEskiGun,
  karsilastirmaVar = true,
  enGecGun,
  enErkenGun,
  onAyarlar,
  paylasilan,
  sinirNotu,
}: {
  aralik: ResolvedRange;
  /** `/metrics/coverage`ten gelen en eski veri günü. "Tüm zamanlar" buna dayanıyor. */
  enEskiGun: IsoDay | null;
  /**
   * Karşılaştırma bölümü gösterilsin mi.
   *
   * Rapor ekranında KAPALI: rapor belgesi yüzde değişim göstermiyor ve
   * çalışmayan bir düğme koymak, kullanıcıya olmayan bir özellik vaat etmek
   * olurdu.
   */
  karsilastirmaVar?: boolean;
  /**
   * Seçilebilecek EN GEÇ gün. Varsayılan bugün.
   *
   * Rapor ekranı bunu düne çekiyor: rapor bir BELGE ve müşteriye gidiyor;
   * tamamlanmamış bir günü içine almak, gün içinde değişecek rakamları
   * müşteriye göndermek demek.
   */
  enGecGun?: IsoDay;
  /**
   * Seçilebilecek EN ERKEN gün. Rapor linki geçmişe doğru sınırlı
   * (`paylasimSiniri`); sınırın öncesini seçtirip sunucudan 400 almak,
   * kişiye nedenini sonradan söylemek olurdu. Taslak sınırı aşarsa Uygula
   * kapalı.
   */
  enErkenGun?: IsoDay;
  /**
   * Gösterilecek ön ayarlar (sıra korunur). Verilmezse hepsi. Rapor linki
   * dördüyle sınırlı: "Tüm zamanlar" en eski günü OTURUMLU `/metrics/coverage`
   * ucundan arıyor ve linki açan kişinin oturumu yok.
   */
  onAyarlar?: readonly OnAyarKodu[];
  /**
   * Rapor linkinde ajansın paylaştığı dönem: listenin başında "Paylaşılan
   * aralık" satırı. Seçilip uygulanınca tarih anahtarları ADRESTEN SİLİNİR
   * (link yine paylaşılan belgeyi açsın, kopyası da öyle).
   */
  paylasilan?: { from: IsoDay; to: IsoDay };
  /** Takvimin altındaki sınır cümlesi (ekranın dilinde, çağıran yazar). */
  sinirNotu?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { dil } = useDil();
  const d = useSozluk(tarihSozlugu).secici;

  const [acik, setAcik] = useState(false);
  const kutuRef = useRef<HTMLDivElement>(null);

  // Taslak durum: panel açıkken yapılan seçimler Uygula'ya kadar URL'e
  // yazılmıyor. İptal, açılıştaki hâle döndürüyor.
  const [taslakKey, setTaslakKey] = useState(aralik.key);
  const [taslakFrom, setTaslakFrom] = useState(aralik.from);
  const [taslakTo, setTaslakTo] = useState(aralik.to);
  const [taslakKars, setTaslakKars] = useState<KarsilastirmaKipi>(aralik.karsilastirma);
  const [takvimAy, setTakvimAy] = useState(aralik.from.slice(0, 7));

  function sifirla() {
    setTaslakKey(aralik.key);
    setTaslakFrom(aralik.from);
    setTaslakTo(aralik.to);
    setTaslakKars(aralik.karsilastirma);
    setTakvimAy(aralik.from.slice(0, 7));
  }

  // DIŞARI TIKLAMA + ESCAPE. `client-switcher` dışarı tıklamayı, modal deseni
  // Escape'i çözüyordu; ikisi de gerekli — açık bir panel klavyeyle
  // kapatılamıyorsa fare kullanmayan kullanıcı sıkışıyor.
  useEffect(() => {
    if (!acik) return;
    const disari = (e: MouseEvent) => {
      if (kutuRef.current && !kutuRef.current.contains(e.target as Node)) {
        setAcik(false);
        sifirla();
      }
    };
    const tus = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setAcik(false);
        sifirla();
      }
    };
    document.addEventListener('mousedown', disari);
    document.addEventListener('keydown', tus);
    return () => {
      document.removeEventListener('mousedown', disari);
      document.removeEventListener('keydown', tus);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [acik, aralik]);

  /*
   * SUNUCUDAN GELEN DEĞER ÖNCELİKLİ; panelde arananı yalnızca o yoksa
   * kullanıyoruz. Tersi, sayfa değeri zaten getirmişken onu istemcide
   * bulunanla ezmek olurdu.
   */
  const [enEskiBulunan, setEnEskiBulunan] = useState<IsoDay | null>(null);
  const [kapsamAraniyor, setKapsamAraniyor] = useState(false);
  const [kapsamHatasi, setKapsamHatasi] = useState<string | null>(null);
  const bilinenEnEski = enEskiGun ?? enEskiBulunan;

  const taslakGun = gunSayisi(taslakFrom, taslakTo);
  const taslakKarsPencere = karsilastirmaPenceresi(taslakFrom, taslakTo, taslakKars);
  const asiyor = taslakGun > MAX_GUN;
  const sinirDisi =
    (enErkenGun !== undefined && taslakFrom < enErkenGun) || (enGecGun !== undefined && taslakTo > enGecGun);
  const gorunenOnAyarlar = onAyarlar
    ? onAyarlar.map((k) => RANGE_PRESETS.find((p) => p.key === k)).filter((p): p is (typeof RANGE_PRESETS)[number] => !!p)
    : RANGE_PRESETS;

  /*
   * ═══ "TÜM ZAMANLAR" EN ESKİ GÜNÜ İSTEDİĞİNDE ARANIYOR ═══
   *
   * `enEskiGun`u üreten `/metrics/coverage` metrik tablosundaki tarih sınırı
   * olmayan tek sorgu ve üretimde 17,4 saniye sürüyor. Sayfa onu artık HER
   * yüklemede çekmiyor — çoğu yüklemede o değeri hiçbir şey okumuyor.
   *
   * AMA ÖNİZLEME YALAN SÖYLEYEMEZ. Değer elde yokken "Tüm zamanlar"a
   * basıldığında panelde 90 günlük bir taslak görünür, kullanıcı "Uygula"ya
   * basar ve sunucu BAŞKA bir pencere hesaplardı: panelde yazan dönem ile
   * bakılan dönem farklı olurdu ve fark hiçbir yerde görünmezdi. O yüzden
   * değer TIKLANDIĞI AN aranıyor ve arandığı ekranda yazıyor.
   *
   * Hata YUTULMUYOR: `.catch(() => null)` ile sessizce 90 güne düşmek,
   * "arıyorum", "bulamadım" ve "veri yok" hâllerini aynı ekrana çevirirdi.
   */
  async function enEskiGunuAra(): Promise<IsoDay | null> {
    setKapsamHatasi(null);
    setKapsamAraniyor(true);
    try {
      const r = await apiFetch<{ earliestDate: IsoDay | null }>(
        '/metrics/coverage?from=2026-01-01&to=2026-01-01',
      );
      setEnEskiBulunan(r.earliestDate);
      return r.earliestDate;
    } catch (e) {
      setKapsamHatasi(
        e instanceof ApiRequestError ? e.message : d.enEskiAlinamadi,
      );
      return null;
    } finally {
      setKapsamAraniyor(false);
    }
  }

  function onAyarSec(key: string) {
    const on = RANGE_PRESETS.find((p) => p.key === key);
    if (!on) return;
    const uygula = (enEski: IsoDay | null) => {
      const { from, to } = on.pencere(today(), enEski);
      setTaslakFrom(from);
      setTaslakTo(to);
      setTakvimAy(from.slice(0, 7));
    };
    setTaslakKey(key);
    uygula(bilinenEnEski);
    // Değer zaten elimizdeyse ikinci bir çağrı, en pahalı sorguyu boşuna
    // tekrarlamak olurdu.
    if (enEskiGunGerekli(key) && bilinenEnEski === null) {
      void enEskiGunuAra().then(uygula);
    }
  }

  /** Takvimden gün seçimi: ilk tık başlangıç, ikinci tık bitiş. */
  const [ikinciTik, setIkinciTik] = useState(false);
  function gunSec(gun: IsoDay) {
    setTaslakKey('ozel');
    if (!ikinciTik) {
      setTaslakFrom(gun);
      setTaslakTo(gun);
      setIkinciTik(true);
    } else {
      if (gun < taslakFrom) {
        setTaslakTo(taslakFrom);
        setTaslakFrom(gun);
      } else {
        setTaslakTo(gun);
      }
      setIkinciTik(false);
    }
  }

  function uygula() {
    const p = new URLSearchParams(searchParams.toString());
    if (taslakKey === 'paylasilan') {
      // Paylaşılan dönem ADRESTE YAZILMIYOR: link onu kendiliğinden açıyor.
      p.delete('aralik');
      p.delete('baslangic');
      p.delete('bitis');
    } else if (taslakKey === 'ozel') {
      p.set('aralik', 'ozel');
      p.set('baslangic', taslakFrom);
      p.set('bitis', taslakTo);
    } else {
      p.set('aralik', taslakKey);
      p.delete('baslangic');
      p.delete('bitis');
    }
    if (taslakKars === 'yok') p.delete('karsilastir');
    else p.set('karsilastir', taslakKars);
    // Sayfalama sıfırlanıyor: yeni aralıkta 7. sayfa büyük ihtimalle yok.
    p.delete('sayfa');
    setAcik(false);
    setIkinciTik(false);
    const sorgu = p.toString();
    router.push(sorgu ? `${pathname}?${sorgu}` : pathname);
  }

  return (
    <div ref={kutuRef} className="relative">
      <button
        type="button"
        onClick={() => {
          if (!acik) sifirla();
          setAcik((v) => !v);
        }}
        aria-expanded={acik}
        aria-haspopup="dialog"
        className="flex h-10 items-center gap-2 whitespace-nowrap rounded-full border border-line-strong bg-surface px-4 text-[13px] transition-colors duration-150 hover:bg-surface-sunken"
      >
        {/*
          ONAYLANAN TASLAĞIN DÜZENİ (2026-10-09): ön ayar adı küçük ve soluk,
          tarih aralığı kalın, sonda açılır işareti. Karşılaştırma açıksa
          bu da yazıyor; kapalıyken rakamların yanında değişim yok ve
          sebebi burada görünmeli.
        */}
        {/* Ad ANAHTARDAN, sunucunun yazdığı `label`dan değil: sayfa
            `resolveRange`e dil geçirmese de seçici ekranın dilinde konuşur. */}
        <small className="text-xs text-ink-muted">{onAyarEtiketi(aralik.key, dil)}</small>
        <b className="font-semibold">
          {gunAdi(aralik.from, dil)} - {gunAdi(aralik.to, dil)}
        </b>
        {aralik.karsilastirma !== 'yok' && (
          <small className="text-[11px] text-ink-muted">{d.karsilastirmali}</small>
        )}
        <span aria-hidden className="text-xs text-ink-muted">
          ▾
        </span>
      </button>

      {acik && (
        <div
          role="dialog"
          aria-label={d.pencere}
          className="absolute right-0 top-full z-30 mt-1.5 flex w-[min(46rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-xl border border-line bg-surface shadow-lg sm:flex-row"
        >
          {/* Ön ayarlar */}
          <ul className="max-h-80 shrink-0 overflow-y-auto border-b border-line py-1 sm:max-h-none sm:w-56 sm:border-b-0 sm:border-r">
            {paylasilan && (
              <li className="border-b border-line pb-1">
                <button
                  type="button"
                  onClick={() => {
                    setTaslakKey('paylasilan');
                    setTaslakFrom(paylasilan.from);
                    setTaslakTo(paylasilan.to);
                    setTakvimAy(paylasilan.from.slice(0, 7));
                  }}
                  className={`w-full px-4 py-2 text-left text-sm transition hover:bg-surface-muted ${
                    taslakKey === 'paylasilan' ? 'bg-brand-soft font-medium text-brand-strong' : ''
                  }`}
                >
                  {onAyarEtiketi('paylasilan', dil)}
                  <small className="block text-[11px] font-normal text-ink-muted">
                    {gunAdi(paylasilan.from, dil)} - {gunAdi(paylasilan.to, dil)}
                  </small>
                </button>
              </li>
            )}
            {gorunenOnAyarlar.map((p) => (
              <li key={p.key}>
                <button
                  type="button"
                  onClick={() => onAyarSec(p.key)}
                  className={`w-full px-4 py-2 text-left text-sm transition hover:bg-surface-muted ${
                    taslakKey === p.key ? 'bg-brand-soft font-medium text-brand-strong' : ''
                  }`}
                >
                  {onAyarEtiketi(p.key, dil)}
                </button>
              </li>
            ))}
            <li>
              <button
                type="button"
                onClick={() => setTaslakKey('ozel')}
                className={`w-full px-4 py-2 text-left text-sm transition hover:bg-surface-muted ${
                  taslakKey === 'ozel' ? 'bg-brand-soft font-medium text-brand-strong' : ''
                }`}
              >
                {onAyarEtiketi('ozel', dil)}
              </button>
            </li>
          </ul>

          <div className="min-w-0 flex-1 p-4">
            <div className="flex flex-wrap items-end gap-2">
              <GunAlani label={d.baslangic} value={taslakFrom} min={enErkenGun} max={enGecGun} onChange={(v) => { setTaslakKey('ozel'); setTaslakFrom(v); }} />
              <span className="pb-2 text-ink-muted">—</span>
              <GunAlani label={d.bitis} value={taslakTo} min={enErkenGun} max={enGecGun} onChange={(v) => { setTaslakKey('ozel'); setTaslakTo(v); }} />
            </div>

            <Takvim
              ay={takvimAy}
              dil={dil}
              oncekiAy={d.oncekiAy}
              sonrakiAy={d.sonrakiAy}
              from={taslakFrom}
              to={taslakTo}
              enGec={enGecGun}
              enErken={enErkenGun}
              onAyDegis={setTakvimAy}
              onGunSec={gunSec}
            />

            {/*
              SESSİZ KESME YOK. 400 gün sunucunun sınırı; aşan bir aralık
              kırpılıyor ve bu KULLANICIYA SÖYLENİYOR. Söylenmezse "tüm
              zamanlar" diye bakıp eksik veriye bakar.
            */}
            {/*
              ARANIYOR / BULUNAMADI AYRI AYRI YAZILIYOR. İkisini de sessiz
              bırakmak, taslakta görünen 90 günlük pencerenin "elimizdeki tüm
              veri bu" diye okunması demekti.
            */}
            {kapsamAraniyor && (
              <p className="mt-2 text-[11px] text-ink-muted">{d.enEskiAraniyor}</p>
            )}
            {kapsamHatasi && (
              <p role="alert" className="mt-2 rounded-alan border border-l-4 border-line border-l-danger bg-surface px-2.5 py-1.5 text-[11px] text-ink">
                {kapsamHatasi}
                {d.tumZamanlarYedek(onAyarEtiketi('tum_zamanlar', dil))}
              </p>
            )}

            {sinirNotu && (
              <p
                className={`mt-2 text-[11px] leading-snug ${
                  sinirDisi
                    ? 'rounded-alan border border-l-4 border-line border-l-danger bg-surface px-2.5 py-1.5 text-ink'
                    : 'text-ink-muted'
                }`}
              >
                {sinirNotu}
              </p>
            )}

            {asiyor && (
              <p className="mt-2 rounded-alan border border-l-4 border-line border-l-danger bg-surface px-2.5 py-1.5 text-[11px] leading-snug">
                {d.asimOnce(taslakGun, MAX_GUN)}
                <strong>{gunAdi(gunEkle(taslakTo, -(MAX_GUN - 1)), dil)}</strong>
                {d.asimSonra}
              </p>
            )}

            {karsilastirmaVar && (
            <div className="mt-3 border-t border-line pt-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium">{d.karsilastir}</span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={taslakKars !== 'yok'}
                  onClick={() => setTaslakKars((k) => (k === 'yok' ? 'onceki_donem' : 'yok'))}
                  className={`relative h-5 w-9 rounded-full transition ${
                    taslakKars !== 'yok' ? 'bg-brand' : 'bg-surface-sunken'
                  }`}
                >
                  <span
                    className={`absolute top-0.5 h-4 w-4 rounded-full bg-surface shadow transition ${
                      taslakKars !== 'yok' ? 'left-[1.125rem]' : 'left-0.5'
                    }`}
                  />
                </button>
                {taslakKars !== 'yok' &&
                  KARSILASTIRMA_SECENEKLERI.map((k) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setTaslakKars(k)}
                      className={`rounded-md px-2 py-1 text-xs transition ${
                        taslakKars === k
                          ? 'bg-brand-soft font-medium text-brand-strong'
                          : 'text-ink-muted hover:text-ink'
                      }`}
                    >
                      {karsilastirmaEtiketi(k, dil)}
                    </button>
                  ))}
              </div>
              {taslakKarsPencere && (
                // HANGİ DÖNEMLE karşılaştırıldığı yazılı. "%12 arttı" tek
                // başına "neye göre" sorusunu cevaplamıyor.
                <p className="mt-1.5 text-[11px] text-ink-muted">
                  {d.karsilastirilacak(gunAdi(taslakKarsPencere.from, dil), gunAdi(taslakKarsPencere.to, dil))}
                </p>
              )}
            </div>
            )}

            <div className="mt-3 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setAcik(false);
                  sifirla();
                }}
                className={dugmeSinifi('hayalet', 'kucuk')}
              >
                {d.iptal}
              </button>
              <button
                type="button"
                onClick={uygula}
                disabled={sinirDisi}
                className={dugmeSinifi('birincil', 'kucuk')}
              >
                {d.uygula}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function GunAlani({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: string;
  min?: string;
  max?: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="text-[11px] text-ink-muted">
      {label}
      <input
        type="date"
        value={value}
        min={min}
        max={max}
        onChange={(e) => onChange(e.target.value)}
        className="mt-0.5 block rounded-lg border border-line bg-surface px-2.5 py-1.5 text-sm text-ink focus:border-brand focus:outline-none"
      />
    </label>
  );
}

/**
 * TEK AYLIK IZGARA — elle çizilmiş.
 *
 * Depoda takvim bileşeni ve tarih kütüphanesi (date-fns/dayjs) YOK; biri için
 * bağımlılık eklemek yerine ızgara burada üretiliyor. Tarih matematiği
 * `Date.UTC` üzerinden: tarayıcının yerel saatiyle hesaplamak, gece yarısına
 * yakın saatlerde bir günlük kayma üretiyor ve bu kayma hiçbir hata vermiyor.
 */
function Takvim({
  ay,
  dil,
  oncekiAy,
  sonrakiAy,
  from,
  to,
  enGec,
  enErken,
  onAyDegis,
  onGunSec,
}: {
  ay: string;
  dil: Dil;
  oncekiAy: string;
  sonrakiAy: string;
  from: IsoDay;
  to: IsoDay;
  enGec?: IsoDay;
  enErken?: IsoDay;
  onAyDegis: (ay: string) => void;
  onGunSec: (gun: IsoDay) => void;
}) {
  const gunler = useMemo(() => ayIzgarasi(ay), [ay]);
  const sonGun = enGec ?? today();

  return (
    <div className="mt-3">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => onAyDegis(ayKaydir(ay, -1))}
          aria-label={oncekiAy}
          className="rounded px-2 py-1 text-ink-muted transition hover:text-ink"
        >
          ‹
        </button>
        <span className="text-sm font-medium">{ayAdi(ay, dil)}</span>
        <button
          type="button"
          onClick={() => onAyDegis(ayKaydir(ay, 1))}
          aria-label={sonrakiAy}
          className="rounded px-2 py-1 text-ink-muted transition hover:text-ink"
        >
          ›
        </button>
      </div>

      <div className="mt-1.5 grid grid-cols-7 gap-0.5 text-center text-[11px] text-ink-muted">
        {haftaGunleri(dil).map((g) => (
          <span key={g} className="py-1">
            {g}
          </span>
        ))}
        {gunler.map((g, i) =>
          g === null ? (
            <span key={`bos-${i}`} />
          ) : (
            <button
              key={g}
              type="button"
              onClick={() => onGunSec(g)}
              // GELECEK GÜNLER KAPALI: veri yok, seçilmesi yalnızca boş bir
              // grafik üretir.
              disabled={g > sonGun || (enErken !== undefined && g < enErken)}
              className={`rounded py-1 transition disabled:opacity-30 ${
                g === from || g === to
                  ? 'bg-brand font-medium text-white'
                  : g > from && g < to
                    ? 'bg-brand-soft text-brand-strong'
                    : 'text-ink hover:bg-surface-muted'
              }`}
            >
              {Number(g.slice(8))}
            </button>
          ),
        )}
      </div>
    </div>
  );
}

/** `YYYY-MM` ayının günleri, başına pazartesi hizası için boşluk konarak. */
function ayIzgarasi(ay: string): Array<IsoDay | null> {
  const ilk = `${ay}-01`;
  const d = new Date(`${ilk}T00:00:00Z`);
  const gunNo = d.getUTCDay() === 0 ? 7 : d.getUTCDay();
  const out: Array<IsoDay | null> = Array.from({ length: gunNo - 1 }, () => null);
  let g = ilk;
  while (g.slice(0, 7) === ay) {
    out.push(g);
    g = gunEkle(g, 1);
  }
  return out;
}

function ayKaydir(ay: string, n: number): string {
  const [y, m] = ay.split('-').map(Number) as [number, number];
  const t = new Date(Date.UTC(y, m - 1 + n, 1));
  return t.toISOString().slice(0, 7);
}

/*
 * AY VE GÜN ADLARI `Intl`DEN, elle yazılmış liste değil: iki dilde iki
 * liste tutmak, birinin unutulup İngilizce takvimde Türkçe ay adı kalması
 * demekti. Saat dilimi UTC (gün aritmetiğiyle aynı; yerel saat gece
 * yarısına yakın bir günlük kayma üretiyor).
 */
function ayAdi(ay: string, dil: Dil): string {
  const ad = new Date(`${ay}-01T00:00:00Z`).toLocaleDateString(bicimKodu(dil), {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
  return ad.charAt(0).toLocaleUpperCase(bicimKodu(dil)) + ad.slice(1);
}

/** "5 Eki 2026" / "Oct 5, 2026". */
function gunAdi(gun: IsoDay, dil: Dil): string {
  return new Date(`${gun}T00:00:00Z`).toLocaleDateString(bicimKodu(dil), {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/** Pazartesiden başlayan kısa gün adları; 2024-01-01 bir pazartesi. */
function haftaGunleri(dil: Dil): string[] {
  return Array.from({ length: 7 }, (_, i) =>
    new Date(Date.UTC(2024, 0, 1 + i)).toLocaleDateString(bicimKodu(dil), { weekday: 'short', timeZone: 'UTC' }),
  );
}
