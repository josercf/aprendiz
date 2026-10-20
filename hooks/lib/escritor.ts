// Transforma itens extraídos em escritas de arquivo (spec 4.1 a 4.3).
// Puro: recebe o índice e uma função de leitura, devolve o que gravar.

import type { ItemExtraido } from './extracao'
import {
  comCorpo, corpoDe, dataHoraLocal, editarFrontmatter, frontmatterIntegro, novoId, parseNota, pastaDoTipo, serializarNota, slug,
  type EntradaIndice, type Nota, type Origem, type TipoNota,
} from './nota'

export type Escrita = { caminho: string; texto: string }
export type NotaCriada = { id: string; titulo: string; caminho: string }

const MARCA_HISTORICO = '## Histórico'

function vinculosEmMarkdown(vinculos: string[]): string {
  const links = [...new Set(vinculos.map(slug))]
  return links.length === 0 ? '' : `\n\n## Vínculos\n\n${links.map(l => `- [[${l}]]`).join('\n')}`
}

export function acrescentarHistorico(corpo: string, linha: string): string {
  const i = corpo.indexOf(MARCA_HISTORICO)
  if (i === -1) {
    const antes = corpo.replace(/\s+$/, '')
    return `${antes ? `${antes}\n\n` : ''}${MARCA_HISTORICO}\n\n${linha}\n`
  }
  const inicio = i + MARCA_HISTORICO.length
  const proxima = corpo.indexOf('\n## ', inicio)
  const fim = proxima === -1 ? corpo.length : proxima + 1
  const secao = corpo.slice(inicio, fim).replace(/\s+$/, '')
  const nova = `${secao ? `${secao}\n` : '\n\n'}${linha}\n`
  return corpo.slice(0, inicio) + nova + (proxima === -1 ? '' : `\n${corpo.slice(fim)}`)
}

export function planejarEscritas(input: {
  itens: ItemExtraido[]
  indice: EntradaIndice[]
  lerNota: (caminho: string) => string | undefined
  existentes?: string[]
  agora: Date
  origem: Origem
}): { escritas: Escrita[]; criadas: NotaCriada[] } {
  const pendentes = new Map<string, string>()
  const indice = [...input.indice]
  const criadas: NotaCriada[] = []
  const quando = dataHoraLocal(input.agora)
  const dia = quando.slice(0, 10)
  const tomados = new Set([...(input.existentes ?? []), ...input.indice.map(e => e.caminho)].map(c => c.toLowerCase()))

  const lerTexto = (caminho: string) => pendentes.get(caminho) ?? input.lerNota(caminho)
  const gravarTexto = (caminho: string, texto: string) => {
    pendentes.set(caminho, texto)
    tomados.add(caminho.toLowerCase())
    const n = parseNota(texto)
    if (!n) return
    const e: EntradaIndice = { id: n.id, caminho, titulo: n.titulo, tipo: n.tipo, status: n.status, apelidos: n.apelidos, tags: n.tags, atualizada: n.atualizada }
    const pos = indice.findIndex(x => x.caminho === caminho)
    if (pos === -1) indice.push(e)
    else indice[pos] = e
  }
  const ocupado = (caminho: string) => tomados.has(caminho.toLowerCase()) || input.lerNota(caminho) !== undefined
  const caminhoLivre = (tipo: TipoNota, titulo: string) => {
    const pasta = `conhecimento/${pastaDoTipo(tipo)}`
    const base = slug(titulo)
    let caminho = `${pasta}/${base}.md`
    for (let n = 2; ocupado(caminho); n++) caminho = `${pasta}/${base}-${n}.md`
    return caminho
  }
  const encontrar = (tipo: TipoNota, titulo: string) => {
    const alvo = slug(titulo)
    return indice.find(e => e.status === 'ativa' && e.tipo === tipo
      && (slug(e.titulo) === alvo || e.apelidos.some(a => slug(a) === alvo)))
  }
  const criar = (it: ItemExtraido, substitui: string[] = []): Nota => {
    const corpo = it.tipo === 'pessoa'
      ? `## Quem é\n\n${it.corpo.trim()}\n\n${MARCA_HISTORICO}\n${vinculosEmMarkdown(it.vinculos)}\n`
      : `${it.corpo.trim()}${vinculosEmMarkdown(it.vinculos)}\n`
    const n: Nota = {
      id: novoId(input.agora, it.titulo),
      titulo: it.titulo,
      tipo: it.tipo,
      status: 'ativa',
      apelidos: [...new Set(it.apelidos)],
      tags: [...new Set(it.tags)],
      criada: quando,
      atualizada: quando,
      origem: { ...input.origem, trecho: it.trecho },
      substitui,
      substituida_por: null,
      confianca: it.confianca,
      extras: {},
      corpo,
    }
    const caminho = caminhoLivre(it.tipo, it.titulo)
    gravarTexto(caminho, serializarNota(n))
    criadas.push({ id: n.id, titulo: n.titulo, caminho })
    return n
  }

  for (const it of input.itens) {
    if (it.acao === 'historico') {
      const nome = it.pessoa ?? it.titulo
      let e = encontrar('pessoa', nome)
      if (!e) {
        criar({ ...it, tipo: 'pessoa', titulo: nome, corpo: '' })
        e = encontrar('pessoa', nome)
      }
      const texto = e && lerTexto(e.caminho)
      if (!e || texto === undefined) continue
      const comLinha = comCorpo(texto, acrescentarHistorico(corpoDe(texto), `- ${dia} · ${it.linhaHistorico}`))
      gravarTexto(e.caminho, frontmatterIntegro(comLinha) ? editarFrontmatter(comLinha, { atualizada: quando }) : comLinha)
      continue
    }

    if (it.acao === 'substituir') {
      const alvo = indice.find(e => e.id === it.substitui && e.status === 'ativa')
      const texto = alvo && lerTexto(alvo.caminho)
      if (alvo && texto !== undefined) {
        const nova = criar(it, [alvo.id])
        gravarTexto(alvo.caminho, editarFrontmatter(texto, { status: 'substituida', substituida_por: nova.id, atualizada: quando }))
        continue
      }
    }

    const existente = encontrar(it.tipo, it.titulo)
    const texto = existente && lerTexto(existente.caminho)
    if (existente && texto !== undefined) {
      const atual = parseNota(texto)
      if (!atual || !frontmatterIntegro(texto)) continue
      const apelidos = [...new Set([...atual.apelidos, ...it.apelidos])]
      const tags = [...new Set([...atual.tags, ...it.tags])]
      if (apelidos.length !== atual.apelidos.length || tags.length !== atual.tags.length) {
        gravarTexto(existente.caminho, editarFrontmatter(texto, { apelidos, tags, atualizada: quando }))
      }
      continue
    }
    criar(it)
  }

  return { escritas: [...pendentes].map(([caminho, texto]) => ({ caminho, texto })), criadas }
}

export function planejarDesfazer(texto: string, agora: Date): { texto: string; restaurar: string[] } {
  const n = parseNota(texto)
  if (!n) return { texto, restaurar: [] }
  return { texto: editarFrontmatter(texto, { status: 'desfeita', atualizada: dataHoraLocal(agora) }), restaurar: n.substitui }
}

export function planejarRestaurar(texto: string, agora: Date): string {
  return editarFrontmatter(texto, { status: 'ativa', substituida_por: null, atualizada: dataHoraLocal(agora) })
}
