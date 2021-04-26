import { ConnectionOptions } from 'typeorm'

enum Environment {
  development = 'development',
  production = 'production',
}

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
    `${__dirname }/entity/*.entity.{ts,js}`
  ],
  migrations: [
    `${__dirname}/migration/*.migration.{ts,js}`
  ],
  subscribers: [],
  cli: {
    entitiesDir: 'src/entity',
    migrationsDir: 'src/migration',
    subscribersDir: 'src/subscriber'
  }
} as ConnectionOptions


const botConfig = {
  // Subscription notifications
  NOTIFY_USERS_ACTIVE: process.env.NODE_ENV === Environment.production, // This is important...
  
  // Subscription confirmations
  SUBSCRIPTION_CONFIRMATIONS_ACTIVE: process.env.NODE_ENV === Environment.production,
  NOTIFY_SUBSCRIPTION_CONFIRMATIONS: false, // TODO: Enable this again

  // Self promotion
  SELF_PROMOTE_ACTIVE: false, // Disables all self-promotion
  SELF_PROMOTE_ONLY_POSTAL_CODE: true,

  // Credentials
  TWITTER_CONSUMER_KEY: process.env.TWITTER_CONSUMER_KEY,
  TWITTER_CONSUMER_SECRET: process.env.TWITTER_CONSUMER_SECRET,
  TWITTER_ACCESS_TOKEN: process.env.TWITTER_ACCESS_TOKEN,
  TWITTER_ACCESS_TOKEN_SECRET: process.env.TWITTER_ACCESS_TOKEN_SECRET,

  // ID for @VaxHuntersCan (via tweeterid.com)
  VAX_HUNTERS_CAN_ID: '1373531468744552448',

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

  // Metrics
  METRICS_INTERVAL_MINUTES: 5,

  // Misc
  MENTIONS_FETCH_COUNT: 200,
  MENTIONS_CURSOR_NAME: 'root',
  MENTIONS_POLL_INTERVAL_SECONDS: 15,

  DM_FETCH_COUNT: 50,
  DM_CURSOR_NAME: 'dm_cursor',
  DMS_POLL_INTERVAL_MINUTES: 1,

  // Blurbs
  SELF_PROMOTION_BLURB: `@VaxHuntersCan I'm here to help you find vaccine pop-ups. Tweet me your postal code and I'll notify you if @VaxHuntersCan mentions it!`,
}

export {
  botConfig,
  ORMConfig,
}
