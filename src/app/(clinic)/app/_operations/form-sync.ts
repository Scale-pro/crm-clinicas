/**
 * Decisão pura de reinício dos formulários em painel (profissional e
 * procedimento). O painel permanece montado quando fechado, então o formulário
 * precisa reiniciar em transições semânticas reais — nunca só porque o
 * componente pai criou um novo objeto `initialValues` com o mesmo conteúdo.
 *
 * A assinatura (`signature`) deve ser uma serialização estável dos valores
 * iniciais já normalizados: conteúdos iguais produzem a mesma string, ainda que
 * a identidade do objeto mude a cada renderização.
 */
export type FormResetKey = {
  readonly open: boolean;
  readonly mode: string;
  readonly signature: string;
};

/**
 * `true` quando o formulário deve ser reiniciado (valores, erros, tentativa e
 * pedido de foco). Reinicia ao reabrir o painel, ao alternar create/edit e
 * quando os valores iniciais mudam de forma real. Nunca reinicia com o painel
 * fechado, nem quando nada mudou (o que preservaria a digitação em andamento).
 */
export function shouldResetForm(previous: FormResetKey, next: FormResetKey): boolean {
  if (!next.open) return false;
  if (!previous.open) return true;
  if (previous.mode !== next.mode) return true;
  return previous.signature !== next.signature;
}
