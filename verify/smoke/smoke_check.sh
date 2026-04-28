#!/usr/bin/env sh
node "$(dirname "$0")/smoke_check.js" "$@"
exit $?