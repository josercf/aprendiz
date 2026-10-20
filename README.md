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


## Instalação num computador novo

O mod fica neste repositório privado (`josercf/aprendiz`), que também serve de marketplace do Claude Code. Cada computador precisa de quatro coisas, nesta ordem.

### 1. Acesso do git ao GitHub como josercf

A instalação clona `josercf/aprendiz` e a sincronização envia commits para `josercf/jose-ops`. Os dois repositórios exigem credencial da conta josercf.

- **Chave SSH** (usada pelo mod para o jose-ops): copiar `id_ed25519_josercf` e `id_ed25519_josercf.pub` para `~/.ssh/` (no Windows, `C:\Users\<usuario>\.ssh\`). No Mac e no Linux, rodar `chmod 600 ~/.ssh/id_ed25519_josercf`. Para gerar uma chave nova em vez de copiar: `ssh-keygen -t ed25519 -f ~/.ssh/id_ed25519_josercf -C josercf` e cadastrar o `.pub` em https://github.com/settings/keys.
- **Credencial HTTPS** (usada pela instalação do mod): `gh auth login` com a conta josercf e depois `gh auth setup-git`.

Para testar: `ssh -i ~/.ssh/id_ed25519_josercf -o IdentitiesOnly=yes -T git@github.com` deve responder "Hi josercf!".

### 2. Clone do jose-ops

Mac:

```
mkdir -p ~/Projects
GIT_SSH_COMMAND='ssh -i ~/.ssh/id_ed25519_josercf -o IdentitiesOnly=yes' git clone git@github.com:josercf/jose-ops.git ~/Projects/jose-ops
```

Windows (PowerShell):

```
mkdir $HOME\Projects -Force
$env:GIT_SSH_COMMAND = "ssh -i $HOME/.ssh/id_ed25519_josercf -o IdentitiesOnly=yes"
git clone git@github.com:josercf/jose-ops.git $HOME\Projects\jose-ops
```

O clone precisa estar no ramo `main` com upstream `origin/main` (o padrão do `git clone`).

### 3. Instalar o mod em cada conta do Claude Code

Pelo shell, uma vez por conta:

```
claude plugin install aprendiz --marketplace josercf/aprendiz
```

Se a máquina tiver várias contas, repetir com o diretório de cada uma. No Mac: `CLAUDE_CONFIG_DIR=~/.claude-inteli claude plugin install ...`. No Windows (PowerShell): `$env:CLAUDE_CONFIG_DIR = "$HOME\.claude-inteli"; claude plugin install ...`.

Dentro de uma sessão, o equivalente é `/plugin install aprendiz --marketplace josercf/aprendiz`.

Se a instalação falhar por autenticação, a alternativa é clonar este repositório e instalar do disco:

```
git clone https://github.com/josercf/aprendiz.git ~/Projects/aprendiz
claude plugin marketplace add ~/Projects/aprendiz
claude plugin install aprendiz@aprendiz
```

### 4. Ajustar os caminhos da máquina

Os padrões servem para o Mac. No Windows, ou com o clone em outro lugar, gravar os caminhos em cada conta:

```
echo '{"repoPath":"C:/Users/<usuario>/Projects/jose-ops","sshKeyPath":"C:/Users/<usuario>/.ssh/id_ed25519_josercf"}' | claude plugin configure aprendiz@aprendiz --values-stdin
```

`claude plugin configure aprendiz@aprendiz` mostra os valores atuais. Dentro de uma sessão, `/config` faz o mesmo.

| Opção | Padrão | Quando mudar |
|---|---|---|
| `repoPath` | `~/Projects/jose-ops` | clone em outro lugar ou Windows |
| `sshKeyPath` | `~/.ssh/id_ed25519_josercf` | chave com outro nome ou Windows |
| `modelo` | `haiku` | trocar o modelo do extrator |
| `perguntaIntervaloMin` | 30 | mais ou menos perguntas |
| `commitIntervaloMin` | 5 | frequência de commit |
| `pullIntervaloMin` | 10 | frequência de pull |

Se o clone não existir, o mod mostra um aviso ao abrir a sessão e fica inativo.

### Conferir

Abrir uma sessão nova e digitar `/aprendido`. A resposta "Nada gravado hoje nesta conta." indica que o mod carregou. Numa sessão que já estava aberta antes da instalação, rodar `/reload-plugins` primeiro.

## Atualizar o mod numa máquina

```
claude plugin marketplace update aprendiz
claude plugin update aprendiz@aprendiz
```

Repetir o `plugin update` em cada conta (com `CLAUDE_CONFIG_DIR`) e reiniciar as sessões abertas, ou rodar `/reload-plugins` nelas.

## Publicar uma versão nova

1. Alterar o código, rodar `claude plugin validate .` e `claude plugin test .`.
2. Subir `version` em `.claude-plugin/plugin.json` (por exemplo de `0.1.0` para `0.2.0`).
3. Fazer commit, criar a tag e enviar:

```
git commit -am "aprendiz: <o que mudou>"
claude plugin tag .
git push origin main --tags
```

`claude plugin tag .` cria a tag `aprendiz--v<versão>` depois de conferir que o manifesto e o marketplace concordam.

## Uso

- `/aprendido`: o que foi gravado hoje.
- `/aprendido desfazer [id]`: desfaz a última gravação ou a do id.
- `/aprendido pausar` e `/aprendido retomar`.
- `/aprendido consentimentos`: mostra as permissões de busca.
