# Protocolo MELK / ELK (Magic Lantern, Lotus Lantern)

Derivado de `Magic Lantern 6.11.06` e `Lotus Lantern 6.5.08` (`com.easylink.colorful`).

## Transporte

| item | valor |
|---|---|
| service | `0000fff0-0000-1000-8000-00805f9b34fb` |
| write char | `0000fff3-0000-1000-8000-00805f9b34fb` |
| tamanho do frame | **9 bytes**, `7E … EF` |
| checksum | **não existe** |
| write type | não definido pelo app → write-without-response na prática |
| handshake | **nenhum** |
| notify | não usado |

Magic Lantern dorme 5 ms entre writes e tem um flush de fundo a cada 100 ms.
Lotus Lantern não tem throttle nenhum. Máximo de 4 GATTs simultâneos no app original
(LRU) — limite do app, não do protocolo.

## Frames (comuns às duas gerações)

```
power on          7e 04 04 01 00 01 ff 00 ef
power off         7e 04 04 00 00 00 ff 00 ef
brilho   0..100   7e 04 01 <bri> <lightmode> ff ff 00 ef
rgb      0..255   7e 07 05 03 <r> <g> <b> 10 ef
cct      0..100   7e 06 05 02 <warm> <cold> ff 08 ef
branco   0..100   7e 05 05 01 <w> ff ff 08 ef
velocidade 0..100 7e 04 02 <speed> ff ff ff 00 ef
mic on/off        7e 04 07 <on> ff ff ff 00 ef
mic sensib.       7e 04 06 <sens> ff ff ff 00 ef
ordem dos pinos   7e 06 81 <p0> <p1> <p2> ff 00 ef
```

`<lightmode>` = seletor de canal: `ALL=0, RGB=1, W=2, CT=3`, `255` = não especificado.
Brilho, velocidade, branco e CCT são **0..100**. RGB é **0..255**.

## Divergência entre gerações — só o comando de efeito

| geração | frame de efeito | tabela |
|---|---|---|
| **MELK-*** (Magic Lantern) | `7e 05 03 <id> 06 ff ff 00 ef` | `melk_effects.tsv`, 213 efeitos em 8 grupos |
| **MELK-*** cenas | `7e 05 31 <id 1..28> 07 ff ff 01 ef` | `melk_effects.tsv`, grupo `Scenes` |
| **ELK-/XSL-/CLK-** (Lotus) | `7e 05 03 <0x80+idx> 03 ff ff 00 ef` | `elk_effects.tsv`, 29 efeitos `0x80..0x9C` |

`0x80..0x9C` é o conjunto canônico do BLEDOM. Lotus não tem comando de cena.

Exclusivos do Magic Lantern: cena (`0x31`), contagem de pixels (`7e 07 21 …`),
relógio do dispositivo (`7e 07 83 …`).
Exclusivos do Lotus: laser (`7e 05 03 <m> 08 …`, `7e 05 05 01 <v> ff ff 10 ef`),
countdown (`7e 07 76 …`).

## Ramificações por nome anunciado

**Magic Lantern: nenhuma diferença de wire.** O nome só liga/desliga recursos da UI:

| checagem | efeito |
|---|---|
| `MELK-OC`, `MELK-OT` | mostra aba de cenas |
| regex `^MELK-.+CT.*` | slider de CCT → manda `7e 06 05 02` em vez de RGB |
| regex `^MELK-.+W.*` | slider de branco → manda `7e 05 05 01` |
| `MELK-OE`, `MELK-OB`, `MELK-TX` | esconde recursos de microfone |

**Lotus Lantern: duas ramificações reais de wire.**

1. **Criptografia.** `isEncryptedDevice(name)` é `name.contains("ELK-*")` — **asterisco
   literal**, não wildcard (`BluetoothLEService.java:1188`). Quando casa **e** o opcode
   (byte 2) é `01` (brilho), `03` (modo) ou `04` (power), o frame vira 21 bytes cifrados
   com `bArr[0]=0xAA`, `bArr[8]=0x55`. Cor, CCT, ordem de pino e timers sempre vão em
   texto claro. **Caminho raro — implementar só se algum aparelho recusar comandos.**
2. **`INTRO`** no nome: byte 3 do power vira `0xFF` em vez de `0x01`.

Prefixos reconhecidos pelo Lotus: `ELK-`, `ELK~`, `XSL-`, `CLK-`, `ELK_`.

### Cifra do Lotus (só para `ELK-*`)

`com/szelk/ledlamppro/ble/EncryptionDecryptionKt.java`. XOR keystream, 12 bytes
aleatórios `R` por frame:

```
presetKey = 2a 7f c1 94 33 de 45 e0 8b 11 5c a6 09 f2 7d b8

ks[i]     = ((R[i]*27) & 0xff) ^ ((R[(i+3)%12]+55) & 0xff) ^ (R[(i+7)%12] >> 2) ^ ((i*85) & 0xff)   , i=0..8
ct[0..8]  = plain9[i] ^ ks[i]
ct[9..20] = R[i] ^ presetKey[i % 16]
```

Total 21 bytes, escritos como um único valor GATT.

## Mesh por advertising (Lotus) — ignorável

Lotus também transmite comandos como manufacturer data (ID `0xBEE8`, 25 bytes) com
heartbeat. É um caminho paralelo de mesh. Controle direto por GATT não precisa disso.

## Tabelas de efeito

| arquivo | linhas | formato |
|---|---|---|
| `melk_effects.tsv` | 241 | `id \t grupo \t nome` — grupo `Scenes` usa opcode `0x31` |
| `elk_effects.tsv` | 29 | `id \t nome` — ids `0x80..0x9C` (128..156) |

## BLEDIM

**Não pertence a esta família.** Ver `bledim.md`. A suposição inicial de que BLEDIM era
ELK-BLEDOM estava errada — o app é um controlador de dimmer, outra linha de produto.
