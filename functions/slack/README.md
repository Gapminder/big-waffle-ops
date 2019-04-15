## Installation

Deploy the Google Cloud function with:

    gcloud functions deploy slack --runtime nodejs8 --region europe-west1 --set-env-vars CONFIG_FILE=slack.yaml --source functions/slack --entry-point do --trigger-http --service-account github@big-waffle.iam.gserviceaccount.com