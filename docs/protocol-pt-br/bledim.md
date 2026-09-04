# BLEDIM — protocolo recuperado

`BLEDIM`, package `com.forwell.bledim`. Controlador/dimmer LED Bluetooth.

## Transporte

| item | valor |
|---|---|
| service | `0000fff0-0000-1000-8000-00805f9b34fb` |
| característica | **`0000fff1-0000-1000-8000-00805f9b34fb`** |

Anuncia o mesmo serviço `FFF0` da família ELK/MELK, mas **escreve em `FFF1`, não em
`FFF3`**, e o protocolo não tem nenhuma relação com o envelope `7E … EF` daquela
família. Tratar como driver próprio.

Detalhes de GATT que diferem de todas as outras famílias:

| item | valor |
|---|---|
| write type | **com resposta** (`setWriteType(1)`) |
| fragmentação | **20 bytes fixos**, obrigatória |
| intervalo | 30 ms por fragmento (15 ms com múltiplos GATTs) |
| notify | mesma característica `FFF1` |
| CCCD `0x2902` | o app **não** escreve; hardware real notifica sem isso |
| MTU | nunca negociado |

O app dispara os fragmentos sem esperar `onCharacteristicWrite` — o intervalo é o
único controle de fluxo que existe.

## Enquadramento

Pacote de **comprimento variável**, não os 9 bytes fixos das outras famílias:

```
55 AA <seq> <cmd> <lenHi> <lenLo> <payload…> <checksum>
 [0] [1]  [2]    [3]     [4]      [5]    [6 .. 6+len-1]   [6+len]
```

- `55 AA` — sync (`SYNC_HB = 85`, `SYNC_LB = 170`)
- `<seq>` — contador livre 0..255; o aparelho não valida
- **comprimento conta só o payload**, big-endian; quadro total = `len + 7`
- receptor: `packetSize = buf[4] * 256 + buf[5] + 7`

### Checksum

Soma aditiva simples — não XOR — de **todos os bytes antes dele**, sync e cabeçalho
inclusive:

```
sum = 0
for i in 0 .. len(frame)-2: sum += frame[i]
checksum = sum & 0xFF
```

## Payloads

| comando | len | payload |
|---|---|---|
| `0x80` power | 1 | `[0\|1]` — sem canal |
| `0x81` cor | 4 | `[W, R, G, B]` — **branco primeiro**, 0..255 |
| `0x88` vel/brilho | 6 | `[sceneNo, saveFlag, speed, brightness, strobe, 0]` |
| `0x86` canais | 1 | `[1..4]` — 1=DIM 2=CCT 3=RGB 4=RGBW |
| `0x82` efeito | 72 | estrutura de cena completa (abaixo) |
| `0x87` consulta | 1 | `[seletor]` |
| `0x8C` sensib. áudio | 1 | `[0..255]` |
| `0x8D` cor salva | 6 | `[0, R, G, B, 0, 0]` |

**Escalas são 0..255**, não 0..100 como nas outras famílias.

Em `0x88`: `sceneNo = 255` significa modo livre; `saveFlag = 1` confirma, `0` é
arrasto ao vivo. Velocidade e brilho viajam **no mesmo comando**, então mudar um
exige lembrar o outro. Padrões: speed 192, brightness 255, strobe 0.

### Estrutura de cena (72 bytes, comando `0x82`)

Quadro total = 72 + 7 = **79** (`SCENE_PACKET_SIZE`).

| offset | campo |
|---|---|
| 0 | fade (0/1) |
| 1 | speed |
| 2 | brightness |
| 3 | quantidade de cores (0..14) |
| 4 | número da cena |
| 6 | strobe |
| 11 | canal 4 = W |
| 12 | largura da cor |
| 13 | índice da cor |
| **14** | **id do efeito**: bits 0-6 = índice 0..12, bit 7 = modo chase |
| 16..71 | até 14 entradas de cor × 4 bytes `[W, R, G, B]` |

Byte 14 igual a `255` significa "sem efeito" — cena de cor estática. A UI rotula
`M1..M13` a partir do índice, e o app não tem nomes próprios para eles.

## Handshake / binding

`Encrypt.java` não faz criptografia: é uma tabela ASCII de 240 bytes e três funções
de consulta. O fluxo:

1. Ao conectar, o app envia `0x89` com `[segundos, milissegundos & 0xFF]` do relógio,
   e calcula localmente duas senhas a partir desses dois nonces.
2. O aparelho responde `0x92`. Na variante atual a verificação é
   `getCmdPass(rcv[2]) + password2 == rcv[13]*256 + rcv[14]` — onde `rcv[2]` é o
   número de pacote **do próprio aparelho**. É desafio/resposta real, com dois nonces.
3. Repete a cada tick até 10 tentativas, depois desconecta.

**Mas o portão é só do lado do cliente.** `mblRegisterd` é um booleano do app; nada
demonstra que o aparelho recuse comandos não autenticados. Um cliente limpo pode
enviar comandos direto. Mandamos o `0x89` mesmo assim: é o que faz o aparelho
reportar o estado dele de volta.

### Checagem de clone

`IsFake()` marca como falso o aparelho cujo nome seja `JDY-10` ou `Ble_Light` — nomes
de fábrica de módulos BLE-UART genéricos. Nomes legítimos: `BLEDIM` e `LanQianTech`.

## Comandos (`Protocol.java`)

| valor | constante |
|---|---|
| `0x80` | `CMD_ONOFF` |
| `0x81` | `CMD_SELECT_COLOR` |
| `0x82` | `CMD_SEND_IMMEDIATE_SCENE` |
| `0x83` | `CMD_SEND_SCHEDULE` / `CMD_CONTROLLER_SCHEDULE_INFO` |
| `0x84` | `CMD_SCHEDULE_ONOFF` |
| `0x85` | `CMD_SYNC_SYMTEM_TIME` |
| `0x86` | `CMD_SWITCH_CHANNELS` |
| `0x87` | `CMD_READ_CONTROLLER_INFO` |
| `0x88` | `CMD_UPDATE_SPEED_BRIGHTNESS` |
| `0x89` | `CMD_SEND_SERIAL_CODE` |
| `0x8A` | `CMD_SEND_AUDIO_BUF` |
| `0x8B` | `CMD_ENABLE_HW_AUDIO` |
| `0x8C` | `CMD_SET_AUDIO_SENSE` |
| `0x8D` | `CMD_SELECT_COLOR_SAVE` |
| `0x8E` | `CMD_UPDATE_CHASE_PARA` |
| `0x8F` | `CMD_SAVE_CHASE_RGB_SEC` |
| `0x90` | `CMD_CONTROLLER_ACK` |
| `0x91` | `CMD_CONTROLLER_SCENE_INFO` |
| `0x92` | `CMD_CONTROLLER_PASSWORD` |
| `0x93` | `CMD_CONTROLLER_TIME` |
| `0x94` | `CMD_CLOCK_UNEXIST` |

Outras constantes: `SCENE_PACKET_SIZE = 79`, `SCENE_PARA_SIZE = 72`,
`SCENE_PACKETS_BASE = 13`, `MAX_PROTOCOL_BUFSIZE = 1024`.

Existe senha e serial code (`mPassword`, `mPassword2`, `mblHaveReceivedPassword`,
`mblRegisterd`, `Encrypt.java`) — é o "binding" que os recursos sugeriam.

## Como o código foi recuperado

Análise estática é impossível: as quatro versões testadas estão empacotadas
(3.11 e 3.16 com 360 Jiagu, 3.13 com Bangcle/SecNeo, versionCode 41 de 2020 com
Jiagu). Nenhuma tem DEX em claro; o payload tem entropia 7,9–8,0.

O caminho que funcionou foi **dump de memória em Android containerizado**, tudo no
PC, sem aparelho nem root no celular:

```bash
# binderfs já vem no kernel do Arch (aparece em /proc/filesystems)
sudo mount -t binder binder /dev/binderfs

sudo docker run -itd --name redroid --privileged \
  -v "$PWD/redroid-data:/data" -p 5555:5555 \
  redroid/redroid:11.0.0-latest androidboot.redroid_gpu_mode=guest

adb connect 127.0.0.1:5555 && adb root
# --abi x86_64 é obrigatório: sem isso o packer extrai a .so errada e o app
# morre com UnsatisfiedLinkError (EM_X86_64 vs EM_AARCH64)
adb install --abi x86_64 -r BLEDIM_3.11_APKPure.apk
adb push frida-server /data/local/tmp/ && adb shell chmod 755 /data/local/tmp/frida-server
adb shell "nohup /data/local/tmp/frida-server >/dev/null 2>&1 &"
adb forward tcp:27042 tcp:27042
adb shell am start -n com.forwell.bledim/.Activity2

# o frida lista pelo rótulo do app ("BLEDIM"), não pelo package
frida-dexdump -H 127.0.0.1:27042 -p <pid>
```

Os DEX despejados saem com checksum e assinatura inválidos e o jadx os rejeita com
`No classes for decompile!`. Reparar antes:

```python
struct.pack_into('<I', d, 32, len(d))            # file_size
d[12:32] = hashlib.sha1(bytes(d[32:])).digest()  # signature
struct.pack_into('<I', d, 8, zlib.adler32(bytes(d[12:])) & 0xffffffff)
```

Resultado: 20 DEX, 553 classes Java, incluindo `Protocol.java`, `BlueToothLe.java`,
`BluetoothLeService.java` e `Encrypt.java`.

O `jiagu_unpacker` (SafaSafari) **não** serve para nenhuma destas versões: lê o
comprimento do shell nos últimos 4 bytes em big-endian e obtém lixo, e suas chaves
AES (`bajk3b4j3bvuoa3h` / `mers46ha35ga23hn`) não produzem DEX em nenhum offset.

## O que a UI do app original mostra

- Roda de cor RGB com 7 presets (R G B Y M C W).
- **13 efeitos embutidos + 2 slots DIY.**
- Sliders de brilho e de velocidade.
- Microfone e Music Player.
- Configurações: `1CH-DIMMING` / `2CH-CT` / `3CH-RGB` / `4CH-RGBW`.
- LED endereçável (chase) com contagem de pixels.
- Agrupamento próprio ("Group needs 2 or more devices").
