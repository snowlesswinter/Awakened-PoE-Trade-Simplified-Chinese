import { Host } from '@/web/background/IPC'
import { AppConfig } from '@/web/Config'
import { ParsedItem, parseClipboard, ItemCategory } from '@/parser'

const POEDB_LANGS = { 'en': 'us', 'ru': 'ru', 'cmn-Hant': 'tw', 'zh_CN': 'cn', 'ko': 'kr' }
const AUCTION_FIELDS = { main: '', sub: '' }

const categoryMapper = {
  'Map': '地图',
  'Captured Beast': '通货',
  'Metamorph Sample': 'Metamorph Sample', // 游戏已经删除该内容
  'Helmet': '头部装备',
  'Body Armour': '身体装备',
  'Gloves': '手部装备',
  'Boots': '脚步装备',
  'Shield': '盾牌',
  'Amulet': '项链',
  'Belt': '腰带',
  'Ring': '戒指',
  'Flask': '药剂',
  'Abyss Jewel': '深渊珠宝',
  'Jewel': '珠宝',
  'Quiver': '箭袋',
  'Claw': '爪类',
  'Bow': '弓类',
  'Sceptre': '短杖',
  'Wand': '法杖',
  'Fishing Rod': 'Fishing Rod',
  'Staff': '长杖',
  'Warstaff': '战杖',
  'Dagger': '匕首',
  'Rune Dagger': '符文匕首',
  'One-Handed Axe': '单手斧',
  'Two-Handed Axe': '双手斧',
  'One-Handed Mace': '单手锤',
  'Two-Handed Mace': '双手锤',
  'One-Handed Sword': '单手剑',
  'Two-Handed Sword': '双手剑',
  'Cluster Jewel': '珠宝',
  'Heist Blueprint': '夺宝奇兵物品',
  'Heist Contract': '夺宝奇兵物品',
  'Heist Tool': '夺宝奇兵物品',
  'Heist Brooch': '夺宝奇兵物品',
  'Heist Gear': '夺宝奇兵物品',
  'Heist Cloak': '夺宝奇兵物品',
  'Trinket': '夺宝饰品',
  'Invitation': '杂项地图',
  'Gem': '宝石',
  'Currency': '通货',
  'Divination Card': '命运卡',
  'Voidstone': 'Voidstone', // 游戏已经删除该内容
  'Sentinel': 'Sentinel', // 游戏已经删除该内容
  'Memory Line': '回忆',
  'Sanctum Relic': '杂项地图',
  'Tincture': '挑战赛季物品',
  'Charm': '挑战赛季物品'
}

function mapToChineseCategory (c: ItemCategory): string {
  return categoryMapper[c]
}

function extractAuctionFields (item: ParsedItem) {
  AUCTION_FIELDS.main = item.category ? mapToChineseCategory(item.category) : ''
  AUCTION_FIELDS.sub = item.info.name
}

export function registerActions () {
  Host.onEvent('MAIN->CLIENT::item-text', (e) => {
    if (!['open-wiki', 'open-craft-of-exile', 'open-poedb', 'search-similar'].includes(e.target) &&
        !['prepare-auction-search'].includes(e.target)) return
    const parsed = parseClipboard(e.clipboard)
    if (!parsed.isOk()) return

    if (e.target === 'open-wiki') {
      openWiki(parsed.value)
    } else if (e.target === 'open-craft-of-exile') {
      openCoE(parsed.value)
    } else if (e.target === 'open-poedb') {
      openPoedb(parsed.value)
    } else if (e.target === 'search-similar') {
      findSimilarItems(parsed.value)
    } else if (e.target === 'prepare-auction-search') {
      extractAuctionFields(parsed.value)
    }
  })

  Host.onEvent('MAIN->CLIENT::widget-action', (e) => {
    if (e.target === 'auction-search-main') {
      Host.sendEvent({
        name: 'CLIENT->MAIN::user-action',
        payload: { action: 'auction-search', text: AUCTION_FIELDS.main }
      })
    } else if (e.target === 'auction-search-sub') {
      Host.sendEvent({
        name: 'CLIENT->MAIN::user-action',
        payload: { action: 'auction-search', text: AUCTION_FIELDS.sub }
      })
    }
  })
}

export function openWiki (item: ParsedItem) {
  window.open(`https://www.poewiki.net/wiki/${item.info.refName}`)
}
export function openPoedb (item: ParsedItem) {
  window.open(`https://poedb.tw/${POEDB_LANGS[AppConfig().language]}/search?q=${item.info.refName}`)
}
export function openCoE (item: ParsedItem) {
  const encodedClipboard = encodeURIComponent(item.rawText)
  window.open(`https://craftofexile.com/?eimport=${encodedClipboard}`)
}

export function findSimilarItems (item: ParsedItem) {
  const text = JSON.stringify(item.info.name)
  Host.sendEvent({
    name: 'CLIENT->MAIN::user-action',
    payload: { action: 'stash-search', text }
  })
}
