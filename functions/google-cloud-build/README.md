## Installation

Deploy with:

    gcloud functions deploy gcbuilt --runtime nodejs8 --region europe-west1 --set-env-vars CONFIG_FILE=github.yaml --source functions/google-cloud-build --entry-point processEvent --trigger-topic=cloud-builds
