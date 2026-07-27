import "server-only";

type SupportModeBannerProps = {
  clinicName: string;
  expiresAt: string;
};

export function SupportModeBanner({
  clinicName,
  expiresAt,
}: SupportModeBannerProps) {
  return (
    <aside aria-live="polite" role="status" className="border border-amber-500 p-3">
      <strong>Modo suporte — somente leitura</strong>
      <span>
        {" "}
        Clínica: {clinicName}. Acesso temporário até {expiresAt}.
      </span>
    </aside>
  );
}
