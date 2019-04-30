const sshExec = require('ssh-exec')
const YAML = require('yaml')

module.exports.warning = function (message, fileName, lineNumber) {
  const warning = Error(message, fileName, lineNumber)
  warning.logLevel = 'info'
  return warning
}
module.exports.info = function (message, fileName, lineNumber) {
  const info = Error(message, fileName, lineNumber)
  info.logLevel = 'info'
  return info
}

module.exports.datasetName = function (aString) {
  /* 
   * trim the name, we remove ddf-[-], remove gapminder-[-], 
   * remove big-waffle-, replace open_numbers-[-] with on_,
   * remove .git
   */
  let name = aString.toLowerCase()
  name = name.replace(/ddf-+/, '')
  name = name.replace(/gapminder-+/, '')
  name = name.replace(/big-*waffle-+/, '')
  name = name.replace(/open_numbers-+/, 'on_')
  name = name.replace(/\.git$/, '')
  return name  
}

module.exports.loadConfig = function (path) {
  return new Promise((resolve, reject) => {
    const GCS = require('@google-cloud/storage').Storage
    const { WritableStream } = require('memory-streams')
    
    const Bucket = (new GCS()).bucket(process.env['CONFIG_BUCKET'] || 'org-gapminder-big-waffle-functions')
    const keyFile = Bucket.file(path)
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
  })
}

module.exports.exec = function (cmd, config, res, content = 'OK') {
  /*
  * Return a Promise that will ssh into the big-waffle master 
  * and execute the command and resolve to an object with the
  * stdout and stderror of the server.
  * 
  * If a (http) res(ponse) is provided the provided content will
  * be send to the response.
  */
  const sshConfig = {
    user: config.user || process.env.FUNCTION_NAME.toLowerCase(),
    host: config.bwMaster,
    key: config.privateKey  
  }
  return new Promise((resolve, reject) => {
    sshExec(cmd, sshConfig, function (err, stdout, stderr) {
      if (res) res.send(content)
      if (err) {
        reject(err)
      } else {
        resolve({ stdout, stderr })
      }
    })  
  })
}