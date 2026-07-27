import "server-only";

type SupportModeBannerProps = {
  clinicName: string;
};

export function SupportModeBanner({ clinicName }: SupportModeBannerProps) {
  return (
    <aside aria-live="polite" role="status" className="border border-amber-500 p-3">
      <strong>Modo suporte — somente leitura</strong>
      <span>
        {" "}
        Clínica: {clinicName}. O acesso temporário foi validado no servidor.
      </span>
    </aside>
  );
}
