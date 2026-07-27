import { Skeleton } from "@/shared/ui/skeleton";

export default function ClinicLoading() {
  return <div className="space-y-4" role="status" aria-label="Carregando área da clínica"><Skeleton className="h-8 w-48" /><Skeleton className="h-40 w-full" /></div>;
}
