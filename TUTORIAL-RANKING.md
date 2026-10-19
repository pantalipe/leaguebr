# Como atualizar o ranking semanal da LeagueBR

Este guia é para a pessoa responsável pela atualização. Tudo é feito pelo site do GitHub, no computador ou no navegador do celular.

**Links para guardar:**

- [Editar os membros e seus estágios](https://github.com/pantalipe/leaguebr/edit/main/data/members.json)
- [Ver o portal](https://pantalipe.github.io/leaguebr/)
- [Acompanhar a publicação](https://github.com/pantalipe/leaguebr/actions)

## 1. Preparação — somente na primeira vez

Crie sua conta no GitHub, se ainda não tiver uma. O dono do repositório precisa convidar essa conta como colaboradora com permissão de escrita. Aceite o convite e entre na sua conta.

O **repositório** é a pasta do projeto no GitHub. O arquivo `data/members.json` guarda os membros e seus estágios. A **main** é a versão do projeto que aparece no portal. Um **commit** é uma alteração salva, com uma descrição do que mudou.

## 2. Reúna as informações da semana

Anote o nickname, o estágio atual e a data real em que esse estágio foi conferido. Use o estágio do personagem; os números de medalhas nas fotos da lista da guild são outra informação.

Cada membro pode ter uma data diferente. Se não recebeu a atualização de alguém, deixe o histórico dele como está. Não repita o estágio antigo com uma data nova apenas para preencher a semana.

## 3. Abra o arquivo para editar

1. Entre no GitHub e abra o [link de edição dos membros](https://github.com/pantalipe/leaguebr/edit/main/data/members.json).
2. Confirme que está no projeto **pantalipe/leaguebr**, na **main**, editando **data/members.json**.
3. Se estiver apenas visualizando o arquivo, toque no lápis **Edit this file** para editar.
4. Localize o nickname do membro. No computador, use `Ctrl+F`. No navegador do celular, use **Localizar na página**, se disponível, ou role até encontrar o nome.

Se aparecer **Fork** ou **Propose changes** em vez da opção de salvar diretamente na main, confira a conta e peça ao dono para verificar a permissão. Esse caminho cria uma proposta que ainda precisaria ser aprovada.

## 4. Acrescente o novo registro ao histórico

Dentro do membro, altere apenas o campo **history**. Preserve `id`, `nickname`, `role` e `portrait` durante a atualização semanal.

**Exemplo: o primeiro registro real de Risk está assim:**

```json
"history": [{ "date": "2026-10-12", "stage": 1090 }]
```

**Supondo que ele tenha chegado ao estágio 1160 em 19/10/2026**, o campo passaria a ficar assim:

```json
"history": [
  { "date": "2026-10-12", "stage": 1090 },
  { "date": "2026-10-19", "stage": 1160 }
]
```

**1160 é um exemplo fictício. Use o estágio informado pelo membro.** O trecho acima substitui somente o campo `history`, não o arquivo inteiro.

O primeiro registro continua guardado e o novo entra depois dele, separado por uma vírgula. Na semana seguinte, acrescente mais um registro dentro dos mesmos colchetes, colocando uma vírgula após o registro anterior. Não apague os registros antigos para atualizar o estágio.

Cuidados ao digitar:

- A data vai entre aspas no formato **ano-mês-dia**: `"2026-10-19"` significa 19/10/2026.
- O estágio é um número inteiro, sem aspas e sem separador de milhar: `1160`.
- Coloque vírgula **entre** os registros; o último registro não leva vírgula antes do `]`.
- Mantenha as aspas retas `"`, chaves `{ }` e colchetes `[ ]`.

Repita para os outros membros que enviaram atualização. Pode atualizar todos na mesma edição. Não precisa mudar a ordem dos membros: o portal calcula o ranking e desempata pelo nickname.

## 5. Revise e salve

1. Confira os nomes, as datas e os estágios alterados. Verifique se os registros antigos continuam presentes.
2. Toque em **Commit changes…**.
3. Na descrição, escreva algo como **Atualiza ranking — 19/10/2026**, usando a data da sua atualização.
4. Se aparecer a escolha, selecione **Commit directly to the main branch**.
5. Confirme em **Commit changes**.

Salvar na main inicia a publicação automaticamente. Não precisa configurar o GitHub Pages novamente a cada semana. O GitHub pode salvar um arquivo JSON com erro de digitação, então a conferência do próximo passo é essencial.

## 6. Confira no portal

Abra [Actions](https://github.com/pantalipe/leaguebr/actions), entre na execução mais recente da publicação do Pages e aguarde a conclusão. Verde indica sucesso; vermelho indica falha na publicação.

Depois de alguns minutos, abra o [portal](https://pantalipe.github.io/leaguebr/) e atualize a página. Confira:

- O estágio e a data dos membros atualizados.
- O pódio e a ordem do ranking.
- O histórico, tocando no cartão de um membro.
- Se apareceu algum aviso de erro no topo.

No exemplo fictício, Risk teria **+70 estágios em 7 dias**, com média de **10 estágios/dia**. Com apenas um dia registrado, “Sem histórico suficiente” é normal. Quem não enviou atualização continua com a data anterior.

## Se precisar corrigir um erro

Abra o mesmo arquivo, encontre o registro incorreto, corrija a data ou o estágio e salve outro commit, por exemplo **Corrige estágio de Risk — 19/10/2026**. Para corrigir o valor do mesmo dia, edite o registro existente.

Se a página mostrar erro de JSON ou deixar de carregar o ranking, procure vírgulas faltando, vírgula depois do último registro, aspas ou colchetes apagados. Se um membro desaparecer com um aviso, confira a data e se o estágio é um inteiro não negativo. Um build verde confirma a publicação, mas não garante que os dados estejam corretos. Se não conseguir resolver, envie o link da alteração ao responsável técnico antes de continuar editando.

**Rotina da semana:** reunir estágios → abrir o arquivo → acrescentar registros → revisar → salvar → conferir no portal.

Referências: [edição de arquivos no GitHub](https://docs.github.com/en/repositories/working-with-files/managing-files/editing-files) e [publicação por branch no GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site).
