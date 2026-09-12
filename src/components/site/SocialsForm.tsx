"use client";

import { useState, useTransition } from "react";
import type { PartnerResult } from "@/lib/auth/partner-actions";
import type { PartnerSocials } from "@/lib/domain/types";

/*
 * Les comptes du partenaire, tenus par lui. L'administration peut les saisir à la
 * création, mais c'est lui qui sait son pseudo et son adresse de profil — et ce sont
 * ces informations qui figurent au contrat d'influence.
 */

const PLATFORMS = [
  { key: "ig", label: "Instagram", placeholder: "https://instagram.com/…" },
  { key: "tt", label: "TikTok", placeholder: "https://tiktok.com/@…" },
  { key: "fb", label: "Facebook", placeholder: "https://facebook.com/…" },
] as const;

const field = "w-full rounded-[10px] bg-paper px-3 py-2.5 text-[0.8125rem] font-semibold outline-none placeholder:font-medium placeholder:text-faint";

export function SocialsForm({ socials, action }: { socials: PartnerSocials; action: (fd: FormData) => Promise<PartnerResult> }) {
  const accountsInit = { ig: socials.instagram, tt: socials.tiktok, fb: socials.facebook };
  const empty = !PLATFORMS.some((p) => accountsInit[p.key].handle || accountsInit[p.key].url);
  /* Rien de renseigné : le formulaire est ouvert d'emblée, c'est la première chose à faire. */
  const [open, setOpen] = useState(empty);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const accounts = accountsInit;
  const filled = PLATFORMS.filter((p) => accounts[p.key].handle || accounts[p.key].url);

  const submit = (fd: FormData) =>
    start(async () => {
      const result = await action(fd);
      setNotice(result.ok ? result.message : result.error);
      if (result.ok) setOpen(false);
    });

  return (
    /* Tant que rien n'est renseigné, l'encart se voit : c'est une information qu'on ne
       peut obtenir que de lui, et elle sert à son contrat. Une fois rempli, il s'efface. */
    <div className={`flex flex-col gap-3 rounded-panel p-7 ${empty ? "bg-tint-sand" : "bg-white"}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div className="flex flex-col gap-1">
          <span className="text-base font-extrabold">{empty ? "Ajoutez vos réseaux" : "Vos réseaux"}</span>
          {empty && (
            <span className="text-[0.8125rem] leading-relaxed text-tint-sand-ink">
              Pseudo et adresse de vos comptes : ils figurent sur votre contrat de collaboration et nous permettent de
              retrouver vos publications. Vous seul pouvez les renseigner.
            </span>
          )}
        </div>
        {!empty && (
          <button type="button" onClick={() => setOpen((v) => !v)} className="whitespace-nowrap border-b-[1.5px] border-ink text-xs font-bold">
            {open ? "Annuler" : "Modifier"}
          </button>
        )}
      </div>

      {!open && (
        <div className="flex flex-col gap-1.5 text-[0.8125rem]">
          {filled.map((p) => {
            const a = accounts[p.key];
            return (
              <span key={p.key} className="flex flex-wrap items-baseline gap-2">
                <span className="font-bold">{p.label}</span>
                {a.handle && <span>{a.handle}</span>}
                {a.url && (
                  <a href={a.url} target="_blank" rel="noreferrer" className="truncate text-xs text-subtle underline">
                    {a.url.replace(/^https?:\/\//, "")}
                  </a>
                )}
              </span>
            );
          })}
        </div>
      )}

      {open && (
        <form action={submit} className="flex flex-col gap-3">
          {PLATFORMS.map((p) => {
            const a = accounts[p.key];
            return (
              <div key={p.key} className="grid grid-cols-[90px_1fr_1.4fr] items-center gap-2 max-[599px]:grid-cols-1">
                <span className="text-[0.8125rem] font-bold">{p.label}</span>
                <input name={`${p.key}Handle`} defaultValue={a.handle} placeholder="@pseudo" aria-label={`Pseudo ${p.label}`} className={field} />
                <input name={`${p.key}Url`} defaultValue={a.url} placeholder={p.placeholder} aria-label={`Adresse ${p.label}`} className={field} />
              </div>
            );
          })}
          <button type="submit" disabled={pending} className="w-fit rounded-pill bg-ink px-5 py-2.5 text-xs font-bold text-white disabled:opacity-50">
            {pending ? "…" : "Enregistrer"}
          </button>
        </form>
      )}

      {notice && <span className="text-xs font-semibold text-tint-green-ink">{notice}</span>}
    </div>
  );
}
