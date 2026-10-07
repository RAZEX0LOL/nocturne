/**
 * На какой системе открыто окно. Определяется сразу, до первого кадра: от этого зависят шрифт,
 * значки и вид элементов, и перерисовывать интерфейс после запуска нельзя — будет мигать.
 * WebView2 на Windows честно пишет «Windows» в User-Agent, WebKit на Mac — «Macintosh».
 */
const agent = typeof navigator === 'undefined' ? '' : navigator.userAgent

export const isWindows = agent.includes('Windows')
export const isMac = !isWindows && agent.includes('Macintosh')
export const platformName = isWindows ? 'windows' : isMac ? 'macos' : 'linux'

/** Ctrl на Windows и Linux, ⌘ на Mac — для подсказок с сочетаниями клавиш. */
export const modKey = isMac ? '⌘' : 'Ctrl+'
