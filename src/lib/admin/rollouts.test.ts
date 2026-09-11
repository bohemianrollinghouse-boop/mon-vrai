import { describe, expect, it } from "vitest";
import { rolloutStatus, type Rollout } from "./rollouts";

const NOW = Date.UTC(2026, 8, 12, 12);
const MIN = 60_000;

const r = (suffix: string, state: string, minutesAgo: number): Rollout => ({
  name: `projects/p/locations/l/backends/b/rollouts/rollout-${suffix}`,
  state,
  createTime: new Date(NOW - minutesAgo * MIN).toISOString(),
});

describe("rolloutStatus", () => {
  it("s'en tient au plus récent, quel que soit l'ordre de la liste", () => {
    // L'API ne trie pas : le rollout en cours peut arriver n'importe où dans la page.
    const list = [r("2026-09-12-004", "SUCCEEDED", 90), r("2026-09-12-006", "PROGRESSING", 2), r("2026-09-12-005", "SUCCEEDED", 40)];
    expect(rolloutStatus(list, NOW)).toEqual({ active: true, since: NOW - 2 * MIN, what: "rollout-2026-09-12-006" });
  });

  it("ne s'agite pas quand le dernier est terminé", () => {
    for (const state of ["SUCCEEDED", "FAILED", "CANCELLED"]) {
      expect(rolloutStatus([r("2026-09-12-006", state, 1)], NOW).active).toBe(false);
    }
  });

  it("tient un état inconnu pour un déploiement en cours", () => {
    // Mieux vaut un bandeau de trop qu'une mise en ligne passée sous silence.
    expect(rolloutStatus([r("2026-09-12-006", "DEPLOYING", 1)], NOW).active).toBe(true);
    expect(rolloutStatus([r("2026-09-12-006", "QUEUED", 1)], NOW).active).toBe(true);
  });

  it("abandonne un rollout resté en cours depuis une demi-heure", () => {
    expect(rolloutStatus([r("2026-09-12-006", "PROGRESSING", 31)], NOW).active).toBe(false);
    expect(rolloutStatus([r("2026-09-12-006", "PROGRESSING", 29)], NOW).active).toBe(true);
  });

  it("ne dit rien d'une liste vide", () => {
    expect(rolloutStatus([], NOW)).toEqual({ active: false });
  });
});
