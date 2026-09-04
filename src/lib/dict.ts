/**
 * Translations. English is the source; anything missing falls back to it, so a new
 * key never surfaces as a raw identifier in the UI.
 *
 * No library: two languages and a few dozen strings would not repay a dependency.
 */
export type Dict = Record<string, string>

export const en: Dict = {
  'app.selected': '{n} selected',
  'app.online': '{n} online',
  'nav.devices': 'Devices',
  'nav.effects': 'Effects',
  'nav.scenes': 'Scenes',
  'nav.debug': 'Debug',

  'devices.add': '+ Add device',
  'devices.connectAll': 'Connect all',
  'devices.selectAll': 'Select all',
  'devices.clearSelection': 'Clear selection',
  'devices.empty': 'No devices yet. Power the strips on and tap Add device.',
  'devices.connect': 'Connect',
  'devices.disconnect': 'Disconnect',
  'devices.output': 'Output {n}',
  'devices.renameHint': 'e.g. Car · strip + door handle',
  'devices.groups': 'Groups',
  'devices.groupName': 'Group name',
  'devices.saveSelection': 'Save selection',
  'devices.select': 'Select',
  'devices.count': '{n} devices',

  'effects.empty': 'No devices yet. Add one in the Devices tab.',
  'effects.everything': 'Everything',
  'effects.everythingHint': 'Colour and brightness for every device at once.',
  'effects.power': 'Power',
  'effects.on': 'On',
  'effects.off': 'Off',
  'effects.color': 'Colour',
  'effects.effect': 'Effect',
  'effects.none': 'None',
  'effects.brightness': 'Brightness',
  'effects.speed': 'Speed',
  'effects.white': 'White',
  'effects.whiteRgb': 'r = g = b',
  'effects.cct': 'Colour temperature',
  'effects.myEffects': 'My effects',
  'effects.builtIn': 'Built-in',
  'effects.newEffect': '+ New effect…',
  'effects.saveScene': 'Save as scene',
  'effects.sceneName': 'Scene name',
  'effects.pickToSave': 'Tick the devices you want in the scene.',

  'bledim.channels': 'Channel mode',
  'bledim.channelsHint':
    'How the controller is wired. There is no white channel in 3CH RGB mode, so the white control only appears on the others.',

  'strip.title': 'Addressable strip',
  'strip.pixels': 'Pixels',
  'strip.order': 'Channel order',
  'strip.apply': 'Apply configuration',
  'strip.forward': 'Normal direction',
  'strip.reverse': 'Reverse',
  'strip.saved': 'Sent and saved',

  'sound.title': 'React to sound',
  'sound.mic': 'Microphone',
  'sound.music': 'Music',
  'sound.on': 'Enable microphone',
  'sound.off': 'Disable',
  'sound.sensitivity': 'Sensitivity',
  'sound.mode': 'Mode',
  'sound.note':
    "The microphone is the controller's own. Switching to Music changes the mode on the device, but streaming the phone's audio is not implemented.",

  'scenes.empty': 'Nothing saved yet. Set your lights up in Effects and save from there.',
  'scenes.apply': 'Apply',
  'scenes.count': '{n} devices',

  'custom.title': 'Custom effect',
  'custom.name': 'Effect name',
  'custom.addColor': '+ Add colour',
  'custom.fade': 'Fade',
  'custom.jump': 'Jump',
  'custom.hint':
    'Black counts as a colour, so green → black → amber gives you a strobe.',
  'custom.unsupported': 'This controller has no custom-effect command.',

  'color.new': 'New colour…',
  'color.name': 'Colour name',
  'color.restore': 'Restore default palette',
  'color.red': 'Red',
  'color.orange': 'Orange',
  'color.yellow': 'Yellow',
  'color.green': 'Green',
  'color.cyan': 'Cyan',
  'color.blue': 'Blue',
  'color.purple': 'Purple',
  'color.white': 'White',

  'common.save': 'Save',
  'common.cancel': 'Cancel',
  'common.remove': 'Remove',
  'common.unsupported': 'Web Bluetooth is not available.',
  'common.unsupportedHint':
    'Use Chrome or Edge. On Android the site must be on HTTPS or localhost. iOS does not support Web Bluetooth.',
}

export const ptBR: Dict = {
  'app.selected': '{n} selecionado(s)',
  'app.online': '{n} online',
  'nav.devices': 'Aparelhos',
  'nav.effects': 'Efeitos',
  'nav.scenes': 'Cenas',
  'nav.debug': 'Debug',

  'devices.add': '+ Adicionar aparelho',
  'devices.connectAll': 'Conectar todos',
  'devices.selectAll': 'Selecionar todos',
  'devices.clearSelection': 'Limpar seleção',
  'devices.empty': 'Nenhum aparelho ainda. Ligue as fitas e toque em Adicionar aparelho.',
  'devices.connect': 'Conectar',
  'devices.disconnect': 'Desconectar',
  'devices.output': 'Saída {n}',
  'devices.renameHint': 'Ex: Carro · fita + maçaneta',
  'devices.groups': 'Grupos',
  'devices.groupName': 'Nome do grupo',
  'devices.saveSelection': 'Salvar seleção',
  'devices.select': 'Selecionar',
  'devices.count': '{n} aparelhos',

  'effects.empty': 'Nenhum aparelho ainda. Adicione um na aba Aparelhos.',
  'effects.everything': 'Todos',
  'effects.everythingHint': 'Cor e brilho para todos os aparelhos de uma vez.',
  'effects.power': 'Ligar',
  'effects.on': 'Ligar',
  'effects.off': 'Desligar',
  'effects.color': 'Cor',
  'effects.effect': 'Efeito',
  'effects.none': 'Nenhum',
  'effects.brightness': 'Brilho',
  'effects.speed': 'Velocidade',
  'effects.white': 'Branco',
  'effects.whiteRgb': 'r = g = b',
  'effects.cct': 'Temperatura de cor',
  'effects.myEffects': 'Meus efeitos',
  'effects.builtIn': 'Embutidos',
  'effects.newEffect': '+ Novo efeito…',
  'effects.saveScene': 'Salvar como cena',
  'effects.sceneName': 'Nome da cena',
  'effects.pickToSave': 'Marque os aparelhos que devem entrar na cena.',

  'bledim.channels': 'Modo de canal',
  'bledim.channelsHint':
    'Como a controladora está ligada. No modo 3CH RGB não existe canal branco, então o controle de branco só aparece nos outros.',

  'strip.title': 'Fita endereçável',
  'strip.pixels': 'Pixels',
  'strip.order': 'Ordem dos canais',
  'strip.apply': 'Aplicar configuração',
  'strip.forward': 'Sentido normal',
  'strip.reverse': 'Inverter',
  'strip.saved': 'Enviado e salvo',

  'sound.title': 'Reagir ao som',
  'sound.mic': 'Microfone',
  'sound.music': 'Música',
  'sound.on': 'Ligar microfone',
  'sound.off': 'Desligar',
  'sound.sensitivity': 'Sensibilidade',
  'sound.mode': 'Modo',
  'sound.note':
    'O microfone é o do próprio controlador. Mudar para Música troca o modo no aparelho, mas transmitir o áudio do celular não está implementado.',

  'scenes.empty': 'Nada salvo ainda. Ajuste as luzes em Efeitos e salve de lá.',
  'scenes.apply': 'Aplicar',
  'scenes.count': '{n} aparelhos',

  'custom.title': 'Efeito customizado',
  'custom.name': 'Nome do efeito',
  'custom.addColor': '+ Adicionar cor',
  'custom.fade': 'Desvanecer',
  'custom.jump': 'Pular',
  'custom.hint': 'Preto conta como cor, então verde → preto → âmbar vira um strobe.',
  'custom.unsupported': 'Esta controladora não tem comando de efeito customizado.',

  'color.new': 'Nova cor…',
  'color.name': 'Nome da cor',
  'color.restore': 'Restaurar paleta padrão',
  'color.red': 'Vermelho',
  'color.orange': 'Laranja',
  'color.yellow': 'Amarelo',
  'color.green': 'Verde',
  'color.cyan': 'Ciano',
  'color.blue': 'Azul',
  'color.purple': 'Roxo',
  'color.white': 'Branco',

  'common.save': 'Salvar',
  'common.cancel': 'Cancelar',
  'common.remove': 'Remover',
  'common.unsupported': 'Web Bluetooth não disponível.',
  'common.unsupportedHint':
    'Use Chrome ou Edge. No Android o site precisa estar em HTTPS ou localhost. iOS não suporta Web Bluetooth.',
}

export const dicts: Record<string, Dict> = { en, 'pt-BR': ptBR }

export const DEFAULT_LOCALE = 'en'

/** Map a browser tag onto a locale we ship: `pt`, `pt-PT` and `pt-BR` all mean pt-BR. */
export function resolveLocale(tag: string | undefined): string {
  if (!tag) return DEFAULT_LOCALE
  if (dicts[tag]) return tag
  const base = tag.split('-')[0].toLowerCase()
  const match = Object.keys(dicts).find((l) => l.split('-')[0].toLowerCase() === base)
  return match ?? DEFAULT_LOCALE
}

/** Look up a key, falling back to English, then to the key itself as a last resort. */
export function translate(
  locale: string,
  key: string,
  params?: Record<string, string | number>,
): string {
  const text = dicts[locale]?.[key] ?? en[key] ?? key
  if (!params) return text
  return text.replace(/\{(\w+)\}/g, (m, name) =>
    name in params ? String(params[name]) : m,
  )
}
