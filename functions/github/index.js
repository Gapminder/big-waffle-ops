const node_ssh = require('node-ssh')

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

let privateSSHKey
function getSSHKey () {
  return new Promise((resolve, reject) => {
    if (privateSSHKey) {
      resolve(privateSSHKey)
    } else {
      const GCS = require('@google-cloud/storage').Storage
      const { WritableStream } = require('memory-streams')
      
      const Bucket = (new GCS()).bucket(process.env['SSH_BUCKET'] || 'org-gapminder-big-waffle-functions')
      const keyFile = Bucket.file(process.env['SSH_FILE'] || 'id_rsa')
      const buffer = new WritableStream()
      
      try {
        keyFile.createReadStream()
        .on('error', err => {
          console.error(err)
          reject(err)
        })
        .on('end', () => {
          privateSSHKey = buffer.toString()
          resolve(privateSSHKey)
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
  let cmd, content = 'OK'
  try {
    // check if action is 'closed', the PR was merged, and the merge is to 'master' (or the BW_MASTER_BRANCH)
    if (!req.body.pull_request) {
      throw info(`GitHub trigger was not for a Pull Request`)
    }
    if (req.body.action !== 'closed') {
      throw info(`GitHub PR was ${req.body.action}. No loading deemed necessary`)
    }
    const branch = req.query.branch || 'master'
    if (req.body.pull_request.base.ref !== branch) {
      throw info(`GitHub trigger was for a PR on an irrelevant branch: not ${branch} but: ${req.body.pull_request.base.ref}`)
    }
    // TODO: check that PR was merged => pull_request.merged === true
    
    // TODO: check signature!
    
    /* 
     * trim the name, we remove ddf-[-], remove gapminder-[-], 
     * remove big-waffle-, replace open_numbers-[-] with on-
     */
    let name = req.body.pull_request.repository.name.toLowerCase()
    name = name.replace(/ddf-+/, '')
    name = name.replace(/gapminder-+/, '')
    name = name.replace(/big-*waffle-+/, '')
    name = name.replace(/open_numbers-+/, 'on-')
    
    let version
    if (req.query.dateversion === undefined && req.body.pull_request.merge_commit_sha) {
      version = req.body.pull_request.merge_commit_sha.slice(0,7) //use the short git hash
    }
    
    // build command to dispatch, should be like "./loadgit.sh -d v0 https://github.com/Gapminder/big-waffle-ddf-testdata.git test"
    const ddfDirectory = req.query.ddfdir
    const gitUrl = req.body.pull_request.repository.clone_url
    cmd = `nohup ./bin/loadgit.sh -b ${branch}${ddfDirectory ? ` -d ${ddfDirectory} `: ''}${version ? ` -v ${version} `: ' '}${gitUrl} ${name} > git-load.log &`
  } catch (err) {
    // TODO: use bunyan for Stackdriver to do the logging
    if ((err.logLevel || 'error') == 'error') {
      console.error(err)
    } else {
      console.log(err)
    }
  }  
  // ssh into the big-waffle master and execute the command
  getSSHKey()
    .then(privateKey => {
      const ssh = new node_ssh()
      return ssh.connect({
        host: process.env.BW_MASTER_IP || '35.228.3.37',
        username: 'github',
        privateKey
      })
    })
    .then(shell => {
      shell.exec(cmd)
    })
    .then(() => {
      res.send(content)     
    })
    .catch(err => {
      console.error(err)
      res.send(content)     
    })
}