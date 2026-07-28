import { Button } from "@/shared/ui/button";

type SelectableClinic = { readonly id: string; readonly name: string };

/**
 * Troca da clínica ativa dentro do rodapé da sidebar. A seleção é apenas
 * contexto de navegação: o servidor revalida o vínculo a cada requisição.
 */
export function SidebarClinicSwitcher({ action, activeClinicId, clinics }: {
  action: (formData: FormData) => void | Promise<void>;
  activeClinicId: string;
  clinics: readonly SelectableClinic[];
}) {
  return <form action={action} className="flex items-end gap-2">
    <label className="min-w-0 flex-1 text-xs text-sidebar-muted-foreground" htmlFor="sidebar-active-clinic">
      Clínica ativa
      <select
        className="mt-1 h-8 w-full truncate rounded-md border border-sidebar-border bg-sidebar-hover px-2 text-sm text-sidebar-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sidebar-ring"
        defaultValue={activeClinicId}
        id="sidebar-active-clinic"
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
