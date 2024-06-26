import { screen, globalShortcut } from 'electron'
import { uIOhook, UiohookKey, UiohookWheelEvent } from 'uiohook-napi'
import { isModKey, KeyToElectron, mergeTwoHotkeys } from '../../../ipc/KeyToCode'
import { typeInChat, stashSearch, auctionSearch } from './text-box'
import { WidgetAreaTracker } from '../windowing/WidgetAreaTracker'
import { HostClipboard } from './HostClipboard'
import { OcrWorker } from '../vision/link-main'
import type { ShortcutAction } from '../../../ipc/types'
import type { Logger } from '../RemoteLogger'
import type { OverlayWindow } from '../windowing/OverlayWindow'
import type { GameWindow } from '../windowing/GameWindow'
import type { GameConfig } from '../host-files/GameConfig'
import type { ServerEvents } from '../server'

type UiohookKeyT = keyof typeof UiohookKey
const UiohookToName = Object.fromEntries(Object.entries(UiohookKey).map(([k, v]) => ([v, k])))

export class Shortcuts {
  private actions: ShortcutAction[] = []
  private stashScroll = false
  private logKeys = false
  private areaTracker: WidgetAreaTracker
  private clipboard: HostClipboard
  private pendingKey = false
  private lastTriggerTime1: number = +new Date()
  private lastTriggerTime2: number = +new Date()

  static async create (
    logger: Logger,
    overlay: OverlayWindow,
    poeWindow: GameWindow,
    gameConfig: GameConfig,
    server: ServerEvents
  ) {
    const ocrWorker = await OcrWorker.create()
    const shortcuts = new Shortcuts(logger, overlay, poeWindow, gameConfig, server, ocrWorker)
    return shortcuts
  }

  private constructor (
    private logger: Logger,
    private overlay: OverlayWindow,
    private poeWindow: GameWindow,
    private gameConfig: GameConfig,
    private server: ServerEvents,
    private ocrWorker: OcrWorker
  ) {
    this.areaTracker = new WidgetAreaTracker(server, overlay)
    this.clipboard = new HostClipboard(logger)

    this.poeWindow.on('active-change', (isActive) => {
      process.nextTick(() => {
        if (isActive === this.poeWindow.isActive) {
          if (isActive) {
            this.register()
          } else {
            this.unregister()
          }
        }
      })
    })

    this.server.onEventAnyClient('CLIENT->MAIN::user-action', (e) => {
      if (e.action === 'stash-search') {
        stashSearch(e.text, this.clipboard, this.overlay)
      } else if (e.action === 'auction-search') {
        auctionSearch(e.text, this.clipboard, this.overlay)
      }
    })

    uIOhook.on('keydown', (e) => {
      if (!this.logKeys) return
      const pressed = eventToString(e)
      this.logger.write(`debug [Shortcuts] Keydown ${pressed}`)
    })
    uIOhook.on('keyup', (e) => {
      if (!this.logKeys) return
      this.logger.write(`debug [Shortcuts] Keyup ${UiohookToName[e.keycode] || 'not_supported_key'}`)
    })

    uIOhook.on('wheel', (e) => {
      if (!e.ctrlKey || !this.poeWindow.isActive || !this.stashScroll) return

      if (!isStashArea(e, this.poeWindow)) {
        if (e.rotation > 0) {
          uIOhook.keyTap(UiohookKey.ArrowRight)
        } else if (e.rotation < 0) {
          uIOhook.keyTap(UiohookKey.ArrowLeft)
        }
      }
    })
  }

  updateActions (
    actions: ShortcutAction[],
    stashScroll: boolean,
    logKeys: boolean,
    restoreClipboard: boolean,
    language: string
  ) {
    this.stashScroll = stashScroll
    this.logKeys = logKeys
    this.clipboard.updateOptions(restoreClipboard)
    this.ocrWorker.updateOptions(language)

    const copyItemShortcut = mergeTwoHotkeys('Ctrl + C', this.gameConfig.showModsKey)
    if (copyItemShortcut !== 'Ctrl + C') {
      actions.push({
        shortcut: copyItemShortcut,
        action: { type: 'test-only' }
      })
    }

    const allShortcuts = new Set([
      'Ctrl + C', 'Ctrl + V', 'Ctrl + A',
      'Ctrl + F',
      'Ctrl + Enter',
      'Home', 'Delete', 'Enter',
      'ArrowUp', 'ArrowRight', 'ArrowLeft',
      copyItemShortcut
    ])

    for (const action of actions) {
      if (allShortcuts.has(action.shortcut) && action.action.type !== 'test-only') {
        this.logger.write(`error [Shortcuts] Hotkey "${action.shortcut}" reserved by the game will not be registered.`)
      }
    }
    actions = actions.filter(action => !allShortcuts.has(action.shortcut))

    const duplicates = new Set<string>()
    for (const action of actions) {
      if (allShortcuts.has(action.shortcut)) {
        this.logger.write(`error [Shortcuts] It is not possible to use the same hotkey "${action.shortcut}" for multiple actions.`)
        duplicates.add(action.shortcut)
      } else {
        allShortcuts.add(action.shortcut)
      }
    }
    this.actions = actions.filter(action =>
      !duplicates.has(action.shortcut) ||
      action.action.type === 'toggle-overlay')
  }

  private register () {
    for (const entry of this.actions) {
      const isOk = globalShortcut.register(shortcutToElectron(entry.shortcut), () => {
        if (this.logKeys) {
          this.logger.write(`debug [Shortcuts] Action type: ${entry.action.type}`)
        }

        if (entry.keepModKeys) {
          const nonModKey = entry.shortcut.split(' + ').filter(key => !isModKey(key))[0]
          uIOhook.keyToggle(UiohookKey[nonModKey as UiohookKeyT], 'up')
        } else {
          entry.shortcut.split(' + ').reverse().forEach(key => { uIOhook.keyToggle(UiohookKey[key as UiohookKeyT], 'up') })
        }

        if (entry.action.type === 'toggle-overlay') {
          this.areaTracker.removeListeners()
          this.overlay.toggleActiveState()
        } else if (entry.action.type === 'paste-in-chat') {
          typeInChat(entry.action.text, entry.action.send, this.clipboard)
        } else if (entry.action.type === 'trigger-event') {
          this.server.sendEventTo('broadcast', {
            name: 'MAIN->CLIENT::widget-action',
            payload: { target: entry.action.target }
          })
        } else if (entry.action.type === 'stash-search') {
          stashSearch(entry.action.text, this.clipboard, this.overlay)
        } else if (entry.action.type === 'copy-item') {
          const { action } = entry

          const pressPosition = screen.getCursorScreenPoint()

          this.clipboard.readItemText()
            .then(clipboard => {
              this.areaTracker.removeListeners()
              this.server.sendEventTo('last-active', {
                name: 'MAIN->CLIENT::item-text',
                payload: { target: action.target, clipboard, position: pressPosition, focusOverlay: Boolean(action.focusOverlay) }
              })
              if (action.focusOverlay && this.overlay.wasUsedRecently) {
                this.overlay.assertOverlayActive()
              }
            }).catch(() => {})

          pressKeysToCopyItemText(
            (entry.keepModKeys) ? entry.shortcut.split(' + ').filter(key => isModKey(key)) : undefined,
            this.gameConfig.showModsKey
          )
        } else if (entry.action.type === 'ocr-text' && entry.action.target === 'heist-gems') {
          if (process.platform !== 'win32') return

          const { action } = entry
          const pressTime = Date.now()
          const imageData = this.poeWindow.screenshot()
          this.ocrWorker.findHeistGems({
            width: this.poeWindow.bounds.width,
            height: this.poeWindow.bounds.height,
            data: imageData
          }).then(result => {
            this.server.sendEventTo('last-active', {
              name: 'MAIN->CLIENT::ocr-text',
              payload: {
                target: action.target,
                pressTime,
                ocrTime: result.elapsed,
                paragraphs: result.recognized.map(p => p.text)
              }
            })
          }).catch(() => {})
        }
      })

      if (!isOk) {
        this.logger.write(`error [Shortcuts] Failed to register a shortcut "${entry.shortcut}". It is already registered by another application.`)
      }

      if (entry.action.type === 'test-only') {
        globalShortcut.unregister(shortcutToElectron(entry.shortcut))
      }
    }

    this.registerAuctionSearchShortcuts()
    if (false) // 不太好用，先屏蔽
      this.registerDoubleSkillShortcuts()
  }

  private unregister () {
    globalShortcut.unregisterAll()
  }

  private registerAuctionSearchShortcuts () {
    const prepareShortcut = 'Ctrl + B'
    globalShortcut.register(prepareShortcut, () => {
      // keepModKeys = true
      const nonModKey = prepareShortcut.split(' + ').filter(key => !isModKey(key))[0]
      uIOhook.keyToggle(UiohookKey[nonModKey as UiohookKeyT], 'up')

      this.clipboard.readItemText()
        .then(clipboard => {
          this.server.sendEventTo('last-active', {
            name: 'MAIN->CLIENT::item-text',
            payload: { target: 'prepare-auction-search', clipboard, position: { x: 0, y: 0 }, focusOverlay: Boolean(false) }
          })
        }).catch(() => { })

      pressKeysToCopyItemText(prepareShortcut.split(' + ').filter(key => isModKey(key)), 'Ctrl')
    })

    const fillMainShortcut = 'Ctrl + 1'
    globalShortcut.register(fillMainShortcut, () => {
      this.server.sendEventTo('last-active', {
        name: 'MAIN->CLIENT::widget-action',
        payload: { target: 'auction-search-main' }
      })
    })

    const fillSubShortcut = 'Ctrl + 2'
    globalShortcut.register(fillSubShortcut, () => {
      this.server.sendEventTo('last-active', {
        name: 'MAIN->CLIENT::widget-action',
        payload: { target: 'auction-search-sub' }
      })
    })

    const fillNameShortcut = 'Ctrl + 3'
    globalShortcut.register(fillNameShortcut, () => {
      this.server.sendEventTo('last-active', {
        name: 'MAIN->CLIENT::widget-action',
        payload: { target: 'auction-search-name' }
      })
    })
  }

  // 直接简单触发的话，会有以下问题：
  //   1. 消息过于频繁，被服务器踢下线
  //   2. 第二个键被新事件抢在前面，导致哑炮
  //
  // 所以干脆放弃直接触发，而是采用一个周期式的方式轮流触发两个键。在下一
  // 个事件等待执行的过程中，无论按多少次，都不会触发一个新事件。
  // 并且，其实这个功能就是给爆灵术用的，那还可以再加一个小优化：
  //   第一个键，也就是亵渎，是不用触发太频繁的，0.5秒一次够了。
  private registerDoubleSkillShortcuts () {
    const minimumInterval = 100
    globalShortcut.register('1', () => {
      if (!this.pendingKey) return
      
      const currentTime = +new Date()
      if (currentTime - this.lastTriggerTime1 < 500) {
        if (currentTime - this.lastTriggerTime2 < minimumInterval) {
          this.delayTriggerKey2(minimumInterval)
        } else {
          uIOhook.keyTap(UiohookKey.F7)
          this.lastTriggerTime2 = currentTime
        }
      } else {
        uIOhook.keyTap(UiohookKey.F6)
        this.lastTriggerTime1 = currentTime
        this.delayTriggerKey2(minimumInterval)
      }
    })
  }

  private delayTriggerKey2 (minimumInterval: number) {
    this.pendingKey = true
    setTimeout(() => {
      uIOhook.keyTap(UiohookKey.F7)
      this.lastTriggerTime2 = +new Date()
      this.pendingKey = false
    }, minimumInterval)
  }
}

function pressKeysToCopyItemText (pressedModKeys: string[] = [], showModsKey: string) {
  let keys = mergeTwoHotkeys('Ctrl + C', showModsKey).split(' + ')
  keys = keys.filter(key => key !== 'C')
  if (process.platform !== 'darwin') {
    // On non-Mac platforms, don't toggle keys that are already being pressed.
    //
    // For unknown reasons, we need to toggle pressed keys on Mac for advanced
    // mod descriptions to be copied. You can test this by setting the shortcut
    // to "Alt + any letter". They'll work with this line, but not if it's
    // commented out.
    keys = keys.filter(key => !pressedModKeys.includes(key))
  }

  for (const key of keys) {
    uIOhook.keyToggle(UiohookKey[key as UiohookKeyT], 'down')
  }

  // finally press `C` to copy text
  uIOhook.keyTap(UiohookKey.C)

  keys.reverse()
  for (const key of keys) {
    uIOhook.keyToggle(UiohookKey[key as UiohookKeyT], 'up')
  }
}

function isStashArea (mouse: UiohookWheelEvent, poeWindow: GameWindow): boolean {
  if (!poeWindow.bounds ||
      mouse.x > (poeWindow.bounds.x + poeWindow.uiSidebarWidth)) return false

  return (mouse.y > (poeWindow.bounds.y + poeWindow.bounds.height * 154 / 1600) &&
          mouse.y < (poeWindow.bounds.y + poeWindow.bounds.height * 1192 / 1600))
}

function eventToString (e: { keycode: number, ctrlKey: boolean, altKey: boolean, shiftKey: boolean }) {
  const { ctrlKey, shiftKey, altKey } = e

  let code = UiohookToName[e.keycode]
  if (!code) return 'not_supported_key'

  if (code === 'Shift' || code === 'Alt' || code === 'Ctrl') return code

  if (ctrlKey && shiftKey && altKey) code = `Ctrl + Shift + Alt + ${code}`
  else if (shiftKey && altKey) code = `Shift + Alt + ${code}`
  else if (ctrlKey && shiftKey) code = `Ctrl + Shift + ${code}`
  else if (ctrlKey && altKey) code = `Ctrl + Alt + ${code}`
  else if (altKey) code = `Alt + ${code}`
  else if (ctrlKey) code = `Ctrl + ${code}`
  else if (shiftKey) code = `Shift + ${code}`

  return code
}

function shortcutToElectron (shortcut: string) {
  return shortcut
    .split(' + ')
    .map(k => KeyToElectron[k as keyof typeof KeyToElectron])
    .join('+')
}