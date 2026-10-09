'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { REHBER_AMACLARI, REHBER_AMAC_KODLARI, type RehberAmacKodu, type RehberKaydi, type RehberListesi, type RehberOzeti } from '@advetics/shared';
import { ApiRequestError, apiFetch } from '@/lib/api';
import { baglanti } from '@/lib/baglanti';
import { formatRelative } from '@/lib/format';
import s from './rehber.module.css';

const DURUM_ADI: Record<RehberOzeti['durum'], string> = { taslak: 'Taslak', yayinda: 'Yayında', arsivlendi: 'Arşivlendi' };

const amacAdi = (amac: string | null) =>
  amac && (REHBER_AMAC_KODLARI as readonly string[]).includes(amac) ? REHBER_AMACLARI[amac as RehberAmacKodu].ekranAdi : 'Amaç seçilmedi';

/**
 * Rehberin GİRİŞİ (menüden gelinen yer): açık rehberler ve "Yeni reklam".
 * Panel kabuğunun içinde (menü rayı görünür); rehberin kendisi odaklı kipte
 * açılıyor. Liste okunamadıysa BOŞ liste gösterilmez, sunucunun mesajı
 * gösterilir: "taslağın yok" ile "taslakları okuyamadım" ayrı iş.
 */
export function RehberGirisi({
  clientId,
  workspaceAdi,
  liste,
  listeHatasi,
  devredildi = false,
}: {
  clientId: string;
  workspaceAdi: string;
  liste: RehberListesi | null;
  listeHatasi: string | null;
  /** İyileştir asistanından `?oturum=` ile gelindi (eski sohbet devri). */
  devredildi?: boolean;
}) {
  const router = useRouter();
  const [aciliyor, setAciliyor] = useState(false);
  const [hata, setHata] = useState<string | null>(null);

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

  const acik = (liste?.satirlar ?? []).filter((r) => r.durum !== 'arsivlendi');
  // Sessiz kesme yok: sunucu listeyi kestiyse kaç tanesinin göründüğü yazılır.
  const kesildi = liste !== null && liste.satirlar.length < liste.toplam;

  return (
    <div className={`${s.kok} ${s.giris}`}>
      <div className={s.girisUst}>
        <div>
          <h1 className="sayfa-baslik">AdvCampaign</h1>
          <div className={s.altSatir}>
            <b>{workspaceAdi}</b> · altı adımda Meta ve Google reklamı
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
      <section className={s.kart}>
        <h2 className={s.kartBaslik}>
          Reklamların <span className={s.ops}>{liste ? (kesildi ? `${liste.satirlar.length} / ${liste.toplam} gösteriliyor` : `${acik.length} reklam`) : ''}</span>
        </h2>
        {listeHatasi ? (
          <p className={s.hataMetni} role="alert" style={{ margin: 0, padding: '14px 16px', borderTop: '1px solid var(--t-line)' }}>
            Reklam listesi okunamadı: {listeHatasi}
          </p>
        ) : acik.length === 0 ? (
          <p className={s.bosMetin}>Bu workspace&apos;te yarım kalmış ya da yayınlanmış reklam yok. &quot;Yeni reklam&quot;la başla.</p>
        ) : (
          <ul className={s.liste}>
            {acik.map((r) => {
              const platformlar = [r.platformlar.meta && 'Meta', r.platformlar.google && 'Google'].filter(Boolean).join(' + ') || 'Platform seçilmedi';
              return (
                <li key={r.id} className={s.listeSatir}>
                  <div>
                    <b>{amacAdi(r.amac)}</b>
                    <small>
                      {DURUM_ADI[r.durum]} · {platformlar}
                      {r.durum === 'taslak' && ` · ${r.eksikSayisi === 0 ? 'eksik yok' : `${r.eksikSayisi} eksik`}`}
                    </small>
                  </div>
                  <span className={s.ops}>{formatRelative(r.updatedAt)}</span>
                  <Link className={s.ikincil} href={baglanti('/reklam', { musteri: clientId, rehber: r.id })}>
                    {r.durum === 'taslak' ? 'Devam et' : 'Gör'}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
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
