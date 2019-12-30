const Koa = require('koa')
const BodyParser = require('koa-bodyparser')
const Router = require('koa-router')

const app = new Koa()
const service = new Router()

const GCBuilt = require('./gcbuilt')
service.post('/gcbuilt', async (ctx) => {
  ctx.body = await GCBuilt.do(ctx.request)
})

const Slack = require('./slack')
service.post('/slack', async (ctx) => {
  ctx.body = await Slack.do(ctx.request)
})

service.get('/', ctx => {
  ctx.body = 'Command interpreters: Slack'
})

app.use(BodyParser())
app.use(service.routes())
return app.listen(process.env.BW_OPS_PORT || '8080')