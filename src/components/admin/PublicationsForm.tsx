import { ActionForm } from "@/components/admin/ActionForm";
import { savePublicationsAction } from "@/lib/admin/actions/campaigns";
import type { PublicationSlot } from "@/lib/admin/publications";

/*
 * Ce qui a paru, à cocher.
 *
 * Le même formulaire sert à deux endroits — la fiche d'une participation et le suivi
 * des campagnes —, et il n'y a aucune raison qu'ils se comportent différemment : une
 * case cochée ici doit valoir une case cochée là. D'où un seul composant, et une seule
 * action.
 *
 * La liste vient du contrat (voir `publicationSlots`) ; on ne fait ici que la
 * constater. L'adresse coche la case d'elle-même : on oublie de cocher, on ne colle pas
 * un lien par distraction.
 */
export function PublicationsForm({ campaignId, slots, hint = true }: { campaignId: string; slots: PublicationSlot[]; hint?: boolean }) {
  return (
    <ActionForm action={savePublicationsAction} submitLabel="Enregistrer les parutions">
      <input type="hidden" name="campaignId" value={campaignId} />
      {hint && (
        <p className="-mt-1 text-[0.6875rem] leading-relaxed text-subtle">
          Cochez ce qui est paru, et collez l&apos;adresse dessous. Une adresse suffit : elle coche la case d&apos;elle-même,
          puisqu&apos;on ne colle pas un lien par distraction.
        </p>
      )}
      <div className="flex flex-col gap-1.5">
        {slots.map((slot) => (
          <div key={slot.key} className="flex flex-col gap-2 rounded-xl bg-paper px-3 py-2.5">
            <label className="flex items-center gap-2.5">
              {/* Champ caché + case, sous le même nom : décochée, la case ne poste rien,
                  et rien ne dirait qu'on l'a décochée. */}
              <input type="hidden" name={`done:${slot.key}`} value="false" />
              <input type="checkbox" name={`done:${slot.key}`} value="true" defaultChecked={slot.done} className="h-4 w-4 accent-black" />
              <span className="text-[0.8125rem] font-semibold">
                {slot.label}
                {slot.qty > 1 && (
                  <span className="font-normal text-subtle">
                    {" "}
                    · {slot.index + 1} sur {slot.qty}
                  </span>
                )}
              </span>
              {slot.at && (
                <span className="ml-auto text-[0.625rem] font-semibold text-subtle">
                  {new Date(slot.at).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}
                </span>
              )}
            </label>
            <span className="flex items-center gap-2">
              <input
                name={`url:${slot.key}`}
                defaultValue={slot.url}
                placeholder="https://www.tiktok.com/@…"
                inputMode="url"
                className="min-w-0 flex-1 rounded-lg bg-surface px-3 py-2 text-[0.75rem] outline-none"
              />
              {slot.url && (
                <a href={slot.url} target="_blank" rel="noreferrer" className="shrink-0 text-[0.6875rem] font-bold underline">
                  Voir
                </a>
              )}
            </span>
          </div>
        ))}
      </div>
    </ActionForm>
  );
}
