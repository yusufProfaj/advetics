import Link from 'next/link';
import type { BekleyenIs, ClientPacing, MetricsConversionDetail, PacingStatus } from '@advetics/shared';
import { donusumBosSebebi, sec, type Dil } from '@advetics/shared';
import { genelBakisSozlugu } from '@/dil/sozlukler/genel-bakis';
import {
  BEKLEYEN_ILK_SATIR,
  bekleyenIsAdresi,
  bekleyenIsCumlesi,
  bekleyenIsYasi,
  bekleyenKutuHali,
  kaynakHataMetni,
  kesmeMetni,
  type BekleyenIslerSonucu,
} from '@/lib/bekleyen-isler';
import { formatDayShort, formatMoney, formatNumber } from '@/lib/format';
import { yuzdeMetni } from '@/lib/degisim';
import { asimYuzdesi } from '@/components/budget/butce-temposu';
import { IslerKap } from './genel-bakis-parcalari';
import s from './taslak.module.css';

/*
 * ═══ GENEL BAKIŞ: SUNUCUDA ÇİZİLEN KARTLAR (onaylanan taslak) ═══
 * Görünüş `taslak.module.css`; veri kuralları eski bileşenlerdekiyle aynı
 * (dört hâl, sessiz kesme yok, boş listenin sebebi).
 */

// ─── Bekleyen işler ──────────────────────────────────────────────────────────

/** Tür karosundaki harf: ad değil SİMGE; satırın cümlesi işi zaten söylüyor. */
const TUR_HARFI: Record<BekleyenIs['tur'], { harf: string; gri: boolean }> = {
  boost_onay: { harf: 'B', gri: false },
  // "!" ve S DEĞİL: S strateji onayında; sinyal bir uyarı, simgesi de öyle.
  sinyal_acik: { harf: '!', gri: false },
  geri_besleme_sorunu: { harf: 'M', gri: false },
  strateji_onay: { harf: 'S', gri: false },
  strateji_aktar: { harf: 'A', gri: false },
  butce_yok: { harf: '₺', gri: true },
};

function IsSatiri({ is, onayYetkisi, dil }: { is: BekleyenIs; onayYetkisi: boolean; dil: Dil }) {
  const yas = bekleyenIsYasi(is.enEski, new Date(), dil);
  const cumle = bekleyenIsCumlesi(is, onayYetkisi, dil);
  const t = TUR_HARFI[is.tur];
  return (
    <Link className={s.is} href={bekleyenIsAdresi(is)} title={`${is.clientAdi} · ${cumle}`}>
      <span className={`${s.tur} ${t.gri ? s.turGri : ''}`} aria-hidden>
        {t.harf}
      </span>
      <span className={s.isIcerik}>
        <b>{cumle}</b>
        <small>{is.clientAdi}</small>
      </span>
      {yas && <span className={s.yas}>{yas}</span>}
      <span className={s.ok} aria-hidden>
        →
      </span>
    </Link>
  );
}

/**
 * Dört hâl ayrı: yükleniyor (Suspense yedeği, `BekleyenIskelet`), hata
 * (sunucunun cümlesi), boş, dolu; artı `yalniz_hata` (satır yok ama bir
 * kaynak okunamadı: "iş yok" yazmak yalan olurdu).
 */
export async function BekleyenIslerKarti({
  sonuc,
  onayYetkisi,
  dil,
}: {
  sonuc: Promise<BekleyenIslerSonucu>;
  onayYetkisi: boolean;
  /** Sunucu bileşeni: dil sayfadan geliyor (sayfa zaten okudu; ikinci çerez okuması yok). */
  dil: Dil;
}) {
  const d = sec(genelBakisSozlugu, dil).isler;
  const r = await sonuc;
  const hal = bekleyenKutuHali(r);

  if (r.durum === 'hata') {
    return (
      <section className={`${s.kart} ${s.gir}`} aria-labelledby="bekleyen-isler-baslik">
        <div className={s.kartUst}>
          <h2 id="bekleyen-isler-baslik">{d.baslik}</h2>
        </div>
        <p role="alert" className={s.hataMetin}>
          {d.alinamadi} {r.mesaj}
        </p>
      </section>
    );
  }

  const { yanit } = r;
  const kesme = kesmeMetni(yanit, dil);
  const isler = yanit.isler;

  return (
    <section className={`${s.kart} ${s.gir}`} aria-labelledby="bekleyen-isler-baslik">
      <div className={s.kartUst}>
        <h2 id="bekleyen-isler-baslik">{d.baslik}</h2>
        {hal === 'dolu' && <span className={`${s.rozet} ${s.num}`}>{isler.length}</span>}
      </div>
      {hal === 'bos' && <p className={s.bosMetin}>{d.yok}</p>}
      {hal === 'dolu' && (
        <>
          <div>
            {isler.slice(0, BEKLEYEN_ILK_SATIR).map((is) => (
              <IsSatiri key={`${is.tur}:${is.clientId}`} is={is} onayYetkisi={onayYetkisi} dil={dil} />
            ))}
          </div>
          <IslerKap
            ilkSayisi={BEKLEYEN_ILK_SATIR}
            gelen={isler.length}
            toplam={yanit.toplam}
            kalan={isler.slice(BEKLEYEN_ILK_SATIR).map((is) => (
              <IsSatiri key={`${is.tur}:${is.clientId}`} is={is} onayYetkisi={onayYetkisi} dil={dil} />
            ))}
          />
        </>
      )}
      {yanit.hatalar.map((h) => (
        <p key={h.tur} role="alert" className={s.kaynakHata}>
          {kaynakHataMetni(h)}
        </p>
      ))}
      {/* Dolu kartta kesme sayacın içinde (IslerKap); ayrı satır iki sayaç demekti. */}
      {kesme && hal !== 'dolu' && <div className={s.kartAlt}>{kesme}</div>}
    </section>
  );
}

export function BekleyenIskelet({ dil }: { dil: Dil }) {
  const d = sec(genelBakisSozlugu, dil).isler;
  return (
    <section className={s.kart} aria-busy="true">
      <div className={s.kartUst}>
        <h2>{d.baslik}</h2>
      </div>
      <p className={s.bosMetin}>{d.yukleniyor}</p>
    </section>
  );
}

// ─── Bütçe ───────────────────────────────────────────────────────────────────

/** Durumun tonu; adı sözlükte (`butce.durum`), anahtar kümesi `PacingStatus`. */
const DURUM_TONU: Record<PacingStatus, 'ok' | 'uyari' | 'tehlike' | 'notr'> = {
  under: 'uyari',
  on_track: 'ok',
  over: 'uyari',
  exhausted: 'tehlike',
  no_budget: 'notr',
};

const yuzde = (r: number, dil: Dil) => yuzdeMetni(Math.round(r * 100), dil);

/**
 * Bu ayın bütçesi: harcanan / bütçe, doluluk çubuğu ve ayın neresinde
 * olunduğu (bugün işareti), tempo satırları. Hepsi `BudgetPacing`ten; tahmin
 * ve önerilen günlük tutar sunucuda hesaplanıyor, burada yeniden değil.
 */
export function ButceKarti({
  veri,
  hata,
  href,
  ayAdi,
  secimGerekli = false,
  dil,
}: {
  dil: Dil;
  veri: ClientPacing | null;
  hata: string | null;
  /** Şirket geneli + birden çok workspace: bütçe workspace başına (`butceKapsami`). */
  secimGerekli?: boolean;
  href: string;
  ayAdi: string;
}) {
  const b = sec(genelBakisSozlugu, dil).butce;
  const durum = (k: PacingStatus) => ({ ad: b.durum[k], ton: DURUM_TONU[k] });
  const gunAdi = (iso: string) => formatDayShort(iso, dil);
  const ust = (hap?: { ad: string; ton: string }) => (
    <div className={s.kartUst}>
      <h2>{b.baslik(ayAdi)}</h2>
      {hap && (
        <span className={s.durumHap} data-ton={hap.ton} style={{ marginLeft: 'auto' }}>
          {hap.ad}
        </span>
      )}
    </div>
  );
  const alt = (etiket: string) => (
    <div className={s.kartAlt}>
      <span>{b.yol}</span>
      <Link href={href}>{etiket} →</Link>
    </div>
  );

  if (secimGerekli) {
    return (
      <section className={`${s.kart} ${s.gir}`}>
        {ust()}
        <p className={s.bosMetin}>{b.secimGerekli}</p>
        {alt(b.butcelereGit)}
      </section>
    );
  }
  if (veri === null) {
    return (
      <section className={`${s.kart} ${s.gir}`}>
        {ust()}
        <p role="alert" className={s.hataMetin}>
          {b.alinamadi}
          {hata ? `: ${hata}` : '.'}
        </p>
        {alt(b.butceyeGit)}
      </section>
    );
  }
  const o = veri.overall;
  if (o.status === 'no_budget' || !o.budget) {
    return (
      <section className={`${s.kart} ${s.gir}`}>
        {ust(durum('no_budget'))}
        <p className={s.bosMetin}>{b.tanimsiz}</p>
        {alt(b.tanimla)}
      </section>
    );
  }

  const birim = veri.currency;
  const doluluk = Math.min(1, o.spentRatio ?? 0);
  const tahmin = o.projectedMicros !== null ? BigInt(o.projectedMicros) : null;
  const asim = tahmin === null ? null : asimYuzdesi(tahmin, BigInt(o.budget.amountMicros));
  /*
   * AYIN İLK GÜNÜ HİÇ TAMAMLANMIŞ GÜN YOK: pacing dünde duruyor ve tahmin
   * boş ya da anlamsız. Tempo satırları yerine nedeni yazılıyor.
   */
  const yeniBasladi = o.daysElapsed === 0;
  /*
   * Bütçe dolduysa sunucu öneriyi 0 gönderiyor: "0 ₺ / gün" yazmak yerine
   * satır düşüyor; durum hapı "Doldu" diyor, aşım uyarısı tonla söylüyor.
   */
  const gunlukVar =
    o.daysRemaining > 0 && o.suggestedDailyMicros !== null && BigInt(o.suggestedDailyMicros) > 0n;

  return (
    <section className={`${s.kart} ${s.gir}`}>
      {ust(durum(o.status))}
      <div className={s.butce}>
        {birim ? (
          <div className={s.butceUst}>
            <span className={`${s.tutar} ${s.num}`}>
              {formatMoney(o.spentMicros, birim, { decimals: 0, dil })}{' '}
              <small>/ {formatMoney(o.budget.amountMicros, birim, { decimals: 0, dil })}</small>
            </span>
            <span className={`${s.notKucuk} ${s.num}`}>{o.spentRatio === null ? '' : yuzde(o.spentRatio, dil)}</span>
          </div>
        ) : (
          <p className={s.uyarMetin}>{b.karisik}</p>
        )}
        <div className={s.cubuk}>
          <span className={s.cubukDolu} style={{ width: `${doluluk * 100}%` }} />
          <span
            className={s.cubukBugun}
            style={{ left: `${Math.min(100, o.elapsedRatio * 100)}%` }}
            title={b.ayGecti(yuzde(o.elapsedRatio, dil))}
          />
        </div>
        <div className={s.cubukEtiket}>
          <span>{gunAdi(o.monthStart)}</span>
          <span>{b.bugun}</span>
          <span>{gunAdi(o.monthEnd)}</span>
        </div>
        <ul className={s.tempo}>
          <li>
            <span>{b.gecenKisim}</span>
            <b className={s.num}>{yuzde(o.elapsedRatio, dil)}</b>
          </li>
          {yeniBasladi && (
            <li>
              <span>{b.yeniBasladi}</span>
            </li>
          )}
          {!yeniBasladi && birim && tahmin !== null && (
            <li>
              <span>{b.aySonu}</span>
              <b className={s.num}>≈ {formatMoney(o.projectedMicros, birim, { decimals: 0, dil })}</b>
            </li>
          )}
          {!yeniBasladi && birim && gunlukVar && (
            <li>
              <span>{b.kalanGunluk}</span>
              <b className={s.num}>{b.gunluk(formatMoney(o.suggestedDailyMicros, birim, { decimals: 0, dil }))}</b>
            </li>
          )}
        </ul>
        {!yeniBasladi && asim !== null && (
          <p className={s.tempoUyari}>{b.asim(yuzdeMetni(Number(asim), dil))}</p>
        )}
      </div>
      {alt(b.duzenle)}
    </section>
  );
}

// ─── Dönüşümler ──────────────────────────────────────────────────────────────

/**
 * "Dönüşümler neydi?": eylem başına adet ve pay. Boş listenin sebebi TEK
 * üreticiden (`donusumBosSebebi`): üretimde bu kutu "kayıtlı dönüşüm yok"
 * derken kampanya tablosu 49 dönüşüm gösteriyordu.
 */
export function DonusumKarti({ detay, dil }: { detay: MetricsConversionDetail; dil: Dil }) {
  const g = sec(genelBakisSozlugu, dil);
  const d = g.donusum;
  const toplam = detay.satirlar.reduce((a, r) => a + r.sayi, 0);
  const bosParam = { hataVar: detay.hatalar.length > 0, toplamDonusum: detay.toplamDonusum };
  return (
    <section className={`${s.kart} ${s.gir}`}>
      <div className={s.kartUst}>
        <h2>{d.baslik}</h2>
      </div>
      {detay.hatalar.map((h) => (
        <p key={h} role="alert" className={s.kaynakHata}>
          {d.detayAlinamadi(h)}
        </p>
      ))}
      {detay.satirlar.length === 0 ? (
        <p className={s.bosMetin}>
          {dil === 'tr' ? donusumBosSebebi(bosParam) : donusumBosIngilizce(bosParam, d.bos)}
        </p>
      ) : (
        <div className={s.tabloSar}>
          <table className={s.tablo}>
            <thead>
              <tr>
                <th>{d.eylem}</th>
                <th>{d.adet}</th>
                <th>{g.metrik.pay}</th>
              </tr>
            </thead>
            <tbody>
              {detay.satirlar.map((r) => {
                const pay = toplam === 0 ? 0 : (r.sayi / toplam) * 100;
                return (
                  <tr key={`${r.platform}-${r.ad}`}>
                    <td style={{ maxWidth: 0, width: '50%' }}>
                      <span title={r.ad} style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {r.ad}
                      </span>
                    </td>
                    <td className={s.num}>{formatNumber(r.sayi, dil)}</td>
                    <td>
                      <span className={s.pay}>
                        <span className={s.payIz} style={{ width: 64 }}>
                          <i style={{ width: `${pay}%` }} />
                        </span>
                        <span className={s.num}>{yuzdeMetni(Math.round(pay), dil)}</span>
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {/*
        META SATIRLARININ NEDEN KOVA OLDUĞU YAZILI: kullanıcı Google'da kendi
        verdiği adları görüp Meta'da "Form/Mesaj" görünce "benim adlarım
        nerede" diye arar; cevap ekranın kendisinde olmalı.
      */}
      {detay.satirlar.some((r) => r.platform === 'meta') && (
        <p className={s.notKucuk} style={{ padding: '0 16px 10px', margin: 0 }}>
          {d.metaNotu}
        </p>
      )}
      {/*
        SAYAÇ İKİ SAYIYI DA YAZIYOR: adlandırılmış eylemlerin toplamı ile
        kapsamdaki bütün dönüşümler ayrışabiliyor (detayı olmayan dönüşüm).
        Yalnız birini yazmak, kampanya tablosuyla çelişen bir sayı demekti.
      */}
      <div className={s.kartAlt}>
        <span className={s.num}>
          {toplam === detay.toplamDonusum
            ? d.toplam(formatNumber(detay.toplamDonusum, dil))
            : d.adlandirilmis(formatNumber(toplam, dil), formatNumber(detay.toplamDonusum, dil))}
        </span>
      </div>
    </section>
  );
}

// ─── Kapsam özeti (ajans ve şirket görünümü) ─────────────────────────────────

/**
 * Ajans ve şirket görünümünde sağ sütunun ikinci kartı (kullanıcı: "ajans
 * görünümündeyken boşlukları doldur"). Sayılar listelerden TÜRÜYOR, ayrı
 * bir sorgu yok: kaç şirket/workspace, kaçı bu dönemde harcadı, kaç hesap
 * izlemede, kaçı izlenmiyor.
 */
export function KapsamOzeti({
  satirlar,
  baslik,
}: {
  satirlar: Array<{ etiket: string; deger: string; uyari?: boolean; href?: string }>;
  baslik: string;
}) {
  return (
    <section className={`${s.kart} ${s.gir}`}>
      <div className={s.kartUst}>
        <h2>{baslik}</h2>
      </div>
      <ul className={s.tempo} style={{ padding: '4px 16px 14px', margin: 0 }}>
        {satirlar.map((r) => (
          <li key={r.etiket}>
            <span>{r.etiket}</span>
            {r.href ? (
              <Link href={r.href} className={s.num} style={{ fontWeight: 700, color: r.uyari ? 'var(--t-warn-strong)' : undefined }}>
                {r.deger} →
              </Link>
            ) : (
              <b className={s.num} style={{ color: r.uyari ? 'var(--t-warn-strong)' : undefined }}>
                {r.deger}
              </b>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * `donusumBosSebebi`nin (shared) İNGİLİZCE KARŞILIĞI, AYNI üç hâl ve aynı
 * sıra. Shared'da henüz dil alan bir sürümü yok (D2 devir notunda); Türkçe
 * yol hâlâ tek üreticiyi çağırıyor. Shared'a dil gelince bu fonksiyon silinir.
 */
function donusumBosIngilizce(
  p: { hataVar: boolean; toplamDonusum: number },
  m: (typeof genelBakisSozlugu)['en']['donusum']['bos'],
): string {
  if (p.hataVar) return m.hata;
  if (p.toplamDonusum > 0) return m.adYok(p.toplamDonusum);
  return m.yok;
}
