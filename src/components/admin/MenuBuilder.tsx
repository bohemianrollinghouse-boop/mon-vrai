"use client";

import { useState } from "react";
import { ActionForm } from "./ActionForm";
import { Button, Input, Select } from "./ui";
import type { AdminResult } from "@/lib/admin/types";
import type { FooterColumn, MenuItem, MenuTarget } from "@/lib/domain/types";
import { SYSTEM_PAGES } from "@/lib/domain/system-pages";

/*
 * Éditeur de menus. Deux formes : une liste plate (en-tête) ou des colonnes titrées
 * (pied de page). Chaque entrée a un libellé et une cible : page système, page libre
 * ou URL. Les pages légales et « Notre histoire » sont désormais des pages libres.
 * La structure est envoyée en JSON à l'action serveur, qui la revalide avec les
 * schémas du domaine.
 */

export type TargetOptions = {
  pages: { slug: string; title: string }[];
};

type Kind = MenuTarget["kind"];

function defaultTarget(kind: Kind, opts: TargetOptions): MenuTarget {
  switch (kind) {
    case "system":
      return { kind, key: "home" };
    case "page":
      return { kind, slug: opts.pages[0]?.slug ?? "" };
    case "url":
      return { kind, href: "https://", newTab: true };
  }
}

function newItem(opts: TargetOptions): MenuItem {
  return { id: `m_${Math.random().toString(36).slice(2, 10)}`, label: "", target: defaultTarget("system", opts) };
}

function ItemRow({ item, opts, onChange, onRemove, onMove }: { item: MenuItem; opts: TargetOptions; onChange: (i: MenuItem) => void; onRemove: () => void; onMove: (d: -1 | 1) => void }) {
  const t = item.target;
  return (
    <div className="grid grid-cols-[1fr_130px_1fr_auto] items-center gap-2 rounded-xl bg-paper p-2 max-[749px]:grid-cols-1">
      <Input value={item.label} onChange={(e) => onChange({ ...item, label: e.target.value })} placeholder="Libellé" aria-label="Libellé" />
      <Select value={t.kind} onChange={(e) => onChange({ ...item, target: defaultTarget(e.target.value as Kind, opts) })} aria-label="Type de cible">
        <option value="system">Page système</option>
        <option value="page">Page libre</option>
        <option value="url">URL</option>
      </Select>
      {t.kind === "system" && (
        <Select value={t.key} onChange={(e) => onChange({ ...item, target: { kind: "system", key: e.target.value as typeof t.key } })} aria-label="Page système">
          {Object.entries(SYSTEM_PAGES).map(([key, p]) => (
            <option key={key} value={key}>
              {p.label} • {p.path}
            </option>
          ))}
        </Select>
      )}
      {t.kind === "page" && (
        <Select value={t.slug} onChange={(e) => onChange({ ...item, target: { kind: "page", slug: e.target.value } })} aria-label="Page libre">
          {opts.pages.length === 0 && <option value="">(aucune page publiée)</option>}
          {opts.pages.map((p) => (
            <option key={p.slug} value={p.slug}>
              {p.title}
            </option>
          ))}
        </Select>
      )}
      {t.kind === "url" && (
        <div className="flex items-center gap-2">
          <Input value={t.href} onChange={(e) => onChange({ ...item, target: { ...t, href: e.target.value } })} placeholder="https://…" aria-label="URL" />
          <label className="flex items-center gap-1.5 whitespace-nowrap text-xs font-semibold">
            <input type="checkbox" checked={t.newTab} onChange={(e) => onChange({ ...item, target: { ...t, newTab: e.target.checked } })} className="accent-ink" />
            Nouvel onglet
          </label>
        </div>
      )}
      <div className="flex gap-1">
        <Button type="button" tone="secondary" onClick={() => onMove(-1)} aria-label="Monter" className="px-2.5">
          ↑
        </Button>
        <Button type="button" tone="secondary" onClick={() => onMove(1)} aria-label="Descendre" className="px-2.5">
          ↓
        </Button>
        <Button type="button" tone="danger" onClick={onRemove} aria-label="Retirer" className="px-2.5">
          ×
        </Button>
      </div>
    </div>
  );
}

function move<T>(arr: T[], i: number, d: -1 | 1): T[] {
  const j = i + d;
  if (j < 0 || j >= arr.length) return arr;
  const copy = [...arr];
  [copy[i], copy[j]] = [copy[j], copy[i]];
  return copy;
}

export function HeaderMenuBuilder({ initial, opts, action }: { initial: MenuItem[]; opts: TargetOptions; action: (fd: FormData) => Promise<AdminResult> }) {
  const [items, setItems] = useState<MenuItem[]>(initial);
  return (
    <ActionForm action={action} submitLabel="Enregistrer le menu d'en-tête">
      <input type="hidden" name="items" value={JSON.stringify(items)} readOnly />
      <div className="flex flex-col gap-2">
        {items.map((it, i) => (
          <ItemRow
            key={it.id}
            item={it}
            opts={opts}
            onChange={(n) => setItems(items.map((x) => (x.id === it.id ? n : x)))}
            onRemove={() => setItems(items.filter((x) => x.id !== it.id))}
            onMove={(d) => setItems(move(items, i, d))}
          />
        ))}
        {items.length < 8 && (
          <Button type="button" tone="secondary" onClick={() => setItems([...items, newItem(opts)])} className="self-start">
            + Ajouter une entrée
          </Button>
        )}
      </div>
    </ActionForm>
  );
}

export function FooterMenuBuilder({ initial, opts, action }: { initial: FooterColumn[]; opts: TargetOptions; action: (fd: FormData) => Promise<AdminResult> }) {
  const [cols, setCols] = useState<FooterColumn[]>(initial);
  const update = (id: string, patch: Partial<FooterColumn>) => setCols(cols.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  return (
    <ActionForm action={action} submitLabel="Enregistrer le pied de page">
      <input type="hidden" name="columns" value={JSON.stringify(cols)} readOnly />
      <div className="flex flex-col gap-5">
        {cols.map((col, ci) => (
          <div key={col.id} className="flex flex-col gap-3 rounded-card border border-line p-4">
            <div className="flex items-center gap-2">
              <Input value={col.heading} onChange={(e) => update(col.id, { heading: e.target.value })} placeholder="Titre de la colonne" aria-label="Titre de la colonne" className="max-w-xs font-bold" />
              <Button type="button" tone="secondary" onClick={() => setCols(move(cols, ci, -1))} className="px-2.5" aria-label="Monter la colonne">↑</Button>
              <Button type="button" tone="secondary" onClick={() => setCols(move(cols, ci, 1))} className="px-2.5" aria-label="Descendre la colonne">↓</Button>
              <Button type="button" tone="danger" onClick={() => setCols(cols.filter((c) => c.id !== col.id))} className="px-2.5" aria-label="Supprimer la colonne">×</Button>
            </div>
            <div className="flex flex-col gap-2">
              {col.items.map((it, i) => (
                <ItemRow
                  key={it.id}
                  item={it}
                  opts={opts}
                  onChange={(n) => update(col.id, { items: col.items.map((x) => (x.id === it.id ? n : x)) })}
                  onRemove={() => update(col.id, { items: col.items.filter((x) => x.id !== it.id) })}
                  onMove={(d) => update(col.id, { items: move(col.items, i, d) })}
                />
              ))}
              {col.items.length < 10 && (
                <Button type="button" tone="secondary" onClick={() => update(col.id, { items: [...col.items, newItem(opts)] })} className="self-start">
                  + Ajouter un lien
                </Button>
              )}
            </div>
          </div>
        ))}
        {cols.length < 3 && (
          <Button type="button" tone="secondary" onClick={() => setCols([...cols, { id: `c_${Math.random().toString(36).slice(2, 8)}`, heading: "", items: [] }])} className="self-start">
            + Ajouter une colonne
          </Button>
        )}
      </div>
    </ActionForm>
  );
}
