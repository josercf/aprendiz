import { expect, test } from 'claude-code/testing'
import { buscar, classificar, indexar } from './indice'
import { serializarNota, type EntradaIndice, type Nota } from './nota'

function nota(p: Partial<Nota>): Nota {
  return {
    id: 'id', titulo: 't', tipo: 'fato', status: 'ativa', apelidos: [], tags: [],
    criada: '2026-09-01T10:00:00-03:00', atualizada: '2026-09-01T10:00:00-03:00',
    origem: { agente: 'claude-code', conta: 'inteli', maquina: 'mac' },
    substitui: [], substituida_por: null, confianca: 'alta', extras: {}, corpo: '', ...p,
  }
}

const ARQUIVOS = [
  { caminho: 'conhecimento/artefatos/aula-01-m04-abertura.md', texto: serializarNota(nota({ id: 'a1', titulo: 'Aula 01 de M04: abertura e apresentação do professor', tipo: 'artefato', tags: ['aula', 'm04', 'slides'] })) },
  { caminho: 'conhecimento/notas/formacao-academica.md', texto: serializarNota(nota({ id: 'f1', titulo: 'Formação acadêmica do José', apelidos: ['currículo'], tags: ['perfil'] })) },
  { caminho: 'conhecimento/notas/velha.md', texto: serializarNota(nota({ id: 'v1', titulo: 'Abertura antiga da aula', tipo: 'artefato', status: 'desfeita', tags: ['aula'] })) },
  { caminho: 'caderno/2026-10-20.md', texto: '# 2026-10-20 · caderno Donna\n' },
]

test('indexar ignora caderno da Donna e notas desfeitas não aparecem na busca', () => {
  const indice = indexar(ARQUIVOS)
  expect(indice.map(e => e.id)).toEqual(['a1', 'f1', 'v1'])
  expect(buscar(indice, 'abertura antiga da aula', 'aula').map(r => r.entrada.id)).not.toContain('v1')
})

test('prompt de aula encontra artefato de aula anterior', () => {
  const r = buscar(indexar(ARQUIVOS), 'Vamos montar a abertura da aula 02 de M04 com os slides de apresentação', 'aula')
  expect(r[0]?.entrada.id).toBe('a1')
})

test('apelido e acentos contam na busca', () => {
  const r = buscar(indexar(ARQUIVOS), 'atualiza meu curriculo e a formacao academica', 'geral')
  expect(r[0]?.entrada.id).toBe('f1')
})

test('prompt sem termos relevantes não devolve nada', () => {
  expect(buscar(indexar(ARQUIVOS), 'qual a previsão do tempo amanhã', 'geral')).toEqual([])
})

test('classificar detecta aula em qualquer conta', () => {
  expect(classificar('Vamos melhorar os slides da aula 01', 'personal')).toBe('aula')
  expect(classificar('Revise o autoestudo do módulo 4', 'inteli')).toBe('aula')
  expect(classificar('escreva um e-mail para o Renato', 'inteli')).toBe('geral')
})

test('investigacao-footstats só na conta footstats', () => {
  expect(classificar('OLAP sem dados da partida', 'footstats')).toBe('investigacao-footstats')
  expect(classificar('OLAP sem dados da partida', 'inteli')).toBe('geral')
  expect(classificar('o deploy falhou de novo', 'footstats')).toBe('investigacao-footstats')
})

test('busca em 2.000 entradas leva menos de 50 ms', () => {
  const indice: EntradaIndice[] = Array.from({ length: 2000 }, (_, i) => ({
    id: `n${i}`, caminho: `conhecimento/notas/n${i}.md`, titulo: `Nota número ${i} sobre aula e projeto ${i % 37}`,
    tipo: 'fato', status: 'ativa', apelidos: [`apelido ${i}`], tags: ['aula'], atualizada: '',
  }))
  buscar(indice, 'aquecimento', 'aula')
  let melhor = Infinity
  for (let i = 0; i < 5; i++) {
    const t0 = Date.now()
    buscar(indice, 'Vamos montar a abertura da aula 02 de M04 com os slides de apresentação do projeto 12', 'aula')
    melhor = Math.min(melhor, Date.now() - t0)
  }
  expect(melhor).toBeLessThan(50)
})
