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
    const build = eventToBuild(event.data.data)
    console.log(JSON.stringify(build))
    // QUEUED, WORKING, SUCCESS, FAILURE, INTERNAL_ERROR, TIMEOUT, CANCELLED, 'FAILURE', 'INTERNAL_ERROR', 'TIMEOUT'
    if (! ['SUCCESS'].includes(build.status)) {
      return 'No action taken'
    }
  
    cmd = 'cd $BIG_WAFFLE_HOME && git pull'
  } catch (err) {
    error(err)
    return 'No action taken'
  }

  getConfig()
  .then(config => {
    // check signature!
    try {
      verify(req, config)
    } catch (err) {
      console.log(err)
      return 'No action taken' 
    }
    // execute the command
    return exec(cmd, config)
  })
  .catch(err => {
    error(err)
    return 'No action taken'
  })
}