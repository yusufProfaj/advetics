import type { GeminiMesaji, GeminiParcasi } from './gemini';

/**
 * Kayıtlı sohbet satırlarından Gemini mesaj listesi.
 *
 * AdvCampaign sohbetinden (`reklam/sohbet/dongu.ts`, 2026-10-10'da API'den
 * kaldırıldı) BURAYA taşındı: İyileştir asistanı aynı kuralı kullanıyor ve
 * ikinci bir kopya doğduğu anda ayrışırdı — düşünce imzası bir tarafta
 * düşerdi.
 *
 * Yarıda kalmış bir turun son model mesajı cevapsız bir araç çağrısıyla
 * bitiyorsa ATILIR: API cevapsız `functionCall` taşıyan geçmişi reddediyor ve
 * oturum bir daha konuşamazdı. Aynı rolden ardışık mesajlar birleştirilir
 * (kesilmiş tur araç sonucuyla bitebilir, ardından kullanıcı mesajı gelir).
 * Parçaların KENDİSİNE dokunulmaz.
 */
export function modelGecmisi(satirlar: ReadonlyArray<{ rol: string; icerik: unknown }>): GeminiMesaji[] {
  const ham: GeminiMesaji[] = [];
  for (const s of satirlar) {
    if (s.rol === 'kullanici') ham.push({ role: 'user', parts: s.icerik as GeminiParcasi[] });
    else if (s.rol === 'asistan') {
      const tur = [...(s.icerik as GeminiMesaji[])];
      const son = tur.at(-1);
      if (son?.role === 'model' && son.parts.some((p) => p.functionCall)) tur.pop();
      ham.push(...tur);
    }
  }
  const sonuc: GeminiMesaji[] = [];
  for (const m of ham) {
    if (m.parts.length === 0) continue;
    const onceki = sonuc.at(-1);
    if (onceki && onceki.role === m.role) onceki.parts = [...onceki.parts, ...m.parts];
    else sonuc.push({ role: m.role, parts: [...m.parts] });
  }
  return sonuc;
}
