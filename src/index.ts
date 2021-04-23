require('dotenv').config()
import 'reflect-metadata'
import { createConnection } from 'typeorm'
import * as Cron from 'cron'

import { config } from './config'
import { TwitterService } from './services/twitter-service/twitter.service'

const { MENTIONS_POLL_INTERVAL_SECONDS } = config

const main = async () => {
  try {
    await createConnection()
    const twitterService = new TwitterService()

    var checkMentionsJob = new Cron.CronJob(`*/${MENTIONS_POLL_INTERVAL_SECONDS} * * * * *`, () => {
      console.log('\nChecking mentions...')
      twitterService.checkMentions()
    })
    
    checkMentionsJob.start()
    console.log('Initialized!')
  } catch (err) {
    console.error(`An error occurred during initialization: %o`, err)
  }
}

main()
