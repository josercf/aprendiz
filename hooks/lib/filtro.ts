// Filtros aplicados antes de qualquer extração ou escrita (spec 4.5 e 5.2).

const RESPOSTA_CURTA = /^(ok|sim|não|nao|s|n|nunca|pode|valeu|obrigad[oa]|[a-d])[.!]?$/i

export function ehTrivial(texto: string): boolean {
  const t = texto.trim()
  if (t === '') return true
  if (t.startsWith('/')) return true
  if (RESPOSTA_CURTA.test(t)) return true
  return t.length <= 12 && !/\s/.test(t)
}

// Cada padrão conta como um segredo removido por ocorrência.
const PADROES: readonly RegExp[] = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
  /\bsk-[A-Za-z0-9_-]{16,}/g,
  /\bgithub_pat_[A-Za-z0-9_]{20,}/g,
  /\bgh[pousr]_[A-Za-z0-9]{30,}/g,
  /\bxox[bpas]-[A-Za-z0-9-]{10,}/g,
  /\bAKIA[0-9A-Z]{16}\b/g,
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g,
  /\b(senha|password|passwd|pin|token|secret|api[_-]?key)\s*[:=]\s*(?!\[removido\])\S+/gi,
  /\b(senha|password|pin)\b(\s+(do|da|de)\s+\S+)?\s+(é|e|eh|is)\s+(?!\[removido\])\S+/gi,
  /\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/g,
  /\b(RG|passaporte|passport)\s*:?\s*[A-Z0-9][A-Z0-9.\-]{5,}/gi,
]

export function removerSegredos(texto: string): { texto: string; removidos: number } {
  let removidos = 0
  let resultado = texto
  for (const padrao of PADROES) {
    resultado = resultado.replace(padrao, () => {
      removidos++
      return '[removido]'
    })
  }
  return { texto: resultado, removidos }
}
