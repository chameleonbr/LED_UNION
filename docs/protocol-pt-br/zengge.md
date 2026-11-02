# ZENGGE (LEDnetWF / ZGHB)

App: **ZENGGE** (`com.zengge.blev2`, Flutter). O transporte está no Java do app
(`com/zengge/hagallbjarkan/*`) e os construtores de payload clássicos em
`com/zengge/wifi/COMM/Protocol/*`. A tabela de produtos e o comando de cada produto vêm
do projeto aberto [lednetwf_ble](https://github.com/8none1/lednetwf_ble), que lê o json
de dispositivos do próprio fabricante. Ainda não testado em hardware.

## Descoberta e GATT

| o quê | valor |
|---|---|
| nomes | `LEDnetWF<mac>` |
| escrita | serviço `FFFF`, característica `FF01` |
| notificação | `FF02` |
| pareamento / criptografia | nenhum para controle |

O modelo só aparece no anúncio. Firmware mais novo põe o cabeçalho em service data sob
`FFFF` (16 ou 29 bytes: versão BLE em 3, produto em 10..11, versão do LED em 13). Firmware
mais antigo tem só o registro de fabricante, com company id em `0x5A00..0x5AFF` e
exatamente 27 bytes depois do id:

| offset | campo |
|---|---|
| 0 | status |
| 1 | versão BLE |
| 2..7 | MAC |
| 8..9 | id do produto, big-endian |
| 10 | firmware |
| 11 | versão do LED |
| 14..24 | estado (versão BLE ≥ 5) |

O Chrome só expõe dados de fabricante para ids listados em `optionalManufacturerData`.
Por isso, um aparelho adicionado antes deste driver precisa ser adicionado de novo.

## Cabeçalho de transporte

`00 seq 80 00 tam_hi tam_lo tam+1 cmdId payload` para versão BLE < 8, e
`01 seq 80 00 tam_hi tam_lo (tam+1)_hi (tam+1)_lo cmdId payload` a partir da 8. `seq`
começa em 1 por aparelho. `cmdId` é `0B` para comandos e `0A` quando se espera resposta.
Os payloads terminam com checksum de soma de 8 bits.

## Payloads

| função | bytes |
|---|---|
| energia, versão do LED ≥ 5 ou desconhecida | `3B 23/24 00 00 00 00 00 00 00 32 00 00 CS` (fade de 0,5 s) |
| energia, versão do LED < 5 | `71 23/24 0F CS` |
| RGB, produtos simples | `31 R G B 00 00 F0 0F CS`, com o brilho embutido no RGB |
| RGB, produtos symphony ou desconhecidos | `3B A1 hs_hi hs_lo V 00 00 00 00 00 00 00 CS`, hs = (matiz << 7) \| saturação |
| branco / CCT | `31 00 00 00 WW CW 0F 0F CS` |
| brilho, só dimmer | `3B 01 00 00 B 00 B 00 00 00 00 00 CS` |
| efeito, simples | `61 id velocidade 0F CS`, ids 37..56, velocidade 1 (rápido) .. 31 |
| efeito, symphony | `42 id velocidade% brilho% CS`, ids 1..100 |
| efeito, anel 0x53 | `38 id velocidade% brilho%` (sem checksum) |
| consulta de estado | `81 8A 8B 96` com cmdId `0A` |

Os bytes 7..9 da cor `3B` são um tempo de transição, não RGB: qualquer valor diferente de
zero faz o aparelho levar segundos ou horas para mudar de cor.

## Fora do escopo

Os produtos 8, 51, 60, 84 e 91 recebem efeitos por `0x38` com uma lista de ids que não
conseguimos confirmar, então ficam só com cor e liga/desliga. Também ficam de fora:
música e microfone, segmentos endereçáveis, aparelhos IOTBT e as variantes Wi-Fi, mesh e
Matter.
