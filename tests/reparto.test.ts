import { describe, expect, it } from "vitest";
import { nivelDe, repartoPorContextoYMomento } from "@/dominio/reparto";
import type { PerfumeCandidato } from "@/dominio/recomendacion";

const OFICINA = "ctx-oficina";
const GIMNASIO = "ctx-gimnasio";

function perfume(
  nombre: string,
  parcial: Partial<PerfumeCandidato> = {},
): PerfumeCandidato {
  return {
    id: `id-${nombre}`,
    nombre,
    marca: "Lattafa",
    estado: "LO_TENGO",
    archivado: false,
    momentos: ["DIA"],
    contextos: [OFICINA],
    estaciones: ["OTONO"],
    ultimoUso: null,
    vecesUsado: 0,
    ...parcial,
  };
}

const CONTEXTOS = [
  { id: OFICINA, atemporal: false },
  { id: GIMNASIO, atemporal: true },
];

describe("reparto por contexto y momento", () => {
  it("cuenta día y noche por separado y el atemporal en una sola casilla", () => {
    const { casillas } = repartoPorContextoYMomento(
      [
        perfume("a"),
        perfume("b", { momentos: ["DIA", "NOCHE"] }),
        perfume("c", { contextos: [GIMNASIO], momentos: ["NOCHE"] }),
      ],
      CONTEXTOS,
    );
    expect(
      casillas.map(({ contextoId, momento, cuantos }) => [
        contextoId,
        momento,
        cuantos,
      ]),
    ).toEqual([
      [OFICINA, "DIA", 2],
      [OFICINA, "NOCHE", 1],
      [GIMNASIO, null, 1],
    ]);
  });

  it("no cuenta lo archivado ni lo que ya no tengo", () => {
    const { casillas } = repartoPorContextoYMomento(
      [perfume("a", { archivado: true }), perfume("b", { estado: "LO_TUVE" })],
      CONTEXTOS,
    );
    expect(casillas.every((c) => c.cuantos === 0 && c.nivel === "vacia")).toBe(
      true,
    );
  });

  it("marca sobrecargadas y escasas respecto a la media", () => {
    const muchos = Array.from({ length: 8 }, (_, i) => perfume(`d${i}`));
    const { casillas, media } = repartoPorContextoYMomento(
      [...muchos, perfume("n", { momentos: ["NOCHE"] })],
      [{ id: OFICINA, atemporal: false }],
    );
    expect(media).toBe(4.5);
    expect(casillas.map((c) => c.nivel)).toEqual(["sobrecargada", "escasa"]);
  });

  it("con una media baja, uno o dos más no es sobrecargar", () => {
    expect(nivelDe(3, 2)).toBe("normal");
    expect(nivelDe(4, 2)).toBe("sobrecargada");
    expect(nivelDe(1, 0.5)).toBe("escasa");
    expect(nivelDe(2, 6)).toBe("escasa");
    expect(nivelDe(3, 6)).toBe("normal");
  });
});
