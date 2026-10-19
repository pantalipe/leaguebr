# LeagueBR · Portal da Guild

Portal estático de Legend Slayer: HTML, CSS, JavaScript e JSON, sem instalação ou build. Os dados iniciais são fictícios. Troque os exemplos e defina `"demo": false` em `data/content.json` quando publicar informações reais. O total de membros é calculado a partir dos registros válidos; nível e meta são opcionais.

## Atualizar pelo GitHub (inclusive no celular)

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

## Testar localmente

Na pasta do projeto, execute `python -m http.server 8000` e abra <http://localhost:8000>. Não abra o HTML por `file://`, pois o carregamento dos JSONs exige HTTP. Para encerrar, `Ctrl+C`.

Com Node instalado: `node --test tests/ranking.test.mjs`. Os testes usam apenas recursos nativos e cobrem as regras de datas e progresso.

Os caminhos são relativos e funcionam em subdiretórios como `/leaguebr/`. Não há login, armazenamento compartilhado no navegador ou segredos no frontend. Este é um portal da comunidade, sem vínculo oficial com o jogo.
