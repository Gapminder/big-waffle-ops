## Installation

Deploy with:

    gcloud functions deploy gcbuilt --runtime nodejs8 --region europe-west1 --set-env-vars --source functions/google-cloud-build --entry-point processEvent --trigger-topic=cloud-builds --service-account github@big-waffle.iam.gserviceaccount.com
