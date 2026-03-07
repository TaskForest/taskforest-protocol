import { useEffect, useMemo, useState, useCallback } from 'react'
import * as anchor from '@coral-xyz/anchor'
import { Program, web3 } from '@coral-xyz/anchor'
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  sendAndConfirmTransaction,
  LAMPORTS_PER_SOL,
  Transaction,
} from '@solana/web3.js'
import { Buffer } from 'buffer'
import './App.css'

// IDL will be imported from the built program
import idl from '../../target/idl/taskforest.json'

const PROGRAM_ID = new PublicKey('Fgiye795epSDkytp6a334Y2AwjqdGDecWV24yc2neZ4s')
const L1_RPC = 'https://devnet.helius-rpc.com/?api-key=03ec6518-e398-4917-987a-a9fdf13c881a'
const MAGIC_ROUTER = 'https://devnet-router.magicblock.app/'
const BURNER_KEY = 'taskforest_burner_secret_key'

type JobData = {
  poster: string
  rewardLamports: number
  deadline: number
  status: number
  claimer: string
  claimerStake: number
  bidCount: number
  bestBidStake: number
  bestBidder: string
}

type ArchiveData = {
  job: string
  poster: string
  claimer: string
  rewardLamports: number
  verdict: number
  settledAt: number
}

const STATUS_LABELS: Record<number, { label: string; color: string }> = {
  0: { label: 'OPEN', color: '#10b981' },
  1: { label: 'BIDDING', color: '#f59e0b' },
  2: { label: 'CLAIMED', color: '#3b82f6' },
  3: { label: 'SUBMITTED', color: '#8b5cf6' },
  4: { label: 'DONE', color: '#059669' },
  5: { label: 'FAILED', color: '#ef4444' },
}

function getOrCreateBurner(): Keypair {
  const raw = localStorage.getItem(BURNER_KEY)
  if (raw) {
    const bytes = Uint8Array.from(JSON.parse(raw) as number[])
    return Keypair.fromSecretKey(bytes)
  }
  const kp = Keypair.generate()
  localStorage.setItem(BURNER_KEY, JSON.stringify(Array.from(kp.secretKey)))
  return kp
}

function randomHash(): number[] {
  return Array.from({ length: 32 }, () => Math.floor(Math.random() * 256))
}

function App() {
  const connection = useMemo(() => new Connection(L1_RPC, 'confirmed'), [])
  const [burner] = useState<Keypair>(() => getOrCreateBurner())
  const wallet = useMemo(() => {
    // Inline wallet adapter since anchor.Wallet isn't exported in browser
    return {
      publicKey: burner.publicKey,
      signTransaction: async (tx: Transaction) => {
        tx.partialSign(burner)
        return tx
      },
      signAllTransactions: async (txs: Transaction[]) => {
        txs.forEach((tx) => tx.partialSign(burner))
        return txs
      },
    }
  }, [burner])
  const provider = useMemo(
    () => new anchor.AnchorProvider(connection, wallet as any, { commitment: 'confirmed' }),
    [connection, wallet]
  )
  const program = useMemo(
    () => new Program(idl as any, provider),
    [provider]
  )

  const [balanceSol, setBalanceSol] = useState('—')
  const [status, setStatus] = useState('Ready')
  const [signature, setSignature] = useState('')
  const [job, setJob] = useState<JobData | null>(null)
  const [archive, setArchive] = useState<ArchiveData | null>(null)

  // Form fields
  const [reward, setReward] = useState('0.1')
  const [deadline, setDeadline] = useState('3600')
  const [bidStake, setBidStake] = useState('0.02')

  // ER state
  const [erEndpoint, setErEndpoint] = useState<string | null>(null)

  const [jobPDA] = useMemo(() => {
    return PublicKey.findProgramAddressSync(
      [Buffer.from('job'), burner.publicKey.toBuffer()],
      PROGRAM_ID
    )
  }, [burner.publicKey])

  const [archivePDA] = useMemo(() => {
    return PublicKey.findProgramAddressSync(
      [Buffer.from('archive'), jobPDA.toBuffer()],
      PROGRAM_ID
    )
  }, [jobPDA])

  const refreshBalance = useCallback(async () => {
    try {
      const lamports = await connection.getBalance(burner.publicKey)
      setBalanceSol((lamports / LAMPORTS_PER_SOL).toFixed(4))
    } catch {
      setBalanceSol('Error')
    }
  }, [connection, burner.publicKey])

  const refreshJob = useCallback(async () => {
    try {
      const j = await program.account.job.fetch(jobPDA)
      setJob({
        poster: (j.poster as PublicKey).toBase58(),
        rewardLamports: (j.rewardLamports as any).toNumber(),
        deadline: (j.deadline as any).toNumber(),
        status: j.status as number,
        claimer: (j.claimer as PublicKey).toBase58(),
        claimerStake: (j.claimerStake as any).toNumber(),
        bidCount: j.bidCount as number,
        bestBidStake: (j.bestBidStake as any).toNumber(),
        bestBidder: (j.bestBidder as PublicKey).toBase58(),
      })
    } catch {
      setJob(null)
    }

    // Check archive
    try {
      const a = await program.account.settlementArchive.fetch(archivePDA)
      setArchive({
        job: (a.job as PublicKey).toBase58(),
        poster: (a.poster as PublicKey).toBase58(),
        claimer: (a.claimer as PublicKey).toBase58(),
        rewardLamports: (a.rewardLamports as any).toNumber(),
        verdict: a.verdict as number,
        settledAt: (a.settledAt as any).toNumber(),
      })
    } catch {
      setArchive(null)
    }

    // Check ER delegation
    try {
      const resp = await fetch(MAGIC_ROUTER, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'getDelegationStatus',
          params: [jobPDA.toBase58()],
        }),
      })
      const result: any = await resp.json()
      if (result.result?.isDelegated && result.result?.fqdn) {
        setErEndpoint(result.result.fqdn)
      } else {
        setErEndpoint(null)
      }
    } catch {
      setErEndpoint(null)
    }
  }, [program, jobPDA, archivePDA])

  useEffect(() => {
    refreshBalance()
    refreshJob()
  }, [refreshBalance, refreshJob])

  async function sendTx(conn: Connection, tx: Transaction): Promise<string> {
    tx.feePayer = burner.publicKey
    tx.recentBlockhash = (await conn.getLatestBlockhash('confirmed')).blockhash
    return await sendAndConfirmTransaction(conn, tx, [burner], {
      skipPreflight: true,
      commitment: 'confirmed',
    })
  }

  async function handleAirdrop() {
    try {
      setStatus('Requesting airdrop...')
      const sig = await connection.requestAirdrop(burner.publicKey, LAMPORTS_PER_SOL)
      await connection.confirmTransaction(sig, 'confirmed')
      setStatus('✅ Airdrop confirmed')
      setSignature(sig)
      await refreshBalance()
    } catch (e) {
      setStatus(`❌ Airdrop failed: ${(e as Error).message}`)
    }
  }

  async function handleCreateJob() {
    try {
      setStatus('Creating job...')
      const rewardLamports = new anchor.BN(Math.floor(parseFloat(reward) * LAMPORTS_PER_SOL))
      const deadlineSecs = new anchor.BN(Math.floor(Date.now() / 1000) + parseInt(deadline))

      const tx = await program.methods
        .initializeJob(rewardLamports, deadlineSecs, randomHash())
        .accounts({
          job: jobPDA,
          poster: burner.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .transaction()

      const sig = await sendTx(connection, tx)
      setSignature(sig)
      setStatus('✅ Job created')
      await refreshJob()
      await refreshBalance()
    } catch (e) {
      setStatus(`❌ Create failed: ${(e as Error).message}`)
    }
  }

  async function handleDelegate() {
    try {
      setStatus('Delegating to ER...')
      const tx = await program.methods
        .delegateJob()
        .accounts({
          payer: burner.publicKey,
          job: jobPDA,
        })
        .transaction()

      const sig = await sendTx(connection, tx)
      setSignature(sig)
      setStatus('✅ Delegated! Waiting for ER pickup...')
      setTimeout(async () => {
        await refreshJob()
        setStatus('✅ Delegation confirmed')
      }, 6000)
    } catch (e) {
      setStatus(`❌ Delegation failed: ${(e as Error).message}`)
    }
  }

  async function handleBid() {
    if (!erEndpoint) {
      setStatus('❌ Not delegated to ER')
      return
    }
    try {
      setStatus('Placing bid on ER...')
      const erConn = new Connection(erEndpoint, 'confirmed')
      const erProvider = new anchor.AnchorProvider(erConn, wallet, { commitment: 'confirmed' })
      const erProgram = new Program(idl as any, erProvider)

      const stake = new anchor.BN(Math.floor(parseFloat(bidStake) * LAMPORTS_PER_SOL))
      const tx = await erProgram.methods
        .placeBid(stake)
        .accounts({
          job: jobPDA,
          bidder: burner.publicKey,
        })
        .transaction()

      const sig = await sendTx(erConn, tx)
      setSignature(sig)
      setStatus('✅ Bid placed on ER')
      await refreshJob()
    } catch (e) {
      setStatus(`❌ Bid failed: ${(e as Error).message}`)
    }
  }

  async function handleCloseBidding() {
    if (!erEndpoint) {
      setStatus('❌ Not delegated to ER')
      return
    }
    try {
      setStatus('Closing bidding...')
      const erConn = new Connection(erEndpoint, 'confirmed')
      const erProvider = new anchor.AnchorProvider(erConn, wallet, { commitment: 'confirmed' })
      const erProgram = new Program(idl as any, erProvider)

      const tx = await erProgram.methods
        .closeBidding()
        .accounts({
          payer: burner.publicKey,
          job: jobPDA,
        })
        .transaction()

      const sig = await sendTx(erConn, tx)
      setSignature(sig)
      setStatus('✅ Bidding closed, committing to L1...')
      setTimeout(async () => {
        await refreshJob()
        setStatus('✅ Job claimed on L1')
      }, 12000)
    } catch (e) {
      setStatus(`❌ Close failed: ${(e as Error).message}`)
    }
  }

  async function handleSubmitProof() {
    try {
      setStatus('Submitting proof...')
      const tx = await program.methods
        .submitProof(randomHash())
        .accounts({
          job: jobPDA,
          submitter: burner.publicKey,
        })
        .transaction()

      const sig = await sendTx(connection, tx)
      setSignature(sig)
      setStatus('✅ Proof submitted')
      await refreshJob()
    } catch (e) {
      setStatus(`❌ Submit failed: ${(e as Error).message}`)
    }
  }

  async function handleSettle(verdict: number) {
    try {
      setStatus(`Settling (${verdict === 1 ? 'PASS' : 'FAIL'})...`)
      const tx = await program.methods
        .settleJob(verdict, randomHash())
        .accounts({
          job: jobPDA,
          settler: burner.publicKey,
        })
        .transaction()

      const sig = await sendTx(connection, tx)
      setSignature(sig)
      setStatus(`✅ Job ${verdict === 1 ? 'PASSED' : 'FAILED'}`)
      await refreshJob()
    } catch (e) {
      setStatus(`❌ Settle failed: ${(e as Error).message}`)
    }
  }

  async function handleArchive() {
    try {
      setStatus('Archiving settlement...')
      const tx = await program.methods
        .archiveSettlement(randomHash())
        .accounts({
          payer: burner.publicKey,
          job: jobPDA,
          archive: archivePDA,
          systemProgram: SystemProgram.programId,
        })
        .transaction()

      const sig = await sendTx(connection, tx)
      setSignature(sig)
      setStatus('✅ Settlement archived')
      await refreshJob()
    } catch (e) {
      setStatus(`❌ Archive failed: ${(e as Error).message}`)
    }
  }

  const statusInfo = STATUS_LABELS[job?.status ?? -1] || { label: 'N/A', color: '#999' }

  return (
    <main className="app">
      <header>
        <div className="header-row">
          <div>
            <p className="tag">TaskForest Protocol</p>
            <h1>Decentralized Bounty Board</h1>
          </div>
          <div className="network-badge">
            <span className="dot" /> Devnet
          </div>
        </div>
        <p className="subtitle">
          Real-time bidding via MagicBlock Ephemeral Rollups · Settlement archiving on-chain
        </p>
      </header>

      {/* Wallet */}
      <section className="panel glass">
        <h2>🔑 Wallet</h2>
        <div className="kv">
          <span className="label">Address</span>
          <code className="mono">{burner.publicKey.toBase58()}</code>
        </div>
        <div className="kv">
          <span className="label">Balance</span>
          <span className="value-big">{balanceSol} SOL</span>
        </div>
        <div className="kv">
          <span className="label">Job PDA</span>
          <code className="mono small">{jobPDA.toBase58()}</code>
        </div>
        <div className="actions">
          <button onClick={handleAirdrop}>Airdrop 1 SOL</button>
          <button className="btn-secondary" onClick={refreshBalance}>Refresh</button>
        </div>
      </section>

      {/* Job Status */}
      {job && (
        <section className="panel glass">
          <h2>📋 Job Status</h2>
          <div className="status-bar">
            <span
              className="status-pill"
              style={{ background: statusInfo.color }}
            >
              {statusInfo.label}
            </span>
            <span className="meta">
              Reward: {(job.rewardLamports / LAMPORTS_PER_SOL).toFixed(4)} SOL
            </span>
            <span className="meta">
              Bids: {job.bidCount}
            </span>
            {job.bestBidStake > 0 && (
              <span className="meta">
                Best: {(job.bestBidStake / LAMPORTS_PER_SOL).toFixed(4)} SOL
              </span>
            )}
            {erEndpoint && (
              <span className="meta er-badge">
                ⚡ ER: {new URL(erEndpoint).hostname}
              </span>
            )}
          </div>
          <div className="kv">
            <span className="label">Poster</span>
            <code className="mono small">{job.poster.slice(0, 16)}...</code>
          </div>
          {job.claimer !== PublicKey.default.toBase58() && (
            <div className="kv">
              <span className="label">Claimer</span>
              <code className="mono small">{job.claimer.slice(0, 16)}...</code>
            </div>
          )}
          <div className="kv">
            <span className="label">Deadline</span>
            <span>{new Date(job.deadline * 1000).toLocaleString()}</span>
          </div>
        </section>
      )}

      {/* Archive */}
      {archive && (
        <section className="panel glass archive-panel">
          <h2>🗄️ Settlement Archive</h2>
          <div className="status-bar">
            <span
              className="status-pill"
              style={{ background: archive.verdict === 1 ? '#059669' : '#ef4444' }}
            >
              {archive.verdict === 1 ? 'PASS' : 'FAIL'}
            </span>
            <span className="meta">
              Reward: {(archive.rewardLamports / LAMPORTS_PER_SOL).toFixed(4)} SOL
            </span>
            <span className="meta">
              Settled: {new Date(archive.settledAt * 1000).toLocaleString()}
            </span>
          </div>
        </section>
      )}

      {/* Actions */}
      <section className="panel glass">
        <h2>⚡ Actions</h2>

        {!job && (
          <div className="action-group">
            <h3>Create Bounty</h3>
            <div className="grid">
              <label>
                Reward (SOL)
                <input value={reward} onChange={(e) => setReward(e.target.value)} type="number" step="0.01" />
              </label>
              <label>
                Deadline (seconds from now)
                <input value={deadline} onChange={(e) => setDeadline(e.target.value)} type="number" />
              </label>
            </div>
            <button onClick={handleCreateJob} className="btn-primary">Create Job</button>
          </div>
        )}

        {job?.status === 0 && (
          <div className="action-group">
            <h3>Delegate to Ephemeral Rollup</h3>
            <p className="hint">Send this job to MagicBlock's ER for real-time bidding (sub-50ms, gasless)</p>
            <button onClick={handleDelegate} className="btn-primary">⚡ Delegate to ER</button>
          </div>
        )}

        {(job?.status === 0 || job?.status === 1) && erEndpoint && (
          <div className="action-group">
            <h3>Place Bid (via ER)</h3>
            <label>
              Stake (SOL) — min 10% of reward
              <input value={bidStake} onChange={(e) => setBidStake(e.target.value)} type="number" step="0.01" />
            </label>
            <button onClick={handleBid} className="btn-primary">Place Bid</button>
          </div>
        )}

        {job?.status === 1 && erEndpoint && (
          <div className="action-group">
            <h3>Close Bidding</h3>
            <p className="hint">Select winner, commit state back to L1</p>
            <button onClick={handleCloseBidding} className="btn-primary">Close & Commit</button>
          </div>
        )}

        {job?.status === 2 && (
          <div className="action-group">
            <h3>Submit Proof</h3>
            <p className="hint">As the claimer, submit your proof of task completion</p>
            <button onClick={handleSubmitProof} className="btn-primary">Submit Proof</button>
          </div>
        )}

        {job?.status === 3 && (
          <div className="action-group">
            <h3>Settle Job</h3>
            <div className="actions">
              <button onClick={() => handleSettle(1)} className="btn-pass">✅ Pass</button>
              <button onClick={() => handleSettle(0)} className="btn-fail">❌ Fail</button>
            </div>
          </div>
        )}

        {(job?.status === 4 || job?.status === 5) && !archive && (
          <div className="action-group">
            <h3>Archive Settlement</h3>
            <p className="hint">Compress the settlement record for cheap on-chain storage</p>
            <button onClick={handleArchive} className="btn-primary">🗄️ Archive</button>
          </div>
        )}

        <button className="btn-secondary refresh-btn" onClick={refreshJob}>🔄 Refresh State</button>
      </section>

      {/* Status bar */}
      <section className="status-footer">
        <p><strong>Status:</strong> {status}</p>
        {signature && (
          <p>
            <a
              href={`https://explorer.solana.com/tx/${signature}?cluster=devnet`}
              target="_blank"
              rel="noreferrer"
            >
              View on Explorer ↗
            </a>
          </p>
        )}
      </section>
    </main>
  )
}

export default App
