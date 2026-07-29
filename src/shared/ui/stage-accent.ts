const OPEN_ACCENTS = [
  "var(--stage-1)",
  "var(--stage-2)",
  "var(--stage-3)",
  "var(--stage-4)",
  "var(--stage-5)",
  "var(--stage-6)",
  "var(--stage-7)",
] as const;

/**
 * Acento visual determinístico de uma etapa. É apenas reforço: etapas ganha e
 * perdida também são identificadas por texto na interface.
 */
export function stageAccent(stageKind: string, index = 0): string {
  if (stageKind === "won") return "var(--stage-won)";
  if (stageKind === "lost") return "var(--stage-lost)";
  return OPEN_ACCENTS[((index % OPEN_ACCENTS.length) + OPEN_ACCENTS.length) % OPEN_ACCENTS.length]!;
}
