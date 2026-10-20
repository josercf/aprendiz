import { expect, test } from 'claude-code/testing'
import { comCorpo, corpoDe, editarFrontmatter, frontmatterIntegro, novoId, parseNota, pastaDoTipo, serializarNota, slug, type Nota } from './nota'

const NOTA_FORMACAO: Nota = {
  id: '20261020-1432-formacao-academica',
  titulo: 'Formação acadêmica do José',
  tipo: 'fato',
  status: 'ativa',
  apelidos: ['formação', 'currículo', 'bio'],
  tags: ['perfil', 'docencia'],
  criada: '2026-10-20T14:32:00-03:00',
  atualizada: '2026-10-20T14:32:00-03:00',
  origem: {
    agente: 'claude-code',
    conta: 'inteli',
    maquina: 'MacBook-Jose',
    projeto: '/Users/jose/aulas',
    trecho: 'Formação: Análise de Sistemas (Uninove), "MBA" no MIT',
  },
  substitui: [],
  substituida_por: null,
  confianca: 'alta',
  extras: {},
  corpo: 'Análise de Sistemas (Uninove).\n\n## Vínculos\n\n- [[jose-romualdo]]\n',
}

test('slug remove acentos e caracteres proibidos no Windows', () => {
  expect(slug('Formação acadêmica: MBA?')).toBe('formacao-academica-mba')
  expect(slug('  José  Romualdo  ')).toBe('jose-romualdo')
  expect(slug('CON')).toBe('con-nota')
  expect(slug('a*b<c>d|e"f/g\\h')).toBe('a-b-c-d-e-f-g-h')
  expect(slug('???')).toBe('nota')
})

test('novoId usa fuso de São Paulo', () => {
  expect(novoId(new Date('2026-10-20T17:32:00Z'), 'Formação acadêmica')).toBe('20261020-1432-formacao-academica')
  expect(novoId(new Date('2026-10-21T01:05:00Z'), 'x')).toBe('20261020-2205-x')
})

test('pastaDoTipo mapeia tipos para pastas', () => {
  expect(pastaDoTipo('pessoa')).toBe('pessoas')
  expect(pastaDoTipo('organizacao')).toBe('organizacoes')
  expect(pastaDoTipo('artefato')).toBe('artefatos')
  expect(pastaDoTipo('ativo')).toBe('ativos')
  expect(pastaDoTipo('indice')).toBe('indices')
  expect(pastaDoTipo('projeto')).toBe('projetos')
  expect(pastaDoTipo('preferencia')).toBe('notas')
})

test('serializar e parsear preservam todos os campos', () => {
  expect(parseNota(serializarNota(NOTA_FORMACAO))).toEqual(NOTA_FORMACAO)
})

test('extras e substituição sobrevivem à ida e volta', () => {
  const n: Nota = { ...NOTA_FORMACAO, substitui: ['a', 'b'], substituida_por: 'c', extras: { papel: 'Chefe', organizacoes: ['[[inteli]]'] } }
  expect(parseNota(serializarNota(n))).toEqual(n)
})

test('parseNota ignora --- dentro do corpo', () => {
  const n = { ...NOTA_FORMACAO, corpo: 'texto\n\n---\nnao: e frontmatter\n---\n' }
  expect(parseNota(serializarNota(n))?.corpo).toBe(n.corpo)
})

test('parseNota devolve null para arquivo sem frontmatter', () => {
  expect(parseNota('# caderno da Donna')).toBeNull()
  expect(parseNota('---\ntipo: "sistema"\n---\n')).toBeNull()
})

test('listas em bloco do Obsidian são lidas', () => {
  const t = '---\nid: "x"\ntitulo: "Maria"\ntipo: "pessoa"\nstatus: "ativa"\ntags:\n  - perfil\n  - aluna\napelidos:\n  - Mari\n---\ncorpo\n'
  const n = parseNota(t)!
  expect(n.tags).toEqual(['perfil', 'aluna'])
  expect(n.apelidos).toEqual(['Mari'])
  expect(frontmatterIntegro(t)).toBe(true)
})

test('bloco literal e linhas desconhecidas tornam o frontmatter não íntegro', () => {
  expect(frontmatterIntegro('---\nid: "x"\npapel: |\n  Coordenador\n  do curso\n---\n')).toBe(false)
  expect(frontmatterIntegro(serializarNota(NOTA_FORMACAO))).toBe(true)
})

test('editarFrontmatter troca só as linhas pedidas e preserva o resto byte a byte', () => {
  const t = '---\nid: "x"\ntitulo: "Maria"\ntipo: "pessoa"\nstatus: "ativa"   # à mão\npapel: |\n  Coordenador\ntags:\n  - perfil\n---\ncorpo intacto\n'
  const e = editarFrontmatter(t, { status: 'desfeita', atualizada: '2026-10-20T14:32:00-03:00' })
  expect(e).toBe('---\nid: "x"\ntitulo: "Maria"\ntipo: "pessoa"\nstatus: "desfeita"\npapel: |\n  Coordenador\ntags:\n  - perfil\natualizada: "2026-10-20T14:32:00-03:00"\n---\ncorpo intacto\n')
  expect(editarFrontmatter(t, { tags: ['perfil', 'nova'] })).toContain('tags: ["perfil","nova"]\n---\ncorpo intacto\n')
})

test('comCorpo troca só o corpo', () => {
  const t = '---\nid: "x"\npapel: |\n  A\n---\nvelho\n'
  expect(comCorpo(t, 'novo\n')).toBe('---\nid: "x"\npapel: |\n  A\n---\nnovo\n')
  expect(corpoDe(t)).toBe('velho\n')
})

test('BOM e CRLF do Windows são aceitos', () => {
  const t = '﻿' + serializarNota(NOTA_FORMACAO).replace(/\n/g, '\r\n')
  expect(parseNota(t)?.id).toBe(NOTA_FORMACAO.id)
})
