// Sincronização do jose-ops (spec 5.6): só conhecimento/, pull --rebase,
// nunca force push, nunca stash. O chamador fixa cwd e GIT_SSH_COMMAND.
// Uma trava em refs/aprendiz/lock (update-ref atômico) serializa sessões,
// contas e processos da mesma máquina.

export type Rodar = (argv: string[], stdin?: string) => Promise<{ exitCode: number; stdout: string; stderr: string }>

export type ResultadoSync = {
  estado: 'ok' | 'adiado' | 'sem-rede' | 'conflito' | 'sem-repo' | 'bloqueado' | 'ocupado'
  detalhe?: string
}

const PASTA = 'conhecimento/'
const RAMO = 'main'
const TRAVA = 'refs/aprendiz/lock'
const TRAVA_VELHA_MS = 3 * 60_000
const SEM_REDE = /Could not resolve host|Could not resolve hostname|Connection timed out|Network is unreachable|Connection refused|Operation timed out/i
const CONFLITO = /CONFLICT|could not apply|Resolve all conflicts/i
const NAO_MESCLADO = /^(DD|AU|UD|UA|DU|AA|UU) /

type Opts = { sshKeyPath: string; agente: string; conta: string; dono: string; agora: () => number }

export class Sincronizador {
  constructor(private readonly rodar: Rodar, private readonly opts: Opts) {}

  private async comTrava(fn: () => Promise<ResultadoSync>): Promise<ResultadoSync> {
    if ((await this.rodar(['git', 'rev-parse', '--git-dir'])).exitCode !== 0) return { estado: 'sem-repo' }
    const marca = (await this.rodar(['git', 'hash-object', '-w', '--stdin'], `${this.opts.dono} ${this.opts.agora()}\n`)).stdout.trim()
    if (!marca) return { estado: 'ocupado', detalhe: 'não foi possível criar a trava' }
    if (!(await this.travar(marca))) return { estado: 'ocupado' }
    try {
      return await fn()
    } finally {
      await this.rodar(['git', 'update-ref', '-d', TRAVA, marca])
    }
  }

  private async travar(marca: string): Promise<boolean> {
    if ((await this.rodar(['git', 'update-ref', TRAVA, marca, ''])).exitCode === 0) return true
    const atual = (await this.rodar(['git', 'cat-file', '-p', TRAVA])).stdout.trim()
    const quando = Number(atual.split(' ')[1])
    if (Number.isFinite(quando) && this.opts.agora() - quando < TRAVA_VELHA_MS) return false
    const antiga = (await this.rodar(['git', 'rev-parse', TRAVA])).stdout.trim()
    if (antiga) await this.rodar(['git', 'update-ref', '-d', TRAVA, antiga])
    return (await this.rodar(['git', 'update-ref', TRAVA, marca, ''])).exitCode === 0
  }

  private async estadoSeguro(): Promise<ResultadoSync | null> {
    const ramo = await this.rodar(['git', 'symbolic-ref', '--short', '-q', 'HEAD'])
    if (ramo.exitCode !== 0) return { estado: 'bloqueado', detalhe: 'HEAD destacado (rebase ou checkout em andamento)' }
    if (ramo.stdout.trim() !== RAMO) return { estado: 'bloqueado', detalhe: `ramo atual é ${ramo.stdout.trim()}, não ${RAMO}` }
    if ((await this.rodar(['git', 'rev-parse', '-q', '--verify', 'MERGE_HEAD'])).exitCode === 0) {
      return { estado: 'bloqueado', detalhe: 'merge em andamento' }
    }
    return null
  }

  private async status(): Promise<string[]> {
    return (await this.rodar(['git', 'status', '--porcelain'])).stdout.split('\n').filter(l => l.trim() !== '')
  }

  private async commitarSemTrava(nNotas: number): Promise<ResultadoSync> {
    const bloqueio = await this.estadoSeguro()
    if (bloqueio) return bloqueio
    if ((await this.status()).some(l => NAO_MESCLADO.test(l))) return { estado: 'bloqueado', detalhe: 'arquivos não mesclados' }
    await this.rodar(['git', 'add', '--', PASTA])
    const staged = await this.rodar(['git', 'diff', '--cached', '--quiet', '--', PASTA])
    if (staged.exitCode === 0) return { estado: 'ok' }
    const msg = `conhecimento: ${this.opts.agente} ${this.opts.conta} +${nNotas} notas`
    const r = await this.rodar(['git', 'commit', '-m', msg, '--', PASTA])
    return r.exitCode === 0 ? { estado: 'ok' } : { estado: 'adiado', detalhe: r.stderr.trim() }
  }

  private async puxarSemTrava(): Promise<ResultadoSync> {
    const bloqueio = await this.estadoSeguro()
    if (bloqueio) return bloqueio
    const linhas = await this.status()
    if (linhas.some(l => NAO_MESCLADO.test(l))) return { estado: 'bloqueado', detalhe: 'arquivos não mesclados' }
    const caminhoDe = (l: string) => l.slice(3).replace(/^"|"$/g, '')
    const foraRastreado = linhas.filter(l => !l.startsWith('??') && !caminhoDe(l).startsWith(PASTA))
    if (foraRastreado.length > 0) {
      return { estado: 'adiado', detalhe: `mudanças fora de ${PASTA}: ${foraRastreado.map(caminhoDe).join(', ')}` }
    }
    const nossas = linhas.filter(l => caminhoDe(l).startsWith(PASTA)).length
    if (nossas > 0) {
      const c = await this.commitarSemTrava(nossas)
      if (c.estado !== 'ok') return c
    }
    const r = await this.rodar(['git', 'pull', '--rebase', '--no-autostash'])
    if (r.exitCode === 0) return { estado: 'ok' }
    const saida = `${r.stdout}\n${r.stderr}`
    if (SEM_REDE.test(saida)) return { estado: 'sem-rede' }
    if (CONFLITO.test(saida)) {
      await this.rodar(['git', 'rebase', '--abort'])
      return { estado: 'conflito', detalhe: saida.trim() }
    }
    return { estado: 'adiado', detalhe: saida.trim() }
  }

  commitar(nNotas: number): Promise<ResultadoSync> {
    return this.comTrava(() => this.commitarSemTrava(nNotas))
  }

  puxar(): Promise<ResultadoSync> {
    return this.comTrava(() => this.puxarSemTrava())
  }

  enviar(): Promise<ResultadoSync> {
    return this.comTrava(async () => {
      const p = await this.puxarSemTrava()
      if (p.estado !== 'ok') return p
      const afrente = await this.rodar(['git', 'diff', '--name-only', '@{u}..HEAD'])
      if (afrente.exitCode !== 0) return { estado: 'adiado', detalhe: 'ramo sem upstream' }
      const fora = afrente.stdout.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith(PASTA))
      if (fora.length > 0) return { estado: 'adiado', detalhe: `commits locais fora de ${PASTA} esperando o José: ${fora.join(', ')}` }
      const r = await this.rodar(['git', 'push'])
      if (r.exitCode === 0) return { estado: 'ok' }
      const saida = `${r.stdout}\n${r.stderr}`
      if (SEM_REDE.test(saida)) return { estado: 'sem-rede' }
      return { estado: 'adiado', detalhe: saida.trim() }
    })
  }
}
