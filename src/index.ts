require('dotenv').config()
import 'reflect-metadata'
import { createConnection } from 'typeorm'
import Cron from 'cron'
import Koa from 'koa'
import Router from 'koa-router'

import { config } from './config'
import { TwitterService } from './services/twitter-service/twitter.service'

const {
  MENTIONS_POLL_INTERVAL_SECONDS,
  DMS_POLL_INTERVAL_MINUTES,
} = config

const buildServer = () => {
  var server = new Koa()
  var router = new Router()

  router.get('/healthcheck', (ctx, next) => {
    ctx.body = `I'm alive`
  })

  server
    .use(router.routes())
    .use(router.allowedMethods())

  return server
}

const main = async () => {
  try {
    const server = buildServer()
    server.listen(3000)

    await createConnection()
    const twitterService = new TwitterService()

    const checkMentionsJob = new Cron.CronJob(`*/${MENTIONS_POLL_INTERVAL_SECONDS} * * * * *`, async () => {
      console.log('\nChecking mentions...')
      await twitterService.checkMentions()
    })

    const checkDMsJob = new Cron.CronJob(`*/${DMS_POLL_INTERVAL_MINUTES} * * * *`, async () => {
      console.log('\nChecking DMs...')
      await twitterService.checkDMs()
    })

    checkMentionsJob.start()
    // TODO(tyler): Possibly implement DM parsing in the future...
    // checkDMsJob.start()
    console.log('Initialized!')
  } catch (err) {
    console.error(`An error occurred during initialization: %o`, err)
  }
}

main()
