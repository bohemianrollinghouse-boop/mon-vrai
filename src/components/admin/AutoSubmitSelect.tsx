"use client";

/*
 * Liste déroulante qui envoie son formulaire dès qu'on change de valeur, comme
 * AutoSubmitSwitch pour les interrupteurs : dans un tableau, un bouton « Enregistrer »
 * par ligne serait plus encombrant que la donnée qu'il enregistre.
 */
export function AutoSubmitSelect({
  name,
  label,
  defaultValue,
  options,
  className = "",
}: {
  name: string;
  label: string;
  defaultValue: string;
  options: { value: string; label: string }[];
  className?: string;
}) {
  return (
    <select
      name={name}
      aria-label={label}
      defaultValue={defaultValue}
      onChange={(e) => e.currentTarget.form?.requestSubmit()}
      className={`w-full cursor-pointer rounded-lg border border-line bg-surface px-2.5 py-2 text-xs font-bold outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ink ${className}`}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
