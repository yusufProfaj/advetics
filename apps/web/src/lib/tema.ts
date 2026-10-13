/**
 * Tema seçiminin saklama anahtarı ve ilk boyama betiği.
 *
 * AYRI DOSYADA, `'use client'` OLMADAN: kök düzen (sunucu bileşeni) betiği
 * buradan okuyor. `'use client'` taşıyan bir dosyadan dışa aktarılan bir
 * dizge sunucuda dizge değil İSTEMCİ REFERANSI olur ve `<script>`in içine
 * düz metin yerine anlamsız bir nesne basılırdı. Bileşen `components/tema.tsx`.
 */
export const TEMA_ANAHTARI = 'advetics.tema';

export const TEMA_BETIGI = `try{var t=localStorage.getItem('${TEMA_ANAHTARI}');if(t==='acik')document.documentElement.dataset.theme='light';else if(t==='koyu')document.documentElement.dataset.theme='dark';}catch(e){}`;
