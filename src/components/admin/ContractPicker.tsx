"use client";

import { useState } from "react";

/*
 * Choix du contrat d'un partenaire, et réglage de ses variables POUR LUI.
 *
 * Les valeurs du contrat servent de point de départ ; ce qui est modifié ici ne vaut
 * que pour ce partenaire. Une valeur laissée telle quelle n'est pas recopiée sur sa
 * fiche : elle continue de suivre le contrat, de sorte qu'en corrigeant un délai dans
 * le contrat on le corrige pour tous ceux qui ne l'avaient pas ajusté.
 *
 * Le composant est client parce que la liste des variables dépend du contrat choisi :
 * changer de contrat doit remplacer les champs sans recharger la page.
 */

export type ContractChoice = {
  id: string;
  label: string;
  /** Variables à remplir pour ce contrat, dans l'ordre d'apparition. */
  keys: string[];
  /** Valeurs par défaut, celles du contrat. */
  defaults: Record<string, string>;
};

export function ContractPicker({
  contracts,
  initialId,
  overrides,
  fieldClassName,
  labelClassName,
}: {
  contracts: ContractChoice[];
  initialId: string;
  /** Ce qui a déjà été ajusté pour ce partenaire. */
  overrides: Record<string, string>;
  fieldClassName: string;
  labelClassName: string;
}) {
  const [id, setId] = useState(initialId);
  const current = contracts.find((c) => c.id === id);

  return (
    <div className="flex flex-col gap-3">
      <label className="flex flex-col gap-1.5">
        <span className={labelClassName}>Contrat à signer</span>
        <select name="contractId" value={id} onChange={(e) => setId(e.target.value)} className={fieldClassName}>
          <option value="">Aucun</option>
          {contracts.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
        <span className="text-[0.6875rem] text-subtle">Vide : aucun contrat exigé avant le kit.</span>
      </label>

      {current && current.keys.length > 0 && (
        <div className="flex flex-col gap-2 rounded-xl bg-paper p-3">
          <span className="text-xs font-semibold text-subtle">Réglages de ce contrat, pour ce partenaire</span>
          {current.keys.map((key) => {
            const base = current.defaults[key] ?? "";
            const value = overrides[key] ?? base;
            const adjusted = overrides[key] !== undefined && overrides[key] !== base;
            return (
              <label key={key} className="flex flex-col gap-1">
                <span className="flex items-baseline justify-between gap-2">
                  <span className="font-mono text-[0.6875rem] text-faint">{key}</span>
                  {adjusted && <span className="text-[0.625rem] font-bold text-tint-sand-ink">ajusté</span>}
                </span>
                {/* La valeur du contrat voyage avec le champ : l'action ne conserve que
                    ce qui en diffère, pour que le reste continue de suivre le contrat. */}
                <input type="hidden" name={`cbase:${key}`} value={base} />
                <input
                  name={`cvar:${key}`}
                  defaultValue={value}
                  key={`${id}-${key}`}
                  placeholder={base || "non défini"}
                  className="w-full rounded-lg border border-line bg-surface px-2.5 py-2 text-[0.8125rem]"
                />
              </label>
            );
          })}
          <span className="text-[0.6875rem] leading-relaxed text-subtle">
            Laissez une valeur telle quelle pour qu&apos;elle continue de suivre le contrat. Vidée, la rubrique disparaît
            du contrat — sauf si elle est marquée « à faire figurer » dans la fiche du contrat.
          </span>
        </div>
      )}
    </div>
  );
}
