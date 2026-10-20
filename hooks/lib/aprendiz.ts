// Orquestração do mod: fila, worker, comandos e consentimento. Recebe o
// mundo externo por `Ambiente`, para register.tsx adaptar `$` e os testes
// usarem memória. O `$.store` é compartilhado entre as contas da máquina,
// então tudo que é por conta leva a conta na chave ou no item.

import { decidir, gravarConsentimento, lerConsentimentos, montarContexto, type EstadoFrequencia, type Fonte } from './consentimento'
import { juntar } from './config'
import { planejarDesfazer, planejarEscritas, planejarRestaurar } from './escritor'
import { lerResposta, montarPedido, type ItemExtraido } from './extracao'
import { ehTrivial, removerSegredos } from './filtro'
import { Sincronizador, type ResultadoSync, type Rodar } from './git'
import { buscar, classificar, indexar, type Situacao } from './indice'
import { dataHoraLocal, semAcento, type EntradaIndice, type Origem } from './nota'

export type Ambiente = {
  ler: (caminho: string) => Promise<string | undefined>
  escrever: (caminho: string, texto: string) => Promise<void>
  listar: (caminho: string) => Promise<{ name: string; kind: 'file' | 'dir' | 'other' }[]>
  existe: (caminho: string) => Promise<boolean>
  rodar: Rodar
  completar: (system: string, prompt: string) => Promise<string | null>
  storeGet: (chave: string) => Promise<unknown>
  storeSet: (chave: string, valor: unknown) => Promise<void>
  toast: (texto: string) => Promise<void>
  agora: () => number
}

export type ConfigAprendiz = { repo: string; conta: string; maquina: string; intervaloMin: number; sessao: string }

type ItemFila = { prompt: string; projeto: string; sessao: string; conta: string; recebidoMs: number; tentativas: number }
type ArtefatoPendente = { caminho: string; projeto: string; prompt: string; sessao: string; conta: string; recebidoMs: number }
type Gravada = { id: string; titulo: string; caminho: string; data: string; conta: string; desfeita?: boolean }
type Frequencia = EstadoFrequencia & { sessao: string }

const K = {
  fila: 'aprendiz.fila',
  artefatos: 'aprendiz.artefatos',
  gravadas: 'aprendiz.gravadas',
  naoCommitadas: 'aprendiz.naoCommitadas',
} as const

const ORFAO_MS = 10 * 60_000
const PULL_ANTES_MS = 2 * 60_000
const MAX_TENTATIVAS = 3
const CONSENTIMENTOS = 'conhecimento/_sistema/consentimentos.md'
const INDICE = 'conhecimento/_sistema/indice.json'
const EXT_ARTEFATO = /\.(html|md|pptx|docx|pdf)$/
const PASTA_ARTEFATO = /(^|\/)[^/]*(aula|deck|slides|ava|modulo)[^/]*\//

function limparItem(it: ItemExtraido): ItemExtraido {
  const l = (t: string) => removerSegredos(t).texto
  return {
    ...it,
    titulo: l(it.titulo),
    corpo: l(it.corpo),
    trecho: l(it.trecho),
    apelidos: it.apelidos.map(l),
    tags: it.tags.map(l),
    vinculos: it.vinculos.map(l),
    ...(it.pessoa !== undefined ? { pessoa: l(it.pessoa) } : {}),
    ...(it.linhaHistorico !== undefined ? { linhaHistorico: l(it.linhaHistorico) } : {}),
  }
}

export class Aprendiz {
  private ativo = false
  private emAndamento: Promise<void> | undefined
  private indice: EntradaIndice[] = []
  private textos = new Map<string, string>()
  private ultimoPrompt: { texto: string; projeto: string } | undefined
  private ultimoPullMs = -Infinity
  private falhasSync = 0
  private avisouSync = false
  private avisouModelo = false
  private readonly sync: Sincronizador

  constructor(private readonly amb: Ambiente, private readonly cfg: ConfigAprendiz) {
    this.sync = new Sincronizador(amb.rodar, { sshKeyPath: '', agente: 'claude-code', conta: cfg.conta, dono: cfg.sessao, agora: amb.agora })
  }

  private abs(rel: string): string {
    return juntar(this.cfg.repo, rel)
  }

  private chave(base: string): string {
    return `${base}.${this.cfg.conta}`
  }

  private async lista<T>(chave: string): Promise<T[]> {
    const v = await this.amb.storeGet(chave)
    return Array.isArray(v) ? (v as T[]) : []
  }

  private hoje(): string {
    return dataHoraLocal(new Date(this.amb.agora())).slice(0, 10)
  }

  private meu(item: { sessao: string; conta: string; recebidoMs: number }): boolean {
    if (item.conta !== this.cfg.conta) return false
    return item.sessao === this.cfg.sessao || this.amb.agora() - item.recebidoMs > ORFAO_MS
  }

  private async somarNaoCommitadas(n: number): Promise<void> {
    const atual = Number((await this.amb.storeGet(K.naoCommitadas)) ?? 0)
    await this.amb.storeSet(K.naoCommitadas, atual + n)
  }

  // Sem rede: a sessão abre na hora; o pull vem depois (puxarPeriodico).
  async iniciar(): Promise<boolean> {
    if (!(await this.amb.existe(this.abs('.git')))) {
      await this.amb.toast(`Aprendiz: jose-ops não encontrado em ${this.cfg.repo}. Ajuste repoPath em /config.`)
      this.ativo = false
      return false
    }
    this.ativo = true
    await this.reindexar()
    return true
  }

  async reindexar(): Promise<void> {
    if (!this.ativo) return
    const textos = new Map<string, string>()
    const percorrer = async (rel: string) => {
      for (const e of await this.amb.listar(this.abs(rel))) {
        const filho = `${rel}/${e.name}`
        if (e.kind === 'dir' && e.name !== '_sistema') await percorrer(filho)
        else if (e.kind === 'file' && e.name.endsWith('.md')) {
          const t = await this.amb.ler(this.abs(filho))
          if (t !== undefined) textos.set(filho, t)
        }
      }
    }
    await percorrer('conhecimento')
    this.textos = textos
    this.atualizarIndice()
    await this.amb.escrever(this.abs(INDICE), JSON.stringify(this.indice))
  }

  private atualizarIndice(): void {
    this.indice = indexar([...this.textos].map(([caminho, texto]) => ({ caminho, texto })))
  }

  private async observarSync(r: ResultadoSync): Promise<void> {
    if (r.estado === 'ok' || r.estado === 'sem-rede' || r.estado === 'ocupado') {
      if (r.estado === 'ok') {
        this.falhasSync = 0
        this.avisouSync = false
      }
      return
    }
    this.falhasSync++
    const urgente = r.estado === 'bloqueado' || r.estado === 'sem-repo'
    if (!this.avisouSync && (urgente || this.falhasSync >= 2)) {
      this.avisouSync = true
      await this.amb.toast(`Aprendiz: não consegui sincronizar o jose-ops (${r.estado}${r.detalhe ? `: ${r.detalhe.slice(0, 160)}` : ''}). As notas ficam locais até resolver.`)
    }
  }

  private async puxar(): Promise<void> {
    const r = await this.sync.puxar()
    await this.observarSync(r)
    if (r.estado === 'ok') {
      this.ultimoPullMs = this.amb.agora()
      await this.reindexar()
    }
  }

  async aoPrompt(input: { texto: string; projeto: string }): Promise<string | undefined> {
    if (!this.ativo || (await this.amb.storeGet(this.chave('aprendiz.pausado'))) === true || ehTrivial(input.texto)) return undefined
    this.ultimoPrompt = input
    const fila = await this.lista<ItemFila>(K.fila)
    fila.push({ prompt: input.texto, projeto: input.projeto, sessao: this.cfg.sessao, conta: this.cfg.conta, recebidoMs: this.amb.agora(), tentativas: 0 })
    await this.amb.storeSet(K.fila, fila)

    const situacao = classificar(input.texto, this.cfg.conta)
    const acertos = buscar(this.indice, input.texto, situacao)
    const consentimentos = lerConsentimentos((await this.amb.ler(this.abs(CONSENTIMENTOS))) ?? '')
    const estado = await this.frequencia()
    const d = decidir({ situacao, acertos: acertos.length, consentimentos, estado, agoraMs: this.amb.agora(), intervaloMin: this.cfg.intervaloMin })
    if (d.modo === 'perguntar') await this.marcarPergunta(situacao)
    return montarContexto(d, situacao, acertos.map(a => ({ ...a.entrada, caminho: this.abs(a.entrada.caminho) })))
  }

  private async frequencia(): Promise<Frequencia> {
    const f = (await this.amb.storeGet(this.chave('aprendiz.frequencia'))) as Frequencia | undefined
    if (!f) return { sessao: this.cfg.sessao, perguntadasNaSessao: [] }
    if (f.sessao !== this.cfg.sessao) return { sessao: this.cfg.sessao, ultimaPerguntaMs: f.ultimaPerguntaMs, perguntadasNaSessao: [] }
    return f
  }

  private async marcarPergunta(situacao: Situacao): Promise<void> {
    const f = await this.frequencia()
    const perguntadas = f.perguntadasNaSessao.includes(situacao) ? f.perguntadasNaSessao : [...f.perguntadasNaSessao, situacao]
    await this.amb.storeSet(this.chave('aprendiz.frequencia'), { sessao: this.cfg.sessao, ultimaPerguntaMs: this.amb.agora(), perguntadasNaSessao: perguntadas })
  }

  async aoEscreverArquivo(caminho: string): Promise<void> {
    if (!this.ativo) return
    const normal = semAcento(caminho.replace(/\\/g, '/')).toLowerCase()
    if (!EXT_ARTEFATO.test(normal) || !PASTA_ARTEFATO.test(normal)) return
    const pendentes = await this.lista<ArtefatoPendente>(K.artefatos)
    if (pendentes.some(p => p.caminho === caminho)) return
    pendentes.push({
      caminho,
      projeto: this.ultimoPrompt?.projeto ?? '',
      prompt: this.ultimoPrompt?.texto ?? '',
      sessao: this.cfg.sessao,
      conta: this.cfg.conta,
      recebidoMs: this.amb.agora(),
    })
    await this.amb.storeSet(K.artefatos, pendentes)
  }

  processarFila(): Promise<void> {
    if (!this.ativo) return Promise.resolve()
    if (this.emAndamento) return this.emAndamento
    this.emAndamento = this.processarUm().finally(() => { this.emAndamento = undefined })
    return this.emAndamento
  }

  private mesmoItem(a: ItemFila, b: ItemFila): boolean {
    return a.sessao === b.sessao && a.recebidoMs === b.recebidoMs && a.prompt === b.prompt
  }

  private async contarFalha(item: ItemFila): Promise<boolean> {
    const atual = await this.lista<ItemFila>(K.fila)
    const idx = atual.findIndex(i => this.mesmoItem(i, item))
    if (idx === -1) return false
    const tentativas = atual[idx]!.tentativas + 1
    const descartado = tentativas >= MAX_TENTATIVAS
    if (descartado) atual.splice(idx, 1)
    else atual[idx] = { ...atual[idx]!, tentativas }
    await this.amb.storeSet(K.fila, atual)
    return descartado
  }

  private async processarUm(): Promise<void> {
    await this.processarArtefatos()
    const fila = await this.lista<ItemFila>(K.fila)
    const item = fila.find(i => this.meu(i))
    if (!item) return
    if (this.amb.agora() - this.ultimoPullMs > PULL_ANTES_MS) await this.puxar()
    const texto = removerSegredos(item.prompt).texto
    const candidatas = buscar(this.indice, texto, 'geral', 30).map(a => ({ id: a.entrada.id, titulo: a.entrada.titulo, tipo: a.entrada.tipo, apelidos: a.entrada.apelidos }))
    const pedido = montarPedido({ prompt: texto, conta: this.cfg.conta, projeto: item.projeto, candidatas })
    let resposta: string | null
    try {
      resposta = await this.amb.completar(pedido.system, pedido.prompt)
    } catch {
      if ((await this.contarFalha(item)) && !this.avisouModelo) {
        this.avisouModelo = true
        await this.amb.toast('Aprendiz: o modelo de extração falhou três vezes num prompt e ele foi descartado. Confira a opção modelo em /config.')
      }
      return
    }
    const lidos = resposta === null ? null : lerResposta(resposta)
    if (lidos === null) {
      await this.contarFalha(item)
      return
    }
    const ids = new Set(candidatas.map(c => c.id))
    const itens = lidos.map(i => (i.acao === 'substituir' && !ids.has(i.substitui ?? '') ? { ...i, acao: 'criar' as const, substitui: undefined } : i))
    if (itens.length > 0) await this.gravar(itens, { projeto: item.projeto, sessao: item.sessao })
    const atual = await this.lista<ItemFila>(K.fila)
    await this.amb.storeSet(K.fila, atual.filter(i => !this.mesmoItem(i, item)))
  }

  private async processarArtefatos(): Promise<void> {
    const pendentes = await this.lista<ArtefatoPendente>(K.artefatos)
    const meus = pendentes.filter(p => this.meu(p))
    if (meus.length === 0) return
    const itens: ItemExtraido[] = meus.map(p => {
      const partes = p.caminho.replace(/\\/g, '/').split('/')
      const nome = partes.pop() ?? p.caminho
      const pasta = partes.pop() ?? ''
      const pedido = p.prompt.slice(0, 300)
      return {
        acao: 'criar',
        tipo: 'artefato',
        titulo: pasta ? `${nome} em ${pasta}` : nome,
        apelidos: [],
        tags: ['artefato'],
        corpo: `Arquivo: ${p.caminho}\nProjeto: ${p.projeto}${pedido ? `\n\nPedido de origem:\n\n> ${pedido.replace(/\n/g, '\n> ')}` : ''}`,
        vinculos: [],
        trecho: pedido || p.caminho,
        confianca: 'alta',
      }
    })
    await this.gravar(itens, { projeto: meus[0]!.projeto, sessao: meus[0]!.sessao })
    const atual = await this.lista<ArtefatoPendente>(K.artefatos)
    await this.amb.storeSet(K.artefatos, atual.filter(p => !meus.some(m => m.caminho === p.caminho && m.recebidoMs === p.recebidoMs)))
  }

  private planejar(itens: ItemExtraido[], origem: Origem) {
    return planejarEscritas({
      itens, indice: this.indice, lerNota: c => this.textos.get(c), existentes: [...this.textos.keys()],
      agora: new Date(this.amb.agora()), origem,
    })
  }

  private async gravar(brutos: ItemExtraido[], extra: { projeto: string; sessao: string }): Promise<void> {
    const itens = brutos.map(limparItem)
    const origem: Origem = { agente: 'claude-code', conta: this.cfg.conta, maquina: this.cfg.maquina, projeto: extra.projeto, sessao: extra.sessao }
    let plano = this.planejar(itens, origem)
    for (const c of plano.criadas) {
      if (await this.amb.existe(this.abs(c.caminho))) {
        await this.reindexar()
        plano = this.planejar(itens, origem)
        break
      }
    }
    for (const e of plano.escritas) {
      await this.amb.escrever(this.abs(e.caminho), e.texto)
      this.textos.set(e.caminho, e.texto)
    }
    this.atualizarIndice()
    if (plano.escritas.length > 0) await this.somarNaoCommitadas(plano.escritas.length)
    const { criadas } = plano
    if (criadas.length === 0) return
    const gravadas = await this.lista<Gravada>(K.gravadas)
    const data = this.hoje()
    gravadas.push(...criadas.map(c => ({ ...c, data, conta: this.cfg.conta })))
    await this.amb.storeSet(K.gravadas, gravadas.filter(g => g.data >= data).slice(-300))
    const curtos = criadas.map(c => (c.titulo.length > 40 ? `${c.titulo.slice(0, 39)}…` : c.titulo))
    const mostra = curtos.slice(0, 3).join(' · ') + (curtos.length > 3 ? ` (+${curtos.length - 3})` : '')
    await this.amb.toast(`✦ Aprendi ${criadas.length} ${criadas.length === 1 ? 'coisa' : 'coisas'}: ${mostra} · /aprendido desfazer`)
  }

  async sincronizar(): Promise<void> {
    if (!this.ativo) return
    const n = Number((await this.amb.storeGet(K.naoCommitadas)) ?? 0)
    const c = await this.sync.commitar(n)
    if (c.estado === 'ok') await this.amb.storeSet(K.naoCommitadas, 0)
    else await this.observarSync(c)
    const r = await this.sync.enviar()
    await this.observarSync(r)
    if (r.estado === 'ok') {
      this.ultimoPullMs = this.amb.agora()
      await this.reindexar()
    }
  }

  async puxarPeriodico(): Promise<void> {
    if (!this.ativo) return
    await this.puxar()
  }

  async comando(args: string): Promise<string> {
    const [sub = '', alvo] = args.trim().split(/\s+/)
    if (!this.ativo) return `Aprendiz inativo: jose-ops não encontrado em ${this.cfg.repo}.`
    if (sub === '') {
      const hoje = (await this.lista<Gravada>(K.gravadas)).filter(g => g.data === this.hoje() && g.conta === this.cfg.conta)
      if (hoje.length === 0) return 'Nada gravado hoje nesta conta.'
      return ['Gravado hoje:', ...hoje.map(g => `- ${g.titulo} (${g.id})${g.desfeita ? ' [desfeita]' : ''}`)].join('\n')
    }
    if (sub === 'desfazer') {
      const gravadas = await this.lista<Gravada>(K.gravadas)
      const minhas = gravadas.filter(g => g.conta === this.cfg.conta)
      const g = alvo ? minhas.find(x => x.id === alvo) : [...minhas].reverse().find(x => !x.desfeita)
      if (!g) return alvo ? `Nenhuma gravação com id ${alvo}.` : 'Nada para desfazer.'
      const texto = this.textos.get(g.caminho) ?? (await this.amb.ler(this.abs(g.caminho)))
      if (texto === undefined) return `Arquivo não encontrado: ${g.caminho}`
      const agora = new Date(this.amb.agora())
      const d = planejarDesfazer(texto, agora)
      await this.amb.escrever(this.abs(g.caminho), d.texto)
      this.textos.set(g.caminho, d.texto)
      let alteradas = 1
      for (const id of d.restaurar) {
        const alvoAntigo = this.indice.find(e => e.id === id)
        const antigo = alvoAntigo && this.textos.get(alvoAntigo.caminho)
        if (!alvoAntigo || antigo === undefined) continue
        const restaurado = planejarRestaurar(antigo, agora)
        await this.amb.escrever(this.abs(alvoAntigo.caminho), restaurado)
        this.textos.set(alvoAntigo.caminho, restaurado)
        alteradas++
      }
      this.atualizarIndice()
      g.desfeita = true
      await this.amb.storeSet(K.gravadas, gravadas)
      await this.somarNaoCommitadas(alteradas)
      return `Desfeita: ${g.titulo}${alteradas > 1 ? ' (a versão anterior voltou a valer)' : ''}`
    }
    if (sub === 'pausar') {
      await this.amb.storeSet(this.chave('aprendiz.pausado'), true)
      return 'Captura pausada nesta conta. Use /aprendido retomar para voltar.'
    }
    if (sub === 'retomar') {
      await this.amb.storeSet(this.chave('aprendiz.pausado'), false)
      return 'Captura retomada.'
    }
    if (sub === 'consentimentos') {
      return (await this.amb.ler(this.abs(CONSENTIMENTOS))) ?? 'Nenhum consentimento registrado.'
    }
    return 'Uso: /aprendido [desfazer [id] | pausar | retomar | consentimentos]'
  }

  async consentimento(input: { situacao: string; fonte: string; resposta: string }): Promise<string> {
    const situacoes: Situacao[] = ['aula', 'investigacao-footstats', 'geral']
    const fontes: Fonte[] = ['jose-ops', 'footstats-wiki']
    if (!situacoes.includes(input.situacao as Situacao) || !fontes.includes(input.fonte as Fonte)) return 'Situação ou fonte inválida.'
    if (!['s', 'n', 'nunca'].includes(input.resposta)) return 'Resposta inválida: use s, n ou nunca.'
    const situacao = input.situacao as Situacao
    await this.marcarPergunta(situacao)
    if (input.resposta === 'n') return 'Entendido, só desta vez.'
    const decisao = input.resposta === 's' ? 'sempre' : 'nunca'
    const atual = (await this.amb.ler(this.abs(CONSENTIMENTOS))) ?? ''
    await this.amb.escrever(this.abs(CONSENTIMENTOS), gravarConsentimento(atual, { situacao, fonte: input.fonte as Fonte, decisao, definido: this.hoje() }))
    await this.somarNaoCommitadas(1)
    return decisao === 'sempre' ? 'Gravado: busco sem perguntar nesta situação.' : 'Gravado: não ofereço mais nesta situação.'
  }

  // O fim de sessão tem orçamento curto: só commit local, sem rede e sem
  // modelo. A fila fica no store e outra sessão da mesma conta a retoma.
  async encerrar(): Promise<void> {
    if (!this.ativo) return
    const n = Number((await this.amb.storeGet(K.naoCommitadas)) ?? 0)
    if ((await this.sync.commitar(n)).estado === 'ok') await this.amb.storeSet(K.naoCommitadas, 0)
  }
}
