import { describe, expect, it } from 'vitest';
import { butceKapsami } from './butce-adresi';

describe('butceKapsami (Genel Bakış bütçe kartı)', () => {
  const A = { id: 'a' };
  const B = { id: 'b' };
  it('KRİTİK: şirket geneli + tek workspace → o workspace (kart kaybolmuyordu)', () => {
    expect(butceKapsami({ ajansGorunumu: false, activeClientId: null, workspaceler: [A] })).toEqual({ tur: 'workspace', id: 'a' });
  });
  it('seçili workspace önce gelir', () => {
    expect(butceKapsami({ ajansGorunumu: false, activeClientId: 'b', workspaceler: [A, B] })).toEqual({ tur: 'workspace', id: 'b' });
  });
  it('şirket geneli + çok workspace → kart nedenini söyler', () => {
    expect(butceKapsami({ ajansGorunumu: false, activeClientId: null, workspaceler: [A, B] })).toEqual({ tur: 'secimGerekli' });
  });
  it('ajans görünümünde ya da workspace yokken kart yok', () => {
    expect(butceKapsami({ ajansGorunumu: true, activeClientId: 'a', workspaceler: [A] })).toEqual({ tur: 'yok' });
    expect(butceKapsami({ ajansGorunumu: false, activeClientId: null, workspaceler: [] })).toEqual({ tur: 'yok' });
  });
});
