import { Button } from "@/shared/ui/button";

type SelectableClinic = { readonly id: string; readonly name: string };

/**
 * Troca da clínica ativa dentro do rodapé da sidebar. A seleção é apenas
 * contexto de navegação: o servidor revalida o vínculo a cada requisição.
 */
export function SidebarClinicSwitcher({ action, activeClinicId, clinics, idPrefix }: {
  action: (formData: FormData) => void | Promise<void>;
  activeClinicId: string;
  clinics: readonly SelectableClinic[];
  /** Distingue as instâncias desktop e mobile da sidebar; o shell renderiza as
   * duas ao mesmo tempo e IDs repetidos quebrariam o vínculo com o label. */
  idPrefix: string;
}) {
  const selectId = `${idPrefix}-active-clinic`;
  return <form action={action} className="flex items-end gap-2">
    <label className="min-w-0 flex-1 text-xs text-sidebar-muted-foreground" htmlFor={selectId}>
      Clínica ativa
      <select
        className="mt-1 h-8 w-full truncate rounded-md border border-sidebar-border bg-sidebar-hover px-2 text-sm text-sidebar-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sidebar-ring"
        defaultValue={activeClinicId}
        id={selectId}
        name="clinicId"
        required
      >
        {clinics.map((clinic) => <option key={clinic.id} value={clinic.id}>{clinic.name}</option>)}
      </select>
    </label>
    <input name="next" type="hidden" value="/app" />
    <Button className="border-sidebar-border bg-transparent text-sidebar-foreground hover:bg-sidebar-hover hover:text-sidebar-foreground" size="sm" type="submit" variant="outline">Trocar</Button>
  </form>;
}
