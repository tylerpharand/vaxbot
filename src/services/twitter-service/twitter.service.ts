/**
  Remaining items:
  - [] Add cron job for checking mentions (subscription updates)
  - [] Unsubscribe via DM (With confirmation)
  - [] Add back logic to fetch/use cursor
  - [] Point towards @VaxHuntersCan
  - [] Dockerize
  - [] Deploy to EC2
  - [] Make sure you add UUID to remote postgres

  Notes:
  - Should be stateless... So we can technically make improvements and redeploy without any issue.
  - Only problem would be that we can potentially miss tweets from @VaxHuntersCan during downtime...
*/

import * as _ from 'lodash'
import * as Twit from 'twit'
import * as pLimit from 'p-limit'
import { Tweet } from './types/index'
import { getRepository, In } from 'typeorm'
import { Subscription } from '../../entity/Subscription'
import { MentionsCursor } from '../../entity/MentionsCursor'
import { config } from '../../config'

const {
  VAX_HUNTERS_CAN_ID,
  VAX_HUNTERS_CAN_USERNAME,
  POSTAL_CODE_REGEX,
  UNSUBSCRIBE_REGEX,
  NOTIFY_USER_CONCURRENCY,
  SUBSCRIBE_USER_TO_POSTAL_CODES_CONCURRENCY,
  PROCESS_MENTIONS_CONCURRENCY,
  SUBSCRIPTION_CONFIRMATION_CONCURRENCY,
  MENTIONS_FETCH_COUNT,
  MENTIONS_CURSOR_NAME,
  TWITTER_CONSUMER_KEY,
  TWITTER_CONSUMER_SECRET,
  TWITTER_ACCESS_TOKEN,
  TWITTER_ACCESS_TOKEN_SECRET,
} = config

var T = new Twit({
  consumer_key: TWITTER_CONSUMER_KEY,
  consumer_secret: TWITTER_CONSUMER_SECRET,
  access_token: TWITTER_ACCESS_TOKEN,
  access_token_secret: TWITTER_ACCESS_TOKEN_SECRET,
})

export class TwitterService {

  stream: Twit.Stream
  subscriptionStream: Twit.Stream

  constructor() {
    this.stream = T.stream('statuses/filter', { follow: [VAX_HUNTERS_CAN_ID] })

    this.stream.on('tweet', async (tweet: Tweet) => {
      this.handleTweet(tweet)
    })
    // this.checkMentions()
  }

  private async handleTweet(tweet: Tweet) {
    if (tweet.user.id_str === VAX_HUNTERS_CAN_ID || true) {
      console.log('Received tweet: %o', tweet.text)
      const cleanedText = tweet.text.replace(/http\S+/, '')
      // TODO(tyler): Verify this new logic works...
      // const postalCodes = _.chain([...(cleanedText as any).matchAll(POSTAL_CODE_REGEX)])
      //     .map((match) => match[0].toUpperCase())
      //     .uniq()
      //     .value()
      const postalCodes = _.uniq(['M5V'])

      if (postalCodes.length > 0) {
        console.log('Matched postal codes: %o', postalCodes)

        // TODO(tyler): The distinct userId could be handled by postgres
        const subscriptions = await getRepository(Subscription)
          .find({
            where: { postalCode: In(postalCodes) },
          })
        const users = _.uniqBy(subscriptions, 'userId')

        console.log(`Notifying ${users.length} users: %o`, users)
        const limit = pLimit(NOTIFY_USER_CONCURRENCY)
        await Promise.all(users.map(user => limit(async () => {
          await this.notifyUser(user.userId, postalCodes, tweet)
        })))

        // TODO(tyler): Send DIRECT MESSAGES of notifications rather than tagging...
      }
    }
  }

  private async notifyUser(userId: string, postalCodes: string[], tweet: Tweet) {
    try {
      await T.post('direct_messages/events/new', {
        event: {
          type: "message_create",
          message_create: {
            target: {
              recipient_id: userId,
            },
            message_data: {
              text: `Hey! @${VAX_HUNTERS_CAN_USERNAME} just tweeted about ${postalCodes.join(', ')}:\nhttps://twitter.com/i/web/status/${tweet.id_str}.\n\nReply 'unsubscribe' to stop recieving alerts.`
            }
          }
        }
      } as any)
    } catch (err) {
      console.error(`An error occurred while notifying user ${userId}: %o`, err)
    }
  }

  private async checkMentions() {
    try {
      // TODO(tyler): Remove `&& null` after debugging
      const mentionsCursor = await getRepository(MentionsCursor).findOne({ name: MENTIONS_CURSOR_NAME }) && null

      const args = {
        count: MENTIONS_FETCH_COUNT,
      }

      if (mentionsCursor && mentionsCursor.cursor) {
        Object.assign(args, { since_id: mentionsCursor.cursor })
      }

      const res = await T.get(`statuses/mentions_timeline`, args)
      const mentions = res.data as unknown as Tweet[]
      await this.processMentions(mentions)
      // await this.sendConfirmations()
    } catch (err) {
      console.error(err)
    }
  }

  private async processMentions(mentions: Tweet[]) {
    console.log(`Processing ${mentions.length} mentions...`)

    // Do nothing
    if (mentions.length === 0) {
      return
    }

    // Process pending mentions
    mentions.reverse()
    const limit = pLimit(PROCESS_MENTIONS_CONCURRENCY)
    await Promise.all(mentions.map(tweet => limit(async () => {
      console.log(`\nProcessing mention (${tweet.id_str}): %o`, tweet.text)
      const cleanedText = tweet.text.replace(/http\S+/, '')
      // TODO(tyler): Verify this new logic works...
      const postalCodes = _.chain([...(cleanedText as any).matchAll(POSTAL_CODE_REGEX)])
          .map((match) => match[0].toUpperCase())
          .uniq()
          .value()

      if (UNSUBSCRIBE_REGEX.test(cleanedText)) {
        await this.unsubscribeUser(tweet.user.id_str)
      } else if (postalCodes.length > 0) {
        await this.subscribeUser(tweet.user.id_str, tweet.user.screen_name, tweet.id_str, postalCodes)
      }
    })))

    const cursor = mentions[mentions.length - 1].id_str
    await getRepository(MentionsCursor).save({
      name: MENTIONS_CURSOR_NAME,
      cursor,
    })

    // Update cursor in db...
    console.log(`\nUpdated cursor to ${cursor}`)
  }

  private async unsubscribeUser(userId: string) {
    try {
      console.log(`\tUnsubscribing user ${userId}...`)
      return await getRepository(Subscription).delete({ userId })
    } catch (err) {
      console.error(`An error occurred while unsubscribing user ${userId}: %o`, err)
    }
  }

  private async subscribeUser(userId: string, username: string, tweetId: string, postalCodes: string[]) {
    try {
      console.log(`\tSubscribing user ${userId} to postal codes ${postalCodes.join(', ')}...`)
      const limit = pLimit(SUBSCRIBE_USER_TO_POSTAL_CODES_CONCURRENCY)
      const subscriptions = await getRepository(Subscription).find({ userId })
      const existingPostalCodes = subscriptions.map(subscription => subscription.postalCode)
      const newPostalCodes = postalCodes.filter(postalCode => !existingPostalCodes.includes(postalCode))

      console.log('\n\nnewPostalCodes')
      console.log(newPostalCodes)
      return await Promise.all(
        newPostalCodes.map(postalCode => limit(
          async () => getRepository(Subscription).save({
            userId,
            username,
            postalCode,
            tweetId,
            confirmed: false,
          })
        ))
      )
    } catch (err) {
      console.error(`An error occurred while subscribing user ${userId} to ${postalCodes.join(',')}: %o`, err)
    }
  }

  private async sendConfirmations() {
    const limit = pLimit(SUBSCRIPTION_CONFIRMATION_CONCURRENCY)
    const toConfirm = await getRepository(Subscription)
      .createQueryBuilder('subscription')
      .where('subscription.confirmed = :confirmed', { confirmed: false })
      .distinctOn(['subscription.tweetId'])
      .getMany()

    await Promise.all(toConfirm.map(({ id, tweetId, username }) => limit(async () => {
      await T.post('statuses/update', { in_reply_to_status_id: tweetId, status: `@${username} Got it! I will DM you if @VaxHuntersCan tweets about your postal code.` })
      await getRepository(Subscription).update(id, { confirmed: true })
    }))).catch(err => {
      console.error('An error occurred while sending confirmations: %o', err)
    })
  }
}
