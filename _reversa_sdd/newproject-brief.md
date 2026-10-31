# Brief inicial, /reversa-new

> Selo 🟡 PLANEJADO. Documento de entrada do time Code New Project Agents.

**Data:** 2026-10-31T18:02:59Z
**Usuário:** André Avila

## Ideia original
crie um plano de implementação dos aplicativos que pedi

Contexto: integrar ao LED Union (PWA Svelte 5 + Web Bluetooth) o suporte aos painéis de LED controlados pelos apps **iPixel Color** (com.wifiled.ipixels 3.8.1) e **CoolLED1248** (com.jtkj.led1248 2.7.9). Protocolos já analisados em `docs/protocol/ipixel.md` e `docs/protocol/coolled.md`.

## Achados de entrada
- iPixel: serviço `000000fa-…`, write `fa02`, nome contém `LED_BLE`; liga/desliga, brilho, rotação, relógio, pixel avulso, apagar tudo, slots; texto e imagem (PNG) em janelas com CRC32 + ACK; sem cor sólida nem lista de efeitos; tamanho do painel lido do aparelho. Dúvida: tamanho da janela (4096 vs 12288).
- CoolLED: serviço `fff0` / char `fff1`, quadro `01 | escape(LEN CMD DATA) | 03`; família pelo nome (CoolLED, X, S, A, M, U, UX, iLedClock…); tamanho e tipo de cor no manufacturer data; liga/desliga, brilho, velocidade, 8 modos; texto/imagem/animação em blocos de 128 B com ACK; cor só em UX/clock. Dúvida: formato para painéis mono e RGB completo.
- Sem teste em hardware ainda.

---
Gerado por /reversa-new em 2026-10-31T18:02:59Z
