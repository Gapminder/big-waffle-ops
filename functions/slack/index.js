const crypto = require('crypto')
const querystring = require('querystring')
const { URL } = require('url')

const { ArgumentParser } = require('argparse')
const { datasetName, info, warning, getConfig, exec } = require('bw-cf-utils')

function error (err, res, command) {
  // TODO: use bunyan for Stackdriver to do the logging
  if ((err.logLevel || 'error') == 'error') {
    console.error(err)
  } else {
    console.log(err.message)
  }
  const reply = {
    response_type: "ephimeral",
  }
  reply.text = `${err.message}`
  if (command && command.formatHelp) {
    reply.attachments = [{text: command.formatHelp()}]
  }
  res.send(reply)
}

function verify (req, config) {
  const signature = req.get('X-Slack-Signature')
  const timestamp = req.get('X-Slack-Request-Timestamp')
  if (! (signature && timestamp)) {
    throw warning(`Slack signature absent`)
  }
  let hmac, expectedHMAC
  try {
    expectedHMAC = signature.split('=', 2) // version, hex digest
    hmac = crypto.createHmac('sha256', config.clientSecret)
    hmac.update(`${expectedHMAC[0]}:`)
    hmac.update(`${timestamp}:`)
    const rawBody = querystring.stringify(req.body).replace(/%20/g, '+') //Slack uses HTML encoding with + signs for spaces.
    hmac.update(rawBody)
  } catch (signErr) {
    console.error(signErr)
    throw warning('Slack signature could not be verified')
  }
  if (hmac.digest('hex') !== expectedHMAC[1]) {
    throw warning('Slack signature was not correct')
  }
}

const commands = {
  bwload: new ArgumentParser({
    prog: '/bwload',
    addHelp: false,
    description: 'Slack interface to load and manage datasets in BigWaffle',
    debug: true // this makes the parser throw exceptions instead of exiting the node process
  })
}
const loadCmd = commands.bwload
loadCmd.addArgument(
  ['-N', '--name'],
  {
    nargs: 1,
    help: 'Give the dataset an explicit name, instead of using the Git URL path'
  }
)
loadCmd.addArgument(
  ['-D', '--dateversion'],
  {
    action: 'storeTrue',
    help: 'Give the dataset a version based on the date, instead of the Git hash'
  }
)
loadCmd.addArgument(
  '--ddfdir',
  {
    nargs: 1,
    help: 'The name of the directory that has the DDF package.json file. Defaults to "/"'
  }
)
loadCmd.addArgument(
  'gitCloneUrl',
  {
    help: 'The URL to clone the GitHub repository'
  }
)
loadCmd.addArgument(
  'branch',
  {
    defaultValue: 'master',
    nargs: '?',
    help: 'The name of the branch in the repository. Defaults to "master"'
  }
)
loadCmd._do = function (req, res, arguments, reply, config) {
  try {
    let gitUrl, name
    try {
      gitUrl = new URL(arguments.gitCloneUrl)
    } catch (typeError) {
      throw info(`gitCloneUrl: "${arguments.gitCloneUrl}" is not a valid URL`)
    }
    name = arguments.name || datasetName(gitUrl.pathname.split('/').pop())
    if (name.length < 1) {
      throw info(`no name was given and ${gitUrl} has an empty path`)
    }
    // build command to dispatch, should be like "./loadgit.sh https://github.com/Gapminder/big-waffle-ddf-testdata.git test"
    const cmd = `nohup ./bin/loadgit ${arguments.dateversion ? '': '--hash '}${arguments.ddfdir ? ` -d ${arguments.ddfdir} `: ' '}-b ${arguments.branch} ${gitUrl} ${name} > slack-load.log &`
    return exec(cmd, config, res, reply) // this returns a Promise that executes the command on the BigWaffle master
  } catch (err) {
    error(err, res, this)
    return
  }
}

module.exports.do = function (req, res) {
  const command = commands[req.body.command.slice(1)] // we strip the opening forward slash cahracter
  let arguments, reply = {
    response_type: "ephimeral",
    text: `Slack command ${req.body.command} ${req.body.text} is being processed...`,
  }
  try {
    if(! (command && typeof command._do === 'function')) {
      throw warning(`Unrecognized command: ${req.body.command}`)
    }
    try {
      arguments = command.parseArgs((decodeURIComponent(req.body.text || '').split(/\s+/)))
    } catch (parseErr) {
      throw info(parseErr.message)
    }
  } catch (err) {
    error(err, res, command)
    return
  }

  getConfig()
  .then(config => {
    // check signature!
    try {
      verify(req, config)
    } catch (err) {
      console.log(err)
      res.send('OK')
      return   
    }
    console.log(`${req.body.user_name || req.body.user_id}: ${req.body.command} ${req.body.text}`)
    // execute the command
    return command._do(req, res, arguments, reply, config)
  })
  .catch(err => {
    error(err, res, command)
  })
}