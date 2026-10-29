# Como atualizar o ranking semanal da LeagueBR

Este guia serve para quem coleta os estágios e para quem publica no GitHub. Funciona no computador ou no navegador do celular.

## Jeito recomendado: preencher a página e enviar o arquivo

Quem coleta os estágios não precisa de conta no GitHub:

1. Abra [Atualizar ranking](https://pantalipe.github.io/leaguebr/atualizar.html).
2. Escolha a data real em que os estágios foram conferidos.
3. Preencha os estágios ao lado dos nomes e escolha a promoção de quem mudou. Deixe em branco quem não enviou atualização. Se já tem uma lista, abra **Colar uma lista pronta**, cole e toque em **Usar esta lista**. Aceita linhas como `1º Risk - 1090`, `Risk: 1090`, `Risk - 1090 - Black Mythril` ou `Risk | 1090 | Black Mythril`; números e promoções aqui são apenas exemplos de formato.
4. Toque em **Conferir atualização**. Confira nomes, data e valores. Correções do mesmo dia e reduções de estágio ficam sinalizadas.
5. Toque em **Baixar members.json**. Procure o arquivo nos downloads do aparelho e envie-o ao responsável pelo portal, como anexo de arquivo/documento.

O portal permanece igual até o responsável publicar. O arquivo gerado contém todos os membros, seus históricos anteriores e os retratos. Para corrigir um valor antes de enviar, altere o campo e confira a prévia de novo. Se o navegador renomear downloads repetidos para `members (1).json`, envie o arquivo mais recente.

Na lista, a promoção é opcional: use o nome mostrado no seletor da página. Quando omitida, a seleção manual é preservada; se estiver em “Manter promoção atual”, o cadastro permanece igual. Para remover uma promoção, use `Risk - 1090 - Sem promoção`. Uma promoção desconhecida ou duas promoções conflitantes para o mesmo membro impedem a aplicação da lista inteira; corrija a linha indicada e tente novamente. Confira estágios e promoções na prévia antes de baixar.


### Importar prints dos membros

Abra **Importar prints dos membros**, selecione até **20 imagens** (uma por membro) e toque em **Ler imagens**. Use o print da janela **Informações de usuário**, com nick, emblema e **Fase** visíveis. A leitura é local, no navegador, e mostra o progresso por arquivo. Cada imagem pode ter até 15 MB.

Confira as miniaturas e corrija membro, estágio e promoção em cada resultado. Nicks sem correspondência segura precisam ser selecionados manualmente; promoção não reconhecida mantém o cadastro. Para quem acabou de entrar, escolha **Novo membro** e confira o nick no campo abaixo. Para quem voltou, selecione seu cadastro com **(retorno)**. Desmarque imagens incorretas ou repetidas.

Se enviou os prints de **todos os membros atuais**, marque **Este lote contém todos os membros atuais da guild**. Os cadastros ativos que não aparecem entre os selecionados serão sugeridos como saída. Em um lote parcial, ausências não geram saída e as saídas já marcadas manualmente são mantidas.

Toque em **Usar resultados selecionados** e confira os nomes nas listas de entradas, retornos e saídas sugeridas. Toque em **Confirmar dados, entradas e saídas** para preencher o formulário; depois use **Conferir atualização** para revisar o arquivo completo. A guild pode ter no máximo 20 membros ativos. O lote não pode aplicar duas imagens para o mesmo membro. A importação não publica nem baixa nada automaticamente; históricos de saídas e retornos são preservados.

### Entradas, saídas e retornos

- **Quem saiu:** marque **Saiu da guild** abaixo do nickname. Não coloque estágio zero para sinalizar saída. O campo de estágio fica desativado e o histórico anterior é mantido fora do ranking ativo.
- **Quem entrou:** no bloco **Entradas na guild**, preencha nickname e estágio. Toque em **Adicionar mais um membro** para outras entradas. Deixe a linha vazia se ninguém entrou.
- **Quem voltou:** adicione o mesmo nickname no bloco de entradas, com o estágio atual. A página recupera o cadastro anterior e seu histórico.
- **Lista colada com recém-chegados:** preencha primeiro os nicknames no bloco de entradas e depois use **Colar uma lista pronta**, para que esses nomes sejam reconhecidos.
- **Antes de baixar:** confira a data e as ações na prévia. É possível gerar um arquivo somente com entradas ou saídas, mesmo sem atualizar estágios dos demais.

A data escolhida registra a entrada ou saída. O arquivo completo inclui os cadastros de ex-membros; envie e publique o arquivo inteiro, sem remover esses registros.

### Para o responsável publicar o arquivo recebido

1. Confira se o arquivo acabou de ser gerado a partir dos dados atuais. Se o portal recebeu outra atualização depois da geração, peça um novo arquivo; não substitua o histórico mais recente por uma cópia antiga.
2. Entre na sua conta do GitHub e abra a [pasta data](https://github.com/pantalipe/leaguebr/tree/main/data).
3. Selecione **Add file → Upload files** e envie o arquivo recebido. O nome final deve ser exatamente **members.json**, dentro de **data**. Se o celular acrescentou um número ao nome do download, renomeie o arquivo antes de enviar.
4. Confira que está substituindo `data/members.json`, sem adicionar outro arquivo na raiz. Salve com **Commit changes** diretamente na **main**.
5. Acompanhe [Actions](https://github.com/pantalipe/leaguebr/actions) e confira o [portal](https://pantalipe.github.io/leaguebr/) após a publicação.

A página verifica a base novamente antes de gerar o arquivo, mas não consegue atualizar um anexo que já foi enviado. Confirme os dados recebidos antes de publicar.

## Alternativa: editar o histórico diretamente no GitHub

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
