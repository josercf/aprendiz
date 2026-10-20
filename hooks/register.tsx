// Adaptador entre a API de mods do Claude Code e a orquestração em lib/.
import type { Register } from 'claude-code'
import { Aprendiz, type Ambiente } from './lib/aprendiz'
import { contaDe, expandirCaminho } from './lib/config'

const ORIGENS_DA_PESSOA = new Set(['composer', 'bridge', 'sdk'])
const FERRAMENTA = 'mcp__aprendiz__consentimento'

export const register: Register = (on, options) => {
  let aprendiz: Aprendiz | undefined
  let cwd = ''

  on('session.start', async ($, e, next) => {
    cwd = e.cwd
    const home = (await $.env.get('HOME')) ?? (await $.env.get('USERPROFILE')) ?? ''
    const conta = contaDe(await $.env.get('CLAUDE_CONFIG_DIR'))
    const repo = expandirCaminho(String(options.repoPath ?? '~/Projects/jose-ops'), home)
    const chave = expandirCaminho(String(options.sshKeyPath ?? '~/.ssh/id_ed25519_josercf'), home)
    const modelo = String(options.modelo ?? 'haiku')
    const maquina = (await $.process.run(['hostname']).catch(() => ({ stdout: '' }))).stdout.trim() || 'desconhecida'
    const sessao = await $.session.id()

    const amb: Ambiente = {
      ler: p => $.fs.read(p).then(t => (typeof t === 'string' ? t : undefined), () => undefined),
      escrever: (p, t) => $.fs.write(p, t),
      listar: p => $.fs.list(p).catch(() => []),
      existe: p => $.fs.exists(p),
      rodar: (argv, stdin) => $.process.run(argv, {
        cwd: repo,
        ...(stdin !== undefined ? { stdin } : {}),
        env: { GIT_SSH_COMMAND: `ssh -i "${chave}" -o IdentitiesOnly=yes`, GIT_TERMINAL_PROMPT: '0' },
        timeoutMs: 120_000,
      }).catch((err: unknown) => ({ exitCode: 1, stdout: '', stderr: String(err) })),
      completar: async (system, prompt) => {
        const r = await $.model.complete({ model: modelo, system: [{ text: system, cache: true }], prompt, maxTokens: 8192, timeoutMs: 60_000 })
        return r.isAnswered ? r.text : null
      },
      storeGet: k => $.store.get(k),
      storeSet: (k, v) => $.store.set(k, v),
      toast: async t => { $.ui.toast(t) },
      agora: () => Date.now(),
    }

    const a = new Aprendiz(amb, { repo, conta, maquina, sessao, intervaloMin: Number(options.perguntaIntervaloMin ?? 30) })
    if (await a.iniciar()) {
      aprendiz = a
      await $.command.register({ name: 'aprendido', description: 'Lista, desfaz, pausa ou retoma o que o aprendiz gravou hoje.' })
      await $.tool.register({
        name: 'consentimento',
        description: 'Registra a resposta do José (s, n ou nunca) a uma sugestão de busca do aprendiz.',
        isDeferred: false,
        inputSchema: {
          type: 'object',
          properties: {
            situacao: { type: 'string', enum: ['aula', 'investigacao-footstats', 'geral'] },
            fonte: { type: 'string', enum: ['jose-ops', 'footstats-wiki'] },
            resposta: { type: 'string', enum: ['s', 'n', 'nunca'] },
          },
          required: ['situacao', 'fonte', 'resposta'],
        },
      })
      $.clock.after(0, () => { void a.puxarPeriodico() })
      $.clock.every(5_000, () => { void a.processarFila() })
      $.clock.every(Number(options.commitIntervaloMin ?? 5) * 60_000, () => { void a.sincronizar() })
      $.clock.every(Number(options.pullIntervaloMin ?? 10) * 60_000, () => { void a.puxarPeriodico() })
    }
    return next(e)
  })

  on('prompt.submit', async ($, e, next) => {
    if (!aprendiz || e.command || e.isMeta || !ORIGENS_DA_PESSOA.has(e.origin.kind)) return next(e)
    const ctx = await aprendiz.aoPrompt({ texto: e.text, projeto: cwd })
    return next(ctx ? { ...e, context: [...(e.context ?? []), ctx] } : e)
  }).catch(($, e, next) => next(e))

  on('tool.call', { tool: ['Write', 'Edit', 'NotebookEdit'] }, async ($, e, next) => {
    const r = await next(e)
    const entrada = e as unknown as { file_path?: unknown; notebook_path?: unknown }
    const caminho = entrada.file_path ?? entrada.notebook_path
    if (aprendiz && r.deny === undefined && r.isError !== true && typeof caminho === 'string') {
      await aprendiz.aoEscreverArquivo(caminho)
    }
    return r
  }).catch(($, e, next) => next(e))

  on('tool.call', { tool: FERRAMENTA }, async ($, e) => {
    const input = e as unknown as { situacao: string; fonte: string; resposta: string }
    const texto = aprendiz ? await aprendiz.consentimento(input) : 'Aprendiz inativo.'
    return { result: { texto }, text: texto }
  }).catch(() => ({ result: { texto: 'Falha ao registrar.' }, text: 'Falha ao registrar.' }))

  on('command.run', { command: 'aprendido' }, async ($, e) => ({
    text: aprendiz ? await aprendiz.comando(e.args) : 'Aprendiz inativo nesta sessão.',
  }))

  on('session.end', async ($, e, next) => {
    await aprendiz?.encerrar()
    return next(e)
  })
}
