const crypto = require('crypto')
const { datasetName, info, warning, getConfig, exec } = require('bw-cf-utils')

function error(err, res, content='OK') {
    // TODO: use bunyan for Stackdriver to do the logging
    if ((err.logLevel || 'error') == 'error') {
      console.error(err)
    } else {
      console.log(err.message)
    }
    res.send(content)
}

function verify (req, config) {
  // check signature!
  const signature = req.get('X-Hub-Signature')
  if (!signature) {
    throw warning(`GitHub Signature missing`)
  }
  let hmac, expectedHMAC
  try {
    expectedHMAC = signature.split('=', 2) // cipher,hex digest
    hmac = crypto.createHmac(expectedHMAC[0], config.githubSecret)
    const rawBody = JSON.stringify(req.body)
    hmac.update(rawBody)
  } catch (signErr) {
    throw warning('GitHub signature could not be verified')
  }
  if (hmac.digest('hex') !== expectedHMAC[1]) {
    throw warning('GitHub signature was not correct')
  }
}

const actions = {
  closed: req => {
    let name, version
    const branch = req.query.branch || 'master'
      // check if the PR was merged, and the merge is to correct branch
      name = req.body.repository.name
      
      if (req.body.pull_request.base.ref !== branch) {
        throw info(`GitHub PR on ${name} was an irrelevant branch: not ${branch} but: ${req.body.pull_request.base.ref}`)
      }
      
      if (req.body.pull_request.merged !== true) {
        throw info(`GitHub PR on ${name} was not merged. No loading deemed necessary`)
      }
      
      name = datasetName(name)
      
      if (req.query.dateversion === undefined && req.body.pull_request.merge_commit_sha) {
        version = req.body.pull_request.merge_commit_sha.slice(0,7) //use the short git hash
      }
      
      // build command to dispatch, should be like "./loadgit.sh -d v0 https://github.com/Gapminder/big-waffle-ddf-testdata.git test"
      const ddfDirectory = req.query.ddfdir
      const gitUrl = req.body.repository.clone_url
      return `nohup ./bin/loadgit -b ${branch}${ddfDirectory ? ` -d ${ddfDirectory} `: ''}${version ? ` -v ${version} `: ' '}${gitUrl} ${name} > git-load.log &`
  }
}

exports.load = function (req, res) {
  let cmd, content = 'OK'
  try {
    if (!req.body.pull_request) {
      throw info(`GitHub trigger was not for a Pull Request`)
    }
    
    const action = actions[req.body.action]
    if (!action) {
      throw info(`GitHub PR on ${req.body.repository.name} was "${req.body.action}". No further action was taken.`)
    }
    cmd = action(req)
  } catch (err) {
    error(err, res, content)
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
    // execute the command
    return exec(cmd, config, res, reply)
  })
  .catch(err => {
    error(err, res, content)
  })
}