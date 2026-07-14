import { createRng, randRange } from "./rng.js";
import type { FuncionalIterationMetrics, PersonSeries, QaIterationMetrics } from "../types.js";

export interface PersonaDefinition {
  personId: string;
  name: string;
  role: "qa" | "funcional";
  seed: string;
  /** -1 a 1: o quanto essa persona melhora ao longo das iteracoes (trend sintetica ilustrativa). */
  trend: number;
}

export const QA_PERSONAS: PersonaDefinition[] = [
  { personId: "qa-camila", name: "Camila Nunes (QA)", role: "qa", seed: "camila-qa", trend: 0.8 },
  { personId: "qa-bruno", name: "Bruno Alves (QA)", role: "qa", seed: "bruno-qa", trend: 0.1 },
];

export const FUNCIONAL_PERSONAS: PersonaDefinition[] = [
  { personId: "func-renata", name: "Renata Ferraz (Funcional)", role: "funcional", seed: "renata-func", trend: 0.6 },
  { personId: "func-diego", name: "Diego Prado (Funcional)", role: "funcional", seed: "diego-func", trend: -0.3 },
];

function progressFactor(iteration: number, totalIterations: number, trend: number): number {
  const t = totalIterations <= 1 ? 0 : iteration / (totalIterations - 1);
  return t * trend;
}

export function generateQaMetrics(persona: PersonaDefinition, totalIterations: number): QaIterationMetrics[] {
  const rng = createRng(persona.seed);
  const metrics: QaIterationMetrics[] = [];

  for (let i = 0; i < totalIterations; i++) {
    const progress = progressFactor(i, totalIterations, persona.trend);
    const escapedDefects = Math.max(0, Math.round(randRange(rng, 4, 9) * (1 - progress) - progress));
    const bugsFound = Math.round(randRange(rng, 6, 14) * (1 + progress * 0.4));
    const testCasesWritten = Math.round(randRange(rng, 5, 12) * (1 + progress * 0.5));
    const reviewComments = Math.round(randRange(rng, 4, 10) * (1 + progress * 0.3));
    const avgReviewTurnaroundHours = Number(
      Math.max(2, randRange(rng, 6, 20) * (1 - progress * 0.5)).toFixed(1),
    );

    metrics.push({ bugsFound, escapedDefects, testCasesWritten, reviewComments, avgReviewTurnaroundHours });
  }

  return metrics;
}

export function generateFuncionalMetrics(
  persona: PersonaDefinition,
  totalIterations: number,
): FuncionalIterationMetrics[] {
  const rng = createRng(persona.seed);
  const metrics: FuncionalIterationMetrics[] = [];

  for (let i = 0; i < totalIterations; i++) {
    const progress = progressFactor(i, totalIterations, persona.trend);
    const requirementsWritten = Math.round(randRange(rng, 3, 8) * (1 + progress * 0.3));
    const clarificationRequests = Math.max(0, Math.round(randRange(rng, 2, 7) * (1 - progress)));
    const reworkCausedPct = Number(Math.max(0, randRange(rng, 8, 25) * (1 - progress)).toFixed(1));
    const stakeholderApprovalDays = Number(Math.max(0.5, randRange(rng, 1, 4) * (1 - progress * 0.4)).toFixed(1));

    metrics.push({ requirementsWritten, clarificationRequests, reworkCausedPct, stakeholderApprovalDays });
  }

  return metrics;
}

export type PersonaOutput = Pick<PersonSeries, "personId" | "name" | "role" | "origin">;
