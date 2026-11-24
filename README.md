# Protótipo: térmica no USB do totem (WebUSB)

O totem (Chrome em tela cheia) imprime direto na térmica ligada no USB dele, sem
passar pelo mini PC:

```
Tablets ──Wi-Fi──► mini PC (layout 1, Python) ──► térmicas do estande
Totem ──USB──► térmica do totem (layouts 1 e 2, gerados no próprio Chrome)
```

Não é módulo Odoo nem depende do Odoo. É uma página estática para validar o
caminho antes de levar o código para o app do totem.

| Arquivo | O quê |
|---|---|
| `src/escpos.js` | Gera os mesmos bytes que o python-escpos (texto em PC850, negrito, faixa invertida, QR como imagem, raster `GS v 0`, corte) |
| `src/coupon_layout.js`, `src/text.js` | Layout 1: port de `print_server/layout.py` e `text_utils.py` |
| `src/raster.js` | Imagem para 1 bit (limiar ou pontilhado), para o logo e o layout 2 |
| `src/preview.js` | Prévia na tela (port de `print_server/preview.py`) |
| `src/webusb.js` | Conexão USB: escolher, reconectar sozinho, enviar em fila, status do papel |
| `vendor/qrcode.js` | qrcode-generator 1.4.4 (MIT), com a escolha de máscara do python-qrcode |

## Layout 1 em dois lugares

O layout do cupom existe em Python (mini PC) e em JS (totem). Os testes geram
os mesmos cupons nos dois lados e comparam **byte a byte**:

```bash
node --test tests/                     # JS contra os fixtures
# depois de mudar o layout no Python, regenere os fixtures:
../smarts_hub_totem_campaign_print_server/.venv/bin/python tests/make_fixtures.py
```

Os casos ficam em `tests/cases.json`: completo, uma via, layout da campanha
(blocos ligados/desligados), textos difíceis (acentos, emoji, palavra maior
que a linha) e mínimo. Mudou o layout de um lado: mude o outro até os testes
passarem.

## Rodar

WebUSB só existe em **contexto seguro**: HTTPS ou `http://localhost`.

```bash
python3 -m http.server 8000 --bind 127.0.0.1    # nesta pasta
```

### No computador (Chrome/Chromium no Linux), térmica no USB do PC

1. Abra `http://localhost:8000` e toque em **Conectar impressora**.
2. Se der erro de acesso ou "Unable to claim interface":
   - permissão: `/etc/udev/rules.d/99-webusb-termica.rules` com
     `SUBSYSTEM=="usb", ATTR{idVendor}=="04b8", MODE="0666"` (o vendor do
     `lsusb`), e `sudo udevadm control --reload-rules`; religue a impressora;
   - driver do kernel segurando a impressora: `sudo rmmod usblp` (volta no
     próximo boot; no Android isso não acontece).

### No totem (Android), térmica no USB OTG do totem

O USB do totem fica com a impressora, então o computador entra pela rede. Duas
opções:

- **adb pelo Wi-Fi** (Android 11+, Opções do desenvolvedor > Depuração por
  Wi-Fi): `adb pair …`, `adb connect …` e `adb reverse tcp:8000 tcp:8000`. No
  Chrome do totem, abra `http://localhost:8000`.
- **Sem adb**: no Chrome do totem, `chrome://flags/#unsafely-treat-insecure-origin-as-secure`,
  adicione `http://IP-DO-PC:8000`, reinicie o Chrome e abra esse endereço. Suba
  o servidor com `--bind 0.0.0.0`. Só para teste: desfaça a flag depois.

Na primeira vez o Chrome pergunta qual aparelho usar (e o Android pode pedir
permissão de USB). Depois disso a página reconecta sozinha ao abrir e quando a
impressora é religada.

## O que testar

- [ ] **Ambiente**: os dois itens verdes no Chrome do totem.
- [ ] **Teste rápido**: acentos, negrito, faixa invertida, QR e corte parcial.
- [ ] **Cupom**: as duas vias iguais às do mini PC. Para comparar, imprima também
      `tests/fixtures/completo.bin` em **Bytes prontos**, que é exatamente o que o
      mini PC manda.
- [ ] **Status do papel**: algumas térmicas não respondem pelo USB. Anote o modelo.
- [ ] **Imagem**: um print do certificado (`/totem/t/<código>?print=1`).
      Ajuste o contraste e veja se o mapa fica legível em preto e branco.
- [ ] **Robustez**: desligue e religue a impressora, ou tire e recoloque o cabo,
      e imprima de novo sem recarregar a página. Deixe a tela parada por um
      tempo e confira se ela ainda imprime (economia de energia do USB no Android).
- [ ] **Permissão**: feche e reabra o Chrome e confira se a página reconecta sem
      perguntar.

## Para levar ao app do totem

- **Layout 2 de verdade**: no totem, o certificado (`PrintCard` do mobility) já
  está na mesma origem. Ele precisa virar imagem: o canvas do MapLibre (já com
  `preserveDrawingBuffer` no modo de impressão) e os marcadores e textos em
  HTML desenhados por cima num canvas de 576 pontos, e depois `toBitmap` e
  `imageBytes`. Aqui o teste é com um print da tela.
- `src/` entra como módulos do bundle do tablet (`@odoo-module`). O
  `print_service.js` passa a escolher o destino: mini PC (tablets) ou USB (totem).
- A fila de reimpressão e o resultado no cadastro continuam como hoje. Uma falha
  no envio pela USB conta como "não impresso", e o cupom não é reenviado sozinho,
  porque sairia duplicado.
