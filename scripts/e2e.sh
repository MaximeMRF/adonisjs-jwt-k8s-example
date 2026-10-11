#!/bin/sh
# the client Jobs retry until the API answers, so they can start first
# Deploys the API and the three client Jobs, then checks each Job got the
# status it expects: 200 for worker, 401 for intruder and default-token.
set -eu

kubectl apply -k k8s
kubectl -n default set image deployment/my-api api="${IMAGE:-ghcr.io/maximemrf/adonisjs-jwt-k8s-example:latest}"
kubectl -n default patch deployment my-api -p '{"spec":{"template":{"spec":{"containers":[{"name":"api","imagePullPolicy":"IfNotPresent"}]}}}}'
kubectl -n default rollout status deployment/my-api --timeout=120s

status=0
for job in worker intruder default-token; do
  if kubectl -n jobs wait --for=condition=complete "job/$job" --timeout=90s >/dev/null 2>&1; then
    echo "ok   $job: $(kubectl -n jobs logs "job/$job")"
  else
    echo "FAIL $job: $(kubectl -n jobs logs "job/$job" 2>&1)"
    status=1
  fi
done

if [ "$status" -ne 0 ]; then
  kubectl -n default logs deployment/my-api --tail=50
fi
exit "$status"
