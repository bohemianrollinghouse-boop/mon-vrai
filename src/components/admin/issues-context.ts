"use client";

import { createContext, useContext } from "react";

/*
 * Erreurs par champ du formulaire courant, publiées par ActionForm et lues par Field.
 * Passer par un contexte plutôt qu'une fonction de rendu permet aux pages serveur
 * d'écrire leurs formulaires en JSX ordinaire : une fonction ne peut pas traverser la
 * frontière serveur → client.
 */
export const IssuesContext = createContext<Record<string, string>>({});

export function useFieldIssue(name?: string): string | undefined {
  const issues = useContext(IssuesContext);
  return name ? issues[name] : undefined;
}
