#!/bin/sh
# The k8s guard doesn't use APP_KEY: it verifies tokens with the cluster's
# public keys. AdonisJS still needs one to boot, so generate it when unset.
if [ -z "$APP_KEY" ]; then
  APP_KEY=$(node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))")
  export APP_KEY
fi
exec "$@"
