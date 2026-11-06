# NEXUS 1.3 — BLADE SYMPHONY

Base: `feature/nexus-1.2-crimson-fury`, commit `67f721d1233515d9dd11bf857f9e2fd2a596c13a`. Essa é a branch 1.2 remota mais recente encontrada, com relatório e evidências de validação em `docs/1.2/`. Desenvolvimento em `feature/nexus-1.3-blade-symphony`. A branch `main` não foi alterada.

Data: 6 de novembro de 2026.

## Implementação

- Swift Slash, Reverse Edge e Falling Crescent: 220/240/330 ms, buffer de uma entrada por janela, reset após 500 ms de inatividade, cancelamento por esquiva somente na recuperação. Finisher tem dano 30% maior, deslocamento curto com colisões e knockback moderado. Transformações articuladas de quadril, tronco, cabeça, ombros, cotovelos, punhos e joelhos; braço de apoio usa IK; transições usam amortecimento exponencial.
- Crimson Strike mantém duração de carga, custo e controles da 1.2. A tensão corporal cresce com a carga; materiais e núcleo emissivos, partículas em espiral convergindo à lâmina com fade individual, pulso máximo e aceleração da trajetória acompanham o corte.
- Crimson Wave usa uma malha procedural compartilhada, distorção GLSL, núcleo luminoso, bordas transparentes, três ecos e flash/partículas no lançamento. Pool de quatro rajadas, 3–5 unidades de alcance e dano de 34–85, conforme a carga. Colisão varrida impede atravessar obstáculos e detecta inimigos entre passos. Desaceleração e fade no fim do alcance; tempo máximo de 1,1 s. Rajadas também são limpas ao terminar a partida ou voltar ao menu, evitando efeitos congelados nesses estados.
- Espada e rajada compartilham o conjunto de inimigos acertados de cada lançamento. **O primeiro contato válido aplica o dano; o outro não soma dano nesse inimigo.** Cada novo ataque ganha outro conjunto, e uma rajada ainda viva mantém seu conjunto original.
- A morte antiga girava todo o ator em 0,05 rad por atualização e subtraía altura continuamente, sem joelhos nem contato com piso. Agora captura a pose no impacto, transfere a reação pelo tronco e cabeça, flexiona quadris/joelhos, articula braços, acelera a queda e resolve o contato usando vértices transformados das malhas. O punho libera a arma paralela ao chão para ela não sustentar o corpo pela ponta. O contato usa os vértices reais: cantos vazios de caixas de limites rotacionadas podiam deixar a armadura visualmente acima do piso. Há repouso amortecido e fade após 2,15 s, com remoção aos 2,8 s. A animação continua após vitória/derrota.
- Variações: queda para trás, lateral, pesada com maior flexão dos joelhos para Brute e perda de sustentação/fragmentação para Archer. Direção de queda deriva do vetor real do impacto no referencial do inimigo. Corpos mortos deixam imediatamente a lista de atacantes, alvos e bloqueadores; o pool só os reutiliza após a animação.
- Arena procedural, câmera de jogo, iluminação, quatro ondas, arquétipos, entrada e demais sistemas da 1.2 foram mantidos. Não há dependências novas de runtime.

## Validação e reprodução

```sh
npm ci
npm test
npm run build
npm run preview -- --port 5173
# Em outro terminal:
npm run test:browser
npm run test:symphony
```

Requer Node 22.12+ ou 24 LTS e Chromium. `CHROMIUM_PATH` e `NEXUS_URL` permitem escolher navegador e servidor. No Fedora: `sudo dnf install git nodejs npm chromium`. Os comandos de execução com Fish também estão no README.

`npm test` executa 34 testes: 21 de mecânica/ações/ondas herdados, dois de integração de inimigos e 11 novos. Os novos verificam sequência de três golpes, buffer limitado, reset, prioridade/cancelamento, carga sob diferentes deltas, acertos exclusivos de rajada/espada, alcance/expiração, bloqueio por obstáculos com passos grandes, limite/reset do pool e mortes dos quatro arquétipos. Para o chão, o teste recalcula independentemente os vértices mundiais de cada malha, verificando ausência de penetração durante toda a queda e contato no repouso. O prazo do teste herdado de retorno ao pool foi atualizado para a nova duração completa da morte.

As suítes de navegador exercitam o build de produção. Os resultados e capturas da regressão 1.3 ficam em `regression/`, preservando as evidências 1.2. O runner novo salva os cenários e snapshots em `browser-results.json`; a inspeção adicional dos quatro tipos de queda fica em `visual-results.json` quando executada com `NEXUS_CASE=Visual`.

## Método e limites

- Capturas são frames reais do Chromium executando Three.js, sem imagens geradas ou composição. Os testes usam o modo explícito `?test=1`: permite posicionar/orientar atores e escolher a onda inicial para isolar comportamentos. Não altera HP, dano, energia, hitboxes ou transições de morte para produzir as evidências.
- O relógio controlado avança a simulação fixa de 60 Hz e permite inspecionar fases curtas mesmo com renderização por software lenta. No runner novo, renders consecutivos podem ser agrupados em intervalos de até 400 ms, abaixo do limite de recuperação de 500 ms; todos os passos físicos continuam executando. As capturas de detalhe usam zoom e interface oculta; não representam o enquadramento normal. O teste herdado de progressão começa na onda 1 e elimina inimigos com ataques e dano reais. Preparação de cenário não comprova balanceamento de uma partida humana.
- Xbox e PlayStation são simulados com objetos `mapping: standard` em `navigator.getGamepads()`, incluindo pressionar/soltar botões. Não houve controle físico, Fedora KDE ou GPU física nesta máquina Linux.
- A solução de morte é procedural híbrida, com restrição de chão pelos vértices de cada malha; não é ragdoll dinâmico completo, nem simula colisões entre cadáveres. Combate continua planar. O fade é transparente, sem shader de dissolução.
- Novos efeitos têm limites fixos: uma geometria compartilhada de 64 triângulos para a rajada, quatro lançamentos e três ecos por lançamento; utilizam as partículas existentes. Não há alocação de geometria por ataque. Materiais de corpos são independentes e reutilizados no pool, para o fade não afetar inimigos vivos.
- Não foi comprovada a meta de 60 FPS. SwiftShader não representa desempenho de GPU. Executar múltiplos Chromium ao mesmo tempo saturou a CPU e provocou uma falha inicial de movimento por tempo real; a repetição isolada passou esse cenário. O build emite o aviso informativo já existente de bundle acima de 500 kB.

## Capturas reais

Sequências principais: [Swift Slash](screenshots/combo-01-swift.png), [Reverse Edge](screenshots/combo-02-reverse.png), [Falling Crescent](screenshots/combo-03-crescent.png); [carga inicial](screenshots/charge-01-early.png), [tensão intermediária](screenshots/charge-02-tension.png), [carga máxima](screenshots/charge-03-maximum.png); [lançamento](screenshots/wave-01-launch.png) e [trajeto da Crimson Wave](screenshots/wave-02-travel.png).

Morte: [impacto](screenshots/death-01-impact.png), [perda de equilíbrio](screenshots/death-02-balance.png), [queda](screenshots/death-03-fall.png), [contato](screenshots/death-04-contact.png) e [repouso](screenshots/death-05-rest.png). As capturas por arquétipo têm os prefixos `sentinel-death`, `raider-death`, `brute-death` e `archer-death` na mesma pasta.

## Cobertura dos critérios

| Critério | Verificação |
| --- | --- |
| Três golpes, buffer, reset, prioridade e cancelamento | `symphony.test.ts` e `symphony-browser.mjs` |
| Carga progressiva e liberação por pressionar/soltar | `mechanics.test.ts`, `crimson.mjs`, `input-queue.mjs` e `symphony-browser.mjs` |
| Rajada, alcance, colisão e um dano por inimigo | `symphony.test.ts`, `crimson.mjs` e cenário de dano real em `symphony-browser.mjs` |
| Direção de morte, queda, chão, repouso e remoção de colisão | `symphony.test.ts`, `enemies.test.ts` e sequências visuais dos quatro arquétipos |
| Progressão das quatro ondas | `waves-browser.mjs`: ataques e dano reais, 21 eliminações até vitória |
| Xbox/PlayStation simulados, movimento e cancelamento por morte | `controller12.mjs`, `movement12.mjs`, `ai-browser.mjs` e `symphony-browser.mjs` |
| Build e console | TypeScript/Vite; coletores de erros nos runners de navegador |

O cenário herdado de dano pesado foi atualizado para a nova regra de primeiro contato: ele antes exigia um evento da espada mesmo quando a rajada acertava primeiro. Agora exige exatamente uma aplicação de dano no alvo por lançamento e compara carga parcial/máxima; a verificação independente da hitbox do corte básico continua presente.

## Resultado final

**34 testes de lógica/integração passaram, zero falhas ou skips. Build TypeScript/Vite aprovado.** Todas as sete suítes herdadas de navegador passaram: entrada (4 cenários), movimento/colisões/foco, controle (11), combate (7), IA (4), ondas (3) e inspeção da esquiva. A nova suíte passou seus seis cenários, incluindo controles simulados e mortes dos quatro arquétipos. Após o refinamento final de contato pelos vértices, os dois cenários afetados de morte foram repetidos e suas capturas reinspecionadas. Os coletores de todos os runners registraram zero erros.

Resultados: [resumo de validação](validation-summary.json), [lógica/integração](unit-tests.txt), [build](build.txt), [suíte nova](browser-results.json), [recaptura final de mortes](visual-results.json) e JSONs individuais em `regression/`. A vitória foi obtida após 21 eliminações com combate real. A inspeção visual conferiu poses distintas dos golpes, tensão/carga, rajada e ecos, flexão de joelhos, movimento secundário de braços/cabeça, queda e repouso. O modo de captura não foi usado como medição de FPS.
