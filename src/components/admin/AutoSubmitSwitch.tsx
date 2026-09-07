"use client";

/** Interrupteur qui soumet son formulaire dès qu'on le bascule (liste FAQ, sans bouton). */
export function AutoSubmitSwitch({ label, defaultChecked }: { label: string; defaultChecked: boolean }) {
  return (
    <label className="flex cursor-pointer items-center" title={label}>
      <input type="checkbox" defaultChecked={defaultChecked} aria-label={label} onChange={(e) => e.currentTarget.form?.requestSubmit()} className="peer sr-only" />
      <span
        aria-hidden="true"
        className="relative h-6 w-10 rounded-pill bg-[#ddd] transition-colors peer-checked:bg-ink peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ink after:absolute after:left-[3px] after:top-[3px] after:h-[18px] after:w-[18px] after:rounded-full after:bg-white after:transition-transform peer-checked:after:translate-x-4"
      />
    </label>
  );
}
