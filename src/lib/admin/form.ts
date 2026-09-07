import type { ZodType } from "zod";

/*
 * Passerelle entre un formulaire HTML et un schéma zod.
 *
 * Les champs sont nommés en chemin : `hero.heading`, `tiles[0].title`,
 * `items[]` (répété). formToObject reconstruit l'objet imbriqué ; le schéma fait le
 * reste (types, bornes, valeurs par défaut). Les cases à cocher absentes valent false
 * si elles sont déclarées dans `booleans`, les nombres sont convertis si déclarés
 * dans `numbers`.
 */

export type FormShape = {
  booleans?: string[];
  numbers?: string[];
};

type Nested = Record<string, unknown>;

export function formToObject(formData: FormData, shape: FormShape = {}): Nested {
  const out: Nested = {};

  for (const [rawKey, rawValue] of formData.entries()) {
    if (typeof rawValue !== "string") continue; // fichiers : traités à part
    if (rawKey.startsWith("$")) continue; // champs techniques (ex. $intent)
    const value = shape.numbers?.some((n) => matches(n, rawKey)) ? toNumber(rawValue) : rawValue;
    setPath(out, rawKey, value, rawKey.endsWith("[]"));
  }

  for (const b of shape.booleans ?? []) {
    if (b.includes("[") ) continue; // les booléens dans des listes se posent via la valeur "true"/"false"
    setPath(out, b, formData.get(b) === "on" || formData.get(b) === "true", false);
  }

  return out;
}

export type ParseResult<T> = { ok: true; data: T } | { ok: false; error: string; issues: Record<string, string> };

export function parseForm<T>(schema: ZodType<T>, formData: FormData, shape: FormShape = {}): ParseResult<T> {
  const result = schema.safeParse(formToObject(formData, shape));
  if (result.success) return { ok: true, data: result.data };
  const issues: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const key = issue.path.map(String).join(".");
    if (!(key in issues)) issues[key] = issue.message;
  }
  const first = result.error.issues[0];
  const where = first?.path.length ? ` (${first.path.map(String).join(".")})` : "";
  return { ok: false, error: `${first?.message ?? "Formulaire invalide"}${where}`, issues };
}

/* ---------- internes ---------- */

function toNumber(v: string): number | undefined {
  if (v.trim() === "") return undefined;
  const n = Number(v.replace(",", "."));
  return Number.isFinite(n) ? n : undefined;
}

/** `a.b[0].c` → ["a", "b", 0, "c"] ; `tags[]` → ["tags", "[]"] (ajout en fin de liste). */
function segments(path: string): (string | number)[] {
  const parts: (string | number)[] = [];
  for (const piece of path.split(".")) {
    const m = piece.match(/^([^[\]]+)((?:\[[^\]]*\])*)$/);
    if (!m) {
      parts.push(piece);
      continue;
    }
    parts.push(m[1]);
    for (const idx of m[2].matchAll(/\[([^\]]*)\]/g)) {
      parts.push(idx[1] === "" ? "[]" : Number.isInteger(Number(idx[1])) ? Number(idx[1]) : idx[1]);
    }
  }
  return parts;
}

function setPath(target: Nested, path: string, value: unknown, append: boolean): void {
  const segs = segments(path);
  let node: unknown = target;
  for (let i = 0; i < segs.length; i++) {
    const seg = segs[i];
    const last = i === segs.length - 1;
    const next = segs[i + 1];

    if (seg === "[]") {
      const arr = node as unknown[];
      if (last) arr.push(value);
      return;
    }

    const container = node as Record<string | number, unknown>;
    if (last) {
      if (append) {
        const arr = Array.isArray(container[seg]) ? (container[seg] as unknown[]) : [];
        arr.push(value);
        container[seg] = arr;
      } else {
        container[seg] = value;
      }
      return;
    }

    if (container[seg] === undefined || container[seg] === null) {
      container[seg] = typeof next === "number" || next === "[]" ? [] : {};
    }
    node = container[seg];
  }
}

function matches(pattern: string, key: string): boolean {
  if (pattern === key) return true;
  // `tiles[].price` couvre `tiles[0].price`, `tiles[12].price`…
  const re = new RegExp("^" + pattern.replace(/[.*+?^${}()|\\]/g, "\\$&").replace(/\[\]/g, "\\[\\d+\\]") + "$");
  return re.test(key);
}
