# LeagueBR · Portal da Guild

Portal estático de Legend Slayer: HTML, CSS, JavaScript e JSON, sem instalação ou build. O histórico começa com o ranking informado pela guild em **12/10/2026**, com 20 membros. O total é calculado a partir dos registros válidos; nível e meta são opcionais. Regras aguardam a liderança. `demo: true` em `data/content.json` serve para identificar dados de demonstração, se necessário.

## Atualizar pelo GitHub (inclusive no celular)

**Jeito mais simples:** abra [Atualizar ranking](https://pantalipe.github.io/leaguebr/atualizar.html), escolha a data, preencha os estágios (ou cole uma lista), confira a prévia e baixe `members.json`. Envie o arquivo ao responsável pelo GitHub. Campos em branco não mudam; o histórico e os retratos são preservados. Essa página não publica alterações.

O responsável confere e substitui `data/members.json` com o arquivo recebido. Use um arquivo recém-gerado: se houve outra atualização no portal depois, peça para gerar novamente. Consulte o [tutorial passo a passo](TUTORIAL-RANKING.md) para o envio e para a alternativa de edição manual.

Abra o arquivo, selecione **Edit** (lápis), faça a alteração e escolha **Commit changes** na branch publicada. Conceda acesso de escrita somente aos líderes. Preserve aspas, vírgulas e colchetes do JSON.

1. **Adicionar membro:** em `data/members.json`, acrescente um objeto à lista, separado por vírgula:

   ```json
   {
     "id": "risk",
     "nickname": "Risk",
     "role": "Membro",
     "history": [{ "date": "2026-10-18", "stage": 3850 }]
   }
   ```

   Use `id` único e estável. Estágio deve ser um inteiro não negativo, sem aspas. Cada membro tem seu próprio calendário de atualizações.
2. **Atualizar estágio:** acrescente `{ "date": "2026-10-23", "stage": 3950 }` ao `history` do membro. Datas reais em `YYYY-MM-DD`. O ranking ordena por estágio decrescente e depois nickname. A evolução compara o último registro com o último registro de uma data anterior; a média usa os dias de calendário entre ambos. Não há estimativas entre registros.
3. **Corrigir registro:** edite ou remova o registro incorreto no JSON e salve. O histórico do GitHub permite recuperar versões anteriores. Os registros são ordenados por data automaticamente; para registros no mesmo dia vale o último na lista. Com apenas um dia registrado, aparece “Sem histórico suficiente”. Correções podem gerar evolução negativa. Registros inválidos são ignorados com aviso visível.
4. **Alterar avisos e regras:** edite `data/content.json`. `notices` contém `date`, `title` e `text`; `rules` é uma lista de textos. `level: null` oculta o valor do nível; `goal: null` remove a meta. Nome, jogo, lema e descrição também são editáveis. Avisos aparecem do mais recente ao mais antigo. Para imagens isoladas, adicione arquivos em `assets/` e configure `crestImage` e `mascot.image`, por exemplo `"assets/jorg.png"`; mantenha `null` para placeholders. Sprites usam `image-rendering: pixelated`. `assets/sede.jpg` é a screenshot fornecida pelo usuário, sem extração ou recriação de sprites.
5. **Publicação:** em **Settings → Pages**, escolha **Deploy from a branch → main → / (root)** e salve. Acompanhe o endereço e o estado em **Settings → Pages**; o build padrão também aparece em **Actions → pages-build-deployment**. Cada commit na branch será publicado automaticamente. Não há workflow personalizado. Se a publicação falhar, confira o último build e a validade dos JSONs. O navegador mostra problemas de dados no topo da página.

Os retratos opcionais ficam em `portrait` no membro: `image` aponta para uma screenshot em `assets/`; `x`, `y` e `size` definem o quadrado original, em pixels. O navegador mostra somente esse trecho, sem recriar ou alterar os sprites. Para adicionar um membro sem retrato, omita `portrait`; aparece a inicial do nickname. Os nicks seguem a tabela informada e os cargos visíveis seguem as capturas, que podem ter sido feitas em outra data. Não use medalhas, status online ou outros números da imagem como estágios.


### Entradas e saídas de membros

Na página de atualização, marque **Saiu da guild** para quem saiu; o estágio fica desativado. No bloco **Entradas na guild**, informe nickname e estágio, usando **Adicionar mais um membro** quando necessário. A data do formulário vale para essas alterações. A prévia distingue atualizações, entradas, retornos e saídas antes do download.

Ex-membros continuam no mesmo arquivo com `active: false` e `leftAt`, preservando seu histórico, mas ficam fora do ranking e da contagem pública. Ausência de `active` significa membro ativo. Novos membros recebem `active: true`, `joinedAt` e apenas o primeiro estágio informado; não há média diária inventada. Para um retorno, use o mesmo nickname no bloco de entradas: o cadastro e o histórico serão recuperados. Não use estágio zero para representar saída; zero continua sendo um estágio válido de um membro ativo.

## Promoções dos membros

Na página **Atualizar ranking**, selecione a promoção de cada membro, confira a prévia e baixe `members.json` pelo fluxo habitual. É possível atualizar somente a promoção, sem registrar outro estágio. O brasão aparece ao lado da posição no ranking, no pódio e nos cards de membros. Cargo na guild e promoção são campos independentes.

No JSON, use o campo opcional `"promotion": "dragonos"`. Os IDs aceitos estão em `js/promotions.js`. Ausência, `null` ou ID desconhecido aparece como **Não informada**, sem brasão inventado; estágio não determina promoção. Os cadastros existentes aguardam informação da liderança. Os 24 brasões foram obtidos na [Slayer Legend Wiki](https://slayerlegend.wiki/character/promotions), a partir do [SlayerLegendCDN](https://github.com/BenDol/SlayerLegendCDN/tree/main/game-assets/images/promotions); origem e correspondências estão em `assets/promotions/README.md`.

## Receitas e inventário

Abra [Receitas](https://pantalipe.github.io/leaguebr/receitas.html): o catálogo começa com todas as receitas e suas imagens. Toque nos botões com ícones para ativar ou desativar ingredientes; receitas precisam conter todos os selecionados. Tipo e raridade também usam botões. **Limpar filtros** restaura o catálogo sem apagar o estoque.

Para calcular quantidades, abra **Calcular com meu estoque**, informe os itens e ative **Mostrar só o que posso preparar**. Campos vazios valem zero. O estoque é temporário, não é enviado nem salvo. Os cards mostram os ingredientes em ícones; toque em **Ingredientes e efeitos** para ver custos, bônus e faltantes. As imagens originais estão em `assets/ingredients/` e `assets/recipes/`, copiadas da referência e servidas localmente, com pixel art preservada.

As três categorias ficam sempre visíveis: aperitivos (terça), pratos principais (quarta) e sobremesas (quinta). A sugestão do dia só destaca uma categoria. Cada prato é uma opção independente sobre o mesmo estoque; os máximos não representam uma combinação de pratos para fazer simultaneamente. Não há simulação de trocas com chefs.

Manutenção: `data/receitas.json` contém as 63 receitas fornecidas e `data/ingredientes.json` contém as **unidades de consumo**, não o estoque do jogador. Ingredientes repetidos na receita somam essas unidades: `Ovo, Ovo, Trigo, Trigo` exige 2 ovos e 200 de trigo. Preserve nomes correspondentes nos dois arquivos, IDs únicos e quantidades inteiras positivas. Efeitos e bônus são exibidos conforme os dados fornecidos. Fonte indicada pelo usuário: [receitasdv](https://github.com/mooncakelvl999999-del/receitasdv), com créditos à comunidade na página. A implementação do portal é independente, sem importar scripts ou rastreadores da referência.

## Sorteio semanal

Abra **Sorteio** na navegação do portal (`sorteio.html`). A página carrega os membros ativos de `data/members.json`, incluindo quem ainda não tem histórico de estágio. Ex-membros (`active: false`) ficam fora automaticamente. Desmarque quem não participa naquela semana, dê um nome ao sorteio e use **Conferir sorteio**. A conferência mostra os participantes e os excluídos; **Voltar e ajustar** permite corrigir a seleção antes de **Sortear vencedor**.

Cada participante tem uma chance igual, com seleção aleatória via Web Crypto e sem influência de estágio ou cargo. O resultado fica fixo na tela; **Baixar resultado** gera um TXT com identificação, data/hora, vencedor, participantes e excluídos. **Preparar novo sorteio** permite outro sorteio e preserva a seleção anterior; use **Selecionar todos** para reincluir os membros. Nenhuma dessas ações modifica o cadastro da guild.

O sorteio é manual: a página não executa sorteios agendados. Os dados desta sessão são apagados ao sair ou recarregar; baixe o arquivo para guardá-los. Não há histórico compartilhado, publicação automática de vencedores ou restrição de execução a líderes. O arquivo é um registro local, sem certificação independente do resultado.

## Testar localmente

Na pasta do projeto, execute `python -m http.server 8000` e abra <http://localhost:8000>. Não abra o HTML por `file://`, pois o carregamento dos JSONs exige HTTP. Para encerrar, `Ctrl+C`.

Com Node instalado: `node --test tests/*.test.mjs`. Os testes usam apenas recursos nativos e cobrem datas, progresso, geração das atualizações, cálculo das receitas e sorteio.

Os caminhos são relativos e funcionam em subdiretórios como `/leaguebr/`. Não há login, armazenamento compartilhado no navegador ou segredos no frontend. Este é um portal da comunidade, sem vínculo oficial com o jogo.
