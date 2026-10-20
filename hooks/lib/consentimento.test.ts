import { expect, test } from 'claude-code/testing'
import { decidir, gravarConsentimento, lerConsentimentos, montarContexto, type Consentimento, type EstadoFrequencia } from './consentimento'
import type { EntradaIndice } from './nota'

const MIN = 60_000
const VAZIO: EstadoFrequencia = { perguntadasNaSessao: [] }
const ARQUIVO = `---
tipo: "sistema"
---
- situacao: aula
  fonte: jose-ops
  decisao: sempre        # comentário à mão
  definido: 2026-10-20
- situacao: investigacao-footstats
  fonte: footstats-wiki
  decisao: nunca
  definido: 2026-10-20
- situacao: lixo
  fonte: x
`

const base = { acertos: 1, consentimentos: [] as Consentimento[], estado: VAZIO, agoraMs: 100 * MIN, intervaloMin: 30 }

test('lerConsentimentos lê o arquivo e ignora linhas malformadas', () => {
  expect(lerConsentimentos(ARQUIVO)).toEqual([
    { situacao: 'aula', fonte: 'jose-ops', decisao: 'sempre', definido: '2026-10-20' },
    { situacao: 'investigacao-footstats', fonte: 'footstats-wiki', decisao: 'nunca', definido: '2026-10-20' },
  ])
  expect(lerConsentimentos('---\ntipo: "sistema"\n---\n')).toEqual([])
})

test('sempre busca sem perguntar', () => {
  expect(decidir({ ...base, situacao: 'aula', consentimentos: lerConsentimentos(ARQUIVO) })).toEqual({ modo: 'buscar', fontes: ['jose-ops'] })
})

test('nunca remove a fonte', () => {
  const d = decidir({ ...base, situacao: 'investigacao-footstats', acertos: 0, consentimentos: lerConsentimentos(ARQUIVO) })
  expect(d).toEqual({ modo: 'nada', fontes: [] })
})

test('sem consentimento pergunta uma vez e depois silencia na sessão', () => {
  expect(decidir({ ...base, situacao: 'aula' }).modo).toBe('perguntar')
  expect(decidir({ ...base, situacao: 'aula', estado: { perguntadasNaSessao: ['aula'] } }).modo).toBe('nada')
})

test('intervalo de 30 min entre perguntas', () => {
  expect(decidir({ ...base, situacao: 'aula', estado: { ultimaPerguntaMs: 71 * MIN, perguntadasNaSessao: [] } }).modo).toBe('nada')
  expect(decidir({ ...base, situacao: 'aula', estado: { ultimaPerguntaMs: 69 * MIN, perguntadasNaSessao: [] } }).modo).toBe('perguntar')
})

test('investigação footstats inclui a wiki mesmo sem acerto local', () => {
  expect(decidir({ ...base, situacao: 'investigacao-footstats', acertos: 0 })).toEqual({ modo: 'perguntar', fontes: ['footstats-wiki'] })
  expect(decidir({ ...base, situacao: 'investigacao-footstats' }).fontes).toEqual(['jose-ops', 'footstats-wiki'])
})

test('sem acertos fora da footstats não faz nada', () => {
  expect(decidir({ ...base, situacao: 'aula', acertos: 0 })).toEqual({ modo: 'nada', fontes: [] })
})

test('fonte parcialmente autorizada pergunta', () => {
  const c: Consentimento[] = [{ situacao: 'investigacao-footstats', fonte: 'jose-ops', decisao: 'sempre', definido: '2026-10-20' }]
  expect(decidir({ ...base, situacao: 'investigacao-footstats', consentimentos: c }).modo).toBe('perguntar')
})

test('gravarConsentimento troca a linha existente e preserva as outras', () => {
  const novo = gravarConsentimento(ARQUIVO, { situacao: 'aula', fonte: 'jose-ops', decisao: 'nunca', definido: '2026-10-21' })
  expect(lerConsentimentos(novo)).toEqual([
    { situacao: 'investigacao-footstats', fonte: 'footstats-wiki', decisao: 'nunca', definido: '2026-10-20' },
    { situacao: 'aula', fonte: 'jose-ops', decisao: 'nunca', definido: '2026-10-21' },
  ])
  expect(novo.startsWith('---\ntipo: "sistema"\n---\n')).toBe(true)
})

const ACERTO: EntradaIndice = { id: 'a1', caminho: 'conhecimento/artefatos/aula-01-m04-abertura.md', titulo: 'Aula 01 de M04', tipo: 'artefato', status: 'ativa', apelidos: [], tags: [], atualizada: '' }

test('contexto de perguntar contém o formato da pergunta e o nome da ferramenta', () => {
  const ctx = montarContexto({ modo: 'perguntar', fontes: ['jose-ops'] }, 'aula', [ACERTO])!
  expect(ctx).toContain('conhecimento/artefatos/aula-01-m04-abertura.md')
  expect(ctx).toContain('aprendiz:validador')
  expect(ctx).toContain('⌕ Na base:')
  expect(ctx).toContain('(s/n/nunca, e lembro da resposta)')
  expect(ctx).toContain('mcp__aprendiz__consentimento')
  expect(ctx).not.toContain('—')
})

test('contexto de buscar manda usar e avisar; nada não gera contexto', () => {
  const ctx = montarContexto({ modo: 'buscar', fontes: ['jose-ops', 'footstats-wiki'] }, 'investigacao-footstats', [ACERTO])!
  expect(ctx).toContain('⌕ Usei')
  expect(ctx).toContain('Footstats Wiki')
  expect(ctx).not.toContain('(s/n/nunca')
  expect(montarContexto({ modo: 'nada', fontes: [] }, 'aula', [ACERTO])).toBeUndefined()
})
