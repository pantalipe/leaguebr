# Leitor OCR local

Arquivos estáticos utilizados sob demanda pela importação de estoque. O modelo e o código ficam no mesmo domínio do portal. As imagens escolhidas pelo visitante não são enviadas a serviços externos.

- Tesseract.js **5.1.1**: `tesseract.esm.min.js` e `worker.min.js`, obtidos de `https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/`. Licença em `LICENSE-tesseract.js`.
- Tesseract.js-core **5.1.1**: `tesseract-core-lstm.wasm.js`, obtido de `https://cdn.jsdelivr.net/npm/tesseract.js-core@5.1.1/`. Inclui o WebAssembly e não precisa de arquivo `.wasm` separado. Licença em `LICENSE-core`. O caminho explícito escolhe o motor LSTM universal, sem exigir SIMD, para reduzir o tamanho hospedado a uma única variante; o portal abre mão da seleção automática de variantes mais rápidas.
- Modelo inglês rápido: `eng.traineddata.gz`, obtido de `https://tessdata.projectnaptha.com/4.0.0_fast/eng.traineddata.gz` (família tessdata_fast 4.0.0, Apache-2.0). O reconhecimento é restrito a números e `/`.

Fontes e documentação: [Tesseract.js](https://github.com/naptha/tesseract.js), [Tesseract.js-core](https://github.com/naptha/tesseract.js-core), [tessdata_fast](https://github.com/tesseract-ocr/tessdata_fast).

Não editar os bundles gerados manualmente. Ao atualizar, fixe as versões, preserve as licenças e teste a leitura real dos prints de estoque e a rejeição de preços da loja. Arquivos de mapa de código não são necessários em produção.
