import { Context } from 'koishi'

export const name = 'peiyangmin'

export function apply(ctx: Context) {
  ctx.command('peiyangmin')
    .action(() => {
      return `你好！目前插件是活着的！`
    })
}
