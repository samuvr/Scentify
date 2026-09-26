import { describe, expect, it } from 'vitest';
import { masVotadas } from '@/dominio/votos';

const voto = (pct: number) => ({ votos: null, anchura: null, pct });

describe('marcar según Fragrantica', () => {
  it('en las estaciones propone las que se acercan a la más votada', () => {
    expect(
      masVotadas({ INVIERNO: voto(40), OTONO: voto(35), PRIMAVERA: voto(15), VERANO: voto(10) }),
    ).toEqual(['INVIERNO', 'OTONO']);
  });

  it('en día/noche una minoría clara no entra, un empate sí', () => {
    expect(masVotadas({ DIA: voto(70), NOCHE: voto(30) })).toEqual(['DIA']);
    expect(masVotadas({ DIA: voto(55), NOCHE: voto(45) })).toEqual(['DIA', 'NOCHE']);
  });

  it('sin votos no propone nada', () => {
    expect(masVotadas(null)).toEqual([]);
    expect(masVotadas({ DIA: voto(0), NOCHE: voto(0) })).toEqual([]);
  });
});
