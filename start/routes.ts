/*
|--------------------------------------------------------------------------
| Routes file
|--------------------------------------------------------------------------
|
| The routes file is used for defining the HTTP routes.
|
*/

import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'

// probes
router.get('health', () => ({ ok: true }))

router
  .post('internal/jobs', async ({ auth }) => {
    const service = auth.use('k8s').getUserOrFail()
    return { calledBy: service.name }
  })
  .use(middleware.auth({ guards: ['k8s'] }))
