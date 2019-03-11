#!/bin/bash
backupsDir="/gapminders/backups"

if [ -d ${backupsDir}/in_progress ] ; then
    echo 'Backup /in_progress directory exists. Please check!'
    exit 1
fi
mkdir ${backupsDir}/in_progress
chmod g+w ${backupsDir}/in_progress
/usr/bin/mariabackup --backup --target-dir ${backupsDir}/in_progress --user=backup --password=${DB_BACKUP_PWD} &&  /usr/bin/mariabackup --prepare --target-dir ${backupsDir}/in_progress
if [ $? -eq 0 ]; then
    echo 'Backup successfull'
else
    exit 2
fi
if [ -d ${backupsDir}/previous ] ; then
    rm -Rf ${backupsDir}/previous
fi
if [ -d ${backupsDir}/latest ] ; then
    mv ${backupsDir}/latest ${backupsDir}/previous
fi
mv ${backupsDir}/in_progress ${backupsDir}/latest
exit 0

