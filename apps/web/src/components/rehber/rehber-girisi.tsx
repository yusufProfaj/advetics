'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { REHBER_AMAC_KODLARI, type RehberAmacKodu, type RehberKaydi, type RehberListesi, type RehberOzeti } from '@advetics/shared';
import { ApiRequestError, apiFetch, onizlemeAdresi } from '@/lib/api';
import { baglanti } from '@/lib/baglanti';
import { formatMoney, formatRelative, formatTarih } from '@/lib/format';
import { REKLAM_YONETICISI } from '@/lib/reklam-yoneticisi';
import {
  BOS_SEKME_METNI,
  GIRIS_SEKMELERI,
  ONAY_METINLERI,
  SEKME_ADLARI,
  aktifSekme,
  birincilEylem,
  butceMetni,
  platformRozetleri,
  satirAdi,
  satirEylemleri,
  sekmeyeAyir,
  taslakPlatformlari,
  taslaklariAyir,
  topluSonucMetni,
  type GirisSekmesi,
  type SatirEylemi,
} from '@/lib/reklam-girisi';
import { AMAC_IKONU, IKON, Ikon } from './ikonlar';
import s from './rehber.module.css';

type OnayTuru = 'taslagi_sil' | 'listeden_kaldir' | 'toplu_sil';

/**
 * Rehberin GİRİŞİ (menüden gelinen yer). 2026-10-12'de sadeleşti; kullanıcı:
 * "ilk girişi çok kötü ve görüntü kirliliği hiç bir şey anlaşılmıyor ve
 * silinmiyor". Üç sekme (Google Ads'in durum süzgeci gibi), satır başına
 * görsel + ad + bütçe + platform rozeti, ⋯ menüsünde silme/kaldırma. Karar
 * mantığı `lib/reklam-girisi.ts` içinde ve orada sınanıyor.
 *
 * Liste okunamadıysa BOŞ liste gösterilmez, sunucunun mesajı gösterilir:
 * "taslağın yok" ile "taslakları okuyamadım" ayrı iş.
 */
export function RehberGirisi({
  clientId,
  workspaceAdi,
  liste,
  listeHatasi,
  sekmeParam,
  devredildi = false,
}: {
  clientId: string;
  workspaceAdi: string;
  liste: RehberListesi | null;
  listeHatasi: string | null;
  /** Adresteki `?sekme=`; geçersizse işi olan sekme seçilir. */
  sekmeParam?: string;
  /** İyileştir asistanından `?oturum=` ile gelindi (eski sohbet devri). */
  devredildi?: boolean;
}) {
  const router = useRouter();
  const [aciliyor, setAciliyor] = useState(false);
  const [hata, setHata] = useState<string | null>(null);
  const [menu, setMenu] = useState<string | null>(null);
  const [onay, setOnay] = useState<{ tur: OnayTuru; satirlar: RehberOzeti[] } | null>(null);
  const [onayAcik, setOnayAcik] = useState(false);
  const [isleniyor, setIsleniyor] = useState(false);
  const [islemHatasi, setIslemHatasi] = useState<string | null>(null);

  // Menü dışına tıklayınca ya da Esc ile kapanır (açık menü odağı kilitlemesin).
  useEffect(() => {
    if (!menu) return;
    const kapat = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest('[data-satir-menu]')) setMenu(null);
    };
    const tus = (e: KeyboardEvent) => e.key === 'Escape' && setMenu(null);
    document.addEventListener('mousedown', kapat);
    document.addEventListener('keydown', tus);
    return () => {
      document.removeEventListener('mousedown', kapat);
      document.removeEventListener('keydown', tus);
    };
  }, [menu]);

  async function yeni() {
    setAciliyor(true);
    setHata(null);
    try {
      const r = await apiFetch<RehberKaydi>('/reklam/rehberler', { method: 'POST', body: JSON.stringify({ clientId }) });
      router.push(baglanti('/reklam', { musteri: clientId, rehber: r.id }));
    } catch (e) {
      setHata(e instanceof ApiRequestError ? e.message : 'Sunucuya ulaşılamadı.');
      setAciliyor(false);
    }
  }

  /** Sırayla çağırır; kısmi başarısızlık sayısıyla yazılır (sessiz kayıp yok). */
  async function uygula(yol: 'arsivle' | 'geri-getir', satirlar: readonly RehberOzeti[]) {
    setIsleniyor(true);
    setIslemHatasi(null);
    const hatalar: string[] = [];
    for (const r of satirlar) {
      try {
        await apiFetch<RehberKaydi>(`/reklam/rehberler/${encodeURIComponent(r.id)}/${yol}`, { method: 'POST' });
      } catch (e) {
        hatalar.push(e instanceof ApiRequestError ? e.message : 'Sunucuya ulaşılamadı.');
      }
    }
    setIsleniyor(false);
    setOnayAcik(false);
    setIslemHatasi(satirlar.length === 1 && hatalar[0] ? hatalar[0] : topluSonucMetni(satirlar.length, hatalar));
    router.refresh();
  }

  function eylem(r: RehberOzeti, e: SatirEylemi) {
    setMenu(null);
    if (e === 'geri_getir') return void uygula('geri-getir', [r]);
    setOnay({ tur: e, satirlar: [r] });
    setOnayAcik(true);
  }

  const gruplar = sekmeyeAyir(liste?.satirlar ?? []);
  const sekme = aktifSekme(sekmeParam, gruplar);
  const simdi = Date.now();
  const taslak = taslaklariAyir(gruplar.taslaklar, simdi);
  // Sessiz kesme yok: sunucu listeyi kestiyse kaç tanesinin göründüğü yazılır.
  const kesildi = liste !== null && liste.satirlar.length < liste.toplam;
  const tasinan = { musteri: clientId };
  const satirAdresi = (r: RehberOzeti) => baglanti('/reklam', tasinan, { rehber: r.id });
  const gorunen = sekme === 'taslaklar' ? taslak.guncel : gruplar[sekme];
  const metin = onay ? ONAY_METINLERI[onay.tur] : null;

  const satir = (r: RehberOzeti, soluk = false) => {
    const eylemler = satirEylemleri(r);
    const rozetler = platformRozetleri(r);
    const butce = butceMetni(r.butce, (m, b) => formatMoney(m, b));
    const plt = r.durum === 'taslak' ? taslakPlatformlari(r) : null;
    return (
      <li key={r.id} className={s.gSatir} data-soluk={soluk || undefined}>
        <Kucuk r={r} />
        <div className={s.gAna}>
          <Link className={s.gAd} href={satirAdresi(r)}>
            {satirAdi(r, formatTarih)}
          </Link>
          <div className={s.gAlt}>
            {rozetler.length > 0
              ? rozetler.map((z) => (
                  <span key={z.platform} className={s.gRozet} data-ton={z.ton} title={z.ipucu ?? undefined}>
                    {z.etiket}
                    {z.ipucu && <small> · {z.ipucu}</small>}
                  </span>
                ))
              : r.durum === 'taslak' && (
                  <span className={s.gRozet} data-ton="notr">
                    Taslak{plt ? ` · ${plt}` : ''}
                    {r.eksikSayisi > 0 && ` · ${r.eksikSayisi} eksik`}
                  </span>
                )}
            {r.durum === 'arsivlendi' && (
              <span className={s.gRozet} data-ton="notr">
                Listeden kaldırıldı
              </span>
            )}
            {butce && <span className={s.num}>{butce}</span>}
            <span>{formatRelative(r.updatedAt)}</span>
          </div>
        </div>
        <div className={s.gEylem}>
          <Link className={s.ikincil} href={satirAdresi(r)}>
            {birincilEylem(r)}
          </Link>
          {eylemler.length > 0 && (
            <div className={s.gMenuKok} data-satir-menu>
              <button
                type="button"
                className={s.gMenuDugme}
                aria-label="Diğer işlemler"
                aria-haspopup="menu"
                aria-expanded={menu === r.id}
                onClick={() => setMenu(menu === r.id ? null : r.id)}
              >
                <Ikon d={IKON.dahaFazla} />
              </button>
              {/* Menü DOM'dan çıkmıyor; görünürlük geçişle (panel kuralı). */}
              <div className={`${s.setMenu} ${s.gMenu}`} role="menu" data-acik={menu === r.id} aria-hidden={menu !== r.id}>
                {eylemler.map((e) => (
                  <button key={e} type="button" role="menuitem" tabIndex={menu === r.id ? 0 : -1} disabled={isleniyor} onClick={() => eylem(r, e)}>
                    {EYLEM_ADI[e]}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </li>
    );
  };

  return (
    <div className={`${s.kok} ${s.giris}`}>
      <div className={s.girisUst}>
        <div>
          <h1 className="sayfa-baslik">AdvCampaign</h1>
          <div className={s.altSatir}>
            <b>{workspaceAdi}</b> · Meta ve Google reklamını altı adımda kur
          </div>
        </div>
        <button type="button" className={s.birincil} disabled={aciliyor} onClick={() => void yeni()}>
          {aciliyor ? 'Açılıyor…' : 'Yeni reklam'}
        </button>
      </div>
      {devredildi && (
        <div className={s.neden} role="status">
          <span>İyileştir&apos;den gelen istek artık sohbetle değil, altı adımlı rehberle kuruluyor. &quot;Yeni reklam&quot;la başla; amaç, bütçe ve metni adım adım seçersin.</span>
        </div>
      )}
      {hata && (
        <p className={s.hataMetni} role="alert" style={{ margin: 0 }}>
          Yeni reklam açılamadı: {hata}
        </p>
      )}
      {islemHatasi && (
        <p className={s.hataMetni} role="alert" style={{ margin: 0 }}>
          İşlem tamamlanamadı: {islemHatasi}
        </p>
      )}
      <section className={s.kart}>
        {listeHatasi ? (
          <p className={s.hataMetni} role="alert" style={{ margin: 0, padding: '14px 16px' }}>
            Reklam listesi okunamadı: {listeHatasi}
          </p>
        ) : (
          <>
            <nav className={s.gSekmeler} aria-label="Reklam durumu">
              {GIRIS_SEKMELERI.map((k: GirisSekmesi) => (
                <Link key={k} href={baglanti('/reklam', tasinan, { sekme: k })} className={s.gSekme} aria-current={k === sekme ? 'page' : undefined}>
                  {SEKME_ADLARI[k]} <span className={s.num}>{gruplar[k].length}</span>
                </Link>
              ))}
            </nav>
            {kesildi && (
              <p className={s.gNot}>
                {liste.satirlar.length} / {liste.toplam} kayıt gösteriliyor; sekme sayıları gösterilenlere göre. En eski arşiv kayıtları listede yok.
              </p>
            )}
            {gorunen.length === 0 && !(sekme === 'taslaklar' && taslak.eski.length > 0) ? (
              <p className={s.bosMetin}>
                {BOS_SEKME_METNI[sekme]}{' '}
                {sekme !== 'arsiv' && (
                  <button type="button" className={s.metinDugme} disabled={aciliyor} onClick={() => void yeni()}>
                    Yeni reklam
                  </button>
                )}
              </p>
            ) : (
              <ul className={s.liste}>{gorunen.map((r) => satir(r))}</ul>
            )}
            {sekme === 'taslaklar' && taslak.eski.length > 0 && (
              <>
                <div className={s.gEskiBaslik}>
                  <div>
                    <b>Eski taslaklar ({taslak.eski.length})</b>
                    <small>Amaç seçilmemiş ya da bir haftadır dokunulmamış yarım taslaklar.</small>
                  </div>
                  <button
                    type="button"
                    className={s.ikincil}
                    disabled={isleniyor}
                    onClick={() => {
                      setOnay({ tur: 'toplu_sil', satirlar: taslak.eski });
                      setOnayAcik(true);
                    }}
                  >
                    Hepsini sil
                  </button>
                </div>
                <ul className={s.liste}>{taslak.eski.map((r) => satir(r, true))}</ul>
              </>
            )}
          </>
        )}
      </section>

      {/* Pencere DOM'da kalıyor; açılıp kapanma görünürlük geçişiyle (panel kuralı). */}
      <div className={`${s.perde} ${onayAcik ? s.acik : ''}`} aria-hidden={!onayAcik}>
        <div className={s.pencere} role="dialog" aria-modal="true" aria-labelledby="giris-onay-baslik">
          <h3 id="giris-onay-baslik">{metin?.baslik}</h3>
          <p>
            {metin?.govde}
            {onay && onay.satirlar.length > 1 && ` (${onay.satirlar.length} taslak)`}
          </p>
          {onay && onay.satirlar.length === 1 && (
            <p>
              <b>{satirAdi(onay.satirlar[0]!, formatTarih)}</b>
            </p>
          )}
          {metin?.yoneticiBaglantisi && (
            <p>
              <Link className={s.metinDugme} href={baglanti(REKLAM_YONETICISI, tasinan)}>
                Reklam Yöneticisi&apos;ne git
              </Link>
            </p>
          )}
          <div className={s.gPencereAlt}>
            <button type="button" className={s.ikincil} disabled={isleniyor} onClick={() => setOnayAcik(false)}>
              Vazgeç
            </button>
            <button
              type="button"
              className={s.birincil}
              disabled={isleniyor || !onay}
              onClick={() => onay && void uygula('arsivle', onay.satirlar)}
            >
              {isleniyor ? metin?.suruyor : metin?.dugme}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

const EYLEM_ADI: Readonly<Record<SatirEylemi, string>> = {
  taslagi_sil: 'Taslağı sil',
  listeden_kaldir: 'Listeden kaldır',
  geri_getir: 'Geri getir',
};

/**
 * Satırın küçük görseli: ilk medyanın görseli (video ise kapağı). Yoksa ya
 * da yüklenemezse amaç simgesi; yüklenemediği `title`da yazıyor (boş kutu
 * "görsel yok" ile "görsel okunamadı"yı ayırt ettirmezdi).
 */
function Kucuk({ r }: { r: RehberOzeti }) {
  const [dustu, setDustu] = useState(false);
  const amac = r.amac && (REHBER_AMAC_KODLARI as readonly string[]).includes(r.amac) ? (r.amac as RehberAmacKodu) : null;
  if (r.gorselVarlikId && !dustu) {
    // Düz <img>: önizleme kimlik doğrulamalı API ucu, next/image onu optimize edemez.
    return (
      <img className={s.gKucuk} src={onizlemeAdresi(`/assets/${r.gorselVarlikId}/preview`)} alt="" loading="lazy" onError={() => setDustu(true)} />
    );
  }
  return (
    <span className={s.gKucuk} data-simge title={dustu ? 'Görsel yüklenemedi' : undefined} aria-hidden>
      {amac ? <Ikon d={AMAC_IKONU[amac]} /> : <Ikon d={IKON.bilgi} />}
    </span>
  );
}

/** Rehber açılamadığında (okuma hatası, yanlış workspace, yetki) tek kart. */
export function RehberMesaji({ baslik, children, geri }: { baslik: string; children: React.ReactNode; geri?: string }) {
  return (
    <div className={`${s.kok} ${s.giris}`}>
      <div className={s.girisUst}>
        <h1 className="sayfa-baslik">AdvCampaign</h1>
      </div>
      <section className={s.kart} role="alert">
        <h2 className={s.kartBaslik}>{baslik}</h2>
        <p className={s.bosMetin}>
          {children}
          {geri && (
            <>
              {' '}
              <Link className={s.metinDugme} href={geri}>
                Reklam listesine dön
              </Link>
            </>
          )}
        </p>
      </section>
    </div>
  );
}
