'use client';

import Link from 'next/link';
import { useState } from 'react';
import {
  KALEM_AKTARIM_ENGEL_METNI,
  REHBER_ALAN_ETIKETI,
  STRATEJI_REHBER_ESLEMESI,
  stratejiUcYolu,
  type KalemAktarimKarari,
  type Permission,
  type StratejiKalemi,
} from '@advetics/shared';
import { baglanti } from '@/lib/baglanti';
import { Dugme } from '@/components/ui/dugme';
import { PlanGerceklesenTablosu } from './belge';
import { PLATFORM_ADI, amacAdi, kalemDurumSatirlari, konumOzeti, onayCumlesi, tarihAraligi, yasMetni } from './hesap';
import { Bildirim, Kart, Nokta, Rozet, yaz } from './ortak';
import { Tutar } from './tutar';
import type { AktarimOnizlemesi, StratejiAktarimSonucu, Gerceklesen, StratejiDetayi } from '@advetics/shared';

type Onizleme = { tur: 'veri'; v: AktarimOnizlemesi } | { tur: 'hata'; mesaj: string } | { tur: 'onaysiz' };

/** Kalemin aktarım satırı: KARAR SUNUCUNUN (`kalemAktarimEngeli`, servisle aynı fonksiyon). */
export function aktarimSatiri(k: Pick<StratejiKalemi, 'durum'>, karar: KalemAktarimKarari | null): { secilebilir: boolean; durum: 'hazir' | 'acildi' | 'bekliyor' | 'bilinmiyor'; neden: string | null } {
  if (k.durum.tur === 'aktarildi') return { secilebilir: false, durum: 'acildi', neden: null };
  if (!karar) return { secilebilir: false, durum: 'bilinmiyor', neden: 'Aktarım önizlemesi bu kalemi içermiyor.' };
  if (karar.tur === 'engel') return { secilebilir: false, durum: karar.engel === 'zaten_aktarildi' ? 'acildi' : 'bekliyor', neden: KALEM_AKTARIM_ENGEL_METNI[karar.engel] };
  return { secilebilir: true, durum: 'hazir', neden: null };
}

/**
 * ═══ EKRAN (c) — ADVCAMPAIGN'E AKTAR ═══
 *
 * Aktarım reklam KURMAZ, para harcamaz: her kalem AdvCampaign'de dolu bir
 * rehber TASLAĞI olarak açılır; yayın her zamanki gibi rehberin onay
 * penceresinde. Bekleyen kalem NEDENİYLE yazılı ve seçilemez (aktarılamayan
 * seçenek gösterilmez); düşecek platform da sebebiyle (sessiz düşme yok).
 *
 * Sonuç kalem kalem: açılan rehbere bağlantı, açılamayanın nedeni, motorun
 * notları ("başlangıç geçmişte, yarın yazıldı"). "Aktarıldı" yazısı ancak
 * sunucu rehber kimliği döndürdüğünde: v1'in ölü aktarımı (ff83c662)
 * "aktarıldı" deyip hiçbir yerde taslak açmıyordu.
 */
export function AktarimEkrani({
  detay,
  onizleme,
  gerceklesen,
  izinler,
  yenile,
  tazeSurum,
}: {
  detay: StratejiDetayi;
  onizleme: Onizleme;
  gerceklesen: { tur: 'veri'; v: Gerceklesen } | { tur: 'hata'; mesaj: string } | null;
  izinler: readonly Permission[];
  yenile: () => Promise<unknown>;
  tazeSurum: () => Promise<number | null>;
}) {
  const { plan, kalemler } = detay;
  const para = plan.paraBirimi;
  const karar = (id: string) => (onizleme.tur === 'veri' ? (onizleme.v.kalemler.find((x) => x.kalemId === id) ?? null) : null);
  const satirlar = kalemler.map((k) => ({ k, o: karar(k.id), s: aktarimSatiri(k, karar(k.id)?.karar ?? null) }));
  const [secili, setSecili] = useState<Set<string>>(() => new Set(satirlar.filter((x) => x.s.secilebilir).map((x) => x.k.id)));
  const [odak, setOdak] = useState<string | null>(kalemler[0]?.id ?? null);
  const [suruyor, setSuruyor] = useState(false);
  const [sonuc, setSonuc] = useState<{ tur: 'veri'; v: StratejiAktarimSonucu } | { tur: 'hata'; mesaj: string } | null>(null);
  const bulkIzni = izinler.includes('bulk.write');
  const seciliSayi = satirlar.filter((x) => x.s.secilebilir && secili.has(x.k.id)).length;
  const bekleyen = satirlar.filter((x) => x.s.durum === 'bekliyor').length;
  const odakSatiri = satirlar.find((x) => x.k.id === odak) ?? null;

  async function aktar() {
    setSuruyor(true);
    setSonuc(null);
    const kalemIdleri = satirlar.filter((x) => x.s.secilebilir && secili.has(x.k.id)).map((x) => x.k.id);
    const r = await yaz<StratejiAktarimSonucu>(stratejiUcYolu('/strateji/v2/planlar/:id/aktar', { id: plan.id }), 'POST', { surum: plan.surum, kalemIdleri }, tazeSurum, plan.surum);
    setSuruyor(false);
    setSonuc(r.tur === 'tamam' ? { tur: 'veri', v: r.veri } : { tur: 'hata', mesaj: r.mesaj });
    if (r.tur === 'tamam') await yenile();
  }

  const rehberAdresi = (rehberId: string) => baglanti('/reklam', { musteri: plan.clientId, rehber: rehberId });

  return (
    <div className="space-y-4">
      <p className="m-0 text-sm text-ink-muted">
        {plan.onay ? <Rozet ton="dolu">{onayCumlesi(plan.onay)}</Rozet> : <Rozet>Onaylanmadı</Rozet>}
      </p>
      <Bildirim baslik="Aktarım reklam kurmaz, para harcamaz.">
        Her kampanya AdvCampaign'de dolu bir taslak olarak açılır; yayına alma her zamanki gibi orada, son kontrol ve onayla.
      </Bildirim>

      {onizleme.tur === 'onaysiz' && (
        <Bildirim baslik="Strateji onaylanınca aktarılabilir.">
          {plan.durum === 'onaylandi' ? 'Onaydan sonra strateji değişti; yeniden onaylanmalı.' : 'Müşteri hesabı ya da ajans (müşteri hesabı adına) onaylayınca kampanyalar burada taslak olarak açılır.'}
        </Bildirim>
      )}
      {onizleme.tur === 'hata' && <Bildirim hata baslik={`Aktarım önizlemesi alınamadı: ${onizleme.mesaj}`} />}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_23.75rem]">
        <Kart>
          <div className="overflow-x-auto" role="region" aria-label="Aktarılacak kampanyalar" tabIndex={0}>
            <table className="w-full border-collapse text-[13px]">
              <thead>
                <tr className="border-b border-line text-left text-xs text-ink-muted">
                  <th className="w-8 px-2.5 py-2" />
                  <th className="px-2.5 py-2 font-semibold">Kampanya</th>
                  <th className="px-2.5 py-2 font-semibold">AdvCampaign'de</th>
                  <th className="hidden px-2.5 py-2 font-semibold md:table-cell">Taşınan</th>
                  <th className="px-2.5 py-2 font-semibold">Durum</th>
                </tr>
              </thead>
              <tbody>
                {satirlar.map(({ k, o, s }) => (
                  <tr key={k.id} className={`cursor-pointer border-b border-line align-top hover:bg-surface-muted ${odak === k.id ? 'bg-surface-muted' : ''}`} aria-selected={odak === k.id} onClick={() => setOdak(k.id)}>
                    <td className="px-2.5 py-2.5">
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-[#ff2400]"
                        aria-label={`${amacAdi(k.amac)} kampanyasını seç`}
                        disabled={!s.secilebilir}
                        checked={s.secilebilir && secili.has(k.id)}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) =>
                          setSecili((x) => {
                            const y = new Set(x);
                            if (e.target.checked) y.add(k.id);
                            else y.delete(k.id);
                            return y;
                          })
                        }
                      />
                    </td>
                    <td className="px-2.5 py-2.5">
                      <b>{amacAdi(k.amac)}</b>
                      <span className="block text-xs text-ink-muted">
                        <Tutar micros={k.butceMicros} para={para} /> · {[k.meta && 'Meta', k.google && 'Google'].filter(Boolean).join(' + ')}
                      </span>
                    </td>
                    <td className="px-2.5 py-2.5">
                      {o?.karar.tur === 'aktarilabilir' ? (
                        <span className="text-xs text-ink-muted">
                          {(['meta', 'google'] as const)
                            .filter((p) => k[p])
                            .map((p) => `${PLATFORM_ADI[p]} ${o.karar.tur === 'aktarilabilir' && o.karar.platformlar[p] ? 'açık' : 'açılmayacak'}`)
                            .join(' · ')}
                          {o.karar.dusenler.map((d) => (
                            <span key={d.platform} className="block">
                              {PLATFORM_ADI[d.platform]}: {d.sebep}
                            </span>
                          ))}
                        </span>
                      ) : k.durum.tur === 'aktarildi' ? (
                        <Link href={rehberAdresi(k.durum.rehberId)} className="text-xs font-semibold text-brand-strong underline-offset-2 hover:underline">
                          Rehberde aç
                        </Link>
                      ) : (
                        <span className="text-xs text-ink-muted">-</span>
                      )}
                    </td>
                    <td className="hidden px-2.5 py-2.5 md:table-cell">
                      {o?.karar.tur === 'aktarilabilir' ? `${STRATEJI_REHBER_ESLEMESI.length} alan${k.kelimeGrubu ? ' + kelimeler' : ''}` : '-'}
                    </td>
                    <td className="px-2.5 py-2.5">
                      {s.durum === 'acildi' ? (
                        kalemDurumSatirlari(k.durum).map((d, i) => (
                          <span key={i} className="flex items-center gap-1.5">
                            <Nokta ton={d.nokta} />
                            {d.metin}
                          </span>
                        ))
                      ) : s.durum === 'hazir' ? (
                        <>
                          <span className="font-semibold text-ok">Hazır</span>
                          {o && o.rehberdeTamamlanacak.length > 0 && <span className="block text-[11px] text-ink-muted">Rehberde {o.rehberdeTamamlanacak.length} eksik: {o.rehberdeTamamlanacak.map((a) => REHBER_ALAN_ETIKETI[a]).join(', ')}</span>}
                        </>
                      ) : (
                        <>
                          <span className="font-semibold text-brand-strong">{s.durum === 'bekliyor' ? 'Bekliyor' : 'Bilinmiyor'}</span>
                          {s.neden && <span className="block text-[11px] text-ink-muted">{s.neden}</span>}
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center gap-2.5 border-t border-line p-4">
            <span className="text-xs text-ink-muted">
              {seciliSayi} kampanya aktarılacak{bekleyen > 0 ? ` · ${bekleyen} bekliyor (nedeniyle)` : ''}
            </span>
            {bulkIzni ? (
              <Dugme className="ml-auto" onClick={() => void aktar()} bekliyor={suruyor} disabled={seciliSayi === 0 || onizleme.tur !== 'veri'}>
                {seciliSayi > 0 ? `${seciliSayi} taslak aç` : 'Taslak aç'}
              </Dugme>
            ) : (
              <span className="ml-auto text-xs text-ink-muted">Taslak açmak reklam oluşturma yetkisi ister; bu hesapta yok.</span>
            )}
          </div>
          {sonuc && <AktarimSonucKutusu sonuc={sonuc} kalemler={kalemler} rehberAdresi={rehberAdresi} />}
        </Kart>

        <aside>
          <Kart className="p-4" etiket="Ne taşınıyor">
            {odakSatiri ? <EslemePaneli k={odakSatiri.k} notlar={odakSatiri.o?.notlar ?? []} para={para} /> : <p className="m-0 text-sm text-ink-muted">Kampanya yok.</p>}
          </Kart>
        </aside>
      </div>

      <Kart>
        <div className="p-4 pb-2">
          <b className="text-sm">Plan ve gerçekleşen</b>
          <div className="text-xs text-ink-muted">Aktarımdan sonra raporun son bölümü bunu gösterir.</div>
        </div>
        <div className="px-4 pb-4">
          {gerceklesen === null ? (
            <p className="m-0 text-sm text-ink-muted">Strateji onaylanınca görünür.</p>
          ) : gerceklesen.tur === 'hata' ? (
            <p className="m-0 text-sm text-brand-strong" role="alert">
              Gerçekleşen veri alınamadı: {gerceklesen.mesaj}
            </p>
          ) : (
            <div className="text-ink">
              <PlanGerceklesenTablosu veri={detay} g={gerceklesen.v} />
            </div>
          )}
        </div>
      </Kart>
    </div>
  );
}

/** Seçili kalemde rehbere ne gidiyor: stratejiden yazılan, rehberde tamamlanacak. */
function EslemePaneli({ k, notlar, para }: { k: StratejiKalemi; notlar: string[]; para: string }) {
  const satir = (ad: string, deger: React.ReactNode, rozet: string | null) => (
    <tr key={ad} className="border-b border-line">
      <td className="whitespace-nowrap py-1.5 pr-2 text-xs text-ink-muted">{ad}</td>
      <td className="py-1.5 pr-2 text-xs">{deger}</td>
      <td className="py-1.5 text-right">{rozet && <Rozet>{rozet}</Rozet>}</td>
    </tr>
  );
  return (
    <>
      <b className="text-sm">{amacAdi(k.amac)} · ne taşınıyor</b>
      <p className="m-0 mb-2.5 mt-1 text-xs text-ink-muted">"Stratejiden" kaynağıyla yazılır; AdvCampaign'de değiştirirsen senin kararın olur.</p>
      <table className="w-full border-collapse">
        <tbody>
          {satir('Amaç', amacAdi(k.amac), 'Stratejiden')}
          {satir('Platformlar', [k.meta && 'Meta', k.google && 'Google'].filter(Boolean).join(', '), 'Stratejiden')}
          {satir('Bütçe', <><Tutar micros={k.butceMicros} para={para} /> toplam</>, 'Stratejiden')}
          {satir('Tarih', tarihAraligi(k.baslangic, k.bitis), 'Stratejiden')}
          {satir('Bölge', konumOzeti(k.konumlar), 'Stratejiden')}
          {k.yasMin !== null && satir('Yaş', yasMetni(k.yasMin, k.yasMax), 'Stratejiden')}
          {satir('Metin', k.metin ? (k.metin.kaynak === 'ajans' ? `${k.metin.basliklar.length} başlık, ana metin` : 'Öneri olarak; rehberde onaylanır') : 'Rehberde yazılacak', k.metin ? (k.metin.kaynak === 'ajans' ? 'Stratejiden' : 'Öneri') : null)}
          {k.kelimeGrubu && satir('Kelimeler', k.kelimeGrubu, 'Stratejiden')}
          {satir('Görseller', k.varliklar.length > 0 ? `${k.varliklar.length} görsel${k.varliklar.some((v) => v.silinmis) ? ' (silinmiş var)' : ''}` : 'Rehberde seçilecek', k.varliklar.length > 0 ? 'Base' : null)}
          {satir('Reklam hesabı, sayfa', 'Workspace ayarından', 'Workspace')}
        </tbody>
      </table>
      <p className="m-0 mt-2 text-[11px] text-ink-muted">Kreatif yönergesi ve kitle tarifi AdvCampaign'de "Stratejiden" kutusunda görünür; reklam alanı değildir. Bütçe ve hukuk sözü (özel kategori, promosyon) rehberde senin elinle verilir.</p>
      {notlar.length > 0 && (
        <ul className="m-0 mt-2 list-disc pl-4 text-[11px] text-ink-muted">
          {notlar.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      )}
    </>
  );
}

function AktarimSonucKutusu({ sonuc, kalemler, rehberAdresi }: { sonuc: { tur: 'veri'; v: StratejiAktarimSonucu } | { tur: 'hata'; mesaj: string }; kalemler: StratejiKalemi[]; rehberAdresi: (id: string) => string }) {
  if (sonuc.tur === 'hata') {
    return (
      <div className="p-4 pt-0">
        <Bildirim hata baslik={`Aktarılamadı: ${sonuc.mesaj}`} />
      </div>
    );
  }
  const acilan = sonuc.v.kalemler.filter((x) => x.tur === 'acildi').length;
  const ad = (id: string) => {
    const k = kalemler.find((x) => x.id === id);
    return k ? amacAdi(k.amac) : 'Kampanya';
  };
  return (
    <div className="p-4 pt-0">
      <Bildirim hata={acilan === 0} baslik={`${acilan} taslak açıldı${sonuc.v.kalemler.length > acilan ? `, ${sonuc.v.kalemler.length - acilan} açılamadı` : ''}.`}>
        <ul className="m-0 mt-1 list-none space-y-1 p-0">
          {sonuc.v.kalemler.map((x) => (
            <li key={x.kalemId}>
              <b className="text-ink">{ad(x.kalemId)}:</b>{' '}
              {x.tur === 'acildi' ? (
                <Link href={rehberAdresi(x.rehberId)} className="font-semibold text-brand-strong underline-offset-2 hover:underline">
                  AdvCampaign'de aç
                </Link>
              ) : (
                KALEM_AKTARIM_ENGEL_METNI[x.engel]
              )}
              {x.notlar.map((n) => (
                <span key={n} className="block text-[11px]">
                  {n}
                </span>
              ))}
            </li>
          ))}
        </ul>
      </Bildirim>
    </div>
  );
}
