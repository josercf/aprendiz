import { expect, test } from 'claude-code/testing'
import { contaDe, expandirCaminho, juntar } from './config'

test('contaDe: sem variável é personal; pastas nomeadas viram a conta', () => {
  expect(contaDe(undefined)).toBe('personal')
  expect(contaDe('')).toBe('personal')
  expect(contaDe('/Users/jose/.claude-footstats')).toBe('footstats')
  expect(contaDe('/Users/jose/.claude-inteli/')).toBe('inteli')
  expect(contaDe('C:\\Users\\jose\\.claude-inteli')).toBe('inteli')
  expect(contaDe('/Users/jose/.claude')).toBe('personal')
})

test('expandirCaminho troca ~ e barras invertidas', () => {
  expect(expandirCaminho('~/Projects/jose-ops', '/Users/jose')).toBe('/Users/jose/Projects/jose-ops')
  expect(expandirCaminho('~\\Projects\\jose-ops', 'C:\\Users\\jose')).toBe('C:/Users/jose/Projects/jose-ops')
  expect(expandirCaminho('D:\\repos\\jose-ops\\', 'C:/Users/jose')).toBe('D:/repos/jose-ops')
})

test('juntar monta caminhos com uma barra só', () => {
  expect(juntar('/a/b/', 'conhecimento/notas/x.md')).toBe('/a/b/conhecimento/notas/x.md')
})
