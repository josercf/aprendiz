import { expect, test } from 'claude-code/testing'
import { planejarDesfazer, planejarEscritas, planejarRestaurar } from './escritor'
import type { ItemExtraido } from './extracao'
import { parseNota, serializarNota, type EntradaIndice, type Nota, type Origem } from './nota'

const AGORA = new Date('2026-10-20T17:32:00Z')
const ORIGEM: Origem = { agente: 'claude-code', conta: 'inteli', maquina: 'mac' }

function item(p: Partial<ItemExtraido>): ItemExtraido {
  return { acao: 'criar', tipo: 'fato', titulo: 'Formação acadêmica do José', apelidos: ['bio'], tags: ['perfil'], corpo: 'Análise de Sistemas.', vinculos: ['Uninove'], trecho: 'Formação: ...', confianca: 'alta', ...p }
}

function nota(p: Partial<Nota>): Nota {
  return {
    id: '20260901-1000-formacao-academica-do-jose', titulo: 'Formação acadêmica do José', tipo: 'fato', status: 'ativa',
    apelidos: ['bio'], tags: ['perfil'], criada: '2026-09-01T10:00:00-03:00', atualizada: '2026-09-01T10:00:00-03:00',
    origem: ORIGEM, substitui: [], substituida_por: null, confianca: 'alta', extras: {}, corpo: 'Texto antigo.\n', ...p,
  }
}

function entrada(n: Nota, caminho: string): EntradaIndice {
  return { id: n.id, caminho, titulo: n.titulo, tipo: n.tipo, status: n.status, apelidos: n.apelidos, tags: n.tags, atualizada: n.atualizada }
}

function base(notas: [Nota, string][]) {
  const arquivos = new Map(notas.map(([n, c]) => [c, serializarNota(n)]))
  return { indice: notas.map(([n, c]) => entrada(n, c)), lerNota: (c: string) => arquivos.get(c) }
}

test('criar gera arquivo na pasta do tipo com frontmatter completo', () => {
  const r = planejarEscritas({ itens: [item({})], ...base([]), agora: AGORA, origem: ORIGEM })
  expect(r.escritas.length).toBe(1)
  expect(r.escritas[0]!.caminho).toBe('conhecimento/notas/formacao-academica-do-jose.md')
  const n = parseNota(r.escritas[0]!.texto)!
  expect(n.id).toBe('20261020-1432-formacao-academica-do-jose')
  expect(n.status).toBe('ativa')
  expect(n.origem).toEqual({ ...ORIGEM, trecho: 'Formação: ...' })
  expect(n.criada).toBe('2026-10-20T14:32:00-03:00')
  expect(n.corpo).toContain('## Vínculos')
  expect(n.corpo).toContain('[[uninove]]')
  expect(r.criadas).toEqual([{ id: n.id, titulo: 'Formação acadêmica do José', caminho: 'conhecimento/notas/formacao-academica-do-jose.md' }])
})

test('criar duplicado por apelido só acrescenta apelido', () => {
  const existente = nota({ titulo: 'Currículo do José', apelidos: ['formação acadêmica do josé'] })
  const r = planejarEscritas({ itens: [item({ apelidos: ['bio', 'formação'] })], ...base([[existente, 'conhecimento/notas/curriculo-do-jose.md']]), agora: AGORA, origem: ORIGEM })
  expect(r.escritas.length).toBe(1)
  expect(r.criadas.length).toBe(0)
  const n = parseNota(r.escritas[0]!.texto)!
  expect(r.escritas[0]!.caminho).toBe('conhecimento/notas/curriculo-do-jose.md')
  expect(n.apelidos).toEqual(['formação acadêmica do josé', 'bio', 'formação'])
  expect(n.corpo).toBe('Texto antigo.\n')
})

test('substituir cria nova e marca antiga sem mexer no corpo dela', () => {
  const antiga = nota({})
  const caminhoAntigo = 'conhecimento/notas/formacao-academica-do-jose.md'
  const r = planejarEscritas({ itens: [item({ acao: 'substituir', substitui: antiga.id, corpo: 'Doutor em Administração.' })], ...base([[antiga, caminhoAntigo]]), agora: AGORA, origem: ORIGEM })
  const nova = r.escritas.find(e => e.caminho !== caminhoAntigo)!
  const velha = r.escritas.find(e => e.caminho === caminhoAntigo)!
  expect(nova.caminho).toBe('conhecimento/notas/formacao-academica-do-jose-2.md')
  expect(parseNota(nova.texto)!.substitui).toEqual([antiga.id])
  const v = parseNota(velha.texto)!
  expect(v.status).toBe('substituida')
  expect(v.substituida_por).toBe(parseNota(nova.texto)!.id)
  expect(v.corpo).toBe('Texto antigo.\n')
})

test('historico acrescenta linha sem alterar linhas existentes', () => {
  const pessoa = nota({ id: '20260901-1000-renato-penha', titulo: 'Renato Penha', tipo: 'pessoa', apelidos: ['chefe'], corpo: '## Quem é\n\nCoordenador.\n\n## Histórico\n\n- 2026-09-01 · Slack · pediu X\n\n## Vínculos\n\n- [[inteli]]\n' })
  const caminho = 'conhecimento/pessoas/renato-penha.md'
  const r = planejarEscritas({ itens: [item({ acao: 'historico', tipo: 'pessoa', titulo: 'Renato Penha', pessoa: 'Renato Penha', linhaHistorico: 'Slack · aprovou as férias' })], ...base([[pessoa, caminho]]), agora: AGORA, origem: ORIGEM })
  expect(r.escritas.length).toBe(1)
  expect(parseNota(r.escritas[0]!.texto)!.corpo).toBe('## Quem é\n\nCoordenador.\n\n## Histórico\n\n- 2026-09-01 · Slack · pediu X\n- 2026-10-20 · Slack · aprovou as férias\n\n## Vínculos\n\n- [[inteli]]\n')
})

test('historico cria nota de pessoa quando não existe', () => {
  const r = planejarEscritas({ itens: [item({ acao: 'historico', tipo: 'pessoa', titulo: 'Alessandra Sena', pessoa: 'Alessandra Sena', linhaHistorico: 'Slack · pediu o Data Model Canvas', vinculos: [] })], ...base([]), agora: AGORA, origem: ORIGEM })
  expect(r.escritas[0]!.caminho).toBe('conhecimento/pessoas/alessandra-sena.md')
  const n = parseNota(r.escritas[0]!.texto)!
  expect(n.tipo).toBe('pessoa')
  expect(n.corpo).toContain('## Histórico\n\n- 2026-10-20 · Slack · pediu o Data Model Canvas\n')
})

test('dois históricos da mesma pessoa no mesmo lote vão para o mesmo arquivo', () => {
  const h = (l: string) => item({ acao: 'historico', tipo: 'pessoa', titulo: 'Ana', pessoa: 'Ana', linhaHistorico: l, vinculos: [] })
  const r = planejarEscritas({ itens: [h('Slack · a'), h('Slack · b')], ...base([]), agora: AGORA, origem: ORIGEM })
  expect(r.escritas.length).toBe(1)
  expect(parseNota(r.escritas[0]!.texto)!.corpo).toContain('- 2026-10-20 · Slack · a\n- 2026-10-20 · Slack · b\n')
})

test('slug colidindo com outra nota gera sufixo -2', () => {
  const outra = nota({ id: 'x', titulo: 'Formacao: academica do Jose!', apelidos: [], status: 'desfeita' })
  const r = planejarEscritas({ itens: [item({ apelidos: [] })], ...base([[outra, 'conhecimento/notas/formacao-academica-do-jose.md']]), agora: AGORA, origem: ORIGEM })
  expect(r.escritas[0]!.caminho).toBe('conhecimento/notas/formacao-academica-do-jose-2.md')
})

test('nenhuma escrita fora de conhecimento/', () => {
  const r = planejarEscritas({ itens: [item({ titulo: '../../caderno/2026-10-20' }), item({ tipo: 'pessoa', titulo: 'Ana' })], ...base([]), agora: AGORA, origem: ORIGEM })
  for (const e of r.escritas) expect(e.caminho.startsWith('conhecimento/') && !e.caminho.includes('..')).toBe(true)
})

test('desfazer muda só o status e atualizada', () => {
  const n = nota({})
  const d = parseNota(planejarDesfazer(serializarNota(n), AGORA).texto)!
  expect(d).toEqual({ ...n, status: 'desfeita', atualizada: '2026-10-20T14:32:00-03:00' })
})

test('C1: arquivo existente fora do índice nunca é sobrescrito', () => {
  const manual = '# Maria Silva\n\nNota escrita à mão, sem frontmatter.\n'
  const arquivos = new Map([['conhecimento/pessoas/maria-silva.md', manual]])
  const r = planejarEscritas({
    itens: [item({ acao: 'historico', tipo: 'pessoa', titulo: 'Maria Silva', pessoa: 'Maria Silva', linhaHistorico: 'Slack · oi', vinculos: [] })],
    indice: [], lerNota: c => arquivos.get(c), existentes: [...arquivos.keys()], agora: AGORA, origem: ORIGEM,
  })
  expect(r.escritas.map(e => e.caminho)).toEqual(['conhecimento/pessoas/maria-silva-2.md'])
})

test('C1: colisão por maiúsculas conta como ocupado', () => {
  const r = planejarEscritas({ itens: [item({ apelidos: [] })], indice: [], lerNota: () => undefined, existentes: ['conhecimento/notas/Formacao-Academica-do-Jose.md'], agora: AGORA, origem: ORIGEM })
  expect(r.escritas[0]!.caminho).toBe('conhecimento/notas/formacao-academica-do-jose-2.md')
})

test('I4: histórico em nota com bloco literal preserva o frontmatter byte a byte', () => {
  const cab = '---\nid: "p1"\ntitulo: "Renato Penha"\ntipo: "pessoa"\nstatus: "ativa"\npapel: |\n  Coordenador\n  do curso\norganizacoes:\n  - "[[inteli]]"\n---\n'
  const texto = `${cab}## Histórico\n\n- 2026-09-01 · Slack · a\n`
  const caminho = 'conhecimento/pessoas/renato-penha.md'
  const indice: EntradaIndice[] = [{ id: 'p1', caminho, titulo: 'Renato Penha', tipo: 'pessoa', status: 'ativa', apelidos: [], tags: [], atualizada: '' }]
  const r = planejarEscritas({ itens: [item({ acao: 'historico', tipo: 'pessoa', titulo: 'Renato Penha', pessoa: 'Renato Penha', linhaHistorico: 'Slack · b', vinculos: [] })], indice, lerNota: () => texto, agora: AGORA, origem: ORIGEM })
  expect(r.escritas[0]!.texto).toBe(`${cab}## Histórico\n\n- 2026-09-01 · Slack · a\n- 2026-10-20 · Slack · b\n`)
})

test('I4: merge de tags em lista em bloco mantém os valores existentes', () => {
  const texto = '---\nid: "f1"\ntitulo: "Formação acadêmica do José"\ntipo: "fato"\nstatus: "ativa"\ntags:\n  - perfil\n  - manual\n---\ncorpo\n'
  const caminho = 'conhecimento/notas/formacao.md'
  const indice: EntradaIndice[] = [{ id: 'f1', caminho, titulo: 'Formação acadêmica do José', tipo: 'fato', status: 'ativa', apelidos: [], tags: ['perfil', 'manual'], atualizada: '' }]
  const r = planejarEscritas({ itens: [item({ tags: ['nova'], apelidos: [] })], indice, lerNota: () => texto, agora: AGORA, origem: ORIGEM })
  expect(parseNota(r.escritas[0]!.texto)!.tags).toEqual(['perfil', 'manual', 'nova'])
  expect(r.escritas[0]!.texto.endsWith('---\ncorpo\n')).toBe(true)
})

test('I8: desfazer uma substituição devolve as notas substituídas', () => {
  const n = nota({ substitui: ['antiga-1'] })
  const r = planejarDesfazer(serializarNota(n), AGORA)
  expect(parseNota(r.texto)!.status).toBe('desfeita')
  expect(r.restaurar).toEqual(['antiga-1'])
  const antiga = serializarNota(nota({ id: 'antiga-1', status: 'substituida', substituida_por: n.id }))
  const back = parseNota(planejarRestaurar(antiga, AGORA))!
  expect(back.status).toBe('ativa')
  expect(back.substituida_por).toBeNull()
})
