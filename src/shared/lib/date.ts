const dateTimeFormatters = new Map<string, Intl.DateTimeFormat>();

export function formatClinicDateTime(value: string, timeZone: string): string {
  let formatter = dateTimeFormatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("pt-BR", {
      dateStyle: "short",
      timeStyle: "short",
      timeZone,
    });
    dateTimeFormatters.set(timeZone, formatter);
  }
  return formatter.format(new Date(value));
}
