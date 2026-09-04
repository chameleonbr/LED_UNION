# BLEDIM — protocolo DESCONHECIDO

`BLEDIM 3.16`, package `com.forwell.bledim`.

## Status

**Nada do protocolo é conhecido.** Nem o UUID do serviço, nem o da característica,
nem o formato dos frames.

O APK está empacotado com **360 Jiagu**. O `classes.dex` contém apenas o stub
(`com.stub.StubApp`, `com.tianyu.util.DtcLoader`) — jadx produz 5 arquivos, zero
lógica. O código real está cifrado em `assets/libjiagu*.so` e só é decifrado em
memória, em runtime.

Varredura do APK inteiro (todos os arquivos, não só o dex) por padrão de UUID:
**zero ocorrências**. Nenhuma pista sobrou fora do dex cifrado.

## O que os recursos revelam

Os recursos não são empacotados, então isso é sólido:

- `bluetooth_dimmer` = **"Bluetooth Dimmer"** — é um controlador de dimmer, não fita RGB.
- `szChannel` = `1CH-DIMMING`, `2CH-CT`, `3CH-RGB`, `4CH-RGBW` — o aparelho reporta em
  qual modo de canal opera, e o app se adapta.
- `can_not_switch_channel` = "The dimming mode can not be changed for this model" —
  existem variantes de hardware com modo de canal fixo.
- `activity_chase.xml`, `activity_chasepara.xml`, `pixel_amount`, `pixels` — suporta
  **LED endereçável** (chase / pixel), com contagem de pixels configurável.
- `group_more_than_one_device` = "Group needs 2 or more devices" — o app já tem
  agrupamento próprio.
- `clock_unexist` = "Schedule is not supported by current model" — agendamento, opcional
  por modelo.
- `now_binding` / `fake` = "Warnning, the device is a fake!" — existe um passo de
  **binding** e alguma checagem de autenticidade. Isso sugere handshake obrigatório.
- Activities: `BlueTooth`, `Devices`, `Color`, `Music`, `Sound`, `Chase`, `ChasePara`,
  `AudioSense`, `BleOnline`, `Schedule`.

O "binding" + anti-clone é o ponto de risco: pode haver um desafio/resposta na conexão,
não só um frame de senha fixo.

## Como descobrir

Em ordem de custo:

1. **Enumerar GATT ao vivo** — nRF Connect (ou similar) no celular, conectar num
   aparelho e listar serviços e características. Dá os UUIDs em ~2 minutos. Não dá
   os frames.
2. **Captura HCI snoop** — ativar "Bluetooth HCI snoop log" nas opções do
   desenvolvedor, usar o BLEDIM numa sequência roteirizada, extrair com
   `adb bugreport` (não precisa root). Dá UUIDs **e** frames **e** o handshake de
   binding. É o caminho que resolve.
3. **`frida-dexdump`** em aparelho ou emulador rooteado — o Jiagu decifra o dex em
   memória no `DexClassLoader`; o dump entrega o código-fonte inteiro. Mais setup,
   mas é o único jeito de recuperar a tabela de efeitos completa se ela não estiver
   nos recursos.

O passo 1 é barato e vale fazer antes de qualquer coisa: se o serviço for `FFF0` ou
`FFE0`, um dos drivers existentes pode já falar com o aparelho.
