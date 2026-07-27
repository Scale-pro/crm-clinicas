import { Button } from "./button";

type SelectableClinic = {
  readonly id: string;
  readonly name: string;
};

export function ClinicSelector({
  action,
  activeClinicId,
  clinics,
}: {
  action: (formData: FormData) => void | Promise<void>;
  activeClinicId?: string;
  clinics: readonly SelectableClinic[];
}) {
  return (
    <form action={action} className="flex flex-col gap-2 sm:flex-row sm:items-end">
      <label className="grid min-w-0 flex-1 gap-1 text-sm" htmlFor="active-clinic">
        Clínica de trabalho
        <select
          id="active-clinic"
          name="clinicId"
          defaultValue={activeClinicId}
          className="h-9 w-full rounded-md border bg-background px-3 text-sm"
          required
        >
          <option value="" disabled>Selecione uma clínica</option>
          {clinics.map((clinic) => (
            <option key={clinic.id} value={clinic.id}>{clinic.name}</option>
          ))}
        </select>
      </label>
      <input type="hidden" name="next" value="/app" />
      <Button type="submit" variant="outline">Trocar</Button>
    </form>
  );
}
