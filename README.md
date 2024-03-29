# BigWaffleOps

This BigWaffleOps repository contains various components that can be used to support DevOps for managing a BigWaffle deployment.

[Service](#service)  
[Scripts](#scripts)  
[YAML configuration file](#yaml-configuration-file)  
[Slack commands](#slack-commands)  
[Workflow](#workflow)  
[Troubleshooting](#troubleshooting)  
[Google Cloud Functions](#coogle-cloud-functions)  

## Service

The [/service](/service) package is a HTTP service that can be used to act upon triggers from 3rd party services. Currently it only supports [Slack commands](https://api.slack.com/slash-commands). The top level Dockerfile builds a NodeJs image that exposes the service on port 8888.

## Scripts

The service essentially translates a trigger into a command for the BigWaffle CLI. To make development slightly easier the [/scripts](/scripts) directory contains auxiliary scripts that should be installed on the `big-waffle-master` instance.

## YAML configuration file

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

## Slack commands

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

## Workflow

1. User sends a command message in `big-waffle` channel on Slack, e.g. `/bwload -N fasttrackQA --publish  https://github.com/open-numbers/ddf--gapminder--fasttrack.git autogenerated`
2. The command gets interpreted by the BigWaffle slack app, which Angie, Fredrik and dev@gapminder.org have access to and can add others as Collaborators. Note you need to look in Slack apps --> Build --> Your apps, not in the installed apps of the gapminder workspace.
3. The slack app sends the requests further to the endpoints configured in the slack app slash commands, which points to the IP address used by the load balancer big-waffle-ops-test (this is the production endpoint, not a test endpoint)
4. big-waffle-ops-test load balancer forwards the request to the internal kubernetes big-waffle-ops service which runs the code auto-deployed on github master branch push of the big-waffle-ops repo
5. logging is made in gcp on https://console.cloud.google.com/kubernetes/deployment/europe-north1-a/ops-cluster/default/bigwaffle-ops/logs?project=big-waffle
the service's code then loads config from a gcp bucket (includes the ssh key and ip address to big-waffle-master) and ssh-exec's commands on big-waffle-master as user "github". The user name is important because MariaDB has exactly that user configured
6. the script that gets run by the load command is in /gapminders/github/bin/loadgit
7. big-waffle-master runs a local database, connects to it locally and loads the data using the cli.js code, see big-waffle repo for more info

## Troubleshooting

### Can not SSH to `big-waffle-master` instance from web interface (stuck on transferring SSH keys)
Check logs inside the instance properties, it is possible that the instance ran out of space. 
Expand the volume the instance is using in Google cloud storage. 
Restart the instance so that it can see the new volume size. This may change IP address of the instance and reset `/gapminders/github/.ssh/authorized_keys` file 

### Can not SSH to `big-waffle-master` instance from a laptop
One needs gcloud SDK to do that. Install SDK, log in with `gcloud auth login`. 
Then run `gcloud compute ssh --zone "europe-north1-a" "big-waffle-master" --project "big-waffle"`. 
Alternatively `gcloud compute ssh big-waffle-master` if zone and project were set up in SDK during the login process.  

### Can not SSH to `big-waffle-master` instance from `big-waffle-ops` used by Slack integration workflow
- `slack.yaml` should have the correct ID address of the `big-waffle-master` instance (could be changed upon restart)
- `slack.yaml` should have the correct RSA private key in PEM format
- `/gapminders/github/.ssh/authorized_keys` should have the correct RSA public key
- The public key should probably also be listed in the web interface, in SSH properties of big-waffle-master instance, with "github" as user

### SSH seccret key looks different from the one in slack.yaml file
Convert openssh key to PEM format

### Where are the bw-ops logs?
[link](https://console.cloud.google.com/kubernetes/deployment/europe-north1-a/ops-cluster/default/bigwaffle-ops/logs?project=big-waffle): Gcloud web interface --> Kubernetes --> Workloads --> bigwaffle-ops --> LOGS

### How to load in datasets directly, bypassing slack integration?
See example [here](https://github.com/Gapminder/big-waffle/blob/production/README.md#usage)

### How to switch to github user without a password?
```
sudo su
su github
```

### Where is the home directory of github user on big-waffle-master instance?
/gapminders/github/

## Google Cloud Functions

The Google Cloud Functions are **deprecated**, and will be moved into the service. 
