// The words of the small shared components in components/ (AvatarPicker,
// ConfirmInline, EmojiPicker, LoadError) in English and Spanish. A component
// that takes its words as props keeps the caller's; these are its defaults.
// Every key exists in both languages (test/i18nAdminPages.test.js).
//
// Left as they are: each avatar's and background colour's name
// (data/avatars.js) and each emoji's name (utils/emoji.js), which are read
// out by screen readers and shown as tooltips.

export const COMPONENTS = {
  en: {
    'confirm.cancel': 'Cancel',

    'load.default': 'Could not load this. Check the connection and try again.',
    'load.retry': 'Try again',

    'avatar.title': 'Choose your picture',
    'avatar.close': 'Close',
    'avatar.preview': 'Preview',
    'avatar.style': 'Picture style',
    'avatar.tab.fluent': '3D animals',
    'avatar.tab.emoji': 'Emoji',
    'avatar.animals': '3D animals',
    'avatar.emoji': 'Emoji',
    'avatar.emoji_note': 'Emoji are drawn by each computer, so they look slightly different on a Mac and on Windows.',
    'avatar.background': 'Background',
    'avatar.background_colour': 'Background colour',
    'avatar.cancel': 'Cancel',
    'avatar.save': 'Save',
    'avatar.saving': 'Saving…',
    'avatar.save_failed': 'Could not save your picture',

    'emoji.add': 'Add an emoji',
    'emoji.panel': 'Emoji',
    'emoji.recent': 'Recently used',
    'emoji.all': 'Emoji',
    'emoji.limit': 'The reply is at its length limit.',
  },

  es: {
    'confirm.cancel': 'Cancelar',

    'load.default': 'No se pudo cargar. Revise la conexión e intente de nuevo.',
    'load.retry': 'Intentar de nuevo',

    'avatar.title': 'Elija su foto',
    'avatar.close': 'Cerrar',
    'avatar.preview': 'Vista previa',
    'avatar.style': 'Estilo de foto',
    'avatar.tab.fluent': 'Animales 3D',
    'avatar.tab.emoji': 'Emoji',
    'avatar.animals': 'Animales 3D',
    'avatar.emoji': 'Emoji',
    'avatar.emoji_note': 'Cada computadora dibuja los emoji a su manera, así que se ven un poco distintos en una Mac y en Windows.',
    'avatar.background': 'Fondo',
    'avatar.background_colour': 'Color de fondo',
    'avatar.cancel': 'Cancelar',
    'avatar.save': 'Guardar',
    'avatar.saving': 'Guardando…',
    'avatar.save_failed': 'No se pudo guardar su foto',

    'emoji.add': 'Agregar un emoji',
    'emoji.panel': 'Emoji',
    'emoji.recent': 'Usados recientemente',
    'emoji.all': 'Emoji',
    'emoji.limit': 'La respuesta llegó a su límite de caracteres.',
  },
}
