import { generateKeyPairSync } from 'node:crypto'
import { test } from '@japa/runner'
import { cluster, ISSUER } from '#tests/helpers/fake_cluster'

test.group('ServiceAccount tokens', () => {
  test('accept a projected token of an allowed ServiceAccount', async ({ client }) => {
    const response = await client.post('/internal/jobs').bearerToken(cluster.token())

    response.assertStatus(200)
    response.assertBody({ calledBy: 'worker' })
  })

  test('fetch the JWKS once, with the pod token, then use the cache', async ({
    client,
    assert,
  }) => {
    for (let i = 0; i < 3; i++) {
      const response = await client.post('/internal/jobs').bearerToken(cluster.token())
      response.assertStatus(200)
    }

    assert.equal(cluster.jwksRequests, 1)
    assert.equal(cluster.jwksDenied, 0)
  })

  test('accept another allowed ServiceAccount', async ({ client }) => {
    const token = cluster.token({ namespace: 'billing', serviceAccount: 'billing-api' })
    const response = await client.post('/internal/jobs').bearerToken(token)

    response.assertStatus(200)
    response.assertBody({ calledBy: 'billing' })
  })

  test('reject a ServiceAccount that is not in the allowlist', async ({ client }) => {
    const token = cluster.token({ namespace: 'jobs', serviceAccount: 'intruder' })
    const response = await client.post('/internal/jobs').bearerToken(token)

    response.assertStatus(401)
  })

  test('reject a default token, whose audience is the API server', async ({ client }) => {
    // what every pod gets in /var/run/secrets/kubernetes.io/serviceaccount/token
    const response = await client
      .post('/internal/jobs')
      .bearerToken(cluster.token({ audience: [ISSUER] }))

    response.assertStatus(401)
  })

  test('reject a token issued for another API', async ({ client }) => {
    const response = await client
      .post('/internal/jobs')
      .bearerToken(cluster.token({ audience: 'other-api' }))

    response.assertStatus(401)
  })

  test('reject a token of another cluster', async ({ client }) => {
    const token = cluster.token({ issuer: 'https://oidc.eks.eu-west-1.amazonaws.com/id/ABC' })
    const response = await client.post('/internal/jobs').bearerToken(token)

    response.assertStatus(401)
  })

  test('reject an expired token', async ({ client }) => {
    const response = await client
      .post('/internal/jobs')
      .bearerToken(cluster.token({ expiresIn: -60 }))

    response.assertStatus(401)
  })

  test('reject a legacy Secret-based token', async ({ client }) => {
    const response = await client.post('/internal/jobs').bearerToken(cluster.legacyToken())

    response.assertStatus(401)
  })

  test('reject a token signed with a key the cluster does not publish', async ({ client }) => {
    const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })

    const sameKid = await client
      .post('/internal/jobs')
      .bearerToken(cluster.token({ key: privateKey }))
    sameKid.assertStatus(401)

    const otherKid = await client
      .post('/internal/jobs')
      .bearerToken(cluster.token({ key: privateKey, kid: 'unknown-kid' }))
    otherKid.assertStatus(401)
  })

  test('read the rotated pod token on the next JWKS fetch', async ({ client, assert }) => {
    cluster.rotateApiToken()
    const before = cluster.jwksRequests

    // an unknown kid makes the guard fetch the JWKS again
    const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
    await client
      .post('/internal/jobs')
      .bearerToken(cluster.token({ key: privateKey, kid: 'rotated-kid' }))

    assert.isAbove(cluster.jwksRequests, before)
    assert.equal(cluster.jwksDenied, 0)
  })

  test('reject a request without a token', async ({ client }) => {
    const response = await client.post('/internal/jobs')

    response.assertStatus(401)
  })

  test('keep the health probe public', async ({ client }) => {
    const response = await client.get('/health')

    response.assertStatus(200)
  })
})
