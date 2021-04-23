require('dotenv').config()
import 'reflect-metadata'
import { createConnection } from 'typeorm'

import { TwitterService } from './services/twitter-service/twitter.service'

const main = async () => {
  try {
    await createConnection()
    new TwitterService()
    console.log('Initialized!')
  } catch (err) {
    console.error(err)
  }
}

main()
