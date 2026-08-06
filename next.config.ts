import type { NextConfig } from "next";

/**
 * O harness visual (`docs/runbooks/visual-harness.md`) usa a extensão
 * `dev.tsx`, registrada como extensão de página **somente em
 * desenvolvimento**. Em qualquer outro ambiente o arquivo deixa de ser uma
 * rota: não entra no build, não vira bundle e não há URL para alcançar. As
 * fixtures que ele importa saem junto, porque nada mais as referencia.
 *
 * As demais extensões repetem o padrão do Next (`tsx` para páginas e layouts,
 * `ts` para route handlers) — declará-las aqui é obrigatório, já que informar
 * `pageExtensions` substitui a lista padrão em vez de acrescentar a ela.
 */
const pageExtensions = ["tsx", "ts"];

const nextConfig: NextConfig = {
  // Runtime Node.js é o padrão do projeto (ADR-008); rotas não devem optar por
  // Edge sem decisão registrada.
  reactStrictMode: true,
  pageExtensions: process.env.NODE_ENV === "development"
    ? ["dev.tsx", ...pageExtensions]
    : pageExtensions,
};

export default nextConfig;
