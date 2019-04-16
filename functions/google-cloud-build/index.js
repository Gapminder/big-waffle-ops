const { getConfig, exec } = require('bw-cf-utils')

function error(err) {
    // TODO: use bunyan for Stackdriver to do the logging
    if ((err.logLevel || 'error') == 'error') {
      console.error(err)
    } else {
      console.log(err.message)
    }
}

const eventToBuild = (data) => {
  return JSON.parse(new Buffer(data, 'base64').toString());
}

exports.processEvent =  event => {
  let cmd   

  try {
    const build = eventToBuild(event.data)
    console.debug(JSON.stringify(build))
    // QUEUED, WORKING, SUCCESS, FAILURE, INTERNAL_ERROR, TIMEOUT, CANCELLED, 'FAILURE', 'INTERNAL_ERROR', 'TIMEOUT'
    if (['SUCCESS'].includes(build.status) 
        && build.source.repoSource 
        && build.source.repoSource.branchName === 'production') {
      cmd = 'cd $BIG_WAFFLE_HOME && git pull'
    }
    if (!cmd) {
      return 'No action required'
    }
  } catch (err) {
    console.debug(event.data)
    error(err)
    return 'No action taken'
  }

  getConfig()
  .then(config => {
    // execute the command
    return exec(cmd, config)
  })
  .catch(err => {
    error(err)
    return 'No action taken'
  })
}