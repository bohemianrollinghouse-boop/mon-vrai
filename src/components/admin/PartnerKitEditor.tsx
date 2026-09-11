"use client";

import { useState, useTransition } from "react";
import { Input } from "@/components/admin/ui";
import type { AdminResult } from "@/lib/admin/types";

/*
 * Kit de communication : la liste des fichiers proposés aux partenaires. Les fichiers
 * eux-mêmes vivent dans la médiathèque — on colle ici l'adresse copiée depuis Médias,
 * plutôt que d'ouvrir un second espace de stockage à tenir à jour.
 */
type Row = { name: string; meta: string; url: string };

export function PartnerKitEditor({ initial, action }: { initial: Row[]; action: (fd: FormData) => Promise<AdminResult> }) {
  const [rows, setRows] = useState<Row[]>(initial.length > 0 ? initial : [{ name: "", meta: "", url: "" }]);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  const set = (i: number, patch: Partial<Row>) => setRows(rows.map((r, k) => (k === i ? { ...r, ...patch } : r)));

  const save = () =>
    start(async () => {
      const fd = new FormData();
      fd.set("kit", JSON.stringify(rows.filter((r) => r.name.trim() && r.url.trim())));
      const result = await action(fd);
      setNotice({ ok: result.ok, text: result.ok ? (result.message ?? "Enregistré.") : result.error });
    });

  return (
    <div className="flex flex-col gap-2.5">
      {rows.map((row, i) => (
        <div key={i} className="grid grid-cols-[1fr_1fr_1.4fr_auto] items-center gap-2 max-[899px]:grid-cols-1">
          <Input value={row.name} onChange={(e) => set(i, { name: e.target.value })} placeholder="Visuels des 9 imagiers" aria-label="Nom" className="!rounded-xl !py-2.5 !text-[0.8125rem]" />
          <Input value={row.meta} onChange={(e) => set(i, { meta: e.target.value })} placeholder="PNG fond transparent · 12 Mo" aria-label="Détail" className="!rounded-xl !py-2.5 !text-[0.8125rem]" />
          <Input value={row.url} onChange={(e) => set(i, { url: e.target.value })} placeholder="Adresse copiée depuis Médias" aria-label="Adresse du fichier" className="!rounded-xl !py-2.5 !text-[0.8125rem]" />
          <button type="button" onClick={() => setRows(rows.filter((_, k) => k !== i))} aria-label="Retirer" className="px-2 text-xs font-bold text-accent">
            ✕
          </button>
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => setRows([...rows, { name: "", meta: "", url: "" }])} className="rounded-pill bg-paper px-3.5 py-2 text-xs font-bold">
          + Ajouter un fichier
        </button>
        <button type="button" onClick={save} disabled={pending} className="rounded-pill bg-ink px-3.5 py-2 text-xs font-bold text-on-ink disabled:opacity-50">
          {pending ? "…" : "Enregistrer le kit"}
        </button>
        {notice && <span className={`text-xs font-semibold ${notice.ok ? "text-tint-green-ink" : "text-danger"}`}>{notice.text}</span>}
      </div>
      <span className="text-[0.6875rem] leading-relaxed text-subtle">
        Déposez d'abord les fichiers dans Médias, puis collez leur adresse ici. Ils apparaissent dans l'espace de tous
        les partenaires.
      </span>
    </div>
  );
}
