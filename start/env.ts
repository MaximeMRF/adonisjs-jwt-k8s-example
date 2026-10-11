/*
|--------------------------------------------------------------------------
| Environment variables service
|--------------------------------------------------------------------------
|
| The `Env.create` method creates an instance of the Env service. The
| service validates the environment variables and also cast values
| to JavaScript data types.
|
*/

import { Env } from '@adonisjs/core/env'

export default await Env.create(new URL('../', import.meta.url), {
  // Node
  NODE_ENV: Env.schema.enum(['development', 'production', 'test'] as const),
  PORT: Env.schema.number(),
  HOST: Env.schema.string({ format: 'host' }),
  LOG_LEVEL: Env.schema.string(),

  // App
  APP_KEY: Env.schema.secret(),
  APP_URL: Env.schema.string({ format: 'url', tld: false }),

  // Kubernetes ServiceAccount tokens (defaults: kubeadm and k3s, from inside the cluster)
  K8S_JWKS_URI: Env.schema.string.optional({ format: 'url', tld: false }),
  K8S_ISSUER: Env.schema.string.optional(),
  K8S_AUDIENCE: Env.schema.string.optional(),
  K8S_SA_DIR: Env.schema.string.optional(),
})
