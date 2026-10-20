// Modelo de nota da base (spec 4.1): frontmatter YAML num subconjunto que
// escrevemos como JSON (strings entre aspas, listas inline), lido de volta
// com tolerância a edição manual simples.

export type TipoNota =
  | 'fato' | 'preferencia' | 'procedimento' | 'decisao' | 'artefato'
  | 'ativo' | 'pessoa' | 'organizacao' | 'projeto' | 'indice'

export type StatusNota = 'ativa' | 'substituida' | 'desfeita'

export type Confianca = 'alta' | 'media' | 'baixa'

export type Origem = {
  agente: string
  conta: string
  maquina: string
  projeto?: string
  sessao?: string
  trecho?: string
}

export type Nota = {
  id: string
  titulo: string
  tipo: TipoNota
  status: StatusNota
  apelidos: string[]
  tags: string[]
  criada: string
  atualizada: string
  origem: Origem
  substitui: string[]
  substituida_por: string | null
  confianca: Confianca
  extras: Record<string, unknown>
  corpo: string
}

// Definido aqui (e reexportado por indice.ts) para o escritor não depender
// do módulo de busca.
export type EntradaIndice = {
  id: string
  caminho: string
  titulo: string
  tipo: TipoNota
  status: StatusNota
  apelidos: string[]
  tags: string[]
  atualizada: string
}

export const TIPOS: readonly TipoNota[] = [
  'fato', 'preferencia', 'procedimento', 'decisao', 'artefato',
  'ativo', 'pessoa', 'organizacao', 'projeto', 'indice',
]
const STATUS: readonly StatusNota[] = ['ativa', 'substituida', 'desfeita']
const CONFIANCAS: readonly Confianca[] = ['alta', 'media', 'baixa']

const RESERVADOS_WINDOWS = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/

export function semAcento(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '')
}

export function slug(titulo: string): string {
  let s = semAcento(titulo)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/, '')
  if (s === '') s = 'nota'
  if (RESERVADOS_WINDOWS.test(s)) s = `${s}-nota`
  return s
}

// São Paulo não tem horário de verão desde 2019: UTC-3 fixo.
const FUSO_MS = -3 * 60 * 60 * 1000

function doisDigitos(n: number): string {
  return String(n).padStart(2, '0')
}

export function novoId(agora: Date, titulo: string): string {
  const local = new Date(agora.getTime() + FUSO_MS)
  const data = `${local.getUTCFullYear()}${doisDigitos(local.getUTCMonth() + 1)}${doisDigitos(local.getUTCDate())}`
  const hora = `${doisDigitos(local.getUTCHours())}${doisDigitos(local.getUTCMinutes())}`
  return `${data}-${hora}-${slug(titulo)}`
}

export function dataHoraLocal(agora: Date): string {
  const local = new Date(agora.getTime() + FUSO_MS)
  return `${local.toISOString().slice(0, 19)}-03:00`
}

export function pastaDoTipo(tipo: TipoNota): string {
  switch (tipo) {
    case 'pessoa': return 'pessoas'
    case 'organizacao': return 'organizacoes'
    case 'projeto': return 'projetos'
    case 'artefato': return 'artefatos'
    case 'ativo': return 'ativos'
    case 'indice': return 'indices'
    default: return 'notas'
  }
}

const CHAVES_FIXAS = [
  'id', 'titulo', 'tipo', 'status', 'apelidos', 'tags', 'criada', 'atualizada',
  'origem', 'substitui', 'substituida_por', 'confianca',
] as const
const CHAVES_ORIGEM = ['agente', 'conta', 'maquina', 'projeto', 'sessao', 'trecho'] as const

function valor(v: unknown): string {
  return JSON.stringify(v ?? null)
}

export function serializarNota(n: Nota): string {
  const linhas = ['---']
  linhas.push(`id: ${valor(n.id)}`)
  linhas.push(`titulo: ${valor(n.titulo)}`)
  linhas.push(`tipo: ${valor(n.tipo)}`)
  linhas.push(`status: ${valor(n.status)}`)
  linhas.push(`apelidos: ${valor(n.apelidos)}`)
  linhas.push(`tags: ${valor(n.tags)}`)
  linhas.push(`criada: ${valor(n.criada)}`)
  linhas.push(`atualizada: ${valor(n.atualizada)}`)
  linhas.push('origem:')
  for (const k of CHAVES_ORIGEM) {
    const v = n.origem[k]
    if (v !== undefined) linhas.push(`  ${k}: ${valor(v)}`)
  }
  linhas.push(`substitui: ${valor(n.substitui)}`)
  linhas.push(`substituida_por: ${valor(n.substituida_por)}`)
  linhas.push(`confianca: ${valor(n.confianca)}`)
  for (const [k, v] of Object.entries(n.extras)) linhas.push(`${k}: ${valor(v)}`)
  linhas.push('---')
  return `${linhas.join('\n')}\n${n.corpo}`
}

// Lê um valor escrito por nós (JSON) ou à mão (sem aspas, com comentário).
function lerValor(bruto: string): unknown {
  const t = bruto.trim()
  if (t === '') return null
  try { return JSON.parse(t) } catch { /* edição manual */ }
  const semComentario = t.replace(/\s+#.*$/, '').trim()
  try { return JSON.parse(semComentario) } catch { /* texto livre */ }
  if (semComentario.startsWith('[') && semComentario.endsWith(']')) {
    return semComentario.slice(1, -1).split(',').map(s => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean)
  }
  return semComentario.replace(/^["']|["']$/g, '')
}

type Cabecalho = { cabecalho: string; corpo: string; prefixo: string; fim: number }

function separar(texto: string): Cabecalho | null {
  const t = texto.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n')
  if (!t.startsWith('---\n')) return null
  const fim = t.indexOf('\n---\n', 3)
  if (fim !== -1) return { cabecalho: t.slice(4, fim), corpo: t.slice(fim + 5), prefixo: t.slice(0, fim + 5), fim }
  if (t.endsWith('\n---')) return { cabecalho: t.slice(4, t.length - 4), corpo: '', prefixo: `${t}\n`, fim: t.length - 4 }
  return null
}

export function lerFrontmatter(texto: string): { campos: Record<string, unknown>; corpo: string; integro: boolean } | null {
  const partes = separar(texto)
  if (!partes) return null
  const campos: Record<string, unknown> = {}
  let integro = true
  let chaveAtual: string | null = null
  for (const linha of partes.cabecalho.split('\n')) {
    if (linha.trim() === '' || linha.trim().startsWith('#')) continue
    const item = /^\s+-\s*(.*)$/.exec(linha)
    if (item && chaveAtual) {
      const atual = campos[chaveAtual]
      const lista = Array.isArray(atual) ? atual : atual && typeof atual === 'object' && Object.keys(atual).length === 0 ? [] : null
      if (lista) {
        lista.push(lerValor(item[1]!))
        campos[chaveAtual] = lista
        continue
      }
    }
    const aninhada = /^\s+([A-Za-z_][\w-]*):\s?(.*)$/.exec(linha)
    const mapa = chaveAtual ? campos[chaveAtual] : undefined
    if (aninhada && mapa && typeof mapa === 'object' && !Array.isArray(mapa)) {
      (mapa as Record<string, unknown>)[aninhada[1]!] = lerValor(aninhada[2]!)
      continue
    }
    const topo = /^([A-Za-z_][\w-]*):\s?(.*)$/.exec(linha)
    if (!topo) {
      integro = false
      continue
    }
    const [, chave, resto] = topo
    const valorBruto = resto!.replace(/\s+#.*$/, '').trim()
    chaveAtual = chave!
    if (valorBruto === '') {
      campos[chave!] = {}
    } else {
      if (/^[|>][+-]?$/.test(valorBruto)) integro = false
      campos[chave!] = lerValor(resto!)
    }
  }
  return { campos, corpo: partes.corpo, integro }
}

export function frontmatterIntegro(texto: string): boolean {
  return lerFrontmatter(texto)?.integro ?? false
}

export function corpoDe(texto: string): string {
  return separar(texto)?.corpo ?? texto
}

export function comCorpo(texto: string, corpo: string): string {
  const partes = separar(texto)
  return partes ? `${partes.prefixo}${corpo}` : corpo
}

// Troca só as linhas de topo pedidas (e as linhas indentadas que pertencem a
// elas); o resto do cabeçalho e o corpo ficam byte a byte.
export function editarFrontmatter(texto: string, campos: Record<string, unknown>): string {
  const partes = separar(texto)
  if (!partes) return texto
  const linhas = partes.cabecalho.split('\n')
  for (const [chave, v] of Object.entries(campos)) {
    const nova = `${chave}: ${valor(v)}`
    const i = linhas.findIndex(l => l.startsWith(`${chave}:`))
    if (i === -1) {
      linhas.push(nova)
      continue
    }
    let j = i + 1
    while (j < linhas.length && /^\s+\S/.test(linhas[j]!)) j++
    linhas.splice(i, j - i, nova)
  }
  return `---\n${linhas.join('\n')}\n---\n${partes.corpo}`
}

function listaDeTexto(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
}

export function parseNota(texto: string): Nota | null {
  const fm = lerFrontmatter(texto)
  if (!fm) return null
  const c = fm.campos
  if (typeof c.id !== 'string' || typeof c.titulo !== 'string') return null
  if (!TIPOS.includes(c.tipo as TipoNota) || !STATUS.includes(c.status as StatusNota)) return null
  const o = (c.origem && typeof c.origem === 'object' ? c.origem : {}) as Record<string, unknown>
  const origem: Origem = {
    agente: String(o.agente ?? ''),
    conta: String(o.conta ?? ''),
    maquina: String(o.maquina ?? ''),
  }
  for (const k of ['projeto', 'sessao', 'trecho'] as const) {
    if (typeof o[k] === 'string') origem[k] = o[k] as string
  }
  const extras: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(c)) {
    if (!(CHAVES_FIXAS as readonly string[]).includes(k)) extras[k] = v
  }
  return {
    id: c.id,
    titulo: c.titulo,
    tipo: c.tipo as TipoNota,
    status: c.status as StatusNota,
    apelidos: listaDeTexto(c.apelidos),
    tags: listaDeTexto(c.tags),
    criada: String(c.criada ?? ''),
    atualizada: String(c.atualizada ?? ''),
    origem,
    substitui: listaDeTexto(c.substitui),
    substituida_por: typeof c.substituida_por === 'string' ? c.substituida_por : null,
    confianca: CONFIANCAS.includes(c.confianca as Confianca) ? (c.confianca as Confianca) : 'media',
    extras,
    corpo: fm.corpo,
  }
}
