# Magic Light (Zengge BLE, LEDENET clássico)

App: **Magic Light - BLE** (`com.Zengge.LEDBluetoothV2`, JM Zengge). Extraído do Java
descompilado (construtores em `r0/g.java`, transporte em `com/blebulb/core/*`). Ainda
não testado em hardware.

## Descoberta e GATT

| o quê | valor |
|---|---|
| nomes | `LEDBLE…`, `LEDBlue…`, `LEDSpeaker…`, `LEDShoe…`, `TIBURN…`; outros nomes (ex.: `FluxBlue`) usam o cliente com timer do app |
| escrita | serviço `FFE5`, característica `FFE9`, escrita sem resposta |
| notificação | serviço `FFE0`, característica `FFE4` |
| pareamento / criptografia | nenhum |

Nomes `LEDBLE-xx` colidem com a família LED+LAMP (`FFE0`/`FFE1`). Quem escolhe o driver
é a sondagem GATT: `FFE5`/`FFE9` é Magic Light; `FFE0`/`FFE1` é LED+LAMP.

Quadros com mais de 20 bytes vão em pedaços de 20 bytes, com 60 ms entre eles.

## Comandos

| função | bytes |
|---|---|
| consulta de estado | `EF 01 77` |
| liga / desliga | `CC 23 33` / `CC 24 33` |
| RGB (maioria dos tipos) | `56 R G B 00 F0 AA` |
| RGB (tipos 3, 19) | `56 R G B 00 AA` |
| branco (maioria) | `56 00 00 00 W 0F AA` |
| branco (tipos 84, 5) | `56 00 00 00 W 5A AA` |
| branco (tipo 4) | `31 00 00 00 W 00 00 CS`, CS = soma dos 7 primeiros bytes |
| modo embutido | `BB modo (31 − s) 44`, s = round(velocidade% × 30 / 100); `01` é o mais rápido |
| lista de cores | `99` + 16 × RGB (vagos = `01 02 03`) + velocidade + `3A` fade / `3B` salto / `3C` strobe + `FF 66` (53 bytes) |
| música (áudio do celular) | `78 R G B 00 F0 EE`, em fluxo |
| acertar relógio | `10 14 AA MM DD hh mm ss dds 00 01` |

Não há opcode de brilho: o app escala o RGB (ou o W), e o driver faz o mesmo.

Modos `0x25..0x38` (20): fade cruzado de sete cores; mudança gradual vermelha, verde,
azul, amarela, ciano, roxa e branca; fade cruzado vermelho/verde, vermelho/azul e
verde/azul; strobe de sete cores; strobes de vermelho a branco; salto de sete cores.

## Resposta de estado

12 bytes: `66 tipo energia(23 ligado) modo 21 velocidade R G B W versão 99`. O byte de
tipo escolhe as variantes de quadro acima.

## Fora do escopo

O serviço extra de energia `FFF0` do cliente com timer (`FFF1` habilita com `04`,
`FFF2` recebe `3F`/`00`), os timers (`23`/`24`), os quadros do LEDSpeaker e as listas de
modos de Natal dos tipos 35/247.
