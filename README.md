# BigWaffleOps

This BigWaffleOps repository contains various components that can be used to support DevOps for managing a BigWaffle deployment.

## /service

The [/service](/service) package is a HTTP service that can be used to act upon triggers from 3rd party services. Currently it only supports [Slack commands](https://api.slack.com/slash-commands). The top level Dockerfile builds a NodeJs image that exposes the service on port 8888.

### scripts

The service essentially translates a trigger into a command for the BigWaffle CLI. To make development slightly easier the [/scripts](/scripts) directory contains auxiliary scripts that should be installed on the BigWaffle *master*.

### yaml configuration file

The Slack service uses a **YAML configuration file**, the current version assumes that the file name is `slack.yaml` and that this file is available in a Google Cloud Storage bucket the name of which should be set in the environment variable: `CONFIG_BUCKET`, which defaults to `org-gapminder-big-waffle-functions`.
See the `loadConfig` function in the [service/utils](/service/utils.js) module.

The configuration file should contain the following entries: 
- **bwMaster**: the domain name, or ip address of the BigWaffle master
- **privateKey**: the complete private key to log into the BigWaffle master
- **user**: the user name to use to log into the BigWaffle master. This user should have (symbolic links to) the [/scripts](/scripts) in directory ```~/bin```, and the correct [environment variables](big-waffle-env.sh) for the scripts in ```~/.bashrc```.
- **signingSecret**: the [Signing Secret](https://api.slack.com/docs/verifying-requests-from-slack) generated for your Slack application.

Your slack.yaml should look like:

      bwMaster: <ipaddress or domain name>
      user: <big-waffler username>
      privateKey: |
        -----BEGIN RSA PRIVATE KEY-----
        ....
        ....
        ....
        ....
        -----END RSA PRIVATE KEY-----
      signingSecret: <signing secret generated by Slack>

### Slack commands

**/bwlist** ```[<dataset>]```

List all versions of all datasets. Provide a dataset name to see all versions of (only) that dataset.

Example: `/bwlist SG`


**/bwload** ```[[-N | --name] <name>] [--publish] [-D | --dateversion] [--ddfdir <ddfdirectory>]``` **```<gitCloneUrl>```** ```[<branch>]```

Load (a new version of) a dataset into BigWaffle. This can take 1-60 minutes!

Example:  `/bwload -N SG https://github.com/open-numbers/ddf--gapminder--systema_globalis.git`


**/bwpublish ```<dataset>```**

Publish the most recently loaded version of a dataset. This unsets any default version, which means that the most recent version will be served by default.

Example: `/bwpublish SG`


**/bwdefault ```<dataset> <version>```**

Make a given version of a dataset the default version. Use this to “revert” to an earlier version.

Example: `/bwdefault SG 2019032501`


**/bwpurge ```<dataset>```**

Remove old versions of a given dataset. This will remove versions that were loaded before the current default version, except the version loaded right before the current default.

Example: `/bwpurge SG`

## Google Cloud Functions

The Google Cloud Functions are **deprecated**, and will be moved into the service. 
