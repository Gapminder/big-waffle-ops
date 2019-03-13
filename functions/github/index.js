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

exports.load = function (req, res) {
  let result = 'OK'
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
    name = name.replace(/^ddf-+/, '')
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
    const cmd = `./loadgit.sh -b ${branch}${ddfDirectory ? ` -d ${ddfDirectory} `: ''}${version ? ` -v ${version} `: ' '}${gitUrl} ${name} &`
    console.log(cmd)
    result = cmd
    
    // TODO: ssh into the big-waffle master and execute the command
  } catch (err) {
    // TODO: use bunyan for Stackdriver to do the logging
    if ((err.logLevel || 'error') == 'error') {
      console.error(err)
    } else {
      console.log(err)
    }
  } finally {
    res.send(result)
  }
}