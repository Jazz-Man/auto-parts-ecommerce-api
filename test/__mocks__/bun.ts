import * as crypto from 'crypto'

const hashCache = new Map<string, string>()

export const password = {
  hash: async (value: string): Promise<string> => {
    const salt = crypto.randomBytes(16).toString('hex')
    const derived = crypto.scryptSync(value, salt, 64).toString('hex')
    const hash = `$mock$${salt}$${derived}`
    hashCache.set(value, hash)
    return hash
  },
  verify: async (value: string, hash: string): Promise<boolean> => {
    if (hashCache.has(value) && hashCache.get(value) === hash) return true
    const parts = hash.split('$')
    if (parts.length < 4) return false
    const salt = parts[2]
    const derived = crypto.scryptSync(value, salt, 64).toString('hex')
    return parts[3] === derived
  },
}
