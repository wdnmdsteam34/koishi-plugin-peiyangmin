import { Context } from 'koishi'
import Decimal from 'decimal.js'

export const name = 'peiyangmin'
export const inject = ['database']

/* ===== 数据库结构 ===== */
export interface PetriDish {
  userId: string
  // 存字符串，但含义是 Decimal
  items: Record<string, string>
  lastDoubleTime?: number
  pendingItem?: string
}

declare module 'koishi' {
  interface Tables {
    peiyangmin: PetriDish
  }
}

/* ===== 工具 ===== */
function fmtList(items: Record<string, string>) {
  if (Object.keys(items).length === 0) return '（空）'
  return Object.entries(items)
    .map(([k, v]) => `· ${k} × ${v}`)
    .join('\n')
}

/* ===== 插件入口 ===== */
export function apply(ctx: Context) {
  ctx.model.extend('peiyangmin', {
    userId: 'string',
    items: 'json',
    lastDoubleTime: 'unsigned',
    pendingItem: 'string',
  }, { primary: 'userId' })

  const getDish = (uid: string) => ctx.database.get('peiyangmin', { userId: uid }).then(r => r[0])
  const setDish = (uid: string, data: Partial<PetriDish>) =>
    ctx.database.set('peiyangmin', { userId: uid }, data)

  /* 统一根指令 */
  ctx.command('培养皿 <subcmd:string> [arg1:string] [arg2:string]')
    .usage('培养皿指令：放入 | 确认放入 | 状态 | 培养 | 重命名 | help')
    .userFields(['id'])
    .action(async ({ session }, subcmd, arg1) => {
      const uid = session.user.id.toString()
      let dish = await getDish(uid)

      /* 帮助 */
      if (!subcmd || subcmd === 'help') {
        return `【培养皿使用说明】
/培养皿 放入 <物品>      → 申请清空并放入新物品（需二次确认）
/培养皿 确认放入 <物品>  → 正式清空并放入新物品
/培养皿 状态            → 查看当前物品列表（高精度支持）
/培养皿 培养            → 5 分钟 CD，所有物品数量翻倍
/培养皿 重命名 <原名> <新名> → 改名
/培养皿 help            → 再次显示本帮助`
      }

      /* 放入（预清空） */
      if (subcmd === '放入') {
        if (!arg1) return '请输入要放入的物品名称。'
        if (!dish) {
          await ctx.database.create('peiyangmin', {
            userId: uid,
            items: { [arg1]: '1' },
            pendingItem: null,
          })
          return `🎉 已为你创建培养皿并直接放入“${arg1}”（原为空）。`
        }
        await setDish(uid, { pendingItem: arg1 })
        return `⚠️ 准备清空培养皿并放入“${arg1}”。  
当前内容：\n${fmtList(dish.items)}\n  
如确认请输入：/培养皿 确认放入 ${arg1}`
      }

      /* 确认放入 */
      if (subcmd === '确认放入') {
        if (!arg1) return '请输入物品名称。'
        if (!dish || dish.pendingItem !== arg1) {
          return '没有待确认的放入请求，请先 /培养皿 放入 <物品>。'
        }
        await setDish(uid, { items: { [arg1]: '1' }, pendingItem: null })
        return `✅ 已清空并放入“${arg1}”，数量：1`
      }

      /* 状态 */
      if (subcmd === '状态') {
        if (!dish || Object.keys(dish.items).length === 0) {
          let msg = '培养皿为空，或未创建。'
          if (dish?.pendingItem) msg += `\n待确认放入“${dish.pendingItem}”。`
          return msg
        }
        let msg = '🧪 当前培养皿：\n' + fmtList(dish.items)
        const cd = 5 * 60 * 1000
        if (dish.lastDoubleTime && Date.now() - dish.lastDoubleTime < cd) {
          const left = Math.ceil((dish.lastDoubleTime + cd - Date.now()) / 60000)
          msg += `\n⏳ 培养冷却中，还剩 ${left} 分钟`
        }
        if (dish.pendingItem) msg += `\n⏸️ 待确认放入“${dish.pendingItem}”`
        return msg
      }

      /* 培养（翻倍） */
      if (subcmd === '培养') {
        if (!dish || Object.keys(dish.items).length === 0) {
          return '培养皿为空，无法培养。'
        }
        const now = Date.now()
        const cd = 5 * 60 * 1000
        if (dish.lastDoubleTime && now - dish.lastDoubleTime < cd) {
          const remain = Math.ceil((dish.lastDoubleTime + cd - now) / 60000)
          return `培养冷却中，请 ${remain} 分钟后再试。`
        }
        const newItems: Record<string, string> = {}
        for (const k in dish.items) {
          newItems[k] = new Decimal(dish.items[k]).mul(2).toString()
        }
        await setDish(uid, { items: newItems, lastDoubleTime: now })
        return `🌱 培养成功！\n` + fmtList(newItems)
      }

      /* 重命名 */
      if (subcmd === '重命名') {
        const [oldName, newName] = [arg1, session.argv[3]]
        if (!oldName || !newName) return '用法：/培养皿 重命名 <原名> <新名>'
        if (!dish || !dish.items[oldName]) return `没有找到“${oldName}”。`
        if (dish.items[newName]) return `名称“${newName}”已存在。`
        dish.items[newName] = dish.items[oldName]
        delete dish.items[oldName]
        await setDish(uid, { items: dish.items })
        return `✏️ 已将“${oldName}”重命名为“${newName}”，数量：${dish.items[newName]}`
      }

      return '未知指令，请使用 /培养皿 help 查看帮助。'
    })
}
