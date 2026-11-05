# NEXUS 1.2 — CRIMSON FURY: validação

Data: 5 de novembro de 2026. Base remota verificada antes do trabalho: `feature/nexus-1.1-movement-combat`, commit `1996bde4cb555aec89f150f7ded5b36d0cbe3996`. Desenvolvimento em `feature/nexus-1.2-crimson-fury`, mantendo as branches anteriores.

## Mudanças verificadas

- Corte básico reduzido de 520 para **260 ms**: antecipação 50 ms, execução 110 ms e recuperação 100 ms. A velocidade angular média da lâmina durante a execução dobrou; o acerto continua usando a geometria varrida entre amostras da espada, sem múltiplos danos no mesmo alvo/golpe.
- Carga Crimson Strike limitada a 1,2 s, mínimo de 0,2 s, lâmina/material emissivo realmente vermelhos, partículas orbitais e halo GLSL. Soltar executa golpe pesado, com potência/custo proporcionais e limite de dano base 85. Carga curta, dano, pausa, foco, morte e desconexão têm caminhos explícitos de cancelamento.
- Esquiva contínua de 300 ms, com custo/cooldown, invulnerabilidade central limitada, colisões, afterimages e aura de vento espectral. Espaço/B/Círculo não conflitam com confirmação de menu ou ataque básico.
- Raider de duas lâminas, Archer flutuante com arco e Brute de pedra com martelo, além das sentinelas preservadas. IA com telegráficos, recuperação, separação/colisões, knockback e coordenação. Projéteis e ondas de choque são reutilizados em pools.
- Quatro ondas com **21 mortes** necessárias para vitória, intervalo, spawn válido, limite simultâneo e reinício dos estados/pools.

## Testes automatizados

`npm test`: **23 testes passaram**, em dois runners: 21 de matemática/ações/ondas e 2 de integração da IA sem renderização. Cobrem determinismo, delta fixo, movimento/colisões, deadzone, fases do corte, volume da lâmina, potência/custo/limite da carga, cancelamento, cooldown/invulnerabilidade, esquiva contra parede/borda, spawn, limite/progressão/reset das ondas, projéteis varridos, todos os padrões de IA, interrupção do Archer, vulnerabilidade do Brute e retorno de mortos ao pool.

`npm run build`: TypeScript e bundle aprovados. Continua o aviso informativo de tamanho do chunk Three.js; não houve erro de build.

`npm run test:browser`, contra Vite Preview de produção e Chromium/Linux:

| Runner              | Evidência                                                                                                                                                                                                                                                                    |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `test:input`        | 4 verificações: clique básico entre renders, carga de 350 ms entre renders com potência preservada, soltura do teclado sem disparar carga de outro dispositivo e cancelamento por desconexão                                                                                 |
| `test:movement`     | W/A/S/D e W+A por dois segundos reais, projeção correta, diagonal normalizada, borda, contato/deslizamento em coluna, foco e fallback `event.key`                                                                                                                            |
| `test:controller`   | 11 cenários: conexão/início, deadzone, movimento proporcional, mira, botão mantido sem repetição, troca de entrada, múltiplos dispositivos/desconexão, mapeamento desconhecido, menus/reinício, Y/Triângulo para carga e B/Círculo para esquiva, cancelamento ao desconectar |
| `test:combat`       | 7 cenários: corte rápido e retomada de movimento, carga visual progressiva/cap/release, cancelamento curto/pausa/foco, oito direções e orientação sem entrada, colisões, sequência visual de esquiva, acerto sincronizado/dano pesado proporcional                           |
| `test:ai`           | 4 cenários: combo do Raider, projétil real do Archer e controle de distância, onda do Brute evitada durante invulnerabilidade, morte/cancelamento de carga/reinício                                                                                                          |
| `test:dodge-visual` | Conferência adicional do shader de vento, sequência início/deslocamento/recuperação e ausência de invulnerabilidade permanente; [dodge-visual.json](dodge-visual.json)                                                                                                       |
| `test:waves`        | 3 cenários: composição/spawn inicial, vitória após 21 mortes calculadas pelo combate e reset de partida/pools. Observou pico de 6 ativos e a vaga pendente da onda 4                                                                                                         |

Resultados brutos: [input-queue.json](input-queue.json), [movement-results.json](movement-results.json), [controller-results.json](controller-results.json), [combat-browser.json](combat-browser.json), [ai-browser.json](ai-browser.json) e [waves-browser.json](waves-browser.json).

Os runners verificam erros de JavaScript e/ou console e retornam status não zero em falha. As execuções finais não registraram erros nos coletores. A validação visual também conferiu os estados da espada e os arquétipos nas capturas reais.

## Métodos e limites das evidências

- Movimento e controle usam relógio normal. Controles são objetos controlados em `navigator.getGamepads()` e eventos de conexão/desconexão, não hardware físico.
- Capturas de animação e cenários longos usam `requestAnimationFrame` e relógio monotônico controlados para inspecionar intervalos curtos no renderizador lento. Entrada, animação, renderização, colisão, energia, invulnerabilidade e dano continuam no código real.
- `?test=1` habilita inspeção, posicionamento de atores e escolha de onda inicial. Esta última só prepara cenários isolados de IA. **A validação de progressão começou na onda 1, aplicou ataques com hitbox e dano reais e chegou à vitória com 21 mortes; não modificou vida dos inimigos nem forçou mortes.** Posicionamento assistido não equivale a um playtest humano de dificuldade.
- A suíte detectou que polling vinculado ao render podia perder um toque de controle em frames lentos. A entrada agora é amostrada a 120 Hz, com eventos ordenados; o teste entre renders comprova a correção. Também foi corrigida a ordem soltar/pressionar após reação a dano, para não descartar uma nova carga.
- Uma asserção herdada esperava energia abaixo de 100 após 550 ms. O custo menor e a regeneração do novo corte já podiam restaurá-la nesse intervalo; o teste passou a observar a sequência iniciada e a ausência de repetição, mantendo os testes exatos de custo no runner de ações.

## Screenshots reais

Todas são capturas do navegador executando o jogo, sem geração de imagens ou composição externa. Nas sequências de inspeção, a câmera foi ampliada e a interface temporariamente oculta; não representam o enquadramento normal.

- [Carga inicial](screenshots/charge-01-early.png), [intermediária](screenshots/charge-02-middle.png), [máxima](screenshots/charge-03-maximum.png) e [golpe liberado](screenshots/crimson-04-release.png).
- [Início da esquiva](screenshots/phantom-01-start.png), [deslocamento](screenshots/phantom-02-displacement.png) e [recuperação](screenshots/phantom-03-recovery.png).
- [Colisão da esquiva](screenshots/dodge-02-column.png), [projétil do Archer](screenshots/void-archer-projectile.png), [Brute e onda](screenshots/obsidian-brute-slam.png), [onda evitada](screenshots/phantom-shockwave-evade.png).
- [Onda 3](screenshots/wave-3.png), [onda 4](screenshots/wave-4.png) e [vitória](screenshots/four-waves-victory.png).

## Desempenho medido

A medição usou **ANGLE SwiftShader**, com resolução 960×600 e qualidade Baixa. Foram 20 intervalos de RAF nativo após aquecimento, executados sequencialmente no mesmo navegador. A referência foi exportada do commit 1.1 real, sem alterar sua fonte. Cenário: início da partida parado, com 3 inimigos na 1.1 e 4 na 1.2.

| Métrica                               |               1.1 |     1.2 |
| ------------------------------------- | ----------------: | ------: |
| FPS médio da amostra                  |              5,71 |    5,88 |
| Draw calls médios                     |             339,6 |   381,9 |
| Máximo de geometrias registradas      |               352 |     105 |
| Tempo médio de atualização por render | não instrumentado | 2,88 ms |

Dados: [performance-comparison.json](performance-comparison.json). São amostras curtas por software, não significância estatística, teste de pior caso ou resultado de GPU. O acréscimo de conteúdo aumentou draw calls; compartilhamento de geometria reduziu recursos registrados. **Não foi comprovada a meta de 60 FPS**. A média de atualização é por render, incluindo os passos físicos recuperados, e exclui a renderização. FPS exibido em capturas com relógio controlado não é medição de desempenho.

Os limites fixos são: 8 corpos reutilizáveis, 6 inimigos simultâneos por padrão (configurável de 1 a 8), 24 projéteis, 4 ondas de choque, 6 afterimages, 40 partículas orbitais e 200 faíscas. A semente/geração do templo permanece preservada. A medição não substitui validação com GPU e hardware do usuário.

## Limitações conhecidas

- Fedora KDE, Windows, Xbox/PlayStation físicos e USB/Bluetooth reais não foram executados neste ambiente. Compatibilidade implementada via mapeamento padrão da Gamepad API; mapeamentos desconhecidos são ignorados.
- A amostragem separada dos renders preserva transições observadas, mas não pode garantir pulsos que o navegador/hardware não exponha nem rodar timers durante bloqueio completo da thread. Entradas básicas usam um buffer limitado, sem fila infinita.
- Simulação fixa de 60 Hz quantiza timings: o hitstop básico configurado em 18 ms dura cerca de 33 ms em passos completos; o pesado configurado em 40 ms dura cerca de 50 ms. Invulnerabilidade é sempre finita e validada por dano real.
- Travamentos acima de 0,5 s por render ainda limitam a recuperação de tempo. A renderização por software continua lenta.
- Colisões de combate são planares; não há física volumétrica, saltos ou distribuição desktop. Balanceamento e legibilidade em sessões humanas longas ainda precisam de playtest.
- Especiais/suprema de fases futuras continuam reservados, sem simular funcionalidades inexistentes.

## Reproduzir

```fish
npm ci
npm test
npm run build
npm run preview -- --port 5181
```

Em outro terminal Fish:

```fish
set -x NEXUS_URL 'http://127.0.0.1:5181/?test=1&diagnostics=1'
npm run test:browser
```

Chromium deve estar instalado; `CHROMIUM_PATH` permite outro executável. Para repetir a comparação, sirva também uma exportação do commit 1.1 na porta 5182 e execute `node tests/compare-performance.mjs`; `NEXUS_BASELINE_URL` e `NEXUS_URL` permitem outros endereços.
