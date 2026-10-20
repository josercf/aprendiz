# ADR-001: Base de conhecimento Zettelkasten em Markdown no jose-ops

- **Data:** 2026-10-20
- **Status:** aceita
- **Decisores:** José Romualdo; Claude Code

## Contexto
O José usa vários agentes (Claude Code em três contas, Donna no xAI bot, Codex, Cursor, Antigravity) e perde conhecimento durável quando cada conversa acaba. O repositório privado `josercf/jose-ops` já é a fonte da verdade da Donna (caderno diário, fios abertos, guia de escrita).

## Decisão
O conhecimento aprendido vira notas atômicas em Markdown com frontmatter YAML e `[[wikilinks]]`, em `jose-ops/conhecimento/`, abrível como cofre do Obsidian.

## Motivações
- Qualquer agente que lê arquivos consegue consumir e escrever, seguindo `conhecimento/LEIA-ME-AGENTES.md`.
- Git dá histórico, desfazer e sincronização entre máquinas sem servidor.
- O Obsidian mostra o grafo sem conversão.

## Riscos conhecidos e mitigações
- Conflito de escrita entre agentes: cada agente cria notas novas; mudança vira substituição; histórico de pessoas é só acréscimo.
- Crescimento com ruído: o extrator agrupa material em volume; a rotina noturna (Fase 2) deduplica.
- Dados de terceiros num repositório pessoal: decisão explícita do José; segredos e documentos de identidade continuam excluídos.

## Consequências
- Positivas: formato aberto, legível por humanos e agentes, sem dependência de banco.
- Negativas: busca sem semântica na Fase 1; consistência depende de cada agente seguir o contrato.

## ADRs relacionadas
ADR-003, ADR-004. Spec: `jose-ops/docs/specs/2026-10-20-base-de-conhecimento-design.md`.
