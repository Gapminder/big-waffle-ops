const fetch = require('node-fetch')
const {OAuth2Client} = require('google-auth-library');
const { loadConfig, exec } = require('./utils')

function error(err) {
    // TODO: use bunyan for Stackdriver to do the logging
    if ((err.logLevel || 'error') == 'error') {
      console.error(err)
    } else {
      console.log(err.message)
    }
}

let oAuthClient

async function verify(req, config) {
  if (!oAuthClient)
    oAuthClient = new OAuth2Client(config)

  try {
    const ticket = await oAuthClient.verifyIdToken({
      idToken: token, //TODO: get the token out of the request, see: https://cloud.google.com/pubsub/docs/push#receiving_push_messages
      audience: CLIENT_ID  // Specify the CLIENT_ID of the app that accesses the backend
    })
  } catch (err) {
    err.logLevel = 'warn'
    throw err
  }
}

const StateMap = {
  QUEUED: 'pending',
  WORKING: 'pending',
  SUCCESS: 'success',
  FAILURE: 'failure',
  INTERNAL_ERROR: 'error',
  TIMEOUT: 'error',
  CANCELLED: 'error'
}

class BuildEvent {
  constructor (req) {
    const event = JSON.parse(new Buffer(req.body.data, 'base64').toString())
    Object.assign(this, event)
  }

  get branch () {
    try {
      return this.source.repoSource.branchName
    } catch (err) {
      return undefined
    }
  }

  get commit () {
    try {
      return this.sourceProvenance.resolvedRepoSource.commitSha
    } catch (err) {
      return undefined
    }
  }

  get repo () {
    try {
      return this.source.repoSource.projectId
    } catch (err) {
      return undefined
    }
  }

  get gitState () {
    try {
      return StateMap[this.status]
    } catch (err) {
      return undefined
    }
  }
}

let config

async function getConfig() {
  if (!config) {
    config = await loadConfig('gcbuilt.yaml')
  }
  return config
}

module.exports.do =  async function (req) {
  try {
    const config = await getConfig()
    //TODO: verify the request to ensure it's from Google Cloud PubSub
    const build = new BuildEvent(req)
    console.debug(JSON.stringify(build))
    
    // update commit status with a simple POST to GitHub API
    if (build.repo && build.commit && build.gitState) {
      await fetch(`https://api.github.com/repos/Gapminder/${build.repo}/statuses/${build.commit}`, {
        method: 'post',
        body: JSON.stringify({
          state: build.gitState,
          target_url: build.logUrl,
          context: 'ci/google-cloud'
        }),
        headers: {
          'Authorization': `token ${config.GitHubToken}`,
          'Content-Type': 'application/json'
        }
      })
      .then(res => {
        if (!res.ok) {
          console.error('Could not update GitHub status')
        }
        return config
      })
    }

    // prepare command to run on master to update the code 
    if (['success'].includes(build.gitState) && build.branch === 'production') {
      await exec('cd $BIG_WAFFLE_HOME && git pull', config)
      console.info('executed update of master')
    }
    return 'OK'
  } catch (err) {
    console.debug(req.body ? req.body : req)
    error(err)
    return 'No action taken'
  }
}