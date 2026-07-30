import { cn } from "@/shared/lib/utils";

/**
 * Estado real de "ainda não conectado". É diferente de vazio (não sabemos se há
 * dados) e de erro (nada falhou): a área de operações da clínica só passa a
 * carregar e gravar quando o contrato de backend correspondente existir.
 *
 * Enquanto isso a interface diz exatamente isso, sem exibir dados fictícios nem
 * oferecer ações que não gravariam nada.
 */
export function IntegrationPendingState({ subject, className }: {
  /** Assunto na primeira pessoa do plural do texto: "os profissionais". */
  subject: string;
  className?: string;
}) {
  return <section
    aria-live="polite"
    className={cn(
      "flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-surface p-8 text-center",
      className,
    )}
    role="status"
  >
    <h2 className="text-sm font-medium text-foreground">Cadastro ainda não disponível</h2>
    <p className="max-w-md text-sm text-muted-foreground">
      A tela para gerenciar {subject} já está pronta, mas o cadastro ainda não está conectado.
      Nenhum dado é exibido ou gravado até a liberação — assim nada aparece aqui por engano.
    </p>
  </section>;
}
