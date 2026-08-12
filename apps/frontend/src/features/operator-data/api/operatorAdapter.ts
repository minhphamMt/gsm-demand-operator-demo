import { httpOperatorAdapter } from '@/features/operator-data/api/httpOperatorAdapter'
import { mockOperatorAdapter } from '@/features/operator-data/api/mockOperatorAdapter'
import { env } from '@/shared/config/env'

export const operatorAdapter = env.isLiveData ? httpOperatorAdapter : mockOperatorAdapter
