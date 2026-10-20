# ADR-004: Índice de busca derivado e fora do git

- **Data:** 2026-10-20
- **Status:** aceita
- **Decisores:** Claude Code (aprovado no plano pelo José)

## Contexto
A busca local precisa de um índice (títulos, apelidos, tags). O spec previa `conhecimento/_sistema/indice.json` no repositório.

## Decisão
O índice é reconstruído a partir das notas em cada máquina e fica no `.gitignore` do jose-ops.

## Motivações
- Um arquivo derivado versionado gera conflito sempre que duas máquinas gravam notas.
- Reconstruir algumas centenas de notas leva pouco tempo e acontece no início da sessão e a cada pull.

## Riscos conhecidos e mitigações
- Base muito grande deixa a reconstrução lenta: medir; se passar de alguns segundos, reconstruir só os arquivos alterados desde o último commit conhecido.

## Consequências
- Positivas: nenhum conflito de índice.
- Negativas: outros agentes que quiserem o índice precisam montar o seu.

## ADRs relacionadas
ADR-001. Altera a seção 4 do spec.
