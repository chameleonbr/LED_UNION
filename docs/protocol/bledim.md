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

## Enquadramento

Pacote de **comprimento variável**, não os 9 bytes fixos das outras famílias:

```
55 AA <?> <cmd> <lenHi> <lenLo> <payload…> <tail>
```

- `55 AA` — sync (`SYNC_HB = 85`, `SYNC_LB = 170`)
- cabeçalho de **6 bytes** (`PROTOCOL_HEADER_SIZE`), cabeçalho + cauda = **7**
- comprimento em **big-endian**: o receptor calcula
  `packetSize = buf[4] * 256 + buf[5] + 7`
- há um byte de cauda (checksum) — ao contrário de todas as outras famílias, que
  não têm checksum nenhum

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
