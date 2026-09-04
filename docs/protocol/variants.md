# Variantes conhecidas de frame — cruzamento com fontes externas

Meus frames em `elk-melk.md` e `ledble.md` vieram da decompilação dos apps originais.
O projeto [`dave-code-ruiz/elkbledom`](https://github.com/dave-code-ruiz/elkbledom)
(integração Home Assistant, 24 modelos) derivou os dele de sniffing de hardware real.

As duas fontes concordam nos UUIDs e em vários frames, e **divergem no byte 1 e em bytes
de padding**. A conclusão não é que uma esteja errada: o firmware varia entre unidades
que anunciam o mesmo nome. Por isso o elkbledom mantém 24 entradas com override por
modelo, e por isso vale varrer candidatos em vez de assumir um.

## UUIDs (confirmados pelas duas fontes)

| write | read | famílias |
|---|---|---|
| `0000fff3` | `0000fff4` | ELK-BTC, ELK-BTCW, ELK-BLEDOB, ELK-BLEDDM, ELK-BLEDOM, ELK-BLE, ELK-BULB, ELK-LAMPL, MELK-*, XSL-, LED LIGHT STRIP |
| `0000ffe1` | `0000ffe2` | LEDBLE |
| `0000ffe1` | `0000ffe1` | LED-, JACKYLED, XROCKER |
| `6e400002-b5a3-f393-e0a9-e50e24dcca9e` | `6e400003-…` | DMRRBA-007 (Nordic UART) |

## Divergências

| comando | LED Onion (apps) | elkbledom (hardware) |
|---|---|---|
| ELK power on | `7E 04 04 01 00 01 FF 00 EF` | `7E 04 04 F0 00 01 FF 00 EF` |
| ELK power off | `7E 04 04 00 00 00 FF 00 EF` | idêntico |
| ELK cor | `7E 07 05 03 r g b 10 EF` | `7E 07 05 03 r g b 0A EF` |
| ELK efeito | `7E 05 03 v 03 FF FF 00 EF` | `7E 07 03 v 03 FF FF 00 EF` |
| ELK brilho | `7E 04 01 i FF FF FF 00 EF` | `7E 04 01 i 01 FF 02 01 EF` |
| MELK power on | `7E 04 04 01 00 01 FF 00 EF` | `7E 00 04 01 00 00 00 00 EF` |
| MELK cor | `7E 07 05 03 r g b 10 EF` | `7E 00 05 03 r g b 00 EF` |
| MELK efeito | `7E 05 03 v 06 FF FF 00 EF` | **idêntico** |
| MELK velocidade | `7E 04 02 v FF FF FF 00 EF` | **idêntico** |
| MELK CCT | `7E 06 05 02 w c FF 08 EF` | **idêntico** |
| LEDBLE power on | `7E FF 04 01 00 FF FF 00 EF` | `7E 00 04 01 00 00 00 00 EF` |
| LEDBLE cor | `7E FF 05 03 r g b FF EF` | `7E 00 05 03 r g b 00 EF` |

Byte 1 parece ser campo de comprimento/tipo que boa parte dos controladores ignora —
mas claramente **não todos**, senão as duas fontes teriam convergido.

## Achados que os apps não mostraram

**Login MELK** — o elkbledom escreve isto *antes* de resolver características, em
aparelhos cujo nome começa com `melk` ou `modelx`:

```
7E 07 83
7E 04 04
```

Dois frames de 3 bytes, sem resposta. Não aparece no código do Magic Lantern.

**Consulta de estado** — não implementada aqui, mas existe:

```
ELK/MELK   7E 00 01 FA 00 00 00 00 EF
LEDBLE     7E 00 10
```

**Detecção por handle** — o elkbledom refina o modelo pelo *handle* da característica
(ex.: `handle=13` distingue uma variante de ELK-BLEDOM de outra com o mesmo nome).

## BLEDIM

**Não está nos 24 modelos do elkbledom.** Ninguém publicou o protocolo dele. Como ele
anuncia `FFF0`, os candidatos acima são o espaço de busca — daí a varredura na aba
Debug.
