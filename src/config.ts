import { ConnectionOptions } from 'typeorm'

const ORMConfig = {
  type: 'postgres',
  host: process.env.POSTGRES_HOST,
  port: parseInt(process.env.POSTGRES_PORT),
  username: process.env.POSTGRES_USERNAME,
  password: process.env.POSTGRES_PASSWORD,
  database: process.env.POSTGRES_DATABASE,
  synchronize: true,
  logging: false,
  entities: [
    'src/entity/**/*.ts'
  ],
  migrations: [
    'src/migration/**/*.ts'
  ],
  subscribers: [
    'src/subscriber/**/*.ts'
  ],
  cli: {
    entitiesDir: 'src/entity',
    migrationsDir: 'src/migration',
    subscribersDir: 'src/subscriber'
  }
} as ConnectionOptions


const botConfig = {
  // Options
  // TODO(tyler): Turn this on when you're ready...
  SELF_PROMOTE_ACTIVE: false,
  NOTIFY_USERS_ACTIVE: true,
  SUBSCRIPTION_CONFIRMATIONS_ACTIVE: true,

  // Credentials
  TWITTER_CONSUMER_KEY: process.env.TWITTER_CONSUMER_KEY,
  TWITTER_CONSUMER_SECRET: process.env.TWITTER_CONSUMER_SECRET,
  TWITTER_ACCESS_TOKEN: process.env.TWITTER_ACCESS_TOKEN,
  TWITTER_ACCESS_TOKEN_SECRET: process.env.TWITTER_ACCESS_TOKEN_SECRET,

  // ID for @VaxHuntersCan (via tweeterid.com)
  VAX_HUNTERS_CAN_ID: '1373531468744552448',
  VAX_HUNTERS_CAN_USERNAME: 'VaxHuntersCan',

  // ID for @VaxHunterBot
  VAX_BOT_ID: '1385030381435506688',

  // Regexes
  POSTAL_CODE_REGEX: /[A-Za-z]\d[A-Za-z]/g,
  UNSUBSCRIBE_REGEX: /unsubscribe/gi,

  // Concurrencies
  NOTIFY_USER_CONCURRENCY: 2,
  SUBSCRIBE_USER_TO_POSTAL_CODES_CONCURRENCY: 2,
  PROCESS_MENTIONS_CONCURRENCY: 2,
  SUBSCRIPTION_CONFIRMATION_CONCURRENCY: 2,

  // Misc
  MENTIONS_FETCH_COUNT: 200,
  MENTIONS_CURSOR_NAME: 'root',
  MENTIONS_POLL_INTERVAL_SECONDS: 30,

  DM_FETCH_COUNT: 50,
  DM_CURSOR_NAME: 'dm_cursor',
  DMS_POLL_INTERVAL_MINUTES: 1,

  // Blurbs
  SELF_PROMOTION_BLURB: `I'm a bot. Tweet me your postal code and I'll notify you if VaxHuntersCan mentions it!`,
}

export {
  botConfig,
  ORMConfig,
}
