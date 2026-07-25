const INTERNAL_ORIGIN = "https://internal.invalid";
const MAX_DECODE_PASSES = 3;

function decodeRepeatedly(value: string): string | null {
  let decoded = value;
  try {
    for (let pass = 0; pass < MAX_DECODE_PASSES; pass += 1) {
      const next = decodeURIComponent(decoded);
      if (next === decoded) break;
      decoded = next;
    }
    return decoded;
  } catch {
    return null;
  }
}

/**
 * Aceita somente caminhos internos absolutos. Protocolos, barras duplas,
 * barras invertidas, caracteres de controle e variantes codificadas caem no
 * fallback neutro.
 */
export function safeInternalRedirect(
  candidate: string | null | undefined,
  fallback = "/",
): string {
  if (!candidate) return fallback;

  const decoded = decodeRepeatedly(candidate.trim());
  if (
    !decoded ||
    !decoded.startsWith("/") ||
    decoded.startsWith("//") ||
    decoded.includes("\\") ||
    /[\u0000-\u001f\u007f]/.test(decoded)
  ) {
    return fallback;
  }

  try {
    const parsed = new URL(decoded, INTERNAL_ORIGIN);
    if (parsed.origin !== INTERNAL_ORIGIN) return fallback;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return fallback;
  }
}
