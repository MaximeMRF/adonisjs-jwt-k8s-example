import { symbols } from '@adonisjs/auth'
import type { JwtGuardUser, JwtUserProviderContract } from '@maximemrf/adonisjs-jwt/types'

export type Service = { name: string; serviceAccount: string }

/**
 * The ServiceAccounts allowed to call the API. A token signed by the
 * cluster for any other ServiceAccount is rejected.
 */
export const SERVICES: Service[] = [
  { name: 'worker', serviceAccount: 'system:serviceaccount:jobs:worker' },
  { name: 'billing', serviceAccount: 'system:serviceaccount:billing:billing-api' },
]

export class ServiceAccountUserProvider implements JwtUserProviderContract<Service> {
  declare [symbols.PROVIDER_REAL_USER]: Service

  async createUserForGuard(service: Service): Promise<JwtGuardUser<Service>> {
    return {
      getId: () => service.serviceAccount,
      getOriginal: () => service,
    }
  }

  async findById(id: string | number | BigInt): Promise<JwtGuardUser<Service> | null> {
    const service = SERVICES.find((s) => s.serviceAccount === String(id))
    return service ? this.createUserForGuard(service) : null
  }
}
