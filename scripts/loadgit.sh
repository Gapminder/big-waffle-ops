#!/bin/bash
usage() {
    echo 'loadgit [ -h | --help ] | [ -b | --branch branchname ] [-v | --version version ] [ -d | --dir ddfDirectory ] git_url dataset_name'
}

bigwaffleDir=${BIG_WAFFLE_HOME:-"."}
workingDir=${LOAD_GIT_DIR:-"./tmp"}
branch="master"
subDir=
version=

while [ $# -gt 2 ]; do
    case $1 in
        -b | --branch )         shift
                                branch=$1
                                ;;
        -d | --dir )            shift
                                subDir=$1
                                ;;
        -v | --version )        shift
                                version=$1
                                ;;
        -h | --help )           usage
                                exit
                                ;;
        * )                     usage
                                exit 1
    esac
    shift
done
if [ $# -lt 2 ]; then
    usage
    exit 1
fi
gitUrl=$1
name=$2

node ${bigwaffleDir}/src/cli.js list > /dev/null

if [ $? -gt 0 ] ; then
    echo "BigWaffle CLI setup is not correct. Check PATH and ENVIRONMENT."
    exit 1
fi
if ! [ -d $workingDir ] ; then
    mkdir $workingDir
fi
if ! [ -d $workingDir ] ; then
    echo "Working directory $workingDir does not exist"
    exit 1
fi
git clone -q -b $branch --single-branch --depth 1 $gitUrl ${workingDir}/${name}
if [ $? -gt 0 ] ; then
    echo "Could not clone $gitUrl into ${workingDir}/${name}"
    exit 1
fi
ddfDirectory=${workingDir}/${name}
if [ -n $subDir ] ; then 
    ddfDirectory=${ddfDirectory}/${subDir}
fi
node ${bigwaffleDir}/src/cli.js load -d $ddfDirectory $name $version
if [ $? -gt 0 ] ; then
    echo "Loading $gitUrl as $name failed"
    rm -Rf ${workingDir}/${name}
    exit 1
fi
rm -Rf ${workingDir}/${name}
node ${bigwaffleDir}/src/cli.js list | grep $name
exit 0
