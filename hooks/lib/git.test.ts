import { expect, test } from 'claude-code/testing'
import { Sincronizador, type Rodar } from './git'

type Resposta = { exitCode?: number; stdout?: string; stderr?: string }

const BASE: Record<string, Resposta | Resposta[]> = {
  'git symbolic-ref --short -q HEAD': { stdout: 'main\n' },
  'git rev-parse -q --verify MERGE_HEAD': { exitCode: 1 },
  'git hash-object -w --stdin': { stdout: 'abc123\n' },
}

function falso(extra: Record<string, Resposta | Resposta[]> = {}) {
  const roteiro = { ...BASE, ...extra }
  const chamadas: string[] = []
  const rodar: Rodar = async argv => {
    const chave = argv.join(' ')
    chamadas.push(chave)
    const r = roteiro[chave]
    const resp = Array.isArray(r) ? (r.shift() ?? {}) : (r ?? {})
    return { exitCode: resp.exitCode ?? 0, stdout: resp.stdout ?? '', stderr: resp.stderr ?? '' }
  }
  return { rodar, chamadas }
}

const OPTS = { sshKeyPath: '~/.ssh/k', agente: 'claude-code', conta: 'inteli', dono: 's1', agora: () => 1_000_000 }
const LIMPO = { 'git diff --cached --quiet -- conhecimento/': { exitCode: 1 } }

test('commit só adiciona conhecimento/', async () => {
  const f = falso(LIMPO)
  expect(await new Sincronizador(f.rodar, OPTS).commitar(3)).toEqual({ estado: 'ok' })
  expect(f.chamadas).toContain('git add -- conhecimento/')
  expect(f.chamadas).toContain('git commit -m conhecimento: claude-code inteli +3 notas -- conhecimento/')
  expect(f.chamadas.some(c => /git add (-A|\.)/.test(c))).toBe(false)
})

test('nada a commitar é ok', async () => {
  const f = falso()
  expect(await new Sincronizador(f.rodar, OPTS).commitar(0)).toEqual({ estado: 'ok' })
  expect(f.chamadas.some(c => c.startsWith('git commit'))).toBe(false)
})

test('push sempre precedido de pull --rebase e nunca com --force', async () => {
  const f = falso()
  expect(await new Sincronizador(f.rodar, OPTS).enviar()).toEqual({ estado: 'ok' })
  const pull = f.chamadas.indexOf('git pull --rebase --no-autostash')
  const push = f.chamadas.indexOf('git push')
  expect(pull).toBeGreaterThan(-1)
  expect(push).toBeGreaterThan(pull)
  expect(f.chamadas.some(c => c.includes('--force') || c.includes(' -f'))).toBe(false)
})

test('mudança rastreada fora de conhecimento/ adia o pull', async () => {
  const f = falso({ 'git status --porcelain': { stdout: ' M caderno/2026-10-20.md\n?? rascunho.txt\n' } })
  expect((await new Sincronizador(f.rodar, OPTS).puxar()).estado).toBe('adiado')
  expect(f.chamadas.some(c => c.startsWith('git pull'))).toBe(false)
  expect(f.chamadas.some(c => c.includes('stash'))).toBe(false)
})

test('arquivo não rastreado fora de conhecimento/ não impede o pull', async () => {
  const f = falso({ 'git status --porcelain': { stdout: '?? rascunho.txt\n' } })
  expect((await new Sincronizador(f.rodar, OPTS).puxar()).estado).toBe('ok')
})

test('notas não commitadas são commitadas antes do pull', async () => {
  const f = falso({ 'git status --porcelain': { stdout: '?? conhecimento/notas/a.md\n M conhecimento/pessoas/b.md\n' }, ...LIMPO })
  expect((await new Sincronizador(f.rodar, OPTS).puxar()).estado).toBe('ok')
  const commit = f.chamadas.indexOf('git commit -m conhecimento: claude-code inteli +2 notas -- conhecimento/')
  expect(commit).toBeGreaterThan(-1)
  expect(f.chamadas.indexOf('git pull --rebase --no-autostash')).toBeGreaterThan(commit)
})

test('conflito aborta o rebase e mantém o commit local', async () => {
  const f = falso({ 'git pull --rebase --no-autostash': { exitCode: 1, stdout: 'CONFLICT (content): Merge conflict in conhecimento/pessoas/ana.md' } })
  expect((await new Sincronizador(f.rodar, OPTS).enviar()).estado).toBe('conflito')
  expect(f.chamadas).toContain('git rebase --abort')
  expect(f.chamadas[f.chamadas.length - 1]).toBe('git update-ref -d refs/aprendiz/lock abc123')
  expect(f.chamadas).not.toContain('git push')
  expect(f.chamadas.some(c => c.includes('reset'))).toBe(false)
})

test('sem rede devolve sem-rede e não tenta push', async () => {
  const f = falso({ 'git pull --rebase --no-autostash': { exitCode: 1, stderr: 'ssh: Could not resolve hostname github.com' } })
  expect((await new Sincronizador(f.rodar, OPTS).enviar()).estado).toBe('sem-rede')
  expect(f.chamadas).not.toContain('git push')
})

test('push rejeitado fica adiado', async () => {
  const f = falso({ 'git push': { exitCode: 1, stderr: ' ! [rejected] main -> main (fetch first)' } })
  expect((await new Sincronizador(f.rodar, OPTS).enviar()).estado).toBe('adiado')
})

test('pasta sem .git devolve sem-repo', async () => {
  const f = falso({ 'git rev-parse --git-dir': { exitCode: 128, stderr: 'fatal: not a git repository' } })
  expect((await new Sincronizador(f.rodar, OPTS).puxar()).estado).toBe('sem-repo')
  expect((await new Sincronizador(f.rodar, OPTS).enviar()).estado).toBe('sem-repo')
})

test('C2: trava ocupada por outra sessão recente adia sem rodar git de escrita', async () => {
  const f = falso({
    'git update-ref refs/aprendiz/lock abc123 ': { exitCode: 1, stderr: 'cannot lock ref' },
    'git cat-file -p refs/aprendiz/lock': { stdout: 's2 990000\n' },
  })
  expect((await new Sincronizador(f.rodar, OPTS).enviar()).estado).toBe('ocupado')
  expect(f.chamadas.some(c => c.startsWith('git pull') || c.startsWith('git push') || c.startsWith('git commit'))).toBe(false)
})

test('C2: trava velha (mais de 3 min) é removida e retomada', async () => {
  const f = falso({
    'git update-ref refs/aprendiz/lock abc123 ': [{ exitCode: 1 }, { exitCode: 0 }],
    'git cat-file -p refs/aprendiz/lock': { stdout: 's2 700000\n' },
    'git rev-parse refs/aprendiz/lock': { stdout: 'old999\n' },
  })
  expect((await new Sincronizador(f.rodar, OPTS).puxar()).estado).toBe('ok')
  expect(f.chamadas).toContain('git update-ref -d refs/aprendiz/lock old999')
})

test('C2: clone fora da main ou no meio de rebase fica bloqueado', async () => {
  const f = falso({ 'git symbolic-ref --short -q HEAD': { exitCode: 1 } })
  expect((await new Sincronizador(f.rodar, OPTS).puxar()).estado).toBe('bloqueado')
  expect(f.chamadas.some(c => c.startsWith('git pull') || c.startsWith('git add'))).toBe(false)
  const g = falso({ 'git symbolic-ref --short -q HEAD': { stdout: 'feature\n' } })
  expect((await new Sincronizador(g.rodar, OPTS).commitar(1)).estado).toBe('bloqueado')
})

test('C2: entradas não mescladas bloqueiam e nunca são commitadas', async () => {
  const f = falso({ 'git status --porcelain': { stdout: 'UU conhecimento/pessoas/ana.md\n' } })
  expect((await new Sincronizador(f.rodar, OPTS).puxar()).estado).toBe('bloqueado')
  expect(f.chamadas.some(c => c.startsWith('git add') || c.startsWith('git commit'))).toBe(false)
})

test('C2: merge em andamento bloqueia', async () => {
  const f = falso({ 'git rev-parse -q --verify MERGE_HEAD': { exitCode: 0 } })
  expect((await new Sincronizador(f.rodar, OPTS).puxar()).estado).toBe('bloqueado')
})

test('I1: push só quando os commits à frente tocam apenas conhecimento/', async () => {
  const f = falso({ 'git diff --name-only @{u}..HEAD': { stdout: 'conhecimento/notas/a.md\nREADME.md\n' } })
  const r = await new Sincronizador(f.rodar, OPTS).enviar()
  expect(r.estado).toBe('adiado')
  expect(r.detalhe).toContain('README.md')
  expect(f.chamadas).not.toContain('git push')
  const g = falso({ 'git diff --name-only @{u}..HEAD': { stdout: 'conhecimento/notas/a.md\n' } })
  expect((await new Sincronizador(g.rodar, OPTS).enviar()).estado).toBe('ok')
  expect(g.chamadas).toContain('git push')
})

test('M5: falha de autenticação não é tratada como falta de rede', async () => {
  const f = falso({ 'git pull --rebase --no-autostash': { exitCode: 1, stderr: 'git@github.com: Permission denied (publickey).\nfatal: Could not read from remote repository.' } })
  expect((await new Sincronizador(f.rodar, OPTS).puxar()).estado).toBe('adiado')
})
