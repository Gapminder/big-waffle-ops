## Installation

### Deploy Google Cloud function

with:

    gcloud functions deploy github-load --runtime nodejs8 --region europe-west1 --service-account github@big-waffle.iam.gserviceaccount.com --source functions/github --entry-point load --trigger-http

### Set up trigger

In GitHub repository with DDF data create a webhook for pull requests that will post to this url:

    https://europe-west1-big-waffle.cloudfunctions.net/github-load

You may add URL parameters:
- `branch` to indicate which branch should be loaded, defaults to 'master'
- `ddfdir` to indicate a directory within the repo that is the "root" of the dataset, i.e. where the datapackage.json is located
- `dateversion` (no value) to request that datasets will be given a version in BigWaffle that reflects the load date. If absent the version will be the short SHA of the commit.

Here's an example that uses all parameters:

    https://europe-west1-big-waffle.cloudfunctions.net/github-load?branch=production&ddfdir=v0&dateversion

