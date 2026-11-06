# NEXUS: Shattered Realms — 1.3 BLADE SYMPHONY

Jogo de ação isométrico com Three.js, TypeScript e geometria procedural. A versão 1.3 parte da [1.2 validada, commit 67f721d](https://github.com/JPDeveloperr/Nexus/commit/67f721d1233515d9dd11bf857f9e2fd2a596c13a), preservando templo, personagens, câmera, iluminação, inimigos, ondas e controles. Acrescenta combo de três golpes, Crimson Wave de curto alcance e mortes articuladas direcionais.

## Executar no Fedora KDE / Konsole / Fish

Requisitos: Node.js **22.12+ ou 24 LTS**, npm e navegador com WebGL2/aceleração gráfica. Sem backend, conta externa ou assets remotos.

```fish
npm ci
npm run dev
```

Abra o endereço informado pelo Vite. `npm install` também funciona; `npm ci` reproduz o lockfile. Se faltarem os programas no Fedora: `sudo dnf install git nodejs npm`. Confira a versão com `node --version`.

```fish
npm run build
npm run preview
```

O build valida TypeScript e gera `dist/` para hospedagem estática. A distribuição desktop ainda não foi implementada.

## Atualizar o clone anterior

Na pasta do seu clone, preserve alterações locais antes de trocar de branch:

```fish
git fetch origin feature/nexus-1.3-blade-symphony
git switch -c feature/nexus-1.3-blade-symphony FETCH_HEAD
npm ci
npm run dev
```

Isso funciona inclusive com o clone original feito com `--single-branch`. Se a branch já existir localmente, use `git switch feature/nexus-1.3-blade-symphony` e `git pull --ff-only origin feature/nexus-1.3-blade-symphony`. `main` e as entregas anteriores permanecem preservadas.

## Controles

| Ação              | Teclado/mouse      | Xbox               | PlayStation                |
| ----------------- | ------------------ | ------------------ | -------------------------- |
| Movimento         | WASD               | Analógico esquerdo | Analógico esquerdo         |
| Orientação        | Mouse              | Analógico direito  | Analógico direito          |
| Corte básico      | Clique esquerdo    | X                  | Quadrado                   |
| Crimson Strike    | Segurar J e soltar | Segurar Y e soltar | Segurar Triângulo e soltar |
| Phantom Dodge     | Espaço             | B                  | Círculo                    |
| Pausa / continuar | Esc                | Menu               | Options                    |

**J agora carrega a espada; não é mais um atalho do corte básico.** A/X é confirmação de menu, não esquiva. Nos menus, D-pad ou analógico vertical navega/ajusta; A/X confirma ou avança ao próximo campo; B/Círculo volta. Há botões de corte e esquiva no HUD. Escolha qualidade gráfica, deadzone e controle ativo no menu.

São usados os índices padrão da Gamepad API. Xbox One/Series e DualShock 4/DualSense devem ser reconhecidos pelo navegador como `mapping: standard`; **não houve teste com controles físicos**. Dispositivos não padronizados são indicados e ignorados com segurança. USB/Bluetooth dependem do sistema e do navegador. Use HTTPS ou localhost e pressione um botão para o navegador disponibilizar o controle.

A leitura do gamepad roda a 120 Hz, separada dos renders, com fila ordenada de pressionar/soltar. Cargas que começam e terminam entre frames preservam a duração observada. Não é possível garantir captura de pulsos que o navegador/hardware nunca exponha, nem executar timers durante bloqueio completo da thread. Deadzone radial padrão 18%, configurável entre 5% e 40%, com persistência local opcional. É possível trocar de teclado para controle e entre dispositivos sem reiniciar. Perda de foco e desconexão cancelam a carga sem disparar.

## Combate

- **Combo básico:** Swift Slash (220 ms), Reverse Edge (240 ms) e Falling Crescent (330 ms). Cortes horizontais opostos e finalizador diagonal com avanço de cerca de 0,23 unidade, dano 30% maior e knockback moderado. Custo de 8 por golpe. Uma entrada antecipada após a preparação fica reservada até a próxima recuperação; cliques extras não estendem a fila. Após 500 ms em idle, o próximo golpe reinicia a sequência. Esquiva cancela recuperação e descarta a reserva. Quadril, tronco, cabeça, braços, punhos e pernas participam; braço de apoio usa IK e transições usam amortecimento exponencial. Hitbox continua acompanhando a lâmina real, com um acerto por alvo/golpe.
- **Crimson Strike:** segure por pelo menos 200 ms. Carga limitada a 1.200 ms, espada progressivamente vermelha, partículas orbitais, pulsação, luz e halo GLSL. Soltar libera um arco carmesim, com dano até **85 (2,5×)**, custo proporcional até 38, knockback maior e recuperação mais longa. A duração do golpe liberado é 580 ms. Energia insuficiente limita a potência real; abaixo de 18, a carga não inicia. Soltar cedo cancela sem custo e informa o motivo. Pausa, perda de foco, dano, morte e desconexão cancelam com segurança.
- **Crimson Wave:** o corte carregado lança uma meia-lua procedural vermelha a partir da lâmina durante a execução. Alcance de 3–5 unidades e dano de 34–85, proporcionais à carga. Núcleo luminoso, bordas transparentes, distorção GLSL, partículas e três ecos translúcidos; pool de quatro lançamentos. Colisão varrida considera colunas, obstáculos, borda e inimigos. **Regra de dano:** o primeiro contato válido (espada ou rajada) consome o acerto desse lançamento para aquele inimigo; os dois compartilham a mesma lista. Não há soma de dano corpo a corpo + rajada no mesmo alvo.

- **Phantom Dodge:** deslocamento contínuo por 300 ms, com colisões, inclinação e afterimages. Invulnerabilidade somente entre 55 e 215 ms, cooldown de 550 ms e custo de 18. Usa a direção de WASD/analógico ou a orientação atual se não houver direção. Pode cancelar carga e recuperação; não interrompe a execução ativa da espada. Não atravessa colunas nem a borda e não pode ser mantida infinitamente sem custo.

Vida máxima 100, energia máxima 100 e regeneração de 15/s fora da carga. Corrida 4,6 unidades/s; movimento é reduzido durante corte e preparação pesada. A direção do golpe fica travada durante sua execução. Energia, cooldown e invulnerabilidade fazem parte da simulação, não da interface.

## Inimigos e ondas

| Arquétipo      | Vida | Comportamento e silhueta                                                                                                 |
| -------------- | ---- | ------------------------------------------------------------------------------------------------------------------------ |
| Sentinela      | 100  | Guerreiro original, espada vermelha, perseguição e preparação legível                                                    |
| Crimson Raider | 76   | Silhueta estreita, crista e duas lâminas; perseguição rápida e combo de dois ataques                                     |
| Void Archer    | 80   | Manto flutuante, fragmentos orbitais e arco geométrico; mantém distância e dispara projéteis precedidos por mira no chão |
| Obsidian Brute | 260  | Corpo largo, placas de pedra, cristais e martelo; lento, golpe no chão e onda de choque, vulnerável na recuperação       |

Dano aproximado por ataque: sentinela 14, raider 9, projétil 12, onda do brute 30. A armadura do brute reduz cortes comuns, mas sua recuperação aumenta o dano recebido. Ataques fortes interrompem archer e brute; cortes comuns interrompem sentinelas e raiders. Projéteis têm colisão varrida, expiração e bloqueio por obstáculos; a onda do brute também considera obstáculos entre origem e jogador.

1. Três sentinelas e um raider.
2. Duas sentinelas, dois raiders e um archer.
3. Dois raiders, dois archers e um brute.
4. Duas sentinelas, dois raiders, dois archers e um brute.

São **21 inimigos** no total. Há três segundos entre ondas, com aviso e contagem no HUD. A próxima onda só começa após eliminar a anterior. Spawn evita o jogador, obstáculos e outros corpos, com breve sinalização. Limite simultâneo padrão **6**; acrescente `?enemyLimit=4` para outro limite entre 1 e 8. Inimigos excedentes aguardam uma vaga. A coordenação limita preparações/ataques simultâneos a dois e espaça novas iniciativas; os telegráficos continuam necessários para esquivar. Derrota e vitória permitem reiniciar a primeira onda com vida/energia restauradas.

Mortes usam a pose real no instante do impacto, reação direcional, perda de equilíbrio, joelhos articulados, queda acelerada pela gravidade, contato de chão por vértices transformados das malhas e repouso amortecido. Há queda para trás, lateral e pesada para Brutes; Archers perdem sustentação e dispersam fragmentos. Corpos permanecem por 2,8 s, com fade nos últimos 650 ms; colisão e ataque cessam imediatamente. A queda continua após a vitória ou derrota. Não há ragdoll de corpos rígidos: a solução é procedural híbrida, estável e limitada por chão.

## Arquitetura e recursos

- `src/main.ts`: integração do jogo, estados, HUD, câmera isométrica e áudio sintetizado.
- `src/input.ts`: camada de entrada, Gamepad API e fila de eventos.
- `src/actions.ts`: estado do jogador, carga, energia, esquiva, cooldown e invulnerabilidade.
- `src/combat.ts`, `combat-effects.ts`, `spectral-effects.ts`: curvas do golpe, hitbox varrida, rastro da lâmina, flash, onda, halo e afterimages.
- `src/crimson-wave.ts`: pool, shader, colisão varrida e regras de acerto da rajada.
- `src/death-motion.ts`: poses capturadas, articulação, queda e repouso com contato no chão.
- `src/enemies.ts`, `enemy-visuals.ts`, `waves.ts`: IA, arquétipos, pooling, projéteis, ondas e escolha de spawn.
- `src/visuals.ts`: Kaeron articulado e templo procedural; `mechanics.ts` e `timing.ts`: colisões planares e simulação fixa de 60 Hz.

A semente padrão é 7341; `?seed=1234` reproduz outra variação de detalhes. A arena navegável é projetada e os elementos superficiais são determinísticos. Sem modelos, imagens, fontes ou áudio externos obrigatórios. O projeto usa instancing no piso e projéteis, geometria imutável compartilhada, pool de 8 corpos, 24 projéteis, 4 ondas, 6 afterimages e 200 faíscas. A tomada de decisão da IA é espaçada; movimento e colisões continuam em passos fixos. Capa e materiais mutáveis não são compartilhados indevidamente.

`?diagnostics=1` mostra FPS real, draw calls, inimigos ativos e tempo de atualização. A simulação recupera até 0,5 s por render; pausas descartam o tempo de suspensão. Esta entrega não comprova 60 FPS em GPU. Os testes disponíveis usam Linux/Chromium com renderização por software; Fedora KDE, Windows, hardware de controle e GPU física precisam de validação no PC de destino.

## Testes e evidências

Veja [o relatório 1.3](docs/1.3/TESTES.md), os JSONs em `docs/1.3/` e as capturas em [screenshots](docs/1.3/screenshots/). Os relatórios anteriores foram preservados.

```fish
npm test
```

Para os testes reais de navegador, instale Chromium (`sudo dnf install chromium`) e mantenha `npm run dev` em outro terminal:

```fish
npm run test:browser
npm run test:symphony
```

Ou execute individualmente `npm run test:input`, `npm run test:movement`, `npm run test:controller`, `npm run test:combat`, `npm run test:ai`, `npm run test:waves` e `npm run test:dodge-visual`. Os runners aceitam `CHROMIUM_PATH` e `NEXUS_URL`. Para testar produção:

```fish
npm run build
npm run preview -- --port 5181
```

Em outro terminal:

```fish
set -x NEXUS_URL 'http://127.0.0.1:5181/?test=1&diagnostics=1'
npm run test:browser
npm run test:symphony
```

`?test=1` habilita somente inspeção e preparação de cenários. Testes de ondas usam ataques, hitboxes, vida, dano e progressão reais; não forçam mortes. Os testes isolados de IA podem iniciar uma onda escolhida, sem fingir que isso valida progressão. Gamepads são simulados via `navigator.getGamepads()`. Capturas curtas de animação usam relógio controlado, documentado no relatório. Não equivalem a benchmark de hardware ou playtest humano de balanceamento.
