import { LoadingState } from "@/shared/ui/loading-state";

export default function ClinicLoading() {
  return <LoadingState className="p-4 sm:p-5" label="Carregando área da clínica" rows={4} />;
}
