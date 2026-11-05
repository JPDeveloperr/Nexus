# Relatório de validação — Fase 1

Data: 5 de novembro de 2026. Ambiente Linux na nuvem, Node.js 24.22.1, Chromium, Three.js 0.180.0. Testes de integração executados contra o **build de produção**, servido com `npm run preview -- --port 5174`.

## Resultados

- **7/7 testes matemáticos passaram:** sequência procedural reproduzível, contenção na ilha (inclusive deslocamentos grandes), colisão e deslizamento em colunas, resolução de sobreposição, arco/alcance direcional do ataque, interpolação angular e regressão da colisão na borda.
- **13/13 testes reais no navegador passaram:** geometria WebGL renderizada; início e movimentação por teclado; detecção e perseguição; colisão no limite do abismo; mira e ataque via mouse com dano e gasto de energia; cooldown; preparação e dano das sentinelas; pausa e retomada; morte dos inimigos e vitória; reinício de checkpoint; derrota e recuperação; estabilidade da câmera; ausência de erros JavaScript e de console.
- `npm run build`: TypeScript e bundle de produção aprovados. Há um aviso informativo do Vite sobre o chunk principal superar 500 kB (Three.js e pós-processamento); não houve erro de build.
- `git diff --check`: sem erros de whitespace.

Os testes não alteram vida, dano, energia nem o relógio da simulação. Em cenários isolados, a API habilitada por `?test=1` posiciona o jogador e permite observação de estado; os ataques usam eventos reais de mouse/teclado e o dano é calculado pelo jogo. Os testes aguardam o tempo da simulação, não presumem que um atraso fixo de parede corresponde a um ataque completo. A vitória e a derrota foram alcançadas separadamente e ambas permitiram reinício.

Uma primeira execução revelou que a projeção de colisão contra obstáculos próximos ao limite podia deslocar ligeiramente o personagem para fora da borda. A contenção final foi corrigida, ganhou teste de regressão e passou novamente no navegador. Uma execução de desenvolvimento foi interrompida por recarregamento do Vite durante ajuste visual; a suíte final foi repetida integralmente em produção, sem HMR.

## Evidências visuais

As capturas foram produzidas pelo Chromium executando o jogo, sem imagens geradas ou composição externa:

1. [Menu e visão do templo](screenshots/01-menu.png): 1280 × 800, qualidade Média.
2. [Jogabilidade](screenshots/02-gameplay.png): 960 × 600, qualidade Baixa; HUD, inimigos, espada e vida após dano.
3. [Vitória](screenshots/03-victory.png): as três sentinelas derrotadas.
4. [Derrota](screenshots/04-defeat.png): vida esgotada e opção de retorno.
5. [Inspeção do personagem](screenshots/05-character-inspection.png): a mesma cena real pausada, câmera ampliada 2,8× e interface oculta apenas para inspeção. Não representa o enquadramento normal de jogo.

A inspeção visual verificou a silhueta do guerreiro, ombreiras, elmo/visor, espada, capa, contraste entre inimigos e protagonista, piso gravado, cristais, colunata e portal. Os materiais metálicos foram clareados para manter a leitura da armadura.

## Desempenho e limitações

O Chromium disponível usa **ANGLE SwiftShader**, um renderizador por software. A amostra recente do teste funcional ficou em aproximadamente **5,3 FPS a 960 × 600, qualidade Baixa**. Esse valor descreve a máquina de teste e não o desempenho de uma GPU dedicada. O delta da simulação é limitado a 50 ms para estabilidade, mas a medição de FPS usa o intervalo real entre frames, sem esse limite.

A medição separada em 1920 × 1080, qualidade Média, obteve **1,55 FPS no renderizador por software** e está em [performance.json](performance.json): 30 intervalos reais após aquecimento dos shaders, com identificação do renderizador. A meta de **60 FPS em hardware intermediário não está comprovada**. É necessário testar com aceleração gráfica real no PC de destino antes de afirmar que foi atingida. Esta é uma amostra curta, não um benchmark estatístico de longa duração.

Não foram testados Fedora KDE, Windows ou uma GPU física diretamente. O áudio é sintetizado localmente e foi acionado no navegador, mas não houve avaliação auditiva humana. Mobile/touch, controle, esquiva, ataques pesados, combos, habilidades, chefe e progressão estão fora desta Fase 1.

## Reproduzir

```fish
npm ci
npm test
npm run build
npm run preview -- --port 5174
```

Em outro terminal Fish, com Chromium instalado:

```fish
set -x NEXUS_URL 'http://127.0.0.1:5174/?test=1'
npm run test:browser
node tests/performance.mjs
```

O runner do navegador encerra com status diferente de zero em caso de falha, grava o estado observado e uma captura de diagnóstico. Resultados finais: [browser-results.json](browser-results.json).
