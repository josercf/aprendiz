// Conta, caminhos e junção de caminhos em macOS e Windows (spec 5.7).

export function contaDe(configDir: string | undefined): string {
  if (!configDir) return 'personal'
  const ultimo = configDir.replace(/\\/g, '/').replace(/\/+$/, '').split('/').pop() ?? ''
  if (ultimo === '.claude' || ultimo === '') return 'personal'
  return ultimo.replace(/^\.claude-/, '')
}

export function expandirCaminho(p: string, home: string): string {
  const casa = home.replace(/\\/g, '/').replace(/\/+$/, '')
  const normal = p.replace(/\\/g, '/')
  const expandido = normal === '~' ? casa : normal.startsWith('~/') ? `${casa}${normal.slice(1)}` : normal
  return expandido.replace(/\/+$/, '')
}

export function juntar(base: string, relativo: string): string {
  return `${base.replace(/\/+$/, '')}/${relativo.replace(/^\/+/, '')}`
}
