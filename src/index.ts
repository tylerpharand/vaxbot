require('dotenv').config()
import 'reflect-metadata'
import { createConnection } from 'typeorm'
import Cron from 'cron'
import Koa from 'koa'
import Router from 'koa-router'

import { botConfig, ORMConfig } from './config'
import { TwitterService } from './services/twitter-service/twitter.service'
import { MetricsService } from './services/metrics-service/metrics.service'

const {
  MENTIONS_POLL_INTERVAL_SECONDS,
  METRICS_INTERVAL_MINUTES,
  DMS_POLL_INTERVAL_MINUTES,
} = botConfig

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

    await createConnection(ORMConfig)
    const twitterService = new TwitterService()
    const metricsService = new MetricsService()

    const checkMentionsJob = new Cron.CronJob(`*/${MENTIONS_POLL_INTERVAL_SECONDS} * * * * *`, async () => {
      try {
        console.log('\nChecking mentions...')
        await twitterService.checkMentions()
      } catch (err) {
        console.error(`An error occurred while checking mentions: %o`, err)
      }
    })

    const publishMetricsJob = new Cron.CronJob(`*/${METRICS_INTERVAL_MINUTES} * * * *`, async () => {
      try {
        console.log('\nChecking metrics...')
        await metricsService.checkMetrics()
      } catch (err) {
        console.error(`An error occurred while publishing metrics: %o`, err)
      }
    })

    // const checkDMsJob = new Cron.CronJob(`*/${DMS_POLL_INTERVAL_MINUTES} * * * *`, async () => {
    //   console.log('\nChecking DMs...')
    //   await twitterService.checkDMs()
    // })

    checkMentionsJob.start()
    publishMetricsJob.start()
    // TODO(tyler): Possibly implement DM parsing in the future...
    // checkDMsJob.start()
    console.log('Initialized!')
  } catch (err) {
    console.error(`An error occurred during initialization: %o`, err)
  }
}

main()
