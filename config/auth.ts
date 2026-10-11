import { readFileSync } from 'node:fs'
import https from 'node:https'
import { defineConfig } from '@adonisjs/auth'
import { jwtGuard } from '@maximemrf/adonisjs-jwt'
import type { InferAuthenticators, InferAuthEvents, Authenticators } from '@adonisjs/auth/types'
import env from '#start/env'
import { ServiceAccountUserProvider } from '#auth/service_account_user_provider'

/**
 * The ServiceAccount files Kubernetes mounts in every pod: the cluster CA
 * and the pod's own token, needed to read the API server's JWKS
 */
const SA_DIR = env.get('K8S_SA_DIR', '/var/run/secrets/kubernetes.io/serviceaccount')

const authConfig = defineConfig({
  default: 'k8s',
  guards: {
    k8s: jwtGuard({
      provider: new ServiceAccountUserProvider(),
      jwks: {
        jwksUri: env.get('K8S_JWKS_URI', 'https://kubernetes.default.svc/openid/v1/jwks'),
        // the token is read on each fetch: the kubelet rotates it
        fetcher: (uri) =>
          new Promise((resolve, reject) => {
            https
              .get(
                uri,
                {
                  ca: readFileSync(`${SA_DIR}/ca.crt`),
                  headers: { Authorization: `Bearer ${readFileSync(`${SA_DIR}/token`, 'utf8')}` },
                },
                (res) => {
                  let body = ''
                  res.on('data', (chunk) => (body += chunk))
                  res.on('end', () => {
                    if (res.statusCode !== 200) {
                      return reject(new Error(`JWKS fetch failed with status ${res.statusCode}`))
                    }
                    resolve(JSON.parse(body))
                  })
                }
              )
              .on('error', reject)
          }),
      },
      issuer: env.get('K8S_ISSUER', 'https://kubernetes.default.svc.cluster.local'),
      audience: env.get('K8S_AUDIENCE', 'my-api'),
      getUserId: (payload) => payload.sub,
    }),
  },
})

export default authConfig

declare module '@adonisjs/auth/types' {
  export interface Authenticators extends InferAuthenticators<typeof authConfig> {}
}
declare module '@adonisjs/core/types' {
  interface EventsList extends InferAuthEvents<Authenticators> {}
}
