/**
 * Contrato de navegação do shell da clínica. Somente rotas já entregues
 * aparecem aqui — funcionalidades futuras entram junto com a implementação.
 */
export type NavIconName =
  | "overview"
  | "today"
  | "agenda"
  | "financeiro"
  | "pipeline"
  | "leads"
  | "contacts"
  | "team"
  | "settings"
  | "account"
  | "security";

export type NavItem = {
  readonly label: string;
  readonly href: string;
  readonly icon: NavIconName;
};

/**
 * Pipelines exibidos como sub-itens de "Pipeline". A aplicação ainda expõe
 * apenas o pipeline padrão; a lista existe para receber múltiplos pipelines
 * quando o contrato de backend correspondente for entregue.
 */
export type PipelineNavItem = {
  readonly id: string;
  readonly name: string;
  readonly href: string;
};
