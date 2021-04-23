require('dotenv').config()
import 'reflect-metadata'
import { createConnection } from 'typeorm'
import * as Cron from 'cron'

import { config } from './config'
import { TwitterService } from './services/twitter-service/twitter.service'

const {
  MENTIONS_POLL_INTERVAL_SECONDS,
  DMS_POLL_INTERVAL_MINUTES,
} = config

const main = async () => {
  try {
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
