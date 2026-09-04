# LED Union

*[Read in English](README.md)*

Um app só para todos os seus controladores LED Bluetooth — um PWA, sem instalar, sem
conta.

Os apps originais (Magic Lantern, Lotus Lantern, LED+LAMP, BLEDIM) falam cada um com
uma família, controlam um aparelho por vez, e nenhum recebe manutenção. Aqui você
seleciona **um aparelho, vários, todos ou um grupo nomeado** e aplica cor, brilho,
efeito ou cena de uma vez.

## Estado

| família | serviço / característica | status |
|---|---|---|
| MELK-* (Magic Lantern) | `FFF0` / `FFF3` | ✅ implementado |
| ELK- / XSL- / CLK- (Lotus Lantern) | `FFF0` / `FFF3` | ✅ implementado |
| LEDBLE / LEDSTAGE / LEDLIGHT | `FFE0` / `FFE1` | ✅ **confirmado em hardware** |
| LEDDMX-00/01/03, LEDCAR-01 | `FFE0` / `FFE1` | ✅ implementado (`7B FF … BF`) |
| LEDDMX-02/04, LEDCAR-02 | `FFE0` / `FFE1` | ✅ implementado (`7B … BF`, deslocado) |
| LEDSMART | `FFE0` / `FFE1` | ✅ implementado (`7D … DF`) |
| LEDSUN | `FFE0` / `FFE1` | ✅ implementado (`7A … AF`, só branco/CCT) |
| LEDLIKE | `FFE0` / `FFE1` | ✅ implementado (`70 … 0F`, só branco/CCT) |
| LEDPHO | `FFE0` / `FFE1` | ✅ implementado (`72 … 2F`, com endereço de grupo) |
| BLEDIM / LanQianTech | `FFF0` / **`FFF1`** | ✅ implementado (`55 AA`, tam. variável) |

Vale ser claro sobre o que "implementado" significa aqui. O driver `ffe0` está
**confirmado em hardware real** — conexão, handshake `2A` e comando de cor funcionam
num LEDBLE-00 de verdade. Todas as outras famílias vêm da decompilação dos apps
originais e batem com eles byte a byte (ver [Teste diferencial](#teste-diferencial)),
mas nunca foram testadas num aparelho.

**Em aberto:** o controlador testado alimenta várias saídas físicas (fita, maçaneta,
soleira) e o frame de cor padrão só atinge uma delas. Ver a seção de canais em
[`docs/protocol-pt-br/ledble.md`](docs/protocol-pt-br/ledble.md).

## Deploy

Push na `main` compila e publica em
**https://chameleonbr.github.io/LED_UNION/** via GitHub Actions e GitHub Pages. O
workflow roda os testes e a checagem de tipos antes — build vermelho não é publicado.

É servido como *project page*, então o site fica sob `/LED_UNION/` e o Vite compila com
esse `base`. Em desenvolvimento fica na raiz, porque o fluxo do túnel adb aponta o
celular para `http://localhost:5173`.

O `dist/` compilado **não** é commitado de propósito: daria conflito em todo build (os
hashes dos assets mudam), e um artefato desatualizado divergindo do fonte em silêncio é
pior que artefato nenhum.

## Rodando no celular

Web Bluetooth exige contexto seguro. Em desenvolvimento `localhost` conta, então um
túnel do adb evita HTTPS e certificado:

```bash
npm install
npm run dev
adb reverse tcp:5173 tcp:5173
```

Abra `http://localhost:5173` no Chrome do Android. Em produção, sirva o `dist/` por
HTTPS em qualquer domínio.

iOS não suporta Web Bluetooth.

## Comandos

```bash
npm run dev          # servidor de desenvolvimento
npm run build        # gera dist/ com service worker e manifest
npm test             # builders de frame e fila de escrita
npm run check        # svelte-check + tsc
npm run gen:effects  # regenera src/lib/protocol/effects.ts a partir de docs/protocol/*.tsv
```

## Estrutura

```
src/lib/protocol/      builders de frame puros, um módulo por família
src/lib/queue.ts       fila serial por aparelho, com coalescing
src/lib/ble.svelte.ts  conexões GATT e aplicação em grupo
src/lib/ui/            telas
docs/protocol/         specs de wire e tabelas de efeito (.tsv)
docs/protocol-pt-br/   as mesmas specs, em português
tools/gen-effects.py   gerador das tabelas de efeito
tools/difftest/        confere nossos builders contra os apps originais
```

Adicionar uma família é um arquivo em `src/lib/protocol/` implementando `Driver`, mais
uma linha no registry. Os builders são funções puras, então cada um ganha um teste que
compara os bytes com o frame documentado.

## Como você controla

Cada **dispositivo lógico** — uma saída física, não uma controladora — é um card próprio
na aba Efeitos, com cor e efeito próprios. Uma controladora que alimenta uma fita e a
maçaneta vira dois cards, então uma pode ficar azul e a outra âmbar.

Um card **Todos** no fim ajusta cor e brilho de tudo de uma vez. Efeito fica de fora de
propósito: os ids são por família, então o id 42 é um efeito no LEDDMX e outro no MELK.

Algumas controladoras escolhem a saída trocando de protocolo, não por número de canal.
O LEDCAR-01 alimenta uma luz RGB comum no envelope `7E` e uma fita endereçável no `7B`;
o app original passa uma flag `isCAR01DMX` em todas as chamadas justamente por isso.
Dividir uma dessas gera um card **RGB** e um **SPI**, e só o SPI oferece configuração
de fita.

Qual byte de canal chega a qual saída física depende do firmware, então as saídas são
editáveis: adicionar, remover e trocar o número do canal até a luz certa responder. Se
só uma de duas saídas reage, a outra está em outro número.

Marque os aparelhos que quiser e **salve uma cena**. Aplicar toca só neles e deixa o
resto como está, reconectando quem tiver caído.

O que cada card mostra é **o último comando enviado**, não uma leitura — BLE não devolve
nada. Use o app original no meio e ele dessincroniza.

O controle **Branco** é uma intenção, não um canal. Hardware com fio branco de verdade
tem esse canal acionado; numa controladora só RGB o mesmo slider faz r = g = b, que é o
que "branco nessa intensidade" significa ali. Mandar o canal branco para uma
controladora RGB zera a cor e apaga a fita.

O BLEDIM expõe um **modo de canal** (1 DIM, 2 CCT, 3 RGB, 4 RGBW) no topo do card,
porque ele muda o significado dos outros controles.

## Cores e efeitos customizados

A paleta é editável: escolha entre as cores salvas, adicione as suas na faixa RGB
completa de 0–255, remova qualquer uma.

Um **efeito customizado** é uma sequência ordenada de cores com velocidade e escolha
entre pular e desvanecer. Preto conta como cor, então verde → preto → âmbar vira um
strobe. LEDBLE, LEDDMX e BLEDIM suportam; **MELK e ELK não** — esses apps não têm
comando de lista de cores, então o editor fica escondido nesses cards.

## Idioma

Inglês por padrão, mudando para o idioma do navegador quando houver tradução, com um
seletor no cabeçalho para forçar.

## Fitas endereçáveis

LEDDMX e LEDCAR controlam fitas de LED endereçáveis. Na aba **Efeitos**, com um desses
aparelhos selecionado, aparece o painel **Fita endereçável**: contagem de pixels,
ordem dos canais e sentido.

Sem isso configurado, os 211 efeitos renderizam com cor trocada ou só em parte da fita
— e nada reporta erro, o que torna o sintoma difícil de diagnosticar. A configuração
fica salva por aparelho.

## Reagir ao som

Também na aba **Efeitos**, o painel **Reagir ao som** liga o microfone do próprio
controlador e ajusta a sensibilidade. Os três drivers suportam.

Alternar para o modo "música" muda o modo no aparelho, mas **transmitir o áudio do
celular não está implementado** — exigiria capturar PCM e enviá-lo por BLE
continuamente.

## Protocolo

Ver [`docs/protocol-pt-br/`](docs/protocol-pt-br/). O que é fácil errar:

- Nas famílias `FFE0` e `FFF0`, brilho, velocidade, branco e CCT são **0–100**,
  enquanto RGB é 0–255. No BLEDIM tudo é **0–255**.
- A família `FFE0` **exige handshake** (`2A 02 …`) logo após conectar, senão o
  controlador ignora todo comando.
- As famílias `FFE0` e `FFF0` usam frames fixos de 9 bytes sem checksum. O BLEDIM usa
  comprimento variável **com** checksum aditivo, e exige fragmentos de 20 bytes.
- Esses controladores engasgam com escritas concorrentes. Há uma fila serial por
  aparelho com gap mínimo — 50 ms para `FFE0`, 5 ms para `FFF0`, 30 ms por fragmento
  no BLEDIM.

## Teste diferencial

Os drivers foram transcritos à mão do Java decompilado, e teste escrito à mão só
confirma o que o autor entendeu — não o que o app faz. O `tools/difftest/` extrai
mecanicamente todo frame que os apps originais montam e compara com os nossos.

**221 de 221 frames casam**, em três drivers e nove layouts de wire. O processo achou
cinco bugs reais que teste unitário não pegaria. Ver
[`tools/difftest/README.md`](tools/difftest/README.md).

## Licença

MIT.

Isto é trabalho de interoperabilidade com protocolos proprietários. O repositório
contém apenas fatos de protocolo derivados de observação — nenhum código, asset ou
string dos apps originais, e nenhuma cópia dos apps em si.
