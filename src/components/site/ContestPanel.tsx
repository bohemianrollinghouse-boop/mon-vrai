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
 * Les formulaires restent repliés tant qu'on ne s'en sert pas : la plupart des visites
 * servent à relire la mécanique avant de publier, pas à saisir quoi que ce soit.
 *
 * Un partenaire AUTONOME en monte aussi lui-même (`canCreate`) : il propose le jeu, en
 * corrige les dates et la mécanique tant qu'il court, et le retire tant que rien n'est
 * promis. Ce qu'il ne décide jamais, et qui n'a donc aucun champ ici : le LOT, qui coûte
 * du stock et du port, et la MISE EN LIGNE, qui est la validation de la maison. D'où la
 * bannière « en attente » sur ses propositions — elle dit ce qui manque, au lieu de
 * l'afficher « brouillon » sans rien expliquer.
 */

const field =
  "w-full rounded-[10px] bg-paper px-3 py-2.5 text-[0.8125rem] font-semibold outline-none placeholder:font-medium placeholder:text-faint";

const day = (ts: number) => new Date(ts).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });

/* Les réseaux où un jeu peut se tenir : les mêmes qu'en administration (ContestPlatform). */
const PLATFORMS: [string, string][] = [
  ["instagram", "Instagram"],
  ["tiktok", "TikTok"],
  ["facebook", "Facebook"],
  ["youtube", "YouTube"],
  ["site", "Le site"],
  ["other", "Ailleurs"],
];

export function ContestPanel({
  contests,
  canCreate,
  declare,
  report,
  save,
  remove,
}: {
  contests: PartnerContest[];
  /** Le partenaire monte ses propres jeux (Influencer.contestAutonomy). */
  canCreate: boolean;
  declare: (fd: FormData) => Promise<PartnerResult>;
  report: (fd: FormData) => Promise<PartnerResult>;
  save: (fd: FormData) => Promise<PartnerResult>;
  remove: (fd: FormData) => Promise<PartnerResult>;
}) {
  /* Sans concours ET sans le droit d'en monter, la section n'a rien à dire. */
  if (contests.length === 0 && !canCreate) return null;
  const own = contests.filter((c) => c.own).length;

  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex flex-col gap-0.5">
        <span className="text-[0.6875rem] font-bold uppercase tracking-[0.12em] text-subtle">Vos concours</span>
        <h2 className="text-[1.375rem] font-extrabold tracking-[-0.01em]">
          {contests.length === 0
            ? "Montez votre premier jeu"
            : contests.length === 1
              ? own === 1
                ? "Un jeu que vous avez monté"
                : "Un jeu monté avec vous"
              : `${contests.length} jeux`}
        </h2>
      </div>
      {contests.map((c) => (
        <ContestCard key={c.id} contest={c} declare={declare} report={report} save={save} remove={remove} />
      ))}
      {canCreate && <NewContestCard save={save} />}
    </div>
  );
}

/*
 * Proposer un jeu. Repliée par défaut dès qu'il en a déjà un : on revient ici pour
 * relire une mécanique bien plus souvent que pour en monter un nouveau.
 */
function NewContestCard({ save }: { save: (fd: FormData) => Promise<PartnerResult> }) {
  const [open, setOpen] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  const submit = (fd: FormData) =>
    start(async () => {
      const result = await save(fd);
      setNotice(result.ok ? { ok: true, text: result.message } : { ok: false, text: result.error });
      if (result.ok) setOpen(false);
    });

  if (!open) {
    return (
      <div className="flex flex-col gap-2 rounded-card border-2 border-dashed border-line bg-transparent p-5">
        <button type="button" onClick={() => setOpen(true)} className="w-fit rounded-pill bg-ink px-[1.125rem] py-2.5 text-xs font-bold text-white hover:opacity-80">
          Proposer un concours
        </button>
        <span className="text-xs leading-[1.5] text-muted">
          Vous dites le jeu, ses dates et ce qu&apos;il faut faire pour participer. Nous y posons le lot et le mettons en
          ligne.
        </span>
        {notice && <span className={`text-xs font-semibold ${notice.ok ? "text-tint-green-ink" : "text-danger"}`}>{notice.text}</span>}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-card bg-surface p-5">
      <span className="text-sm font-extrabold">Proposer un concours</span>
      <form action={submit} className="flex flex-col gap-2.5">
        <ContestFields />
        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" disabled={pending} className="rounded-pill bg-ink px-[1.125rem] py-2.5 text-xs font-bold text-white disabled:opacity-50">
            {pending ? "…" : "Proposer ce concours"}
          </button>
          <button type="button" onClick={() => setOpen(false)} className="border-b-[1.5px] border-ink text-xs font-bold">
            Annuler
          </button>
        </div>
      </form>
      {notice && <span className={`text-xs font-semibold ${notice.ok ? "text-tint-green-ink" : "text-danger"}`}>{notice.text}</span>}
    </div>
  );
}

/*
 * Les champs que le partenaire remplit, à la création comme à la correction — un seul
 * endroit où les changer. Ni lot ni publication : ce qui coûte à la maison ne se décide
 * pas d'ici (voir savePartnerContestAction).
 */
function ContestFields({ contest }: { contest?: PartnerContest }) {
  return (
    <>
      <div className="grid grid-cols-[1fr_140px] gap-2 max-[599px]:grid-cols-1">
        <input name="name" required maxLength={80} defaultValue={contest?.name ?? ""} placeholder="Jeu de la rentrée" aria-label="Nom du concours" className={field} />
        <select name="platform" defaultValue={contest?.form.platform ?? "instagram"} aria-label="Où il a lieu" className={field}>
          {PLATFORMS.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>
      <div className="grid grid-cols-2 gap-2 max-[599px]:grid-cols-1">
        <label className="flex flex-col gap-1">
          <span className="text-[0.6875rem] font-bold text-subtle">Ouverture</span>
          <input name="startAt" type="date" required defaultValue={contest?.form.startDay ?? ""} className={field} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[0.6875rem] font-bold text-subtle">Tirage</span>
          <input name="endAt" type="date" required defaultValue={contest?.form.endDay ?? ""} className={field} />
        </label>
      </div>
      <label className="flex flex-col gap-1">
        <span className="text-[0.6875rem] font-bold text-subtle">Ce qu&apos;il faut faire pour participer</span>
        <textarea
          name="mechanic"
          rows={3}
          maxLength={1000}
          defaultValue={contest?.mechanic ?? ""}
          placeholder="S'abonner aux deux comptes, aimer la publication, identifier une personne en commentaire."
          className={`${field} resize-y leading-[1.5]`}
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-[0.6875rem] font-bold text-subtle">Règlement (facultatif)</span>
        <textarea
          name="rules"
          rows={2}
          maxLength={2000}
          defaultValue={contest?.rules ?? ""}
          placeholder="Jeu gratuit sans obligation d'achat, ouvert en France métropolitaine…"
          className={`${field} resize-y leading-[1.5]`}
        />
      </label>
    </>
  );
}

function ContestCard({
  contest: c,
  declare,
  report,
  save,
  remove,
}: {
  contest: PartnerContest;
  declare: (fd: FormData) => Promise<PartnerResult>;
  report: (fd: FormData) => Promise<PartnerResult>;
  save: (fd: FormData) => Promise<PartnerResult>;
  remove: (fd: FormData) => Promise<PartnerResult>;
}) {
  const [open, setOpen] = useState<"" | "winner" | "report" | "edit">("");
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  const submit = (action: (fd: FormData) => Promise<PartnerResult>) => (fd: FormData) =>
    start(async () => {
      const result = await action(fd);
      setNotice(result.ok ? { ok: true, text: result.message } : { ok: false, text: result.error });
      if (result.ok) setOpen("");
    });

  const books = c.prize.items.reduce((n, i) => n + i.qty, 0);
  /* Une proposition en attente porte sa propre teinte : ce n'est ni un jeu qui court, ni rien. */
  const tone = c.awaiting
    ? "bg-tint-sand text-tint-sand-ink"
    : c.state === "live"
      ? "bg-tint-green text-tint-green-ink"
      : c.state === "drawing"
        ? "bg-tint-sand text-tint-sand-ink"
        : "bg-paper text-subtle";

  return (
    <div className="flex flex-col gap-3 rounded-card bg-surface p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2.5">
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="text-sm font-extrabold">{c.name}</span>
          <span className="text-xs text-subtle">
            {c.platform} · du {day(c.startAt)} au {day(c.endAt)}
          </span>
        </span>
        <span className={`whitespace-nowrap rounded-pill px-2.5 py-[5px] text-[0.6875rem] font-bold ${tone}`}>
          {c.awaiting ? "En attente de validation" : c.stateLabel}
        </span>
      </div>

      {/* ---------- Ce qui manque encore ---------- */}
      {c.awaiting && (
        <p className="rounded-[14px] bg-tint-sand px-4 py-3 text-xs leading-[1.6] text-tint-sand-ink">
          Votre proposition nous est parvenue. Nous y posons le lot, puis la mettons en ligne — vous la retrouverez ici
          une fois publiée, et c&apos;est alors seulement que vous pourrez y déclarer votre gagnant.
        </p>
      )}

      {/* ---------- Ce qui est en jeu ---------- */}
      <div className="flex flex-col gap-2">
        <span className="text-xs font-bold">
          {books > 0 ? `${books} imagier${books > 1 ? "s" : ""} à gagner` : c.awaiting ? "Le lot reste à poser" : "Le lot"}
          {c.winnersWanted > 1 && ` · ${c.winnersWanted} gagnants`}
        </span>
        {books === 0 && c.awaiting && <span className="text-xs leading-[1.5] text-muted">Nous choisissons les imagiers mis en jeu.</span>}
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
          /* En attente, la bannière a déjà tout dit : la redire ici ferait doublon. */
          !c.awaiting && (
            <span className="text-xs text-subtle">
              {c.seatsLeft === 0 ? "Tous les lots ont trouvé preneur." : "Le concours n'a pas encore commencé."}
            </span>
          )
        )}
        {/* Corriger le sien : ses dates, sa mécanique. Jamais son lot. */}
        {c.canEdit && (
          <button type="button" onClick={() => setOpen((v) => (v === "edit" ? "" : "edit"))} className="border-b-[1.5px] border-ink text-xs font-bold">
            {open === "edit" ? "Annuler" : "Corriger"}
          </button>
        )}
        <button type="button" onClick={() => setOpen((v) => (v === "report" ? "" : "report"))} className="border-b-[1.5px] border-ink text-xs font-bold">
          {open === "report" ? "Annuler" : "Vos chiffres"}
        </button>
        {/*
          Retirer sa proposition. Un `<form>` à part, et non un bouton du formulaire de
          correction : deux actions distinctes, et celle-ci ne doit rien enregistrer.
        */}
        {c.canDelete && (
          <form action={submit(remove)}>
            <input type="hidden" name="contestId" value={c.id} />
            <button type="submit" disabled={pending} className="text-xs font-bold text-danger disabled:opacity-50">
              Retirer
            </button>
          </form>
        )}
        {c.seatsLeft > 0 && c.winnersWanted > 1 && (
          <span className="text-[0.6875rem] text-subtle">
            {c.seatsLeft} lot{c.seatsLeft > 1 ? "s" : ""} encore à attribuer, tous créateurs confondus
          </span>
        )}
      </div>

      {open === "edit" && (
        <form action={submit(save)} className="flex flex-col gap-2.5 border-t border-line-soft pt-3">
          <input type="hidden" name="contestId" value={c.id} />
          <span className="text-xs leading-[1.5] text-muted">
            Les dates et la mécanique de votre jeu. Le lot, lui, se règle avec nous.
          </span>
          <ContestFields contest={c} />
          <button type="submit" disabled={pending} className="w-fit rounded-pill bg-ink px-[1.125rem] py-2.5 text-xs font-bold text-white disabled:opacity-50">
            {pending ? "…" : "Enregistrer"}
          </button>
        </form>
      )}

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
