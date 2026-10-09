'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { AsistanMesaji, AsistanOturumu, AsistanParcasi, Oneri, UygulamaSonucu } from '@advetics/shared';
import { API_URL, ApiRequestError, apiFetch } from '@/lib/api';
import { aracIziMetni, devretAdresi, eylemMetni, parcaEkle, parcalariAyikla, sonucMetni, turuBitir, yaziyorMu } from '@/lib/iyilestir';
import { OnayPenceresi } from './onay-penceresi';
import i from '@/components/taslak/iyilestir.module.css';
import s from '@/components/taslak/taslak.module.css';

/**
 * `asistanBagli` sözleşmede yok, API ekliyor (model anahtarı tanımlı mı).
 * İsteğe bağlı okunuyor: `false` geldiyse ekran söylüyor, gelmediyse susuyor.
 */
type OkunanOturum = AsistanOturumu & { asistanBagli?: boolean };

export type OturumSonucu =
  | { durum: 'yok' }
  | { durum: 'tamam'; oturum: OkunanOturum }
  | { durum: 'hata'; mesaj: string };

/** Taslaktaki üç soru; ekranda değişmiyor, metinleri olduğu gibi gönderiliyor. */
const SIK_SORULANLAR = [
  'Bu hafta en çok para nereye boşa gitti?',
  'Hangi reklamlar yoruldu?',
  'Yeni bir kampanya açmak istiyorum',
] as const;

/**
 * ═══ AI ASİSTAN SEKMESİ ═══
 *
 * Asistan OKUR ve ÖNERİR; yazma yalnız kullanıcının onayladığı Uygula
 * kartından, öneri uygulamasıyla AYNI pencere ve AYNI uçtan (MIMARI §6).
 * Reklam kurmaz: devir kartı AdvCampaign'de hazır istekli bir oturum açar,
 * gönder düğmesine kullanıcı basar.
 *
 * OTURUM ADRESTE (`?oturum=`): sayfa yenilenince sohbet kaybolmasın ve
 * sunucu oturumu okuyup ilk hâli versin. Oturum ilk mesajda açılıyor; boş
 * bir sohbet için kayıt açmak, kimsenin yazmadığı satırlar biriktirirdi.
 *
 * AKIŞ BİTİNCE KAYITLI HÂL OKUNUYOR: ekrandaki mesajlar akıştan biriktirildi
 * ve bir parça kaybolduysa (bozuk blok, vekil sunucu) ekran eksik kalır.
 * Sunucunun kaydı tek doğru; akış yalnız beklerken görünen hâl.
 */
export function AsistanSekmesi({
  clientId,
  clientAdi,
  ilk,
  yazabilir,
}: {
  clientId: string;
  clientAdi: string;
  ilk: OturumSonucu;
  yazabilir: boolean;
}) {
  const pathname = usePathname();
  const params = useSearchParams();
  const [oturumId, setOturumId] = useState<string | null>(ilk.durum === 'tamam' ? ilk.oturum.id : null);
  const [mesajlar, setMesajlar] = useState<AsistanMesaji[]>(ilk.durum === 'tamam' ? ilk.oturum.mesajlar : []);
  const [okumaHatasi, setOkumaHatasi] = useState<string | null>(ilk.durum === 'hata' ? ilk.mesaj : null);
  const [metin, setMetin] = useState('');
  const [akis, setAkis] = useState(false);
  const [akisSorunu, setAkisSorunu] = useState<string | null>(null);
  const [onayda, setOnayda] = useState<Oneri | null>(null);
  const [sonuclar, setSonuclar] = useState<Record<string, UygulamaSonucu>>({});
  const [vazgecilen, setVazgecilen] = useState<ReadonlySet<string>>(new Set());
  const [bagliDegil, setBagliDegil] = useState(ilk.durum === 'tamam' && ilk.oturum.asistanBagli === false);
  const kutu = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Yeni parça gelince en alta kay; kullanıcı yukarı kaydırıp okuyorsa da
    // yeni cevap görünmeli (taslak her eklemede kaydırıyor).
    kutu.current?.scrollTo({ top: kutu.current.scrollHeight });
  }, [mesajlar]);

  const kayitliOku = useCallback(async (id: string) => {
    try {
      const o = await apiFetch<AsistanOturumu>(`/iyilestir/asistan/oturumlar/${encodeURIComponent(id)}`);
      setMesajlar(o.mesajlar);
      setOkumaHatasi(null);
    } catch (e) {
      setOkumaHatasi(e instanceof ApiRequestError ? e.message : 'Bağlantı kurulamadı.');
    }
  }, []);

  function adreseYaz(id: string | null) {
    const p = new URLSearchParams(params.toString());
    p.set('sekme', 'asistan');
    if (id) p.set('oturum', id);
    else p.delete('oturum');
    /*
     * `history.replaceState`, `router.replace` DEĞİL: router sunucu
     * bileşenini yeniden çalıştırır, öneri ve kural listelerini boşuna
     * yeniden çeker ve akış sürerken bu bileşene yeni bir `ilk` verir.
     * Next.js 15 bu çağrıyı `useSearchParams` ile eşliyor.
     */
    window.history.replaceState(null, '', `${pathname}?${p}`);
  }

  function yeniSohbet() {
    setOturumId(null);
    setMesajlar([]);
    setOkumaHatasi(null);
    setAkisSorunu(null);
    adreseYaz(null);
  }

  async function gonder(soru: string) {
    const temiz = soru.trim();
    if (!temiz || akis) return;
    setAkisSorunu(null);
    let id = oturumId;
    if (!id) {
      try {
        const o = await apiFetch<OkunanOturum>('/iyilestir/asistan/oturumlar', {
          method: 'POST',
          body: JSON.stringify({ clientId }),
        });
        id = o.id;
        setOturumId(id);
        setBagliDegil(o.asistanBagli === false);
        adreseYaz(id);
      } catch (e) {
        setAkisSorunu(`Sohbet açılamadı: ${e instanceof ApiRequestError ? e.message : 'Bağlantı kurulamadı.'}`);
        return;
      }
    }
    const simdi = new Date().toISOString();
    setMesajlar((l) => [
      ...l,
      { id: `yerel-k-${l.length}`, rol: 'kullanici', parcalar: [{ tur: 'metin', metin: temiz }], zaman: simdi },
      { id: `yerel-a-${l.length}`, rol: 'asistan', parcalar: [], zaman: simdi },
    ]);
    setMetin('');
    setAkis(true);

    let res: Response;
    try {
      res = await fetch(`${API_URL}/iyilestir/asistan/oturumlar/${encodeURIComponent(id)}/mesajlar`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
        body: JSON.stringify({ metin: temiz }),
      });
    } catch {
      setAkis(false);
      setAkisSorunu('Bağlantı koptu; mesaj gönderilemedi.');
      void kayitliOku(id);
      return;
    }
    if (!res.ok || !res.body) {
      const g = (await res.json().catch(() => null)) as { message?: string } | null;
      setAkis(false);
      setAkisSorunu(g?.message ?? `Mesaj gönderilemedi (HTTP ${res.status}).`);
      void kayitliOku(id);
      return;
    }

    const okuyucu = res.body.getReader();
    const cozucu = new TextDecoder();
    let tampon = '';
    let sorun = 0;
    try {
      for (;;) {
        const { done, value } = await okuyucu.read();
        if (done) break;
        tampon += cozucu.decode(value, { stream: true });
        const r = parcalariAyikla(tampon);
        tampon = r.kalan;
        sorun += r.bozuk + r.taninmayan;
        if (r.parcalar.length > 0) {
          setMesajlar((l) => r.parcalar.reduce<AsistanMesaji[]>((acc, p) => parcaEkle(acc, p), l));
        }
        const bitti = r.bitti;
        if (bitti) setMesajlar((l) => turuBitir(l, bitti));
      }
    } catch {
      setAkisSorunu('Akış yarıda kesildi; kayıtlı hâl okunuyor.');
    } finally {
      setAkis(false);
    }
    /*
     * OKUNAMAYAN PARÇA SESSİZCE ATILMIYOR: sayısı yazılıyor ve kayıtlı hâl
     * okunuyor. Kayıt da okunamazsa üstteki hata kutusu çıkıyor.
     */
    if (sorun > 0) setAkisSorunu(`${sorun} parça okunamadı; kayıtlı hâl gösteriliyor.`);
    void kayitliOku(id);
  }

  const yaziyor = yaziyorMu(akis, mesajlar);

  return (
    <div className={i.asistan}>
      <div className={`${s.kart} ${i.sohbet}`}>
        <div className={s.kartUst}>
          <h2>AI Asistan</h2>
          <span className={i.etiket}>{clientAdi}</span>
          <span className={i.zaman}>Okur, önerir, onayınla uygular. Reklam kurmaz.</span>
          {mesajlar.length > 0 && (
            <button type="button" className={i.metin} onClick={yeniSohbet} disabled={akis}>
              Yeni sohbet
            </button>
          )}
        </div>
        <div className={i.mesajlar} ref={kutu} aria-live="polite">
          <div className={`${i.balon} ${i.o}`}>
            Merhaba. {clientAdi} reklam verilerine bakabilirim: nereye para gidiyor, ne çalışıyor, ne yoruldu. Bir
            şey değiştirmem gerekirse önce ne yapacağımı kart olarak gösteririm, sen onaylamadan hiçbir şey değişmez.
          </div>
          {bagliDegil && (
            <div className={i.balonHata} role="alert">
              Asistan şu an bağlı değil: sunucuda yapay zekâ anahtarı tanımlı değil. Sorular cevaplanamaz; öneriler
              ve kurallar çalışmaya devam ediyor.
            </div>
          )}
          {okumaHatasi && (
            <div className={i.balonHata} role="alert">
              Sohbet okunamadı: {okumaHatasi}{' '}
              {oturumId && (
                <button type="button" className={i.metin} onClick={() => void kayitliOku(oturumId)}>
                  Yeniden dene
                </button>
              )}
            </div>
          )}
          {mesajlar.map((m) =>
            m.rol === 'kullanici' ? (
              <div key={m.id} className={`${i.balon} ${i.ben}`}>
                {m.parcalar.map((p) => (p.tur === 'metin' ? p.metin : '')).join('')}
              </div>
            ) : (
              <AsistanParcalari
                key={m.id}
                mesaj={m}
                clientId={clientId}
                yazabilir={yazabilir}
                sonuclar={sonuclar}
                vazgecilen={vazgecilen}
                onUygula={setOnayda}
                onVazgec={(anahtar) => setVazgecilen((x) => new Set(x).add(`${m.id}:${anahtar}`))}
              />
            ),
          )}
          {yaziyor && (
            <div className={`${i.balon} ${i.o}`} aria-label="Asistan yazıyor">
              <span className={i.yaziyor}>
                <span />
                <span />
                <span />
              </span>
            </div>
          )}
          {akisSorunu && (
            <div className={i.balonHata} role="alert">
              {akisSorunu}
            </div>
          )}
        </div>
        <form
          className={i.yaz}
          onSubmit={(e) => {
            e.preventDefault();
            void gonder(metin);
          }}
        >
          <input
            value={metin}
            onChange={(e) => setMetin(e.target.value)}
            placeholder="Bir şey sor: “Bu hafta en çok para nereye boşa gitti?”"
            autoComplete="off"
            maxLength={2000}
            aria-label="Asistana soru"
          />
          <button className={i.birincil} type="submit" disabled={akis || metin.trim() === ''}>
            Gönder
          </button>
        </form>
      </div>

      <div className={i.yanSutun}>
        <div className={s.kart}>
          <div className={s.kartUst}>
            <h2>Sık sorulanlar</h2>
          </div>
          <div className={i.oneriSorular}>
            {SIK_SORULANLAR.map((soru) => (
              <button key={soru} type="button" onClick={() => void gonder(soru)} disabled={akis}>
                {soru}
              </button>
            ))}
          </div>
        </div>
        <div className={s.kart}>
          <div className={s.kartUst}>
            <h2>Asistan ne yapabilir?</h2>
          </div>
          <div className={i.bilgi}>
            <b>Okur:</b> özet, günlük seri, kampanya → reklam kırılımı, dönüşümler, bütçe temposu.
            <br />
            <b>Önerir ve uygular (onayla):</b> Meta ve Google’da reklam veya kampanya durdurma, bütçe değişikliği.
            <br />
            <b>Yapmaz:</b> reklam kurmaz (AdvCampaign’e devreder), LinkedIn’e yazmaz.
          </div>
        </div>
      </div>

      <OnayPenceresi
        oneri={onayda}
        onKapat={() => setOnayda(null)}
        onSonuc={(anahtar, r) => setSonuclar((x) => ({ ...x, [anahtar]: r }))}
      />
    </div>
  );
}

/**
 * Bir asistan mesajının parçaları, sırasıyla: araç izleri tek satırda
 * toplanıyor (taslaktaki `.iz`), metin balon, Uygula ve devir kartları ayrı.
 */
function AsistanParcalari({
  mesaj,
  clientId,
  yazabilir,
  sonuclar,
  vazgecilen,
  onUygula,
  onVazgec,
}: {
  mesaj: AsistanMesaji;
  clientId: string;
  yazabilir: boolean;
  sonuclar: Record<string, UygulamaSonucu>;
  vazgecilen: ReadonlySet<string>;
  onUygula: (o: Oneri) => void;
  onVazgec: (anahtar: string) => void;
}) {
  // Ardışık araç parçalarını tek iz satırında topla.
  const gruplar: Array<{ tur: 'iz'; izler: string[] } | { tur: 'parca'; parca: AsistanParcasi }> = [];
  for (const p of mesaj.parcalar) {
    const son = gruplar.at(-1);
    if (p.tur === 'arac') {
      if (son?.tur === 'iz') son.izler.push(aracIziMetni(p));
      else gruplar.push({ tur: 'iz', izler: [aracIziMetni(p)] });
    } else {
      gruplar.push({ tur: 'parca', parca: p });
    }
  }

  return (
    <>
      {gruplar.map((g, n) => {
        if (g.tur === 'iz') {
          return (
            <div key={n} className={i.iz}>
              {g.izler.map((t, k) => (
                <span key={k}>{t}</span>
              ))}
            </div>
          );
        }
        const p = g.parca;
        if (p.tur === 'metin') {
          return (
            <div key={n} className={`${i.balon} ${i.o}`}>
              {p.metin}
            </div>
          );
        }
        if (p.tur === 'hata') {
          return (
            <div key={n} className={i.balonHata} role="alert">
              {p.mesaj}
            </div>
          );
        }
        if (p.tur === 'devret') {
          return (
            <div key={n} className={i.icKart}>
              <div className={i.ust2}>
                <span className={`${i.tur} ${i.turButce}`}>AdvCampaign’e devret</span>
              </div>
              <p>“{p.istem}” isteği AdvCampaign’e hazır olarak aktarıldı. Gönderme düğmesine sen basarsın.</p>
              <div className={i.alt2}>
                <Link className={i.birincil} href={devretAdresi(clientId, p.oturumId)}>
                  AdvCampaign’de aç
                </Link>
              </div>
            </div>
          );
        }
        if (p.tur !== 'uygula_karti') return null;
        // uygula_karti
        const o = p.oneri;
        const metin = eylemMetni(o);
        const sonuc = sonuclar[o.anahtar] ?? (o.durum === 'uygulandi' ? o.uygulama : null);
        const vazgecildi = vazgecilen.has(`${mesaj.id}:${o.anahtar}`);
        return (
          <div key={n} className={i.icKart}>
            <div className={i.ust2}>
              <span className={i.tur}>Uygula kartı</span> {metin?.dugme ?? o.baslik}
            </div>
            <p>
              {o.baslik}. {metin ? `${metin.once} → ${metin.sonra}.` : ''} {o.neden}
            </p>
            <div className={i.alt2}>
              {sonuc ? (
                (() => {
                  const t = sonucMetni(sonuc, o.platform, metin?.sonra ?? null, 'az önce');
                  return (
                    <span className={`${i.durum} ${t.ton === 'uyari' ? i.durumUyari : ''}`}>
                      <i />
                      {t.metin}
                    </span>
                  );
                })()
              ) : o.durum === 'yoksayildi' ? (
                <span className={i.kisit}>Bu öneri yoksayılmış.</span>
              ) : o.eylem === null ? (
                <span className={i.kisit}>{o.kisit ?? 'Bu öneri yalnız bilgi; panelden uygulanamıyor.'}</span>
              ) : !yazabilir ? (
                <span className={i.kisit}>Uygulamak için bütçe yazma yetkisi gerekiyor. Yöneticine sor.</span>
              ) : vazgecildi ? (
                <span className={i.kisit}>Vazgeçildi; hiçbir şey değişmedi.</span>
              ) : (
                <>
                  <button type="button" className={i.birincil} onClick={() => onUygula(o)}>
                    Onayla ve uygula
                  </button>
                  <button type="button" className={i.metin} onClick={() => onVazgec(o.anahtar)}>
                    Vazgeç
                  </button>
                </>
              )}
            </div>
          </div>
        );
      })}
    </>
  );
}
