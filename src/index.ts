require('dotenv').config()
import 'reflect-metadata'
import { createConnection } from 'typeorm'
import * as Cron from 'cron'

import { TwitterService } from './services/twitter-service/twitter.service'

const main = async () => {
  try {
    await createConnection()
    const twitterService = new TwitterService()

    var checkMentionsJob = new Cron.CronJob('*/10 * * * * *', () => {
      console.log('\nChecking mentions...')
      twitterService.checkMentions()
    })
    
    checkMentionsJob.start()
    console.log('Initialized!')
  } catch (err) {
    console.error(err)
  }
}

main()
