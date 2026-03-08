const PINATA_GATEWAY = 'https://gateway.pinata.cloud/ipfs'

export interface TaskMetadata {
  title: string
  description: string
  category?: string
  requirements?: string[]
  createdAt: string
  poster: string
  reward: number
  deadline: number
}

/**
 * Upload task metadata JSON to IPFS via Pinata.
 * Returns the IPFS CID (content identifier).
 */
export async function uploadMetadata(metadata: TaskMetadata): Promise<string> {
  const jwt = import.meta.env.VITE_PINATA_JWT
  if (!jwt) {
    console.warn('VITE_PINATA_JWT not set — falling back to local-only storage')
    return ''
  }

  const res = await fetch('https://api.pinata.cloud/pinning/pinJSONToIPFS', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${jwt}`,
    },
    body: JSON.stringify({
      pinataContent: metadata,
      pinataMetadata: {
        name: `taskforest-${metadata.title.slice(0, 30)}`,
      },
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Pinata upload failed: ${err}`)
  }

  const data = await res.json()
  return data.IpfsHash as string // e.g. "QmXyz..."
}

/**
 * Fetch task metadata from IPFS via public gateway.
 * Uses localStorage as cache to avoid repeated fetches.
 */
export async function fetchMetadata(cid: string): Promise<TaskMetadata | null> {
  if (!cid) return null

  // Check cache first
  const cacheKey = `tf_ipfs_${cid}`
  const cached = localStorage.getItem(cacheKey)
  if (cached) {
    try { return JSON.parse(cached) } catch { /* re-fetch */ }
  }

  try {
    const res = await fetch(`${PINATA_GATEWAY}/${cid}`, {
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return null
    const metadata = await res.json() as TaskMetadata
    localStorage.setItem(cacheKey, JSON.stringify(metadata))
    return metadata
  } catch {
    return null
  }
}

/**
 * SHA-256 hash of the metadata JSON, returned as a 32-byte array.
 * This gets stored on-chain for content verification.
 */
export async function hashMetadata(metadata: TaskMetadata): Promise<number[]> {
  const json = JSON.stringify(metadata)
  const encoded = new TextEncoder().encode(json)
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoded)
  return Array.from(new Uint8Array(hashBuffer))
}
