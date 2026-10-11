import { execFileSync } from 'node:child_process'
import { generateKeyPairSync, randomUUID, type KeyObject } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import https from 'node:https'
import { join } from 'node:path'
import jwt from 'jsonwebtoken'

export const ISSUER = 'https://kubernetes.default.svc.cluster.local'
export const AUDIENCE = 'my-api'

/**
 * A stand-in for the Kubernetes API server: it serves /openid/v1/jwks over
 * HTTPS with a self-signed CA, and only to callers that send the pod's
 * ServiceAccount token, like the real one does. It signs tokens shaped like
 * the ones the kubelet projects into pods.
 */
export class FakeCluster {
  readonly kid = randomUUID()
  readonly #privateKey: KeyObject
  readonly #publicKey: KeyObject
  #server?: https.Server
  #apiToken = `api-sa-token-${randomUUID()}`
  jwksRequests = 0
  jwksDenied = 0

  constructor(
    readonly saDir: string,
    readonly port: number
  ) {
    const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
    this.#privateKey = privateKey
    this.#publicKey = publicKey
  }

  async start() {
    mkdirSync(this.saDir, { recursive: true })
    const keyFile = join(this.saDir, 'tls.key')
    const certFile = join(this.saDir, 'ca.crt')
    execFileSync(
      'openssl',
      [
        'req',
        '-x509',
        '-newkey',
        'rsa:2048',
        '-nodes',
        '-days',
        '1',
        '-keyout',
        keyFile,
        '-out',
        certFile,
        '-subj',
        '/CN=localhost',
        '-addext',
        'subjectAltName=DNS:localhost,IP:127.0.0.1',
      ],
      { stdio: 'ignore' }
    )
    writeFileSync(join(this.saDir, 'token'), this.#apiToken)

    const jwks = {
      keys: [
        { ...this.#publicKey.export({ format: 'jwk' }), kid: this.kid, alg: 'RS256', use: 'sig' },
      ],
    }
    this.#server = https.createServer(
      { key: readFileSync(keyFile), cert: readFileSync(certFile) },
      (req, res) => {
        if (req.url !== '/openid/v1/jwks') {
          res.writeHead(404).end()
          return
        }
        this.jwksRequests++
        if (req.headers.authorization !== `Bearer ${this.#apiToken}`) {
          this.jwksDenied++
          res.writeHead(403).end()
          return
        }
        res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(jwks))
      }
    )
    await new Promise<void>((resolve) => this.#server!.listen(this.port, '127.0.0.1', resolve))
  }

  async stop() {
    await new Promise((resolve) => this.#server?.close(resolve))
  }

  /**
   * Rotate the API pod's own token, as the kubelet does
   */
  rotateApiToken() {
    this.#apiToken = `api-sa-token-${randomUUID()}`
    writeFileSync(join(this.saDir, 'token'), this.#apiToken)
  }

  /**
   * A projected ServiceAccount token, as mounted in a pod
   */
  token(
    options: {
      namespace?: string
      serviceAccount?: string
      audience?: string | string[]
      issuer?: string
      expiresIn?: number
      claims?: Record<string, unknown>
      key?: KeyObject
      kid?: string
    } = {}
  ) {
    const namespace = options.namespace ?? 'jobs'
    const serviceAccount = options.serviceAccount ?? 'worker'
    const now = Math.floor(Date.now() / 1000)
    return jwt.sign(
      {
        'aud': options.audience ?? [AUDIENCE],
        'iss': options.issuer ?? ISSUER,
        'sub': `system:serviceaccount:${namespace}:${serviceAccount}`,
        'iat': now,
        'nbf': now,
        'exp': now + (options.expiresIn ?? 3600),
        'kubernetes.io': {
          namespace,
          serviceaccount: { name: serviceAccount, uid: randomUUID() },
          pod: { name: `${serviceAccount}-7d9f8b6c5-x2v4q`, uid: randomUUID() },
        },
        ...options.claims,
      },
      options.key ?? this.#privateKey,
      { algorithm: 'RS256', keyid: options.kid ?? this.kid }
    )
  }

  /**
   * A legacy Secret-based token: another issuer, no expiration
   */
  legacyToken() {
    return jwt.sign(
      {
        'iss': 'kubernetes/serviceaccount',
        'sub': 'system:serviceaccount:jobs:worker',
        'kubernetes.io/serviceaccount/namespace': 'jobs',
        'kubernetes.io/serviceaccount/service-account.name': 'worker',
      },
      this.#privateKey,
      { algorithm: 'RS256', keyid: this.kid }
    )
  }
}

export const cluster = new FakeCluster('tmp/serviceaccount', 9443)
