const E164_PATTERN = /^\+[1-9][0-9]{7,14}$/;
const PHONE_VISUAL_PATTERN = /^[0-9\s()+.\-]+$/;

/** Normaliza E.164 já internacional ou aplica o país padrão brasileiro. */
export function normalizeE164Phone(rawValue: string): string | null {
  if (!PHONE_VISUAL_PATTERN.test(rawValue)) return null;
  const trimmed = rawValue.trim();
  if (trimmed.startsWith("+")) {
    const international = `+${trimmed.slice(1).replace(/\D/g, "")}`;
    return E164_PATTERN.test(international) ? international : null;
  }
  return normalizeBrazilianPhone(rawValue);
}

export function normalizeBrazilianPhone(rawValue: string): string | null {
  if (!PHONE_VISUAL_PATTERN.test(rawValue)) return null;
  const digits = rawValue.replace(/\D/g, "");
  const normalized =
    digits.length === 10 || digits.length === 11
      ? `+55${digits}`
      : (digits.length === 12 || digits.length === 13) && digits.startsWith("55")
        ? `+${digits}`
        : null;
  return normalized && E164_PATTERN.test(normalized) ? normalized : null;
}

export function normalizeEmail(rawValue: string): string | null {
  const normalized = rawValue.trim().toLowerCase();
  if (
    normalized.length > 320 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)
  ) {
    return null;
  }
  return normalized;
}

export function normalizeContactMethod(
  kind: "phone" | "email",
  rawValue: string,
): string | null {
  return kind === "phone"
    ? normalizeBrazilianPhone(rawValue)
    : normalizeEmail(rawValue);
}
