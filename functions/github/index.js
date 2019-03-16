const crypto = require('crypto')
const node_ssh = require('node-ssh')
const YAML = require('yaml')

function warning (message, fileName, lineNumber) {
  const warning = Error(message, fileName, lineNumber)
  warning.logLevel = 'info'
  return warning
}
function info (message, fileName, lineNumber) {
  const info = Error(message, fileName, lineNumber)
  info.logLevel = 'info'
  return info
}

let config
function getConfig () {
  return new Promise((resolve, reject) => {
    if (config) {
      resolve(config)
    } else {
      const GCS = require('@google-cloud/storage').Storage
      const { WritableStream } = require('memory-streams')
      
      const Bucket = (new GCS()).bucket(process.env['CONFIG_BUCKET'] || 'org-gapminder-big-waffle-functions')
      const keyFile = Bucket.file(process.env['CONFIG_FILE'] || 'github.yaml')
      const buffer = new WritableStream()
      
      try {
        keyFile.createReadStream()
        .on('error', err => {
          console.error(err)
          reject(err)
        })
        .on('end', () => {
          config = YAML.parse(buffer.toString())
          resolve(config)
        })
        .pipe(buffer)
      } catch (err) {
        console.error(err)
        reject(err)
      }
    }
  })
}
  
exports.load = function (req, res) {
  let cmd, content = 'OK', name, version
  const branch = req.query.branch || 'master'
    try {
    // check if action is 'closed', the PR was merged, and the merge is to 'master' (or the BW_MASTER_BRANCH)
    if (!req.body.pull_request) {
      throw info(`GitHub trigger was not for a Pull Request`)
    }
    
    name = req.body.repository.name
    
    if (req.body.action !== 'closed') {
      throw info(`GitHub PR on ${name} was "${req.body.action}", not "closed". No loading deemed necessary`)
    }
    
    if (req.body.pull_request.base.ref !== branch) {
      throw info(`GitHub PR on ${name} was an irrelevant branch: not ${branch} but: ${req.body.pull_request.base.ref}`)
    }
    
    if (req.body.pull_request.merged !== true) {
      throw info(`GitHub PR on ${name} was not merged. No loading deemed necessary`)
    }
  } catch (err) {
    // TODO: use bunyan for Stackdriver to do the logging
    if ((err.logLevel || 'error') == 'error') {
      console.error(err)
    } else {
      console.log(err.message)
    }
    res.send(content)
    return
  }

  getConfig()
  .then(config => {
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

    /* 
     * trim the name, we remove ddf-[-], remove gapminder-[-], 
     * remove big-waffle-, replace open_numbers-[-] with on_
     */
    name = name.toLowerCase()
    name = name.replace(/ddf-+/, '')
    name = name.replace(/gapminder-+/, '')
    name = name.replace(/big-*waffle-+/, '')
    name = name.replace(/open_numbers-+/, 'on_')
    
    if (req.query.dateversion === undefined && req.body.pull_request.merge_commit_sha) {
      version = req.body.pull_request.merge_commit_sha.slice(0,7) //use the short git hash
    }
    
    // build command to dispatch, should be like "./loadgit.sh -d v0 https://github.com/Gapminder/big-waffle-ddf-testdata.git test"
    const ddfDirectory = req.query.ddfdir
    const gitUrl = req.body.repository.clone_url
    cmd = `nohup ./bin/loadgit -b ${branch}${ddfDirectory ? ` -d ${ddfDirectory} `: ''}${version ? ` -v ${version} `: ' '}${gitUrl} ${name} > git-load.log &`

    // ssh into the big-waffle master and execute the command
    const ssh = new node_ssh()
    return ssh.connect({
      host: config.bwMaster,
      username: 'github',
      privateKey: config.privateKey
    })
  })
  .then(shell => {
    shell.exec(cmd)
  })
  .then(() => {
    res.send(content)     
  })
  .catch(err => {
    // TODO: use bunyan for Stackdriver to do the logging
    if ((err.logLevel || 'error') == 'error') {
      console.error(err)
    } else {
      console.log(err.message)
    }
    res.send(content)     
  })
}