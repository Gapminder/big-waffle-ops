const crypto = require('crypto')
const querystring = require('querystring')
const { URL } = require('url')

const { ArgumentParser } = require('argparse')
const fetch = require('node-fetch')
const { datasetName, info, warning, loadConfig, exec } = require('./utils')

function errorReply(err) {
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
  if (err.helpText) {
    reply.attachments = [{text: err.helpText}]
  }
  return reply
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
    hmac = crypto.createHmac('sha256', config.signingSecret)
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
  bwload: {
    args: [
      [  
        ['-N', '--name'],
        {
          nargs: 1,
          help: 'Give the dataset an explicit name, instead of using the Git URL path'
        }
      ],
      [
        ['-D', '--dateversion'],
        {
          action: 'storeTrue',
          help: 'Give the dataset a version based on the date, instead of the Git hash'
        }
      ],
      [
        '--ddfdir',
        {
          nargs: 1,
          help: 'The name of the directory that has the DDF package.json file. Defaults to "/"'
        }      
      ],
      [
        '--publish',
        {
          action: 'storeTrue',
          help: 'Make the newly loaded version of the dataset the default for answering queries'
        }        
      ],
      [
        'gitCloneUrl',
        {
          help: 'The URL to clone the GitHub repository'
        }      
      ],
      [
        'branch',
        {
          defaultValue: 'master',
          nargs: '?',
          help: 'The name of the branch in the repository. Defaults to "master"'
        }
      ]
    ],
    cmdFor: args => {
      let gitUrl, name
      try {
        gitUrl = new URL(args.gitCloneUrl)
      } catch (typeError) {
        throw info(`gitCloneUrl: "${args.gitCloneUrl}" is not a valid URL`)
      }
      name = args.name || datasetName(gitUrl.pathname.split('/').pop())
      if (name.length < 1) {
        throw info(`no name was given and ${gitUrl} has an empty path`)
      }
      // build command to dispatch, should be like "./loadgit.sh https://github.com/Gapminder/big-waffle-ddf-testdata.git test"
      return `nohup ./bin/loadgit ${args.dateversion ? '': '--hash '}${args.publish ? '--publish ' : ''}${args.ddfdir ? `-d ${args.ddfdir} `: ' '}-b ${args.branch} ${gitUrl} ${name} > slack-load.log &`
    }
  },
  bwpublish: {
    args: [
      [
        'dataset',
        {
          help: 'The name of the dataset to publish'
        }
      ]    
    ],
    cmdFor: args => {
      // build command to dispatch
      return `./bin/bw make-default ${args.dataset} latest`
    },
    useStdOut: true
  },
  bwdefault: {
    args: [
      [
        'dataset',
        {
          help: 'The name of the dataset to publish'
        }
      ],
      [
        'version',
        {
          help: 'The version of the dataset'
        }      
      ]
    ],
    cmdFor: args => {
      // build command to dispatch
      return `./bin/bw make-default ${args.dataset} ${version}`
    },
    useStdOut: true
  },
  bwlist: {
    args: [
      [
        'dataset',
        {
          defaultValue: undefined,
          nargs: '?',
          help: 'The name of the dataset'
        }      
      ]
    ],
    cmdFor: args => {
      // build command to dispatch
      return `./bin/bw list ${args.dataset || ''}`
    },
    useStdOut: true
  },
  bwpurge: {
    args: [
      [
        'dataset',
        {
          help: 'The name of the dataset to purge'
        }
      ]
    ],
    cmdFor: args => {
      // build command to dispatch
      return `./bin/bw purge ${args.dataset}`
    },
    useStdOut: true
  }
}


function getCommand(command, argsString) {
  const spec = commands[command]
  if(! (spec && typeof spec.cmdFor === 'function')) {
    throw warning(`Unrecognized command: ${command}`)
  }
  const parser = spec.parser || new ArgumentParser({
    prog: `/${command}`,
    addHelp: false,
    description: 'Slack interface to load and manage datasets in BigWaffle',
    debug: true // this makes the parser throw exceptions instead of exiting the node process 
  })
  if (!spec.parser) {
    for (let arg of spec.args) {
      parser.addArgument(...arg)
    }
    spec.parser = parser
  }
  
  let cmdArgs
  try {
    cmdArgs = parser.parseArgs((decodeURIComponent(argsString || '').split(/\s+/)))
  } catch (parseErr) {
    const err = info(parseErr.message)
    err.helpText = parser.formatHelp()
    throw err
  }

  const cmd = new String(spec.cmdFor(cmdArgs))
  if (spec.useStdOut) {
    cmd.useStdOut = true
  }
  console.log(`use stdout: ${cmd.useStdOut}`)
  return cmd
}

function postResult(responseUrl, result) {
  console.log('Starting to POST result')
  if (typeof result === 'string') {
    result = {
      response_type: "ephimeral",
      text: result      
    }
  }
  return fetch(responseUrl, {
    method: 'post',
    body: JSON.stringify(result),
    headers: {
      'Content-Type': 'application/json'
    }
  })
  .then(res => {
    console.log('Finished posting result')
    if (!res.ok) {
      console.error('Could not send result to Slack')
    }
    return res
  })
}

let config

async function getConfig() {
  if (!config) {
    config = await loadConfig('slack.yaml')
  }
  return config
}

module.exports.do = async function (req) {
  let cmd, reply = {
    response_type: "ephimeral",
    text: `Slack command ${req.body.command} ${req.body.text} is being processed...`,
  }
  try {
    cmd = getCommand(req.body.command.slice(1), req.body.text)
  } catch (err) {
    console.info(reply.text)
    return errorReply(err)
  }

  const config = await getConfig()
  // check signature!
  try {
    verify(req, config)
  } catch (err) {
    console.log(err)
    if (process.env.NODE_ENV === "production") {
      // in production we stop here!
      return 'OK'
    }
  }
  console.info(`${req.body.user_name || req.body.user_id}: ${req.body.command} ${req.body.text}`)
  console.info(`Respond to ${req.body.response_url}`)
  // start execution of the command
  console.debug(cmd)
  exec(cmd.toString(), config) // this returns a Promise that executes the command on the BigWaffle master
  .then(result => {
    if (cmd.useStdOut && result.stdout) {
      postResult(req.body.response_url, result.stdout)
    }
  })
  .catch(err => {
    console.error(err)
  })
  return reply // send initial reply to Slack
}
