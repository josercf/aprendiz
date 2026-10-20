# ADR-002: Extração com Haiku pela API de modelo do mod, em segundo plano

- **Data:** 2026-10-20
- **Status:** aceita
- **Decisores:** Claude Code (aprovado no plano pelo José)

## Contexto
Cada prompt precisa ser analisado por um modelo para extrair conhecimento. O José pediu economia de tokens e que o envio do prompt não fique lento. O mod roda em macOS e Windows, nas três contas.

## Decisão
O extrator chama `$.model.complete` com o modelo `haiku` num worker de timer iniciado no `session.start`; o hook `prompt.submit` só enfileira.

## Motivações
- `$.model.complete` usa o cliente da sessão: sem chave de API separada, custo na assinatura da conta em uso.
- Nenhum processo extra do Claude Code e nenhuma dependência de shell, o que funciona igual em macOS e Windows.
- O prompt do sistema fixo vai em bloco com cache, reduzindo custo por chamada.

## Riscos conhecidos e mitigações
- Limite de uso da assinatura: uma chamada curta por prompt não trivial; prompts triviais são filtrados antes.
- Resposta inválida do modelo: a leitura descarta sem gravar nada e o item volta à fila até três vezes.
- Sessão fechada com fila: a fila fica em `$.store` e é retomada na próxima sessão.

## Consequências
- Positivas: zero latência percebida, custo baixo, multiplataforma.
- Negativas: a extração acontece segundos depois do prompt; o aviso chega depois.

## ADRs relacionadas
ADR-001.
