"use client";

import Image from "next/image";
import { useState, useTransition } from "react";
import type { PartnerResult } from "@/lib/auth/partner-actions";
import type { PartnerContest } from "@/lib/db/partner";

/*
 * Un concours vu par le créateur qui le monte avec nous.
 *
 * Trois choses, et pas une de plus : ce qui est convenu (le lot, les dates, ce qu'il
 * doit demander à sa communauté), le gagnant qu'il déclare, et ce que sa publication a
 * donné. Le reste — à qui le colis part vraiment, ce qu'il coûte — ne le regarde pas.
 *
 * Les deux formulaires restent repliés tant qu'on ne s'en sert pas : la plupart des
 * visites servent à relire la mécanique avant de publier, pas à saisir quoi que ce soit.
 */

const field =
  "w-full rounded-[10px] bg-paper px-3 py-2.5 text-[0.8125rem] font-semibold outline-none placeholder:font-medium placeholder:text-faint";

const day = (ts: number) => new Date(ts).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });

export function ContestPanel({
  contests,
  declare,
  report,
}: {
  contests: PartnerContest[];
  declare: (fd: FormData) => Promise<PartnerResult>;
  report: (fd: FormData) => Promise<PartnerResult>;
}) {
  if (contests.length === 0) return null;
  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex flex-col gap-0.5">
        <span className="text-[0.6875rem] font-bold uppercase tracking-[0.12em] text-subtle">Vos concours</span>
        <h2 className="text-[1.375rem] font-extrabold tracking-[-0.01em]">
          {contests.length === 1 ? "Un jeu monté avec vous" : `${contests.length} jeux montés avec vous`}
        </h2>
      </div>
      {contests.map((c) => (
        <ContestCard key={c.id} contest={c} declare={declare} report={report} />
      ))}
    </div>
  );
}

function ContestCard({
  contest: c,
  declare,
  report,
}: {
  contest: PartnerContest;
  declare: (fd: FormData) => Promise<PartnerResult>;
  report: (fd: FormData) => Promise<PartnerResult>;
}) {
  const [open, setOpen] = useState<"" | "winner" | "report">("");
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  const submit = (action: (fd: FormData) => Promise<PartnerResult>) => (fd: FormData) =>
    start(async () => {
      const result = await action(fd);
      setNotice(result.ok ? { ok: true, text: result.message } : { ok: false, text: result.error });
      if (result.ok) setOpen("");
    });

  const books = c.prize.items.reduce((n, i) => n + i.qty, 0);
  const tone = c.state === "live" ? "bg-tint-green text-tint-green-ink" : c.state === "drawing" ? "bg-tint-sand text-tint-sand-ink" : "bg-paper text-subtle";

  return (
    <div className="flex flex-col gap-3 rounded-card bg-surface p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2.5">
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="text-sm font-extrabold">{c.name}</span>
          <span className="text-xs text-subtle">
            {c.platform} · du {day(c.startAt)} au {day(c.endAt)}
          </span>
        </span>
        <span className={`whitespace-nowrap rounded-pill px-2.5 py-[5px] text-[0.6875rem] font-bold ${tone}`}>{c.stateLabel}</span>
      </div>

      {/* ---------- Ce qui est en jeu ---------- */}
      <div className="flex flex-col gap-2">
        <span className="text-xs font-bold">
          {books > 0 ? `${books} imagier${books > 1 ? "s" : ""} à gagner` : "Le lot"}
          {c.winnersWanted > 1 && ` · ${c.winnersWanted} gagnants`}
        </span>
        {c.prize.items.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {c.prize.items.map((i) =>
              i.image ? (
                <Image key={i.slug} src={i.image} alt={i.title} width={44} height={44} className="h-11 w-11 rounded-[10px] bg-white object-cover" />
              ) : (
                <span key={i.slug} className="h-11 w-11 rounded-[10px] bg-paper" />
              ),
            )}
          </div>
        )}
        {c.prize.extra && <span className="text-xs leading-[1.5] text-muted">Et aussi : {c.prize.extra}</span>}
      </div>

      {c.mechanic && (
        <div className="flex flex-col gap-1 rounded-[14px] bg-paper px-4 py-3">
          <span className="text-[0.6875rem] font-bold uppercase tracking-[0.1em] text-subtle">À demander à votre communauté</span>
          <span className="whitespace-pre-line text-xs leading-[1.6]">{c.mechanic}</span>
        </div>
      )}

      {c.rules && (
        <details className="flex flex-col">
          <summary className="w-fit cursor-pointer list-none border-b-[1.5px] border-ink text-xs font-bold [&::-webkit-details-marker]:hidden">
            Lire le règlement
          </summary>
          <p className="whitespace-pre-line pt-2 text-xs leading-[1.6] text-muted">{c.rules}</p>
        </details>
      )}

      {/* ---------- Le gagnant ---------- */}
      {c.mine.length > 0 && (
        <div className="flex flex-col gap-1 border-t border-line-soft pt-3">
          <span className="text-xs font-bold">Votre gagnant{c.mine.length > 1 ? "s" : ""}</span>
          {c.mine.map((w) => (
            <span key={w.id} className="text-xs text-muted">
              <strong className="text-ink">{w.handle || w.name}</strong> · {w.sent ? "lot expédié" : "lot en préparation"}
            </span>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 border-t border-line-soft pt-3">
        {c.canDeclare ? (
          <button
            type="button"
            onClick={() => setOpen((v) => (v === "winner" ? "" : "winner"))}
            className="rounded-pill bg-ink px-[1.125rem] py-2.5 text-xs font-bold text-white hover:opacity-80"
          >
            {open === "winner" ? "Annuler" : "Déclarer le gagnant"}
          </button>
        ) : (
          <span className="text-xs text-subtle">
            {c.seatsLeft === 0 ? "Tous les lots ont trouvé preneur." : "Le concours n'a pas encore commencé."}
          </span>
        )}
        <button type="button" onClick={() => setOpen((v) => (v === "report" ? "" : "report"))} className="border-b-[1.5px] border-ink text-xs font-bold">
          {open === "report" ? "Annuler" : "Vos chiffres"}
        </button>
        {c.seatsLeft > 0 && c.winnersWanted > 1 && (
          <span className="text-[0.6875rem] text-subtle">
            {c.seatsLeft} lot{c.seatsLeft > 1 ? "s" : ""} encore à attribuer, tous créateurs confondus
          </span>
        )}
      </div>

      {open === "winner" && (
        <form action={submit(declare)} className="flex flex-col gap-2.5 border-t border-line-soft pt-3">
          <input type="hidden" name="contestId" value={c.id} />
          <span className="text-xs leading-[1.5] text-muted">
            Son pseudo, puis où lui envoyer son lot. Demandez-lui ces informations en message privé — nous ne les
            utilisons que pour le colis.
          </span>
          <div className="grid grid-cols-2 gap-2 max-[599px]:grid-cols-1">
            <input name="handle" required maxLength={80} placeholder="@son.pseudo" aria-label="Pseudo du gagnant" className={field} />
            <input name="name" required maxLength={120} placeholder="Nom et prénom" aria-label="Nom et prénom" className={field} />
          </div>
          <input name="email" type="email" required maxLength={160} placeholder="Son e-mail" aria-label="E-mail du gagnant" className={field} />
          <input name="line1" required maxLength={160} placeholder="Adresse" aria-label="Adresse" className={field} />
          <input name="line2" maxLength={160} placeholder="Complément (facultatif)" aria-label="Complément d'adresse" className={field} />
          <div className="grid grid-cols-[110px_1fr_90px] gap-2 max-[599px]:grid-cols-1">
            <input name="postalCode" required maxLength={12} placeholder="Code postal" aria-label="Code postal" className={field} />
            <input name="city" required maxLength={80} placeholder="Ville" aria-label="Ville" className={field} />
            <input name="country" maxLength={2} defaultValue="FR" placeholder="FR" aria-label="Pays" className={field} />
          </div>
          <input name="phone" maxLength={30} placeholder="Téléphone (facultatif)" aria-label="Téléphone" className={field} />
          <button type="submit" disabled={pending} className="w-fit rounded-pill bg-ink px-[1.125rem] py-2.5 text-xs font-bold text-white disabled:opacity-50">
            {pending ? "…" : "Déclarer ce gagnant"}
          </button>
        </form>
      )}

      {open === "report" && (
        <form action={submit(report)} className="flex flex-col gap-2.5 border-t border-line-soft pt-3">
          <input type="hidden" name="contestId" value={c.id} />
          <span className="text-xs leading-[1.5] text-muted">
            Ce que votre publication a donné. Ces chiffres ne nous parviennent pas autrement — vous seul les voyez.
          </span>
          <input name="postUrl" defaultValue={c.report.postUrl} maxLength={300} placeholder="Adresse de votre publication" aria-label="Adresse de votre publication" className={field} />
          <div className="grid grid-cols-2 gap-2 max-[599px]:grid-cols-1">
            <label className="flex flex-col gap-1">
              <span className="text-[0.6875rem] font-bold text-subtle">Participants</span>
              <input name="participants" type="number" min={0} defaultValue={c.report.participants} className={field} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[0.6875rem] font-bold text-subtle">Abonnés gagnés</span>
              <input name="followers" type="number" defaultValue={c.report.followers} className={field} />
            </label>
          </div>
          <button type="submit" disabled={pending} className="w-fit rounded-pill bg-ink px-[1.125rem] py-2.5 text-xs font-bold text-white disabled:opacity-50">
            {pending ? "…" : "Enregistrer"}
          </button>
        </form>
      )}

      {notice && <span className={`text-xs font-semibold ${notice.ok ? "text-tint-green-ink" : "text-danger"}`}>{notice.text}</span>}
    </div>
  );
}
