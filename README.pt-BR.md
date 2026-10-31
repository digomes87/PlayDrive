# PlayDrive

[English](README.md) · **Português**

Simulador de estacionamento de caminhão que roda 100 % no navegador. Não é um jogo arcade: o
conjunto tem motor diesel com curva de torque e câmbio automatizado, pneus que saturam, quinta
roda que transmite empurrão e puxão, e um reboque que balança, escapa e dobra quando o motorista
insiste. Quando houve dúvida entre jogável e realista, ficou o realista, e o parâmetro está em
[`src/truckSpec.ts`](src/truckSpec.ts).

Publicado em: <https://digomes87.github.io/PlayDrive/>

A interface está disponível em inglês (o padrão) e em português do Brasil. As bandeiras no topo do
menu alternam entre os dois, e a escolha fica guardada no navegador. Os nomes abaixo são os da
interface em português.

## Rodar localmente

Requer Node 22 ou mais novo.

```bash
npm install
npm run dev        # servidor de desenvolvimento
npm test           # testes da física e da simulação (Vitest)
npm run test:e2e   # testes no navegador (npx playwright install chromium antes)
npm run build      # gera dist/
npm run preview    # serve o build em /PlayDrive/
```

## Controles

| Teclado | Ação |
| --- | --- |
| `W` / `↑` | Acelerador |
| `S` / `↓` | Freio de serviço |
| `A` / `D`, `←` / `→` | Direção |
| `Shift` | Direção fina (25 % da velocidade) |
| `Espaço` | Válvula do freio de estacionamento |
| `G` | Seletor de marcha R · N · D |
| `C` | Câmera: externa, cabine, pátio, reboque |
| `H` | Buzina |
| `R` / `Esc` | Reiniciar a missão / menu |

Controle no layout de motorista: analógico esquerdo dirige, gatilho direito acelera, gatilho
esquerdo freia. `A` marcha, `B` freio de estacionamento, `X` buzina, `Y` câmera, `LB` direção
fina. Expo e zona morta são ajustáveis no menu. Teclado e controle funcionam juntos.

## Missões

1. **Treino livre**: sem cronômetro, cones e um doca aberta.
2. **Primeira entrega**: dê ré com o reboque na ba livre entre dois trailers estacionados.
3. **Baliza no beco**: passe da boca do beco e entre de ré, 90 graus, entre as paredes.
4. **Rua de carga**: baliza paralela na vaga entre os dois trailers encostados na parede.
5. **Slalom de ré**: portões de cones deslocados; o reboque não pode dobrar além do limite.
6. **O portão**: passe pelo portão estreito, manobre no pátio e entre de ré na porta de carga.

A missão fecha quando o reboque está inteiro dentro do retângulo-alvo, parado, com o freio de
estacionamento aplicado, por 1,5 s. A pontuação parte de 1000 e desconta tempo acima da referência,
pico de articulação, alinhamento final, colisões e freadas bruscas. Os melhores resultados ficam no
`localStorage`.

Ao fim da missão, **Rever a manobra** repete tudo a 4×. O replay não é um vídeo: a simulação é
determinística, então ele roda a missão de novo com os comandos gravados e chega ao mesmo estado.

## Modelo físico

Tudo em SI, em `src/physics`, sem dependência do Three.js. Passo fixo de 120 Hz desacoplado do
framerate (acumulador), com o estado interpolado para a renderização. A simulação é determinística:
mesma entrada, mesmo estado.

### O conjunto

Cavalo e reboque são dois corpos rígidos no plano do pátio — posição, orientação, velocidades
longitudinal e lateral, taxa de guinada cada um — integrados juntos por RK4:

- **Motor**: curva de torque (2100 N·m plana entre 1100 e 1400 rpm, corte no governador), câmbio
  automatizado de oito marchas, corte de torque na troca, embreagem de partida abaixo de 1,5 m/s e
  creep engrenado com os freios soltos.
- **Pneus**: um modelo por grupo de eixo. A força lateral cresce com a velocidade de
  escorregamento até o eixo saturar em μ·Fz (0,85 no asfalto seco); o círculo de atrito então
  divide o orçamento com freio e tração — travar as rodas esterçado faz o conjunto deslizar reto.
- **Cargas verticais**: cargas estáticas por eixo vindas da geometria, incluindo a carga do pino
  rei sobre a quinta roda, mais transferência longitudinal quase estática — frear alivia o eixo do
  reboque e carrega o dianteiro do cavalo.
- **Quinta roda**: junta mola-amortecedor rígida e quase crítica que transmite empurrão e puxão,
  mas nenhum momento de guinada — o reboque gira livre no pino rei, como deve. O alongamento em
  regime de frenagem é de poucos milímetros.
- **Direção**: coluna com rampa (volante todo em 1,8 s, retorno mais rápido, modo fino a 25 %) e
  geometria Ackermann no eixo dianteiro.

Consequências que saem do modelo em vez de serem roteirizadas:

- a ré é instável: o reboque escapa e o motorista precisa corrigir, senão dobra;
- articulação acima de 55° alarmea, acima de 80° a missão reprova;
- frear forte com o conjunto torto deixa o reboque balançar — os pneus saturam;
- o caminhão anda sozinho engrenado com os freios soltos, e fica parado com a válvula fechada.

### Colisões

Cavalo e reboque são caixas orientadas contra os obstáculos fixos (paredes, galpões, trailers
estacionados, cones) via SAT, com push-out e resposta por impulso no ponto de contato que mata a
velocidade de aproximação. Impactos acima de 0,3 m/s contam como colisão na pontuação.

## Testes

`npm test` roda 60 testes, entre eles:

- curva de torque nos pontos tabelados e entre eles, banda de partida da embreagem, lógica de
  troca com histerese;
- orçamento de atrito nunca estourado na largada; ré reta que continua reta; curva constante com o
  reboque assentando na articulação que a geometria prevê; frenagem até a imobilidade que se mantém
  imóvel; dobra com o volante travado; determinismo;
- separação SAT, parada na parede com contagem de impacto, sem atropelar obstáculo em passo de
  homem;
- toda missão começa livre de obstáculos e toda zona comporta um reboque estacionado;
- a missão dock inteira dirigida do início ao fim por um piloto automático de teste — zero
  colisões — e o replay dela chegando ao mesmo tempo e à mesma pontuação.

## Limitações conhecidas

- O mundo é plano: sem curso de suspensão, sem rolagem, sem rampa.
- Os pneus são um modelo por velocidade com saturação, não um conjunto Pacejka com comprimento de
  relaxação.
- O motor não tem dinâmica de pedal de embreagem; a partida é um fator de acoplamento suave.
- Cones são rígidos: não tombam, são obstáculos como as paredes.
- Articulação além do limite mecânico é travada, não resolvida como contato.
- O mapeamento do controle tem teste unitário do layout, mas não foi experimentado com um controle
  físico.
- As missões foram ajustadas pelo piloto automático e passadas rápidas manuais; beco, rua e portão
  podem ainda estar mais apertados ou mais largos do que deveriam.

## Estrutura

```
src/
  truckSpec.ts   todos os valores de referência do conjunto
  physics/       núcleo físico puro e testável: motor, pneus, direção, veículo em RK4
  sim/           passo de simulação, colisões, missões, verificação de estacionamento, pontuação, replay
  i18n/          idiomas da interface e o texto de cada um
  render/        cena Three.js, caminhão procedural, pátios, câmeras
  input/         teclado, controle, curvas de resposta
  ui/            painel de instrumentos, menus, áudio
tests/           testes Vitest (física, simulação, missão do piloto automático)
```

## Deploy

O workflow [`deploy.yml`](.github/workflows/deploy.yml) testa, gera o build e publica a `main` no
GitHub Pages. No repositório, em *Settings → Pages*, a fonte precisa estar em **GitHub Actions**.
O `base` do Vite está configurado para `/PlayDrive/`.

O fluxo de branches é gitflow com promoção automática: `feature/*` entra em `develop`; quando o CI
de `develop` passa (tipos, testes e build), o job `promote` faz o merge em `main`, cria a tag da
versão do `package.json` se ainda não existir e dispara o deploy. Ninguém faz push direto na
`main`.

A documentação é escrita em inglês; este arquivo é a versão em português de [README.md](README.md)
e deve ser atualizado junto com ele.
