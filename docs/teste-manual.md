# Teste manual da Fase 1

Data: 2026-10-20. Claude Code 2.1.304, macOS. Clone de teste do jose-ops com remoto local (nenhum push para o GitHub). Mod carregado com `claude -p --plugin-dir`.

| # | Cenário | Conta | Resultado |
|---|---|---|---|
| 1 | Prompt da aula 01 gera notas | inteli | 6 notas (formação, trajetória docente, papel no Inteli, Inteli Exec, preferência de slides, ativo da foto); commit `conhecimento: claude-code inteli +6 notas`; push para o remoto de teste; nada fora de `conhecimento/` |
| 2 | `prompt.submit` rápido | inteli, footstats | 158 a 232 ms |
| 3 | Sugestão de busca em aula | inteli | validador aprovou a preferência de slides; o Claude perguntou `⌕ Na base: ... (s/n/nunca, e lembro da resposta)` |
| 4 | Investigação Footstats com `sempre` | footstats | validador consultou a wiki (`mcp__claude_ai_Wiki_-_Footstats__*`) e o Claude respondeu `⌕ Usei [[2026-09-09 OLAP Worker ...]] ... como base` |
| 5 | Limite de 30 min | footstats | segunda investigação seguida não gerou pergunta |

## Defeitos encontrados e corrigidos

- Sessão `-p` terminava com a extração em andamento e o `encerrar` não esperava. Corrigido; teste `encerrar espera a extração em andamento antes de sincronizar`.
- O contexto passava caminhos relativos ao jose-ops; o validador roda na pasta do projeto. Corrigido para caminhos absolutos.
- O conector da wiki se chama "Footstats Wiki" na conta personal e "Wiki - Footstats" na conta footstats. O validador aceita os dois.

## Revisão final e reteste

A revisão do código inteiro apontou 2 problemas críticos e 10 importantes. Todos foram corrigidos com teste que falhou antes (suíte: 104 testes). O teste ponta a ponta foi repetido num clone novo: 6 notas, commit local no fim da sessão, trava `refs/aprendiz/lock` liberada, nenhum rebase pendente.

## Limites observados

- O fim de sessão tem orçamento de cerca de 2 s. Nele o mod só faz commit local, sem rede e sem modelo. O push sai pelo timer de 5 min das sessões interativas; a fila que sobrar é retomada por outra sessão da mesma conta.
- O aviso flutuante não aparece em `-p` (não há tela). Falta conferir numa sessão interativa: depois de instalar, mandar o prompt da aula 01 e esperar o `✦ Aprendi ...` em até 1 min.
- O `$.store` do mod é compartilhado entre as três contas deste Mac (a pasta `plugins` das contas inteli e footstats é um link para a da personal). Fila, pausa, frequência e lista do dia levam a conta.
- O push só acontece quando todos os commits locais à frente do GitHub tocam apenas `conhecimento/`. Commits do José fora dessa pasta seguram o push até ele enviar.
- `/aprendido desfazer`, `pausar` e `retomar` foram verificados nos testes automatizados, não na sessão real.
