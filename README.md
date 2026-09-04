# LED Onion

Controle centralizado de fitas e controladores LED Bluetooth, em um PWA.

Os apps originais (Magic Lantern, Lotus Lantern, LED+LAMP, BLEDIM) controlam um
aparelho por vez, cada um fala só com a sua família, e nenhum recebe atualização.
Aqui dá para selecionar **um, vários, todos ou um grupo** e aplicar cor, brilho,
efeito ou cena de uma vez só.

## Estado

| família | serviço / característica | status |
|---|---|---|
| MELK-* (Magic Lantern) | `FFF0` / `FFF3` | ✅ implementado |
| ELK- / XSL- / CLK- (Lotus Lantern) | `FFF0` / `FFF3` | ✅ implementado |
| LEDBLE / LEDSTAGE / LEDLIGHT | `FFE0` / `FFE1` | ✅ **validado em hardware** |
| LEDDMX-00/01/03, LEDCAR-01 | `FFE0` / `FFE1` | ✅ implementado (`7B FF … BF`) |
| LEDDMX-02/04, LEDCAR-02 | `FFE0` / `FFE1` | ✅ implementado (`7B … BF`, deslocado) |
| LEDSMART | `FFE0` / `FFE1` | ✅ implementado (`7D … DF`) |
| LEDSUN | `FFE0` / `FFE1` | ✅ implementado (`7A … AF`, só branco/CCT) |
| LEDLIKE | `FFE0` / `FFE1` | ✅ implementado (`70 … 0F`, só branco/CCT) |
| LEDPHO | `FFE0` / `FFE1` | ✅ implementado (`72 … 2F`, com endereço de grupo) |
| BLEDIM / LanQianTech | `FFF0` / **`FFF1`** | ✅ implementado (`55 AA`, tam. variável) |

O driver `ffe0` está **confirmado em hardware**: conexão, handshake `2A` e comando de
cor funcionam num LEDBLE-00 real. As demais famílias continuam derivadas da
decompilação e batem byte a byte com `docs/protocol/`, mas ainda sem confirmação
no aparelho.

**Em aberto:** o controlador testado tem várias saídas físicas (fita, maçaneta,
soleira) e o frame de cor padrão só atinge uma delas. Ver a seção de canais em
`docs/protocol/ledble.md`.

## Rodando no celular

Web Bluetooth exige contexto seguro. Em desenvolvimento, `localhost` conta — então
o túnel do adb resolve sem HTTPS nem certificado:

```bash
npm install
npm run dev
adb reverse tcp:5173 tcp:5173
```

Abra `http://localhost:5173` no Chrome do Android. Em produção, sirva o `dist/`
por HTTPS em qualquer domínio.

iOS não suporta Web Bluetooth.

## Comandos

```bash
npm run dev          # servidor de desenvolvimento
npm run build        # gera dist/ com service worker e manifest
npm test             # testes de frame e de fila de escrita
npm run check        # svelte-check + tsc
npm run gen:effects  # regenera src/lib/protocol/effects.ts a partir de docs/protocol/*.tsv
```

## Estrutura

```
src/lib/protocol/    builders de frame puros, um módulo por família
src/lib/queue.ts     fila serial por aparelho, com coalescing
src/lib/ble.svelte.ts  conexões GATT e aplicação em grupo
src/lib/ui/          telas
docs/protocol/       specs de wire + tabelas de efeito (.tsv)
tools/gen-effects.py gerador das tabelas
```

Adicionar uma família nova = um arquivo em `src/lib/protocol/` que implementa
`Driver`, mais uma linha no registry. Os builders são funções puras, então cada um
ganha um teste que compara os bytes com o que está documentado.

## Protocolo

Ver `docs/protocol/`. Resumo do que é fácil errar:

- Brilho, velocidade, branco e CCT são **0–100**. RGB é 0–255.
- A família `FFE0` **exige handshake** (`2A 02 …`) logo após conectar, senão ignora
  todo comando.
- Nenhuma família usa checksum. Todo frame tem 9 bytes.
- Os controladores engasgam com escritas concorrentes; há uma fila por aparelho com
  gap mínimo (50 ms para `FFE0`, 5 ms para `FFF0`).

## Licença

MIT. Interoperabilidade com protocolo próprio — o repositório contém apenas fatos de
protocolo derivados de observação, nenhum código ou asset dos apps originais.
