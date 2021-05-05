/**
  Remaining items:
  - [] nice-to-have: Automatic followbacks.
  - [] DM scalability beyond limits...
  - [] Dockerize
  - [] Deploy to EC2
  - [] Make sure you add UUID to remote postgres

  Notes:
  - Should be stateless... So we can technically make improvements and redeploy without any issue.
  - Only problem would be that we can potentially miss tweets from @VaxHuntersCan during downtime...
*/

import _ from 'lodash'
import Twit from 'twit'
import pLimit from 'p-limit'
import { Tweet } from './types/index'
import { getRepository, In } from 'typeorm'
import { Subscription } from '../../entity/Subscription.entity'
import { MentionsCursor } from '../../entity/MentionsCursor.entity'
import { botConfig } from '../../config'

const {
  SELF_PROMOTE_ACTIVE,
  SELF_PROMOTE_ONLY_POSTAL_CODE,
  NOTIFY_USERS_ACTIVE,
  SUBSCRIPTION_CONFIRMATIONS_ACTIVE,
  NOTIFY_SUBSCRIPTION_CONFIRMATIONS,
  VAX_HUNTERS_CAN_ID,
  POSTAL_CODE_REGEX,
  UNSUBSCRIBE_REGEX,
  NOTIFY_USER_CONCURRENCY,
  SUBSCRIBE_USER_TO_POSTAL_CODES_CONCURRENCY,
  PROCESS_MENTIONS_CONCURRENCY,
  SUBSCRIPTION_CONFIRMATION_CONCURRENCY,
  MENTIONS_FETCH_COUNT,
  DM_FETCH_COUNT,
  MENTIONS_CURSOR_NAME,
  TWITTER_CONSUMER_KEY,
  TWITTER_CONSUMER_SECRET,
  TWITTER_ACCESS_TOKEN,
  TWITTER_ACCESS_TOKEN_SECRET,
  SELF_PROMOTION_BLURB,
  VAX_BOT_ID,
} = botConfig

var T = new Twit({
  consumer_key: TWITTER_CONSUMER_KEY,
  consumer_secret: TWITTER_CONSUMER_SECRET,
  access_token: TWITTER_ACCESS_TOKEN,
  access_token_secret: TWITTER_ACCESS_TOKEN_SECRET,
})

const CONFIRMATION_PHRASES = [
  'Aye aye',
  'Got it',
  'For sure',
  'Done',
  'Sure thing',
  'Will do',
  'Understood',
  'Consider it done',
]

const ATTENTION_GRABBING_PHRASES = [
  'Hey',
  'Hi',
  'Ayo',
  'Hello',
  'Yo',
  'Greetings',
]

export class TwitterService {

  stream: Twit.Stream
  subscriptionStream: Twit.Stream

  constructor() {
    if (NOTIFY_USERS_ACTIVE) {
      console.log(`Listening for tweet updates from user ${VAX_HUNTERS_CAN_ID}`)

      this.stream = T.stream('statuses/filter', { follow: [VAX_HUNTERS_CAN_ID] })
      this.stream.on('tweet', async (tweet: Tweet) => {
        this.handleTweet(tweet)
      })
      this.stream.on('connect', async () => {
        console.error(`Received 'connect' event`)
      })
      this.stream.on('connected', async () => {
        console.error(`Received 'connected' event`)
      })
      this.stream.on('disconnect', async (disconnectMessage) => {
        console.error(`Received 'disconnect' event: %o`, disconnectMessage)
      })
      this.stream.on('reconnect', function (request, response, connectInterval) {
        console.error(`Received 'reconnect' event (connectInterval: ${connectInterval})`)
      })
      this.stream.on('warning', function (warningMessage) {
        console.error(`Received 'warning' event: %o`, warningMessage)
      })
      // this.stream.on('direct_message', function (directMsg) {
      //   console.log(`Received direct message: %o`, directMsg)
      // })
    }
  }

  public async testDirectMessageToSelf() {
    console.log(`Testing direct message to @vaxhunterbot (${VAX_BOT_ID})...`)
    await T.post('direct_messages/events/new', {
      event: {
        type: "message_create",
        message_create: {
          target: {
            recipient_id: VAX_BOT_ID,
          },
          message_data: {
            text: `${_.sample(ATTENTION_GRABBING_PHRASES)}! Test message\n\nTo unsubscribe, mention me in a tweet with the word 'unsubscribe'.`
          }
        }
      }
    } as any)
  }


  /**
   * 
   * Checks for new mentions and creates/deletes subscriptions as necessary. Additionally,
   * sends confirmations for subscriptions which haven't been acknowledged.
   * 
   */
  public async checkMentions() {
    try {
      const mentionsCursor = await getRepository(MentionsCursor)
        .findOne({ name: MENTIONS_CURSOR_NAME })

      const args = {
        count: MENTIONS_FETCH_COUNT,
      }

      if (mentionsCursor && mentionsCursor.cursor) {
        Object.assign(args, { since_id: mentionsCursor.cursor })
      }

      const res = await T.get(`statuses/mentions_timeline`, args)
      const remainingCalls = res.resp.headers['x-rate-limit-remaining']
      const remainingSeconds = parseInt(res.resp.headers['x-rate-limit-reset'] as string, 10) - Math.floor(new Date().getTime() / 1000)
      const remainingMinutes = Number.parseFloat(String(remainingSeconds / 60)).toFixed(2)
      console.log(`(Mentions) Remaining calls: ${remainingCalls} - More juice in ${remainingMinutes} mins`)

      const mentions = res.data as unknown as Tweet[]
      mentions.reverse()
      await this.handleMentions(mentions)
      await this.sendSubscriptionConfirmations()
    } catch (err) {
      console.error(`An error occurred while checking mentions: %o`, err)
    }
  }

  public async checkDMs() {
    try {
      const directMessageCursor = '' || { cursor: '' }
      const args = {
        count: DM_FETCH_COUNT,
      }

      if (directMessageCursor && directMessageCursor.cursor) {
        Object.assign(args, { since_id: directMessageCursor.cursor })
      }

      const res = await T.get(`direct_messages/events/list`, args)
      const remainingCalls = res.resp.headers['x-rate-limit-remaining']
      const remainingSeconds = parseInt(res.resp.headers['x-rate-limit-reset'] as string, 10) - Math.floor(new Date().getTime() / 1000)
      const remainingMinutes = Number.parseFloat(String(remainingSeconds / 60)).toFixed(2)
      console.log(`(DMs) Remaining calls: ${remainingCalls} - More juice in ${remainingMinutes} mins`)

      const directMessages = (res.data as any).events as unknown as any[]
      directMessages.reverse()
      console.log(`DMS: ${directMessages.length}`)
      const filteredDms = directMessages.filter(directMessage => {
        return (
          directMessage.type === 'message_create'
          && directMessage.message_create.sender_id !== VAX_BOT_ID
        )
      })
      // TODO(tyler): Future improvement
      // handleDMs(filteredDms)

    } catch (err) {
      console.error(`An error occurred while checking DMs: %o`, err)
    }
  }


  /**
   * 
   * Handles new tweets which are posted by @VaxHuntersCan and determines if they
   * have mentioned any postal codes. Notifies any users which are subscribed to
   * postal codes which were mentioned.
   * 
   * @param tweet 
   */
  private async handleTweet(
    tweet: Tweet
  ) {
    try {
      if ((tweet.user.id_str === VAX_HUNTERS_CAN_ID) && tweet.in_reply_to_user_id_str === null) {
        console.log('\nReceived tweet: %o', tweet.text)
        const cleanedText = tweet.text.replace(/http\S+/, '')
        const postalCodes = _.chain([...(cleanedText as any).matchAll(POSTAL_CODE_REGEX)])
          .map((match) => match[0].toUpperCase())
          .uniq()
          .value()

        if (postalCodes.length > 0) {
          console.log('Matched postal codes: %o', postalCodes)

          // TODO(tyler): The distinct userId could be handled by postgres
          const subscriptions = await getRepository(Subscription)
            .find({
              where: { postalCode: In(postalCodes) },
            })
          const users = _.uniqBy(subscriptions, 'userId')

          console.log(`Notifying ${users.length} users...`)
          const limit = pLimit(NOTIFY_USER_CONCURRENCY)
          await Promise.all(users.map(user => limit(async () => {
            await this.notifyUser(user.userId, postalCodes, tweet)
              .catch((err) => console.error(`An error occurred while notifying user ${user.userId}: %o`, err))
          })))
        }

        // Self promote on tweets containing postal codes
        await this.selfPromote(tweet, postalCodes)
      }
    } catch (err) {
      console.error(`An error occurred while handling tweet: %o`, err)
    }
  }


  /**
   * 
   * For @VaxHuntersCan tweets that contain postal codes, automatically post self promo
   * 
   * @param tweet 
   */
  private async selfPromote(
    tweet: Tweet,
    postalCodes: string[]
  ) {
    try {
      if (SELF_PROMOTE_ACTIVE && tweet.user.id_str === VAX_HUNTERS_CAN_ID) {
        // Guard if only promoting tweets containing postal codes
        if (SELF_PROMOTE_ONLY_POSTAL_CODE && postalCodes.length === 0) return

        await T.post('statuses/update', { in_reply_to_status_id: tweet.id_str, status: SELF_PROMOTION_BLURB })
      }
    } catch (err) {
      console.error(`An error occurred during self promotion: %o`, err)
    }
  }


  /**
   * 
   * Notifies users when @VaxHuntersCan posts a tweet which mentions a
   * postal code they are subscribed to.
   * 
   * @param userId 
   * @param postalCodes 
   * @param tweet 
   */
  private async notifyUser(
    userId: string,
    postalCodes: string[],
    tweet: Tweet
  ) {
    try {
      console.log(`Notifying user ${userId} of tweet ${tweet.id_str} about postal codes ${postalCodes.join(', ')}`)
      if (NOTIFY_USERS_ACTIVE) {
        await T.post('direct_messages/events/new', {
          event: {
            type: "message_create",
            message_create: {
              target: {
                recipient_id: userId,
              },
              message_data: {
                text: `${_.sample(ATTENTION_GRABBING_PHRASES)}! VaxHuntersCan just tweeted about ${postalCodes.join(', ')}:\nhttps://twitter.com/i/web/status/${tweet.id_str}\n\nTo unsubscribe, mention me in a tweet with the word 'unsubscribe'.`
              }
            }
          }
        } as any)
      }
    } catch (err) {
      console.error(`An error occurred while notifying user ${userId}: %o`, err)
    }
  }


  /**
   * 
   * Checks for any new mentions, classifies the mentions as either a subscribe,
   * unsubscribe or neither, then updates subscriptions in database accordingly.
   * 
   * @param mentions 
   */
  private async handleMentions(
    mentions: Tweet[]
  ) {
    try {
      // Do nothing
      if (mentions.length === 0) {
        return
      }

      // Process pending mentions
      console.log(`Processing ${mentions.length} mentions...`)
      const limit = pLimit(PROCESS_MENTIONS_CONCURRENCY)
      await Promise.all(mentions.map(tweet => limit(async () => {
        try {
          console.log(`\nProcessing mention (${tweet.id_str}): %o`, tweet.text)
          const cleanedText = tweet.text.replace(/http\S+/, '')
          const postalCodes = _.chain([...(cleanedText as any).matchAll(POSTAL_CODE_REGEX)])
            .map((match) => match[0].toUpperCase())
            .uniq()
            .value()

          // Ignore tweets from @VaxHunterBot
          if (tweet.user.id_str === VAX_BOT_ID) return

          if (UNSUBSCRIBE_REGEX.test(cleanedText)) {
            await this.unsubscribeUser(tweet.user.id_str, tweet.id_str, tweet.user.screen_name)
          } else if (postalCodes.length > 0) {
            await this.subscribeUser(tweet.user.id_str, tweet.user.screen_name, tweet.id_str, postalCodes)
          }
        } catch (err) {
          console.error(`An error occurred while handling a subscription change: %o`, err)
        }
      })))

      // Update cursor in db...
      const cursor = mentions[mentions.length - 1].id_str
      console.log(`\nUpdating cursor to ${cursor}`)
      await getRepository(MentionsCursor).save({
        name: MENTIONS_CURSOR_NAME,
        cursor,
      })
    } catch (err) {
      console.error(`An error occurred while handling mentions: %o`, err)
    }
  }


  /**
   * 
   * Unsubscribes users from all subscriptions. This can be initiated either from
   * a mention a or Direct Message.
   * 
   * This method DOES notify the user
   * 
   * @param userId 
   * @returns 
   */
  private async unsubscribeUser(
    userId: string,
    tweetId: string,
    username: string,
  ) {
    try {
      console.log(`\tUnsubscribing user ${userId}...`)
      await getRepository(Subscription).delete({ userId })
      if (SUBSCRIPTION_CONFIRMATIONS_ACTIVE) {
        await T.post('statuses/update', { in_reply_to_status_id: tweetId, status: `@${username} ${_.sample(CONFIRMATION_PHRASES)}!` })
      }
    } catch (err) {
      console.error(`An error occurred while unsubscribing user ${userId}: %o`, err)
    }
  }


  /**
   *
   * Creates subscriptions for a user to the specified postal codes. This can be
   * initiated from a mention.
   * 
   * This method DOES NOT notify the user (see `sendSubscriptionConfirmations`)
   *
   * @param userId
   * @returns
   */
  private async subscribeUser(
    userId: string,
    username: string,
    tweetId: string,
    postalCodes: string[]
  ) {
    try {
      console.log(`\tSubscribing user ${userId} to postal codes ${postalCodes.join(', ')}...`)
      const limit = pLimit(SUBSCRIBE_USER_TO_POSTAL_CODES_CONCURRENCY)
      const subscriptions = await getRepository(Subscription).find({ userId })
      const existingPostalCodes = subscriptions.map(subscription => subscription.postalCode)
      const newPostalCodes = postalCodes.filter(postalCode => !existingPostalCodes.includes(postalCode))

      return await Promise.all(
        newPostalCodes.map(postalCode => limit(
          async () => getRepository(Subscription)
            .save({
              userId,
              username,
              postalCode,
              tweetId,
              confirmed: false,
            })
            .catch((err) => {
              console.error(`An error occurred while subscribing user ${userId} to their postal codes ${postalCodes.toString()}: %o`, err)
            })
        ))
      )
    } catch (err) {
      console.error(`An error occurred while subscribing user ${userId} to ${postalCodes.join(',')}: %o`, err)
    }
  }


  /**
   * 
   * Go through database and send confirmations for subscriptions which haven't
   * yet been confirmed.
   * 
   */
  private async sendSubscriptionConfirmations() {
    if (SUBSCRIPTION_CONFIRMATIONS_ACTIVE) {
      const limit = pLimit(SUBSCRIPTION_CONFIRMATION_CONCURRENCY)
      const toConfirm = await getRepository(Subscription)
        .createQueryBuilder('subscription')
        .where('subscription.confirmed = :confirmed', { confirmed: false })
        .distinctOn(['subscription.tweetId'])
        .getMany()

      await Promise.all(toConfirm.map(({ id, tweetId, username }) => limit(async () => {
        try {
          if (NOTIFY_SUBSCRIPTION_CONFIRMATIONS) {
            await T.post('statuses/update', { in_reply_to_status_id: tweetId, status: `@${username} ${_.sample(CONFIRMATION_PHRASES)}! I'll DM you if VaxHuntersCan mentions your postal code. I will only be able to send you notifications if you are following me!\n\nReply 'unsubscribe' to stop.` })
          }
          await getRepository(Subscription)
            .createQueryBuilder()
            .update()
            .set({ confirmed: true })
            .where(`username = :username`, { username })
            .execute()
        } catch (err) {
          console.error('An error occurred while sending confirmations: %o', err)
        }
      })))
    }
  }
}
