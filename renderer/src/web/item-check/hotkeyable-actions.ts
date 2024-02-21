import { Host } from '@/web/background/IPC'
import { AppConfig } from '@/web/Config'
import { ParsedItem, parseClipboard, ItemCategory, ItemRarity } from '@/parser'

const POEDB_LANGS = { 'en': 'us', 'ru': 'ru', 'cmn-Hant': 'tw', 'zh_CN': 'cn', 'ko': 'kr' }
const AUCTION_FIELDS = { main: '', sub: '', unique_name: '' }

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
  'Gem': '技能石',
  'Currency': '通货',
  'Divination Card': '命运卡',
  'Voidstone': 'Voidstone', // 游戏已经删除该内容
  'Sentinel': 'Sentinel', // 游戏已经删除该内容
  'Memory Line': '回忆',
  'Sanctum Relic': '遗迹',
  'Tincture': '挑战赛季物品',
  'Charm': '挑战赛季物品'
}

function checkCategory (category: string, desc: string, end: boolean = true): boolean {
  if (end) return desc.length >= category.length && desc.slice(-category.length) === category
  return desc.length > category.length && desc.slice(0, category.length) === category
}

function mapToChineseCategory (category: ItemCategory | undefined, baseTypeName: string, rawText: string): string {
  if (!category) {
    if (checkCategory('圣甲虫', baseTypeName)) return '圣甲虫'

    const firstLine = rawText.split('\n')[0].trim()
    if (checkCategory('地图碎片', firstLine)) return '地图碎片'

    return ''
  }

  // "Expedition Logbook" 这种类型居然没有包含在ItemCategory里面，BUG真多
  if (checkCategory('先祖秘藏日志', baseTypeName)) return '先祖秘藏物品'

  const mapped = categoryMapper[category]

  // 一些物品子类太多，会在拍卖行另开一个一级的类别，例如精华
  if (mapped === '通货') {
    if (checkCategory('精华', baseTypeName)) return '精华'
    if (checkCategory('共振器', baseTypeName)) return '探索物品'
    if (checkCategory('孕育石', baseTypeName)) return '孕育石'
    if (checkCategory('圣油', baseTypeName)) return '圣油'
    if (checkCategory('异域铸币', baseTypeName)) return '先祖秘藏物品'
    if (checkCategory('废金属', baseTypeName)) return '先祖秘藏物品'
    if (checkCategory('黄芪', baseTypeName)) return '先祖秘藏物品'
    if (checkCategory('葬礼徽章', baseTypeName)) return '先祖秘藏物品'
    if (checkCategory('污秽', baseTypeName, false)) return '异度天灾通货物品'
    if (checkCategory('梦魇宝珠', baseTypeName)) return '梦魇宝珠'

    const firstLine = rawText.split('\n')[0].trim()
    if (checkCategory('灵柩', firstLine)) return '挑战赛季物品'
  }

  if (mapped === '技能石') {
    const firstLine = rawText.split('\n')[0].trim()
    if (checkCategory('辅助宝石', firstLine)) return '辅助技能石'
    return '主动技能石'
  }

  if (mapped === '药剂') {
    const firstLine = rawText.split('\n')[0].trim()
    if (checkCategory('生命药剂', firstLine)) return '生命药剂'
    if (checkCategory('魔力药剂', firstLine)) return '魔力药剂'
    if (checkCategory('功能药剂', firstLine)) return '非恢复类药剂'
  }

  return mapped
}

function extractAuctionFields (parsed: ParsedItem) {
  const item = JSON.parse(JSON.stringify(parsed)) // 不知道为什么，如果不做转换，item.baseType无法引用
  AUCTION_FIELDS.main = mapToChineseCategory(item.category, item.info.name, item.rawText)
  AUCTION_FIELDS.sub = item.baseType ? item.baseType : item.info.name
  AUCTION_FIELDS.unique_name = item.rarity ? (item.rarity === ItemRarity.Unique ? item.info.name : '') : ''
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
    } else if (e.target === 'auction-search-name') {
      Host.sendEvent({
        name: 'CLIENT->MAIN::user-action',
        payload: { action: 'auction-search', text: AUCTION_FIELDS.unique_name }
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
