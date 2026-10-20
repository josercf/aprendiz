# ADR-003: Consentimentos no repositório e controle de frequência local

- **Data:** 2026-10-20
- **Status:** aceita
- **Decisores:** José Romualdo; Claude Code

## Contexto
O José quer que o Claude lembre das buscas que ele autorizou e não pergunte de novo, com poucas perguntas em intervalo curto. Ele usa cerca de três computadores e três contas.

## Decisão
As permissões ficam em `jose-ops/conhecimento/_sistema/consentimentos.md` (versionado); o estado de frequência (última pergunta, perguntas da sessão) fica local, no `$.store` de cada máquina e conta.

## Motivações
- Uma permissão dada num computador vale em todos e o José pode editá-la à mão.
- Frequência é sobre a experiência da sessão em curso; sincronizá-la não traz ganho.

## Riscos conhecidos e mitigações
- Uma pergunta a mais ao trocar de máquina: aceito.
- Edição manual malformada: linhas que não forem lidas são ignoradas, nunca quebram o mod.

## Consequências
- Positivas: permissões portáveis e auditáveis.
- Negativas: commit extra no jose-ops quando uma permissão muda.

## ADRs relacionadas
ADR-001.
