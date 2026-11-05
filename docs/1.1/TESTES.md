# NEXUS 1.1 — validação

Data: 5 de novembro de 2026. Base: `delivery/nexus-phase1`, commit `b0a077995dae025b6e0da80d921061932a9bbd58`. Atualização desenvolvida em `feature/nexus-1.1-movement-combat`; `main` não foi modificada.

## Diagnóstico da movimentação

A versão original usava `Math.min(delta, 0.05)` e executava uma única atualização por frame. Isso descartava o tempo acima de 50 ms: a velocidade real dependia do FPS. Além disso, o teste antigo esperava tempo de **simulação**, o que mascarava o problema em máquinas lentas.

A reprodução antes de modificar o código atrasou cada frame em 250 ms e pressionou D por dois segundos reais. O resultado foi **0,35 s de simulação e 1,61 unidade de deslocamento**, para uma velocidade nominal que produziria 9,2 unidades em dois segundos. Os dados originais estão em [movement-baseline.json](movement-baseline.json).

O teclado funcionou nessa reprodução; **não foi reproduzida imobilidade absoluta em um Fedora físico**. Portanto, essa evidência comprova a perda de tempo e a lentidão do movimento, sem estabelecer que seja a única causa do sintoma informado pelo usuário. Foco, vetores isométricos, colisões e posição real também foram investigados e verificados nos testes abaixo.

A correção usa passos fixos de 1/60 s, recuperando até 0,5 s entre renders sem aplicar deslocamentos gigantes. Foco retorna ao canvas ao iniciar/retomar; leitura de tecla tem fallback para `event.key`; áudio não impede o início se indisponível. A aceleração é suavizada e a passada responde à distância realmente percorrida, inclusive ao parar em obstáculos.

## Resultados finais

Execução contra o build de produção em Vite Preview, Chromium/Linux com ANGLE SwiftShader (software):

- **13/13 testes unitários:** determinismo, bordas, colisão/deslizamento, sobreposição, arco legado das sentinelas, ângulos, relógio fixo sob frames lentos e suspensão, teclado sem código físico, deadzone radial, fases contínuas do corte e volume varrido pela lâmina.
- **Movimento real:** W, A, S, D e W+A pressionados por aproximadamente dois segundos de parede; deslocamento de posição comprovado, direção projetada na tela e diagonal normalizada. Também passaram contenção na ilha, amostragem de contato/deslizamento contra a coluna norte, retorno de foco e fallback de teclado. Ver [movement-results.json](movement-results.json).
- **9/9 cenários de controle:** conexão/início; deadzone; movimento completo e proporcional; mira independente; ataque por borda de botão sem repetição por segurar; troca teclado/controle; múltiplos dispositivos/desconexão; dispositivo não padronizado ignorado; pausa, navegação, retomada e reinício. Ver [controller-results.json](controller-results.json).
- **5/5 cenários de combate:** antecipação sem dano; um acerto durante execução; trajetória da lâmina e comprimento rígido; um segundo ataque por buffer tardio sem repetição infinita; corrida → ataque → corrida, com direção travada durante o golpe. Ver [combat-results.json](combat-results.json).
- **13/13 cenários de regressão:** renderização, início/movimento, perseguição, borda, ataque com mouse, cooldown, dano recebido, pausa, vitória, checkpoint, derrota/recuperação, câmera finita/estável e ausência de erros de navegador. Ver [regression/browser-results.json](regression/browser-results.json).
- **TypeScript e build de produção aprovados.** Continua existindo o aviso informativo de tamanho do chunk do Three.js; não é falha de build.

Os testes finais de navegador não registraram erros de JavaScript/console. Vida, energia, dano, arena, luzes, posição inicial e IA existentes foram preservados. A refatoração da hierarquia dos braços manteve a geometria original e acrescentou articulação de cotovelo e apoio da mão por IK durante o corte do protagonista.

A suíte antiga de mouse precisou ser ajustada: após posicionar o jogador para o cenário, agora espera a câmera se estabilizar, aguarda o fim da reação legítima a dano e observa o término do ataque solicitado. Ela não presume mais que qualquer clique, inclusive durante stun, deve causar dano após um atraso fixo. As asserções de dano e energia foram mantidas; os testes específicos verificam a janela e a unicidade de acerto.

## Capturas reais e inspeção

[Antecipação](screenshots/attack-01-anticipation.png), [execução](screenshots/attack-02-execution.png), [contato](screenshots/attack-02b-contact.png) e [recuperação](screenshots/attack-03-recovery.png) são renders reais da mesma execução, com câmera de inspeção ampliada e interface oculta. Foram inspecionadas a posição da espada, a coordenação dos braços/tronco, a continuidade do rastro e o flash/onda no contato. O rastro usa as posições de base/ponta da lâmina, sem um anel independente girando no chão.

A sequência e os testes de combate usam `requestAnimationFrame` controlado a 60 Hz para observar fases curtas mesmo no renderizador lento. Não substituem a lógica do jogo, o dano ou a geometria. Os testes de movimento, controle e regressão usam relógio normal e eventos reais; apenas a Gamepad API é simulada. O `?test=1` habilita inspeção e posicionamento para preparar cenários, não altera vida, energia ou dano.

O menu atualizado e capturas normais do jogo estão em [regression/screenshots](regression/screenshots/).

## Limitações

- Nenhum Xbox One/Series, DualShock 4 ou DualSense físico foi conectado. A implementação cobre o mapeamento padrão da Gamepad API, mas USB/Bluetooth e particularidades de navegador/driver precisam de validação no PC do usuário.
- Dispositivos sem mapeamento padrão não recebem ações presumidas. São indicados na interface e ignorados, mantendo teclado/mouse.
- Fedora KDE e GPU física não estavam disponíveis. A renderização foi por software; **não foi comprovada a meta de 60 FPS** nem foi repetido um benchmark de GPU para esta atualização.
- Recuperação de tempo é limitada a 0,5 s por frame; travamentos mais longos ainda desaceleram a simulação. Pausa/perda de foco descartam o tempo de suspensão deliberadamente.
- Ataque pesado, esquiva, interação, habilidades e suprema continuam indisponíveis; seus botões estão reservados. Não foram apresentados como implementados.

## Reproduzir

```fish
npm ci
npm test
npm run build
npm run preview -- --port 5174
```

Em outro terminal Fish:

```fish
set -x NEXUS_URL 'http://127.0.0.1:5174/?test=1'
npm run test:movement
npm run test:controller
npm run test:combat
npm run test:browser
```

Os runners usam `/usr/bin/chromium` por padrão e aceitam `CHROMIUM_PATH`. Todos retornam status não zero em falhas; resultados e capturas estão versionados nesta pasta. As evidências anteriores da Fase 1 permanecem em `docs/TESTES.md` e `docs/screenshots/`.
