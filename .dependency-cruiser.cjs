/**
 * Regras de fronteira arquitetural (ADR-003, ADR-009, ADR-012).
 * Executadas no CI; violação = falha de pipeline.
 * Documentação: docs/architecture/module-boundaries.md
 */
module.exports = {
  forbidden: [
    {
      name: "no-circular",
      severity: "error",
      comment: "Dependências circulares são proibidas (module-boundaries §3).",
      from: {},
      to: { circular: true },
    },
    {
      name: "no-cross-module-internals",
      severity: "error",
      comment:
        "Um módulo não pode importar internals de outro módulo — apenas o index.ts público (ADR-003).",
      from: { path: "^src/modules/([^/]+)/" },
      to: {
        path: "^src/modules/",
        pathNot: ["^src/modules/$1/", "^src/modules/[^/]+/index\\.ts$"],
      },
    },
    {
      name: "only-module-public-api",
      severity: "error",
      comment:
        "app/ e shared/ só podem importar a interface pública (index.ts) de um módulo (ADR-003).",
      from: { path: "^src/(app|shared)/" },
      to: {
        path: "^src/modules/[^/]+/.+",
        pathNot: "^src/modules/[^/]+/index\\.ts$",
      },
    },
    {
      name: "shared-must-not-depend-on-modules",
      severity: "error",
      comment:
        "shared/ é transversal e não pode depender de módulos de domínio (module-boundaries §5).",
      from: { path: "^src/shared/" },
      to: { path: "^src/modules/" },
    },
    {
      name: "modules-must-not-depend-on-app",
      severity: "error",
      comment: "Módulos de domínio não podem importar rotas/UI de app/ (ADR-003).",
      from: { path: "^src/modules/" },
      to: { path: "^src/app/" },
    },
    {
      name: "db-sdk-only-in-shared-db",
      severity: "error",
      comment:
        "O SDK do Supabase só pode ser importado em shared/db e shared/auth (ADR-002).",
      from: { pathNot: "^src/shared/(db|auth)/" },
      to: { path: "node_modules/@supabase" },
    },
    {
      name: "queue-sdk-only-in-shared-queue",
      severity: "error",
      comment: "O SDK da fila (QStash/Upstash) só pode ser importado em shared/queue (ADR-009).",
      from: { pathNot: "^src/shared/queue/" },
      to: { path: "node_modules/@upstash" },
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    exclude: { path: "\\.next|node_modules|coverage" },
    tsConfig: { fileName: "tsconfig.json" },
    tsPreCompilationDeps: true,
    enhancedResolveOptions: {
      exportsFields: ["exports"],
      conditionNames: ["import", "require", "node", "default", "types"],
      mainFields: ["module", "main", "types", "typings"],
    },
    reporterOptions: {
      dot: { collapsePattern: "node_modules/(?:@[^/]+/[^/]+|[^/]+)" },
    },
  },
};
