# Runbook — Harness visual

- **Objetivo:** ver uma tela renderizada de verdade — em claro e escuro, em
  desktop e celular — sem depender de banco, sessão ou ambiente hospedado.
- **Escopo:** conferência de layout, densidade e acessibilidade visual durante o
  desenvolvimento. Não substitui teste automatizado nem validação com dados
  reais.
- **ADRs relacionados:** [ADR-011](../adr/ADR-011-design-system-e-acessibilidade.md)
  (design system, contraste, dark mode), [ADR-012](../adr/ADR-012-seguranca-por-fase-e-governanca.md).
- **Última revisão:** 2026-08-06.

## Por que existe

Rodar a aplicação de verdade exige Docker, stack Supabase local e uma base com
clínica, profissionais e procedimentos cadastrados. Quando nada disso está
disponível — e nem sempre está — não havia como olhar para uma tela antes de
abrir PR. Erros de layout que só aparecem renderizados (texto cortado, bloco
sem altura, contraste ruim no tema escuro) passavam direto por `lint`,
`typecheck` e testes.

O harness renderiza os componentes de apresentação com props fixas, num
navegador real, e não pede banco nem login.

## O que ele NÃO é

- **Não é fonte de dados do produto.** As fixtures são dados fictícios de
  conferência de layout. Nenhuma tela real consome nada daqui.
- **Não vai para produção.** Ver "Isolamento" abaixo.
- **Não valida regra de negócio.** Autorização, RLS, multi-tenant e fuso
  continuam sendo responsabilidade dos testes de integração (`pnpm test:db`).

## Isolamento

Três camadas, para que o harness não possa vazar para o produto:

1. **Não é rota fora de desenvolvimento.** A página é `page.dev.tsx`, e
   `dev.tsx` só entra em `pageExtensions` quando `NODE_ENV === "development"`
   (`next.config.ts`). Em build de produção o arquivo não é uma rota: não
   compila como página, não vira bundle e não há URL que o alcance.
2. **As fixtures saem junto.** O único arquivo que as importa é a própria
   página. Sem rota, não há import, então nada disso entra em bundle.
3. **Guarda em runtime.** A página chama `notFound()` se `NODE_ENV` não for
   `development` — segunda linha de defesa, caso alguém reintroduza a extensão
   no build.

A rota fica fora de `/app` e `/platform`, então o proxy de sessão
(`src/proxy.ts`) a deixa passar sem autenticação — é isso que permite abri-la
sem banco.

## Pré-requisitos

- `pnpm install` já executado.
- Um Chromium para o Playwright. O projeto **não** baixa navegador: os scripts
  procuram, nesta ordem, `CHROMIUM_PATH`, depois `PLAYWRIGHT_BROWSERS_PATH`, e
  por fim o local padrão do `playwright-core`. Se não achar nenhum, a mensagem
  diz o que instalar:

  ```bash
  pnpm dlx playwright-core install chromium
  # ou, se já houver um Chromium na máquina:
  export CHROMIUM_PATH=/caminho/para/chrome
  ```

- Um `.env.local` com valores quaisquer que satisfaçam o schema de configuração
  (ver `.env.example`). O harness não fala com o Supabase, mas o proxy de sessão
  lê a configuração ao subir — valores de placeholder bastam.

## Como usar

Com o servidor de desenvolvimento rodando (`pnpm dev`):

```bash
# abrir no navegador
http://localhost:3000/harness?scenario=grid&theme=dark

# capturar tudo: cenários x claro/escuro x desktop/celular
pnpm harness:shoot .harness-shots

# medir se algum bloco da grade corta texto (sai com código 1 se cortar)
pnpm harness:measure
```

`SCENARIOS` limita a captura: `SCENARIOS=grid pnpm harness:shoot`.

Cenários disponíveis hoje: `grid` (dia cheio), `empty` (dia sem atendimentos),
`no-professionals` (clínica sem profissional cadastrado), `financeiro` e
`financeiro-vazio`. No cenário `grid` a captura também abre o painel de detalhe
e o diálogo de marcação **por clique real**, gerando `drawer-*` e `modal-*`. A
saída vai para `.harness-shots/`, que é ignorada pelo git.

> **Use `localhost`, nunca `127.0.0.1`.** O Next dev trata os dois como origens
> distintas e bloqueia os recursos de dev na origem "errada". O sintoma é
> traiçoeiro: a página renderiza normalmente e a captura parece boa, mas o
> runtime de cliente nunca carrega — nada hidrata e nenhuma interação funciona.
> O log do dev server avisa com "Blocked cross-origin request to Next.js dev
> resource".

## Por que existe um script de medição

Olhar screenshot não é suficiente para detectar texto cortado, e o modo óbvio
de medir engana. Itens flex com `truncate` (`overflow: hidden`) têm o
`min-height` implícito resolvido em `0`: em vez de transbordar, eles **encolhem
abaixo da própria `line-height`**. Nesse estado `scrollHeight === clientHeight`
e o bloco parece são, enquanto o texto sai fatiado na vertical.

Por isso `harness:measure` usa duas sondas:

- **ESPREME** — compara a altura renderizada de cada linha com a `line-height`
  que ela deveria ocupar. Pega o encolhimento silencioso.
- **TRANSBORDA** — com as linhas travadas em `shrink-0`, sobra de conteúdo
  volta a aparecer como `scrollHeight > clientHeight`.

Foi assim que se estabeleceu a altura de hora da grade da agenda: a 5rem, três
blocos transbordavam; 5.25rem é o piso exato, com zero folga; 5.5rem deixa
2–4px de margem. Sem medir, a escolha teria sido chute.

## Ao acrescentar uma tela

1. Acrescente as fixtures em `src/app/harness/fixtures.ts`, escolhendo os casos
   que **quebram** layout — nomes longos, durações extremas, listas vazias,
   todos os estados do enum — e não o caso feliz.
2. Acrescente o cenário à lista `SCENARIOS` em `page.dev.tsx`.
3. Capture antes e depois da mudança e compare.
