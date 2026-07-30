/**
 * Sincronização de um campo controlado que mantém o texto digitado pelo
 * usuário. O campo guarda o próprio texto enquanto está em edição — assim a
 * digitação nunca é reformatada nem tem o cursor reposicionado a cada tecla.
 * Quando o campo **não** está em edição, uma mudança externa da prop (por
 * exemplo, limpar um override para `null`) passa a valer imediatamente.
 *
 * Função pura: recebe o estado de foco, o valor que chega pela prop
 * (`incoming`), o último valor já refletido no texto (`synced`) e o formatador.
 * Devolve o próximo par `{ text, synced }` quando o texto deve ser substituído,
 * ou `null` quando nada muda. `Object.is` distingue `0` de `null` — zero é um
 * valor legítimo, nunca confundido com ausência de valor.
 */
export function resolveSyncedText(params: {
  editing: boolean;
  incoming: number | null;
  synced: number | null;
  format: (value: number) => string;
}): { readonly text: string; readonly synced: number | null } | null {
  const { editing, incoming, synced, format } = params;
  // Enquanto o usuário digita, o texto é soberano: nada é sincronizado.
  if (editing) return null;
  // A prop não mudou desde o último texto refletido — nada a fazer.
  if (Object.is(incoming, synced)) return null;
  return { synced: incoming, text: incoming === null ? "" : format(incoming) };
}
