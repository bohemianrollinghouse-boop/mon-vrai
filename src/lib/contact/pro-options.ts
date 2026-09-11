/*
 * Choix proposés par le formulaire professionnel. Dans leur propre module : un fichier
 * « use server » ne peut exporter que des fonctions asynchrones, et ces listes sont
 * lues à la fois par le formulaire (client) et par la validation (serveur).
 */
export const PRO_KINDS = ["Crèche / micro-crèche", "Assistante maternelle", "Librairie / boutique", "PMI / structure médico-sociale", "Orthophoniste", "Autre"] as const;
export const PRO_INTERESTS = ["Équiper ma structure", "Revendre les livres", "Co-création / retours terrain", "Autre"] as const;
