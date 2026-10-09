import Link from 'next/link';
import type { BekleyenIs, ClientPacing, MetricsConversionDetail, PacingStatus } from '@advetics/shared';
import { donusumBosSebebi } from '@advetics/shared';
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
import { formatMoney, formatNumber } from '@/lib/format';
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
  strateji_onay: { harf: 'S', gri: false },
  strateji_aktar: { harf: 'A', gri: false },
  butce_yok: { harf: '₺', gri: true },
};

function IsSatiri({ is, onayYetkisi }: { is: BekleyenIs; onayYetkisi: boolean }) {
  const yas = bekleyenIsYasi(is.enEski);
  const cumle = bekleyenIsCumlesi(is, onayYetkisi);
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
}: {
  sonuc: Promise<BekleyenIslerSonucu>;
  onayYetkisi: boolean;
}) {
  const r = await sonuc;
  const hal = bekleyenKutuHali(r);

  if (r.durum === 'hata') {
    return (
      <section className={`${s.kart} ${s.gir}`} aria-labelledby="bekleyen-isler-baslik">
        <div className={s.kartUst}>
          <h2 id="bekleyen-isler-baslik">Bekleyen işler</h2>
        </div>
        <p role="alert" className={s.hataMetin}>
          Bekleyen işler alınamadı. {r.mesaj}
        </p>
      </section>
    );
  }

  const { yanit } = r;
  const kesme = kesmeMetni(yanit);
  const isler = yanit.isler;

  return (
    <section className={`${s.kart} ${s.gir}`} aria-labelledby="bekleyen-isler-baslik">
      <div className={s.kartUst}>
        <h2 id="bekleyen-isler-baslik">Bekleyen işler</h2>
        {hal === 'dolu' && <span className={`${s.rozet} ${s.num}`}>{isler.length}</span>}
      </div>
      {hal === 'bos' && <p className={s.bosMetin}>Bekleyen iş yok</p>}
      {hal === 'dolu' && (
        <>
          <div>
            {isler.slice(0, BEKLEYEN_ILK_SATIR).map((is) => (
              <IsSatiri key={`${is.tur}:${is.clientId}`} is={is} onayYetkisi={onayYetkisi} />
            ))}
          </div>
          <IslerKap
            ilkSayisi={BEKLEYEN_ILK_SATIR}
            toplam={isler.length}
            kalan={isler.slice(BEKLEYEN_ILK_SATIR).map((is) => (
              <IsSatiri key={`${is.tur}:${is.clientId}`} is={is} onayYetkisi={onayYetkisi} />
            ))}
          />
        </>
      )}
      {yanit.hatalar.map((h) => (
        <p key={h.tur} role="alert" className={s.kaynakHata}>
          {kaynakHataMetni(h)}
        </p>
      ))}
      {kesme && <div className={s.kartAlt}>{kesme}</div>}
    </section>
  );
}

export function BekleyenIskelet() {
  return (
    <section className={s.kart} aria-busy="true">
      <div className={s.kartUst}>
        <h2>Bekleyen işler</h2>
      </div>
      <p className={s.bosMetin}>Yükleniyor…</p>
    </section>
  );
}

// ─── Bütçe ───────────────────────────────────────────────────────────────────

const DURUM: Record<PacingStatus, { ad: string; ton: 'ok' | 'uyari' | 'tehlike' | 'notr' }> = {
  under: { ad: 'Yavaş', ton: 'uyari' },
  on_track: { ad: 'Yolunda', ton: 'ok' },
  over: { ad: 'Hızlı', ton: 'uyari' },
  exhausted: { ad: 'Doldu', ton: 'tehlike' },
  no_budget: { ad: 'Bütçe yok', ton: 'notr' },
};

const yuzde = (r: number) => `%${Math.round(r * 100)}`;

function gunAdi(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', timeZone: 'UTC' });
}

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
}: {
  veri: ClientPacing | null;
  hata: string | null;
  href: string;
  ayAdi: string;
}) {
  const ust = (hap?: { ad: string; ton: string }) => (
    <div className={s.kartUst}>
      <h2>{ayAdi} bütçesi</h2>
      {hap && (
        <span className={s.durumHap} data-ton={hap.ton} style={{ marginLeft: 'auto' }}>
          {hap.ad}
        </span>
      )}
    </div>
  );
  const alt = (etiket: string) => (
    <div className={s.kartAlt}>
      <span>Planla › Aylık Bütçe</span>
      <Link href={href}>{etiket} →</Link>
    </div>
  );

  if (veri === null) {
    return (
      <section className={`${s.kart} ${s.gir}`}>
        {ust()}
        <p role="alert" className={s.hataMetin}>
          Bütçe alınamadı{hata ? `: ${hata}` : '.'}
        </p>
        {alt('Bütçeye git')}
      </section>
    );
  }
  const o = veri.overall;
  if (o.status === 'no_budget' || !o.budget) {
    return (
      <section className={`${s.kart} ${s.gir}`}>
        {ust(DURUM.no_budget)}
        <p className={s.bosMetin}>Bu ay için bütçe tanımlı değil.</p>
        {alt('Bütçe tanımla')}
      </section>
    );
  }

  const birim = veri.currency;
  const doluluk = Math.min(1, o.spentRatio ?? 0);
  const tahmin = o.projectedMicros !== null ? BigInt(o.projectedMicros) : null;
  const butce = BigInt(o.budget.amountMicros);
  const asar = tahmin !== null && butce > 0n && tahmin > butce;

  return (
    <section className={`${s.kart} ${s.gir}`}>
      {ust(DURUM[o.status])}
      <div className={s.butce}>
        {birim ? (
          <div className={s.butceUst}>
            <span className={`${s.tutar} ${s.num}`}>
              {formatMoney(o.spentMicros, birim, { decimals: 0 })}{' '}
              <small>/ {formatMoney(o.budget.amountMicros, birim, { decimals: 0 })}</small>
            </span>
            <span className={`${s.notKucuk} ${s.num}`}>{o.spentRatio === null ? '' : yuzde(o.spentRatio)}</span>
          </div>
        ) : (
          <p className={s.uyarMetin}>Hesaplarda farklı para birimi var; toplam gösterilemiyor.</p>
        )}
        <div className={s.cubuk}>
          <span className={s.cubukDolu} style={{ width: `${doluluk * 100}%` }} />
          <span
            className={s.cubukBugun}
            style={{ left: `${Math.min(100, o.elapsedRatio * 100)}%` }}
            title={`Ayın ${yuzde(o.elapsedRatio)} geçti`}
          />
        </div>
        <div className={s.cubukEtiket}>
          <span>{gunAdi(o.monthStart)}</span>
          <span>Bugün</span>
          <span>{gunAdi(o.monthEnd)}</span>
        </div>
        <ul className={s.tempo}>
          <li>
            <span>Ayın geçen kısmı</span>
            <b className={s.num}>{yuzde(o.elapsedRatio)}</b>
          </li>
          {birim && tahmin !== null && (
            <li>
              <span>Bu tempoyla ay sonu</span>
              <b className={s.num}>≈ {formatMoney(o.projectedMicros, birim, { decimals: 0 })}</b>
            </li>
          )}
          {birim && o.suggestedDailyMicros !== null && (
            <li>
              <span>Kalan günlük bütçe</span>
              <b className={s.num}>{formatMoney(o.suggestedDailyMicros, birim, { decimals: 0 })} / gün</b>
            </li>
          )}
        </ul>
        {asar && (
          <p className={s.tempoUyari}>
            Bu hızla bütçe %{(((tahmin! - butce) * 100n + butce - 1n) / butce).toString()} aşılır.
          </p>
        )}
      </div>
      {alt('Bütçeyi düzenle')}
    </section>
  );
}

// ─── Dönüşümler ──────────────────────────────────────────────────────────────

/**
 * "Dönüşümler neydi?": eylem başına adet ve pay. Boş listenin sebebi TEK
 * üreticiden (`donusumBosSebebi`): üretimde bu kutu "kayıtlı dönüşüm yok"
 * derken kampanya tablosu 49 dönüşüm gösteriyordu.
 */
export function DonusumKarti({ detay }: { detay: MetricsConversionDetail }) {
  const toplam = detay.satirlar.reduce((a, r) => a + r.sayi, 0);
  return (
    <section className={`${s.kart} ${s.gir}`}>
      <div className={s.kartUst}>
        <h2>Dönüşümler neydi?</h2>
      </div>
      {detay.hatalar.map((h) => (
        <p key={h} role="alert" className={s.kaynakHata}>
          Dönüşüm detayı alınamadı: {h}
        </p>
      ))}
      {detay.satirlar.length === 0 ? (
        <p className={s.bosMetin}>
          {donusumBosSebebi({ hataVar: detay.hatalar.length > 0, toplamDonusum: detay.toplamDonusum })}
        </p>
      ) : (
        <div className={s.tabloSar}>
          <table className={s.tablo}>
            <thead>
              <tr>
                <th>Eylem</th>
                <th>Adet</th>
                <th>Pay</th>
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
                    <td className={s.num}>{formatNumber(r.sayi)}</td>
                    <td>
                      <span className={s.pay}>
                        <span className={s.payIz} style={{ width: 64 }}>
                          <i style={{ width: `${pay}%` }} />
                        </span>
                        <span className={s.num}>%{Math.round(pay)}</span>
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <div className={s.kartAlt}>
        <span className={s.num}>Toplam {formatNumber(detay.toplamDonusum)} dönüşüm</span>
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
}: {
  satirlar: Array<{ etiket: string; deger: string; uyari?: boolean; href?: string }>;
}) {
  return (
    <section className={`${s.kart} ${s.gir}`}>
      <div className={s.kartUst}>
        <h2>Kapsam</h2>
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
