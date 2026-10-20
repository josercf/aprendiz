import { expect, test } from 'claude-code/testing'
import { ehTrivial, removerSegredos } from './filtro'
import { PROMPT_AULA_01 } from './fixtures/prompt-aula-01'

test('respostas curtas são triviais', () => {
  for (const t of ['ok', 'B', 'sim', 'nunca', '/aprendido', '  ', 'Pode.', 'valeu!', 'obrigada']) {
    expect(ehTrivial(t)).toBe(true)
  }
})

test('prompt com conteúdo não é trivial', () => {
  expect(ehTrivial(PROMPT_AULA_01)).toBe(false)
  expect(ehTrivial('sim, mas troque a cor do título para azul')).toBe(false)
})

test('segredos são removidos e contados', () => {
  const r = removerSegredos('token: ghp_abcdefghijklmnopqrstuvwxyz0123456789 e CPF 123.456.789-09')
  expect(r.texto).not.toMatch(/ghp_|123\.456/)
  expect(r.removidos).toBe(2)
})

test('chaves de provedores e blocos de chave privada', () => {
  const texto = [
    'sk-ant-api03-abcdefghijklmnopqrstuvwxyz',
    'AKIAABCDEFGHIJKLMNOP',
    'xoxb-1234567890-abcdefghij',
    'github_pat_11ABCDEFG0123456789_abcdefghijklmnop',
    'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U',
    '-----BEGIN OPENSSH PRIVATE KEY-----\nabc\n-----END OPENSSH PRIVATE KEY-----',
    'senha = minhaSenha123',
    'PIN: 4321',
    'RG 12.345.678-9',
  ].join('\n')
  const r = removerSegredos(texto)
  expect(r.removidos).toBe(9)
  for (const pedaco of ['sk-ant', 'AKIA', 'xoxb', 'github_pat', 'eyJhbGci', 'PRIVATE KEY', 'minhaSenha', '4321', '12.345.678']) {
    expect(r.texto).not.toContain(pedaco)
  }
})

test('nomes e notas de alunos ficam', () => {
  expect(removerSegredos('Eduardo de Oliveira nota 8,5').texto).toBe('Eduardo de Oliveira nota 8,5')
  expect(removerSegredos(PROMPT_AULA_01)).toEqual({ texto: PROMPT_AULA_01, removidos: 0 })
})

test('I5: senha dita em frase também sai', () => {
  const r = removerSegredos('a senha é hunter2 e o PIN e 4321; minha senha do wifi eh casa123')
  expect(r.texto).not.toMatch(/hunter2|4321|casa123/)
})
