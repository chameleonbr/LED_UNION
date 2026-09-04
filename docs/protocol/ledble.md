# Protocolo LEDBLE / LEDDMX / LEDCAR / LEDSMART / LEDSUN / LEDLIKE / LEDPHO

Derivado de `LED+LAMP 4.3.5` (`com/home/net/NetConnectBle.java`, `com/home/constant/CommonConstant.java`).

## Transporte

| item | valor |
|---|---|
| service | `0000ffe0-0000-1000-8000-00805f9b34fb` |
| write + notify char | `0000ffe1-0000-1000-8000-00805f9b34fb` |
| `0000ffe2` | declarado, nunca usado |
| tamanho do frame | **sempre 9 bytes**, sem fragmentação |
| checksum | **não existe** |
| write type | não definido pelo app → default (with-response) |
| CCCD | `0x2902` = `0100` para habilitar notify |

**Pacing observado no app original** (gate por tempo, não fila — writes dentro da janela
são descartados):

| comando | intervalo mínimo |
|---|---|
| RGB | 50 ms |
| brilho | 30 ms |
| upload de listas (DIY, cores) | 100 ms |
| DIY dinâmico | 300 ms |

## Header / trailer por família

Byte 0 e byte 8 são fixos por família, selecionados pelo **prefixo do nome anunciado**.
Nada é lido de volta do controlador para escolher o formato.

| header | trailer | família |
|---|---|---|
| `7E` | `EF` | LEDBLE-00/01/02/03, LEDSTAGE, LEDLIGHT, LEDCAR-00/01 (modo BLE) |
| `7B` | `BF` | LEDDMX-00..04, LEDCAR-01 (modo DMX), LEDCAR-02 |
| `7D` | `DF` | LEDSMART |
| `7A` | `AF` | LEDSUN |
| `70` | `0F` | LEDLIKE |
| `72` | `2F` | LEDPHO |
| `7C` | `CF` | grafite (DMX-02/04, CAR-02) |
| `8E` / `8B` | `EF` / `BF` | timer |
| `2A` | `AF` | senha / auth |

## Handshake na conexão

Se o nome contém `LEDBLE`, `LEDDMX` ou `LEDCAR`, o app espera **300 ms** após conectar e envia:

```
2A 02 <p0> <p1> <p2> <p3> <tb> <min> AF
```

- `<p0..p3>` = senha, **default `A1 23 45 67`**
- `<tb>` = `(weekIndex << 5) | hour24`, `weekIndex = {7,1,2,3,4,5,6}[DAY_OF_WEEK-1]`
- `<min>` = minuto atual

Consulta de status da senha (também é o que habilita notify):
```
2A 05 FF FF FF FF FF FF AF
```
Resposta: `2A 05 <status>` — `1` = senha errada, `2` = senha com dígitos repetidos, `3` = reenviar.

Este é o **único frame de notify que o app decodifica**. Não existe frame de estado geral.

## Frames LEDBLE (`7E … EF`)

Layout padrão: `7E <sub> <cmd> <p1> <p2> <p3> <p4> <p5> EF`, com `<sub>=FF`.

```
power on      7E FF 04 01 00 FF FF 00 EF
power off     7E FF 04 00 00 FF FF 00 EF
rgb           7E FF 05 03 <r> <g> <b> FF EF
warm white    7E FF 05 01 <w 0..100> FF FF FF EF
cct 2ch       7E FF 05 02 <warm> <cool> FF FF EF
brilho        7E FF 01 <0..100> 00 FF FF FF EF
velocidade    7E FF 02 <0..100> 00 FF FF FF EF
efeito        7E 00 0E <modeId> FF FF FF FF EF
modo mic      7E 02 0E <mode> FF FF FF FF EF
sensib. mic   7E FF 07 <sens> FF FF FF FF EF
ordem RGB     7E FF 08 <order> FF FF FF FF EF
```

Brilho e velocidade são **0..100**, não 0..255.

### Canais (LEDBLE-02) — duas saídas independentes

O ramo `LEDBLE-02` usa o **byte 7** como seletor de saída. Valores vindos do seletor de
rádio em `MainActivity_BLE` (`rbBLE02RgbALL` / `rbBLE02RgbLED1` / `rbBLE02RgbLED2`):

| valor | alvo |
|---|---|
| `0` | todas as saídas |
| `1` | LED1 |
| `2` | LED2 |

```
rgb        7E FF 05 03 <r> <g> <b> <ch> EF     NetConnectBle:725
power      7E FF 04 <1|0> 00 FF FF <ch> EF     NetConnectBle:394
brilho     7E FF 01 <bri> 00 FF FF <ch> EF     NetConnectBle:2206
velocidade 7E FF 02 <spd> 00 FF FF <ch> EF     NetConnectBle:2217
efeito     7E <flag> 0E <id> FF FF FF <ch> EF  NetConnectBle:1852
```

**Observado em hardware** (LEDBLE-00-9B67, controlador de carro com fita + maçaneta +
soleira): o frame de cor padrão com byte 7 = `FF` mudou **apenas a maçaneta**. Ou seja,
o firmware trata o byte 7 como seletor de saída mesmo anunciando `LEDBLE-00`, e `FF`
não significa "todas". Falta mapear qual valor atinge cada luz.

São **duas** saídas segundo o código, não três. Nos outros ramos (`LEDBLE-00`, `-01`) o byte 7 é fixo
(`FF` em cor, `00` em power) e não há seleção de saída documentada — então um
controlador que separe luzes fisicamente mas anuncie `LEDBLE-00` precisa de
confirmação no aparelho.

### Variantes de layout

- **LEDBLE-03** desloca tudo: `cmd` vai pro byte 1, o filler `FF` some.
  `7E 09 <modeId> <flag> FF FF FF FF EF`, `7E 01 <bri> <flag> FF FF FF FF EF`.
- **LEDBLE-02** usa byte 1 e byte 7 como canal: `7E FF 05 03 <r> <g> <b> <ch> EF`.
- **LEDBLE-03 RGBW**: `7E 05 <r> <g> <b> <w> FF FF EF`.
- **LEDSTAGE / LEDLIGHT** trocam o power: `7E FF 04 <1|0> FF FF FF FF EF`.

## Frames LEDDMX / LEDCAR (`7B … BF`)

Dois layouts. DMX-00/01/03 e CAR-01 usam `7B FF <cmd> …`; **DMX-02/04 e CAR-02
descartam o `FF` e deslocam**.

```
                 7B FF (00/01/03, CAR-01)              7B (02/04, CAR-02)
power on/off     7B 04 04 <1|0> FF FF FF FF BF         7B 04 <1|0> FF FF FF FF FF BF
rgb              7B FF 07 <r> <g> <b> 00 FF BF         7B 07 <r> <g> <b> <w> FF FF BF
brilho           7B FF 01 <(v*32)/100> <v> <f> FF FF BF  7B 01 <v> <f> FF FF FF FF BF
velocidade       7B FF 02 <spd> FF 00 FF FF BF         7B 02 <spd> 00 FF FF FF FF BF
modo             7B FF 13 <mode> FF FF FF FF BF        7B 13 <mode> FF FF FF FF FF BF
chip/SPI         7B FF 03 <m> FF FF FF FF BF           7B 03 <m> FF FF FF FF FF BF
direção          7B FF 0D <d> FF FF FF FF BF           7B 0D <d> FF FF FF FF FF BF
cct              —                                     7B 0A <cw> FF FF FF FF FF BF
```

Escala de brilho difere: família `7E` manda `0..100` cru; `7B FF` manda `(v*32)/100` no
byte 3 **e** o valor cru no byte 4.

## Outras famílias

Verificadas byte a byte contra os `new int[]{…}` do `NetConnectBle`.

### LEDSMART (`7D … DF`)

```
power       7D 01 01 <1|0> FF FF FF FF DF
rgb         7D 02 01 FF <r> <g> <b> FF DF
brilho      7D 02 02 <v> FF FF FF FF DF
velocidade  7D 02 04 <v> FF FF FF FF DF
modo        7D 02 05 <m> FF FF FF FF DF
dim/branco  7D 02 07 <v> FF FF FF FF DF
diy         7D 02 03 <i> <r> <g> <b> <qtd> DF
custom rgb  7D 02 08 <i4> <r> <g> <b> <i5> DF
consulta    7D 01 05 <i> FF FF FF FF DF
```

### LEDSUN (`7A … AF`) — **sem canal RGB**

```
power       7A 01 <1|0> FF FF FF FF FF AF
brilho      7A 02 <v> FF FF FF FF FF AF
velocidade  7A 03 <v> FF FF FF FF FF AF
cct/warm    7A 05 <v> FF FF FF FF FF AF
modo        7A 06 <m> FF FF FF FF FF AF
modo voz    7A 07 <m> FF FF FF FF FF AF
sensib.     7A 08 <s> FF FF FF FF FF AF
```

### LEDLIKE (`70 … 0F`) — **sem canal RGB**

```
power       70 01 <1|0> FF FF FF FF FF 0F
brilho      70 02 <v> FF FF FF FF FF 0F
velocidade  70 03 <v> FF FF FF FF FF 0F
modo        70 FF <m> FF FF FF FF FF 0F
modo mic    70 04 <m> 00 FF FF FF FF 0F
modo voz    70 FF <m> 01 FF FF FF FF 0F
sensib.     70 08 <s> FF FF FF FF FF 0F
```

Existem dois comandos de modo distintos: o genérico (`70 FF <m>`, usado por
`setRgbMode`) e o específico do LEDLIKE (`70 04 <m> <flag>`, `setLikeMode`).

### LEDPHO (`72 … 2F`) — com endereço de grupo

Os **três últimos bytes de parâmetro são o endereço de grupo** (`A`, `B`, `C` em
`MainActivity_PHO`), que começam em `0, 0, 0` — o que atinge todas as luminárias.

```
power        72 01 <on> <seg> FF <A> <B> <C> 2F
brilho       72 02 <v> <seg> FF <A> <B> <C> 2F
hsi          72 03 <h> <s> <i> <A> <B> <C> 2F
rgb          72 04 <r> <g> <b> <A> <B> <C> 2F
cct          72 05 <ct> FF FF <A> <B> <C> 2F
corr. cct    72 06 <v> <v2> FF <A> <B> <C> 2F
gelatina     72 07 <v> FF FF <A> <B> <C> 2F
efeito       72 08 <fx> FF FF <A> <B> <C> 2F
vel. efeito  72 09 <spd> FF FF <A> <B> <C> 2F
canal        72 0A <v> <v2> FF <A> <B> <C> 2F
add grupo    72 10 <g> <n> FF FF FF <x> 2F
del grupo    72 11 <g> FF FF FF FF FF 2F
consulta     72 12 00 FF FF FF FF FF 2F
reset grupos 72 14 FF FF FF FF FF FF 2F
```

## Fitas endereçáveis (SPI / pixel)

As famílias **LEDDMX** e **LEDCAR** controlam fitas de LED endereçáveis. Os efeitos
embutidos só renderizam corretamente depois que o controlador sabe como a fita está
fisicamente ligada. Errar isso não dá erro: dá cor trocada ou meia fita acesa.

```
config    7B FF 05 <chip> <pixHi> <pixLo> <ordem> FF BF     (DMX-00/03)
          7B FF 05 04    <pixHi> <pixLo> <ordem> FF BF      (CAR-01, chip fixo em 4)
          7B 05 <ordem> <pixHi> <pixLo> FF FF FF BF         (DMX-02/04, CAR-02)
chip      7B FF 03 <m> FF FF FF FF BF   /  7B 03 <m> FF FF FF FF FF BF
sentido   7B FF 0D <d> FF FF FF FF BF   /  7B 0D <d> FF FF FF FF FF BF
```

A contagem de pixels é **big-endian** em dois bytes. Repare que o layout deslocado
**reordena os parâmetros** — a ordem de canais vem primeiro e não há campo de chip.

Do `ChipSelectActivity`, que nomeia os parâmetros:

```java
setConfigSPI(bannerType, (byte)(bannerPix >> 8), (byte)bannerPix, bannerSort)
//           chip/IC      contagem de pixels (hi, lo)             ordem RGB
```

| tabela | arquivo | valores |
|---|---|---|
| chip | `chip_model.tsv` | 1 = UCS512A, 2 = UCS512C |
| ordem dos canais | `rgb_order.tsv` | 12: RGB, RBG, GRB, GBR, BRG, BGR + as quatro variantes W |
| ordem (deslocado) | `rgb_order_dmx02.tsv` | 6: só as permutações RGB |

Efeitos dessas famílias: `dmx_model.tsv`, 211 entradas, com `255 = AUTO`.

### Handshake

O `2A` só é enviado para `LEDBLE`, `LEDDMX` e `LEDCAR`. As outras quatro famílias
não o recebem no app original.

### Tabelas de efeito destas famílias

| família | arquivo | entradas |
|---|---|---|
| LEDLIKE | `like_mode.tsv` | 8 (ids 0..7) |
| LEDPHO | `pho_mode.tsv` | 16 (ids 0..15) |
| LEDSMART, LEDSUN | — | nenhuma tabela nos recursos; ids expostos diretamente |

## Tabelas de efeito

Extraídas de `res/values/arrays.xml`:

| arquivo | entradas | faixa de id |
|---|---|---|
| `ble_mode.tsv` | 23 | 135..157 |
| `car_mode.tsv` | 23 | 135..157 |
| `dmx_model.tsv` | 211 | 1..255 |
| `dmx03_model.tsv` | 211 | 1..255 |
| `select_mode.tsv` | 5 | 0..4 |

## Bugs conhecidos do app original (não replicar)

- Brilho CT em `NetConnectBle:1215` manda trailer `0F` em vez de `EF`.
- Brilho LEDCAR-02 em `:1162` emite um frame LEDLIKE (`70 … 0F`).
