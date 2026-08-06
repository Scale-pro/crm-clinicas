import { formatBrlFromCents } from "@/shared/lib/currency";

import type { HourlyPoint } from "./agenda-view-model";

/**
 * "Resumo do dia": atendimentos e recebimentos por hora.
 *
 * SVG próprio, sem biblioteca de gráficos: são duas séries curtas em uma grade
 * fixa, e uma dependência de runtime não se paga aqui. O desenho é decorativo
 * (`aria-hidden`) e os números ficam disponíveis para leitores de tela em uma
 * tabela equivalente — o gráfico nunca é a única forma de ler o dado (ADR-011).
 */
export function DayChart({ points }: { points: readonly HourlyPoint[] }) {
  if (points.length < 2) {
    return <p className="text-sm text-muted-foreground">
      Sem variação suficiente no dia para desenhar o resumo por hora.
    </p>;
  }

  const width = 100;
  const height = 36;
  const maxAppointments = Math.max(1, ...points.map((point) => point.appointments));
  const maxSettled = Math.max(1, ...points.map((point) => point.settledCents));
  const stepX = width / (points.length - 1);

  const line = (value: (point: HourlyPoint) => number, max: number) => points
    .map((point, index) => {
      const x = index * stepX;
      const y = height - (value(point) / max) * (height - 4) - 2;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");

  const appointmentsLine = line((point) => point.appointments, maxAppointments);
  const settledLine = line((point) => point.settledCents, maxSettled);

  return <figure className="m-0">
    <svg
      aria-hidden="true"
      className="h-40 w-full"
      preserveAspectRatio="none"
      role="presentation"
      viewBox={`0 0 ${width} ${height}`}
    >
      {[0.25, 0.5, 0.75].map((ratio) => <line
        key={ratio}
        stroke="currentColor"
        strokeDasharray="1 2"
        strokeWidth="0.2"
        x1="0"
        x2={width}
        y1={height * ratio}
        y2={height * ratio}
        className="text-border"
      />)}
      <polyline
        className="text-accent/40"
        fill="none"
        points={settledLine}
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="0.8"
        vectorEffect="non-scaling-stroke"
      />
      <polyline
        className="text-accent"
        fill="none"
        points={appointmentsLine}
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.6"
        vectorEffect="non-scaling-stroke"
      />
    </svg>

    <div aria-hidden="true" className="mt-1 flex justify-between text-[0.6875rem] text-muted-foreground">
      {points.map((point) => <span key={point.label}>{point.label}</span>)}
    </div>

    <figcaption className="mt-2 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
      <span className="inline-flex items-center gap-1.5">
        <span aria-hidden="true" className="h-0.5 w-4 rounded-full bg-accent" />
        Atendimentos
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span aria-hidden="true" className="h-0.5 w-4 rounded-full bg-accent/40" />
        Recebimentos
      </span>
    </figcaption>

    <table className="sr-only">
      <caption>Atendimentos e recebimentos por hora</caption>
      <thead>
        <tr><th scope="col">Hora</th><th scope="col">Atendimentos</th><th scope="col">Recebido</th></tr>
      </thead>
      <tbody>
        {points.map((point) => <tr key={point.label}>
          <th scope="row">{point.label}</th>
          <td>{point.appointments}</td>
          <td>{formatBrlFromCents(point.settledCents)}</td>
        </tr>)}
      </tbody>
    </table>
  </figure>;
}
