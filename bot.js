'use strict'

require('dotenv').config()

process.on('SIGINT', process.exit)

if (!process.env.SLACK_API_TOKEN) {
  console.error('Error: SLACK_API_TOKEN is not specified')
  process.exit(1)
}

if (!process.env.GOOGLE_API_TOKEN) {
  console.error('Error: GOOGLE_API_TOKEN is not specified')
  process.exit(1)
}

const Translate = require('@google-cloud/translate')
const Botkit = require('botkit')
const async = require('async')

const translator = Translate({ key: process.env.GOOGLE_API_TOKEN })
const controller = Botkit.slackbot({})

const createTranslateOptions = (from, to) => {
  return {
    from,
    to,
    format: 'text',
    model: 'nmt'
  }
}

const JAPANESE_CHANNEL_ID = process.env.JAPANESE_CHANNEL_ID
const ENGLISH_CHANNEL_ID = process.env.ENGLISH_CHANNEL_ID

const englishToJapanese = createTranslateOptions('en', 'ja')
const japaneseToEnglish = createTranslateOptions('ja', 'en')

const checkError = (err) => {
  if (!err) return

  console.error(err)
  process.exit(1)
}

let prefs = {}

controller.spawn({
  token: process.env.SLACK_API_TOKEN
}).startRTM((err, bot) => {
  checkError(err)
  prefs = Object.freeze({
    botname: bot.identity.name,
    displayRealNames: bot.team_info.prefs.display_real_names
  })
})

controller.on('ambient', (bot, message) => {
  let destChannel, translateOptions

  switch (message.channel) {
    case JAPANESE_CHANNEL_ID:
      destChannel = ENGLISH_CHANNEL_ID
      translateOptions = japaneseToEnglish
      break
    case ENGLISH_CHANNEL_ID:
      destChannel = JAPANESE_CHANNEL_ID
      translateOptions = englishToJapanese
      break
    default:
      return bot.replyPrivate(message, 'Error: Target channel was not found.')
  }

  async.parallel({
    user: bot.api.users.info.bind(null, { user: message.user }),
    translation: translator.translate.bind(translator, message.text, translateOptions)
  }, (err, res) => {
    if (err) return bot.replyPrivate(message, err)

    const user = res.user.user || {}
    const translation = res.translation || {}

    const reply = {
      channel: destChannel,
      text: translation[0],
      username: (prefs.displayRealNames ? user.real_name : user.name) + ' \u{1F4D8}',
      icon_url: user.profile.image_72
    }

    bot.send(reply, function (err, res) {
      if (err === 'channel_not_found') return bot.replyPrivate(message, 'Error: Target channel was not found.')
      if (err) return bot.replyPrivate(message, err)

      bot.replyAcknowledge()
    })
  })
})
