const fetch = require('node-fetch')
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

const StatusMap = {
  QUEUED: 'pending',
  WORKING: 'pending',
  SUCCESS: 'success',
  FAILURE: 'failure',
  INTERNAL_ERROR: 'error',
  TIMEOUT: 'error',
  CANCELLED: 'error'
}

exports.processEvent =  event => {
  let cmd, updateGitHubStatus 

  try {
    const build = eventToBuild(event.data)
    console.debug(JSON.stringify(build))
    
    // update commit status with simple POSTs like:
    let repo, commit, status
    try {
      repo = build.source.repoSource.projectId
      commit = build.sourceProvenance.resolvedRepoSource.commitSha
      status = StatusMap[build.status]
    } catch (err) {
      console.info(err)
    }
    if (repo && commit && status) {
      updateGitHubStatus = (config) => {
        fetch(`https://api.github.com/repos/Gapminder/${repo}/statuses/${commit}`, {
          method: 'post',
          body: JSON.stringify({
            state: status,
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
            console.err('Could not update GitHub status')
          }
          return config
        })
      }
    }

    // prepare command to run on master to update the code 
    if (['SUCCESS'].includes(build.status) 
        && build.source.repoSource 
        && build.source.repoSource.branchName === 'production') {
      cmd = 'cd $BIG_WAFFLE_HOME && git pull'
    }
  } catch (err) {
    console.debug(event.data)
    error(err)
    return 'No action taken'
  }

  getConfig()
  .then(config => {
    return updateGitHubStatus ? updateGitHubStatus(config) : Promise.resolve(config)
  })
  .then(config => {
    if (cmd) {
      // execute the command
      return exec(cmd, config)
    } else {
      return 'No action required'
    }
  })
  .catch(err => {
    error(err)
    return 'No action taken'
  })
}