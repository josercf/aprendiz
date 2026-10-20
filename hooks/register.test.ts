import type { On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'

function mundo(on: On, opts: { repo: boolean }) {
  mock.env(on, { HOME: '/home/j', CLAUDE_CONFIG_DIR: '/home/j/.claude-inteli' })
  mock.store(on)
  const toasts: string[] = []
  const comandos: string[] = []
  const processos: string[] = []
  const modelo: { maxTokens?: number; timeoutMs?: number }[] = []
  on('ui.toast', (_, e) => { toasts.push(e.text); return { value: undefined } })
  on('fs.exists', (_, e) => ({ value: opts.repo && e.path === '/home/j/Projects/jose-ops/.git' }))
  on('fs.list', () => ({ value: [] }))
  on('fs.read', () => ({ value: '---\ntipo: "sistema"\n---\n' }))
  on('fs.write', () => ({ value: undefined }))
  on('process.run', (_, e) => { processos.push(e.argv.join(' ')); return { value: { exitCode: 0, stdout: e.argv[1] === 'symbolic-ref' ? 'main\n' : 'mac\n', stderr: '' } as never } })
  on('model.complete', (_, e) => { modelo.push({ maxTokens: e.maxTokens, timeoutMs: e.timeoutMs }); return { value: { isAnswered: true, text: '{"itens":[]}', usage: {} } as never } })
  on('session.id', () => ({ value: 's1' }))
  on('command.register', (_, e) => { comandos.push(e.name); return { value: { command: e.name } } })
  on('tool.register', (_, e) => ({ value: { tool: `mcp__aprendiz__${e.name}` } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('prompt.submit', (_, e) => ({ text: e.text, context: e.context }))
  return { toasts, comandos, processos, modelo }
}

test('repo ausente: um toast, nenhum comando e o prompt passa intacto', async ($, on) => {
  const m = mundo(on, { repo: false })
  await $.session.start({ cwd: '/home/j/aulas', surface: 'terminal', isInteractive: true })
  expect(m.toasts.length).toBe(1)
  expect(m.toasts[0]).toContain('jose-ops não encontrado em /home/j/Projects/jose-ops')
  expect(m.comandos).toEqual([])
  const r = await $.prompt.submit({ text: 'Vamos montar a aula 02 de M04', wait: false, origin: { kind: 'composer' } } as never)
  expect(r.drop).toBeUndefined()
})

test('repo presente: registra /aprendido e o comando responde', async ($, on) => {
  const m = mundo(on, { repo: true })
  await $.session.start({ cwd: '/home/j/aulas', surface: 'terminal', isInteractive: true })
  expect(m.toasts).toEqual([])
  expect(m.comandos).toEqual(['aprendido'])
  const r = await $.command.run({ command: 'aprendido', args: '', origin: { kind: 'composer' } } as never)
  expect(r.text).toBe('Nada gravado hoje nesta conta.')
})

test('I7: session.start não faz pull nem fetch', async ($, on) => {
  const m = mundo(on, { repo: true })
  await $.session.start({ cwd: '/home/j/aulas', surface: 'terminal', isInteractive: true })
  expect(m.processos.some(c => c.startsWith('git pull') || c.startsWith('git fetch'))).toBe(false)
})
