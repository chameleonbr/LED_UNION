# Teste diferencial

*[Read in English](README.md)*

Os drivers em `src/lib/protocol/` foram transcritos **à mão** a partir do Java
decompilado dos apps originais. Testes escritos à mão não pegam erro de transcrição:
eles verificam o que eu entendi, não o que o app faz.

Este teste compara mecanicamente as duas coisas.

## Como funciona

1. **`extract_java_frames.py`** varre as árvores decompiladas e extrai todo frame BLE
   que o app monta, em três formas diferentes:
   - `new byte[]{…}` — literal (LED+LAMP)
   - `byte[] x = {…}` — inicializador nu (Lotus Lantern)
   - `buf[0] = 85; buf[1] = -86; …` — atribuição indexada (Magic Lantern, BLEDIM)

   Duas armadilhas que custaram caro e estão tratadas:
   - o jadx **re-aliasa o mesmo buffer** dentro de um método
     (`byte[] bArr = sendDatas2; … byte[] bArr2 = sendDatas2;`), espalhando um frame
     por vários nomes. Sem resolver aliases, todo frame sai truncado.
   - o jadx resolve inteiros comuns para constantes de bibliotecas sem relação
     (`WebSocketProtocol.PAYLOAD_SHORT` = 126 = `0x7E`). São artefatos do decompilador.

2. **`emit_ts_frames.ts`** roda nossos drivers com valores de sonda distintos
   (`R=0x11 G=0x22 B=0x33`, para que uma posição trocada salte aos olhos) e emite JSON.

3. **`compare.py`** casa cada frame nosso contra os literais da mesma família. Um
   literal casa se todas as posições que ele fixa em constante forem iguais às nossas;
   posições que ele preenche a partir de variável ficam livres.

   - **exato** — mesmo comprimento, todas as posições fixas conferem
   - **prefixo** — o app copia o payload em loop, então o literal só fixa o cabeçalho
     (só o frame de cena do BLEDIM cai aqui)
   - **sem correspondência** — não existe frame nenhum daquela forma no app original.
     Isso é erro nosso.

## Rodar

```bash
python3 tools/difftest/extract_java_frames.py targets.json > java.json
node tools/difftest/emit_ts_frames.ts > ts.json
python3 tools/difftest/compare.py java.json ts.json
```

`targets.json` é uma lista de `{"app": "...", "path": "..."}` apontando para as
árvores decompiladas (arquivo ou diretório).

## Resultado

**170 de 170 frames casam** com os apps originais, em três drivers e nove layouts.
Um casa só por prefixo (a cena de 72 bytes do BLEDIM, cujo payload é copiado em loop).

### O que isso pegou

**Cinco bugs**, todos invisíveis para teste escrito à mão — porque meus testes
afirmavam exatamente o que eu tinha entendido errado.

O `iSceneNo` da estrutura de cena do BLEDIM (offset 4). Eu tinha posto `0xFF`,
confundindo com o campo de cena do comando `0x88` — que aí sim usa 255. Os quatro
buffers que o app constrói (`FlushEmptyBuf`, `FlushStaticBuf`, `FlushChaseColor`,
`FlushChaseAuto`) zeram esse offset. Corrigido, com teste de regressão em
`frames.test.ts`.

**2. Power do LEDCAR-01.** Eu o agrupei com o LEDDMX porque ambos usam o envelope
`7B FF`. Mas o `turnOn` do app ramifica pelo **nome antes do envelope**:

```
LEDBLE / LEDCAR-00   7E FF 04 01 00 FF FF 00 EF
LEDCAR-01            7B FF 04 01 FF FF FF FF BF   ← próprio
LEDCAR-02            7B 04 01 FF FF FF FF FF BF
LEDDMX               7B 04 04 01 FF FF FF FF BF
```

**3. Dim do LEDDMX-02 / LEDCAR-02.** Eu tinha inventado usar o slot branco do frame
RGB (`7B 07 00 00 00 <w> …`). O app tem opcode dedicado: `7B 09 <v> FF FF FF FF FF BF`.

**4. Estado de velocidade/brilho do BLEDIM era global do módulo.** Esses dois valores
viajam no mesmo comando, então mudar um exige reenviar o outro — e eu guardava a
memória num único objeto de módulo. Com dois controladores BLEDIM, ajustar o brilho
de um empurraria esse brilho para o outro. Agora é por aparelho.

Esse apareceu porque o teste de fixture falhou: testes anteriores tinham mutado o
estado global, e a cena saiu com velocidade 0. O sintoma era "teste frágil"; a causa
era um bug de verdade.

**5. `iSceneNo`** — ver acima.

## Parte dinâmica

O payload de cena de 72 bytes do BLEDIM é copiado em loop, então o extrator estático
só consegue fixar o cabeçalho. `bledim_scene.js` fecha essa lacuna: roda dentro do
app, chama o `ScenePara.EnPackToDb()` **dele mesmo** e imprime o buffer resultante.

```bash
frida -H 127.0.0.1:27042 -p <pid> -l tools/difftest/bledim_scene.js
```

Os vetores capturados estão em `src/lib/protocol/__fixtures__/bledim_scene.json` e
são verificados em `frames.test.ts`. Confirmaram:

- offsets 0–15 do nosso frame batem byte a byte
- `[1]=0xC0` velocidade e `[2]=0xFF` brilho são mesmo os padrões
- `[14]` carrega o efeito, com `0xFF` como sentinela de "sem efeito"
- a tabela de cores vem **pré-preenchida com uma paleta**, não zerada — mas com
  `bClrQty=1` só a entrada 0 é lida, então o resto é inerte

## Os 289 literais que não emitimos

Não são lacunas — são, quase todos, fora do escopo deste app por decisão:

| categoria | exemplos |
|---|---|
| agendamento | `sendTime`, `endTime`, `closeTime`, `timeSun`, `setSmartTimer*` |
| configuração de hardware | `setSPIModel`, `setConfigSPI`, contagem de pixels, direção, ordem de pinos |
| específico de carro | `setCar02SetWelcomeMode`, `TurnMode`, `BrakeMode`, `Motor*` |
| áudio e música | `sendAudioBuf`, `enableHwAudio`, `setSensitivity`, `setMusicMicroMode` |
| grafite / pixel art | `setCar02Graffiti`, `setDmx0204Graffiti` (envelope `7C`) |
| listas DIY de cor | `setDiy`, `setCustomCycle`, `setChangeColor`, `setCollectMode` |
| grupos do LEDPHO | `setPhoAddGroup`, `setPhoDelectGroup`, `setPhoResetGroup` |
| variantes por canal | `7B FF 04 <03\|05\|07>` — power por canal, 43 formas |

**Uma categoria vale implementar**: a **consulta de estado**
(`readControllerInfo` `0x87`, `setCheck` `72 12`, `setSmartCheck` `7D 01 05`,
`setPasswordFeedback` `2A 05`). Hoje a UI presume o estado; com isso ela leria o
aparelho de verdade — ligado/desligado, cor atual, cena, contagem de canais.

## Limite

Isto valida **transcrição**, não comportamento. Prova que emitimos os bytes que o app
emite; não prova que o aparelho aceita, nem que a sequência ou o timing estão certos.
Isso só hardware responde.
