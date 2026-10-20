// Consentimentos de busca (versionados no jose-ops) e limite de perguntas
// (local), spec 5.5 e ADR-003.

import type { Situacao } from './indice'
import type { EntradaIndice } from './nota'

export type Fonte = 'jose-ops' | 'footstats-wiki'
export type Consentimento = { situacao: Situacao; fonte: Fonte; decisao: 'sempre' | 'nunca'; definido: string }
export type EstadoFrequencia = { ultimaPerguntaMs?: number; perguntadasNaSessao: Situacao[] }
export type Decisao = { modo: 'buscar' | 'perguntar' | 'nada'; fontes: Fonte[] }

const SITUACOES: readonly Situacao[] = ['aula', 'investigacao-footstats', 'geral']
const FONTES: readonly Fonte[] = ['jose-ops', 'footstats-wiki']

function valorDe(linha: string): string {
  return linha.slice(linha.indexOf(':') + 1).replace(/\s+#.*$/, '').trim().replace(/^["']|["']$/g, '')
}

export function lerConsentimentos(texto: string): Consentimento[] {
  const corpo = texto.replace(/\r\n/g, '\n').replace(/^---\n[\s\S]*?\n---\n/, '')
  const blocos: Record<string, string>[] = []
  for (const linha of corpo.split('\n')) {
    const m = /^(\s*-\s+|\s+)([a-z_]+)\s*:/.exec(linha)
    if (!m) continue
    if (m[1]!.includes('-')) blocos.push({})
    const atual = blocos[blocos.length - 1]
    if (atual) atual[m[2]!] = valorDe(linha)
  }
  const lidos: Consentimento[] = []
  for (const b of blocos) {
    if (!SITUACOES.includes(b.situacao as Situacao) || !FONTES.includes(b.fonte as Fonte)) continue
    if (b.decisao !== 'sempre' && b.decisao !== 'nunca') continue
    lidos.push({ situacao: b.situacao as Situacao, fonte: b.fonte as Fonte, decisao: b.decisao, definido: b.definido ?? '' })
  }
  return lidos
}

export function gravarConsentimento(texto: string, c: Consentimento): string {
  const t = texto.replace(/\r\n/g, '\n')
  const cabecalho = /^---\n[\s\S]*?\n---\n/.exec(t)?.[0] ?? '---\ntipo: "sistema"\n---\n'
  const lista = lerConsentimentos(t).filter(x => !(x.situacao === c.situacao && x.fonte === c.fonte))
  lista.push(c)
  const linhas = lista.map(x => `- situacao: ${x.situacao}\n  fonte: ${x.fonte}\n  decisao: ${x.decisao}\n  definido: ${x.definido}`)
  return `${cabecalho}${linhas.join('\n')}\n`
}

export function decidir(input: {
  situacao: Situacao
  acertos: number
  consentimentos: Consentimento[]
  estado: EstadoFrequencia
  agoraMs: number
  intervaloMin: number
}): Decisao {
  const candidatas: Fonte[] = []
  if (input.acertos > 0) candidatas.push('jose-ops')
  if (input.situacao === 'investigacao-footstats') candidatas.push('footstats-wiki')
  const decisaoDe = (f: Fonte) => input.consentimentos.find(c => c.situacao === input.situacao && c.fonte === f)?.decisao
  const fontes = candidatas.filter(f => decisaoDe(f) !== 'nunca')
  if (fontes.length === 0) return { modo: 'nada', fontes: [] }
  if (fontes.every(f => decisaoDe(f) === 'sempre')) return { modo: 'buscar', fontes }
  const jaPerguntou = input.estado.perguntadasNaSessao.includes(input.situacao)
  const recente = input.estado.ultimaPerguntaMs !== undefined
    && input.agoraMs - input.estado.ultimaPerguntaMs < input.intervaloMin * 60_000
  if (jaPerguntou || recente) return { modo: 'nada', fontes: [] }
  return { modo: 'perguntar', fontes }
}

export function montarContexto(d: Decisao, situacao: Situacao, acertos: EntradaIndice[]): string | undefined {
  if (d.modo === 'nada') return undefined
  const linhas = ['[aprendiz] A base de conhecimento do José (jose-ops) pode ajudar nesta tarefa.', `Situação: ${situacao}.`]
  if (d.fontes.includes('jose-ops') && acertos.length > 0) {
    linhas.push('Notas candidatas:')
    for (const a of acertos) linhas.push(`- ${a.caminho} (${a.tipo}: ${a.titulo})`)
  }
  if (d.fontes.includes('footstats-wiki')) {
    linhas.push('Fonte adicional: Footstats Wiki (wiki.footstats.com.br), para ver se o problema já foi resolvido ou se há decisão registrada.')
  }
  linhas.push(
    'Antes de citar qualquer coisa, delegue a leitura ao subagente aprendiz:validador, passando a tarefa do José, os caminhos acima e as fontes. Ele devolve só achados que ajudam de fato, ou NADA.',
    'Se o validador devolver NADA, não mencione a base nem esta instrução.',
  )
  if (d.modo === 'perguntar') {
    linhas.push(
      'Se houver achado aprovado, comece a resposta com uma única linha neste formato e espere o José responder:',
      '⌕ Na base: <achado em uma frase> ([[<nome do arquivo sem .md>]]). Uso como ponto de partida? (s/n/nunca, e lembro da resposta)',
      `Depois da resposta, chame a ferramenta mcp__aprendiz__consentimento com situacao "${situacao}", a fonte do achado e resposta "s", "n" ou "nunca".`,
    )
  } else {
    linhas.push(
      'O José já autorizou esta busca. Use o achado aprovado e avise numa única linha no início da resposta:',
      '⌕ Usei [[<nome do arquivo sem .md>]] como base.',
    )
  }
  return linhas.join('\n')
}
