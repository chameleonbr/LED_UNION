# Teste diferencial

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

O `iSceneNo` da estrutura de cena do BLEDIM (offset 4). Eu tinha posto `0xFF`,
confundindo com o campo de cena do comando `0x88` — que aí sim usa 255. Os quatro
buffers que o app constrói (`FlushEmptyBuf`, `FlushStaticBuf`, `FlushChaseColor`,
`FlushChaseAuto`) zeram esse offset. Corrigido, com teste de regressão em
`frames.test.ts`.

Erro invisível para teste escrito à mão, porque meu teste afirmava exatamente o que
eu tinha entendido errado.

## Limite

Isto valida **transcrição**, não comportamento. Prova que emitimos os bytes que o app
emite; não prova que o aparelho aceita, nem que a sequência ou o timing estão certos.
Isso só hardware responde.
