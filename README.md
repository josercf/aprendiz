# aprendiz

Mod do Claude Code que extrai conhecimento dos prompts do José e grava notas Zettelkasten em `jose-ops/conhecimento/`, com aviso flutuante, sugestão de busca validada e sincronização com o GitHub.

- Spec: `jose-ops/docs/specs/2026-10-20-base-de-conhecimento-design.md`
- Plano: `jose-ops/docs/plans/2026-10-20-aprendiz-fase1.md`
- Contrato da base: `jose-ops/conhecimento/LEIA-ME-AGENTES.md`
- Decisões: `docs/adrs/`

## Desenvolvimento

```
claude plugin validate .
claude plugin test .
```


## Instalação

Em cada conta do Claude Code de cada máquina, no prompt de uma sessão de terminal:

```
/plugin install aprendiz --marketplace josercf/aprendiz
```

Neste Mac, uma vez por conta: abrir `claude-personal`, `claude-inteli` e `claude-footstats` e rodar a linha acima em cada uma.

Pelo shell:

```
claude plugin install aprendiz --marketplace josercf/aprendiz
```

O repositório é privado: a máquina precisa de credencial git para github.com que leia `josercf/aprendiz`.

Depois, em `/config`, ajustar se preciso:

| Opção | Padrão | Quando mudar |
|---|---|---|
| `repoPath` | `~/Projects/jose-ops` | clone em outro lugar (no Windows, por exemplo `C:/Users/jose/Projects/jose-ops`) |
| `sshKeyPath` | `~/.ssh/id_ed25519_josercf` | chave com outro nome na máquina |
| `modelo` | `haiku` | trocar o modelo do extrator |
| `perguntaIntervaloMin` | 30 | mais ou menos perguntas |
| `commitIntervaloMin` | 5 | frequência de commit |
| `pullIntervaloMin` | 10 | frequência de pull |

Se o clone não existir, o mod mostra um aviso ao abrir a sessão e fica inativo.

## Uso

- `/aprendido`: o que foi gravado hoje.
- `/aprendido desfazer [id]`: desfaz a última gravação ou a do id.
- `/aprendido pausar` e `/aprendido retomar`.
- `/aprendido consentimentos`: mostra as permissões de busca.
