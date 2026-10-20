// Índice derivado das notas (ADR-004), busca local por termos e
// classificação da situação do prompt (spec 5.5).

import { parseNota, semAcento, type EntradaIndice } from './nota'

export type { EntradaIndice } from './nota'

export type Situacao = 'aula' | 'investigacao-footstats' | 'geral'

export type Acerto = { entrada: EntradaIndice; pontos: number }

export function indexar(arquivos: { caminho: string; texto: string }[]): EntradaIndice[] {
  const indice: EntradaIndice[] = []
  for (const { caminho, texto } of arquivos) {
    const n = parseNota(texto)
    if (!n) continue
    indice.push({ id: n.id, caminho, titulo: n.titulo, tipo: n.tipo, status: n.status, apelidos: n.apelidos, tags: n.tags, atualizada: n.atualizada })
  }
  return indice
}

function palavras(texto: string): string[] {
  return semAcento(texto).toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)
}

function termos(texto: string): Set<string> {
  return new Set(palavras(texto).filter(p => p.length > 3))
}

const TERMOS_AULA = new Set(['aula', 'aulas', 'slide', 'slides', 'deck', 'reveal', 'ava', 'autoestudo', 'modulo', 'encontro', 'ponderada', 'artefato'])
const TERMOS_INVESTIGACAO = new Set(['erro', 'falha', 'falhou', 'quebrou', 'bug', 'olap', 'deploy', 'pipeline', 'timeout', 'exception', 'stack', 'log', 'logs', 'incidente', 'lento'])

export function classificar(prompt: string, conta: string): Situacao {
  const p = palavras(prompt)
  if (conta === 'footstats' && p.some(x => TERMOS_INVESTIGACAO.has(x))) return 'investigacao-footstats'
  if (p.some(x => TERMOS_AULA.has(x))) return 'aula'
  return 'geral'
}

const PONTOS_MINIMOS = 4

type Termos = { titulo: Set<string>; apelidos: Set<string>; tags: Set<string> }
const cache = new WeakMap<EntradaIndice, Termos>()

function termosDa(entrada: EntradaIndice): Termos {
  let t = cache.get(entrada)
  if (!t) {
    t = { titulo: termos(entrada.titulo), apelidos: termos(entrada.apelidos.join(' ')), tags: termos(entrada.tags.join(' ')) }
    cache.set(entrada, t)
  }
  return t
}

export function buscar(indice: EntradaIndice[], prompt: string, situacao: Situacao, limite = 5): Acerto[] {
  const consulta = termos(prompt)
  if (consulta.size === 0) return []
  const acertos: Acerto[] = []
  for (const entrada of indice) {
    if (entrada.status !== 'ativa') continue
    const { titulo, apelidos, tags } = termosDa(entrada)
    let pontos = 0
    for (const t of consulta) {
      if (titulo.has(t)) pontos += 3
      if (apelidos.has(t)) pontos += 2
      if (tags.has(t)) pontos += 1
    }
    if (pontos > 0 && situacao === 'aula' && entrada.tipo === 'artefato') pontos += 2
    if (pontos >= PONTOS_MINIMOS) acertos.push({ entrada, pontos })
  }
  return acertos.sort((a, b) => b.pontos - a.pontos).slice(0, limite)
}
