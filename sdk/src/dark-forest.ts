import { PublicKey, Connection, SystemProgram, LAMPORTS_PER_SOL } from '@solana/web3.js'
import { Program, AnchorProvider, BN, Wallet, Idl } from '@coral-xyz/anchor'

const PROGRAM_ID = new PublicKey('DFpay111111111111111111111111111111111111111')
const CHANNEL_SEED = Buffer.from('channel')
const VOUCHER_SEED = Buffer.from('voucher')
const SETTLEMENT_SEED = Buffer.from('settlement')
const PERMISSION_PROGRAM_ID = new PublicKey('ACLseoPoyC3cBqoUtkbjZ4aDrkurZW86v19pXz2XQnp1')
const DELEGATION_PROGRAM_ID = new PublicKey('DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh')

export const TEE_VALIDATORS = {
  mainnet: new PublicKey('MTEWGuqxUpYZGFJQcp8tLN7x5v9BSeoFHYWQQ3n3xzo'),
  devnet: new PublicKey('FnE6VJT5QNZdedZPnCoLsARgBwoE6DeJNjBs2H1gySXA'),
} as const

export const ER_ENDPOINTS = {
  mainnet: 'https://mainnet-tee.magicblock.app',
  devnet: 'https://tee.magicblock.app',
  devnetRouter: 'https://devnet-router.magicblock.app',
} as const

export interface ChannelState {
  channelId: number
  poster: PublicKey
  agent: PublicKey
  deposited: number
  claimed: number
  voucherCount: number
  lastVoucherAmount: number
  status: 'Open' | 'Settling' | 'Closed'
  createdAt: number
  expiresAt: number
}

export interface SettlementState {
  channelId: number
  poster: PublicKey
  agent: PublicKey
  totalDeposited: number
  totalClaimed: number
  voucherCount: number
  settledAt: number
  settlementHash: number[]
}

function deriveChannelPda(channelId: number): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [CHANNEL_SEED, new BN(channelId).toArrayLike(Buffer, 'le', 8)],
    PROGRAM_ID,
  )
}

function deriveVoucherPda(channelId: number): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [VOUCHER_SEED, new BN(channelId).toArrayLike(Buffer, 'le', 8)],
    PROGRAM_ID,
  )
}

function deriveSettlementPda(channelId: number): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [SETTLEMENT_SEED, new BN(channelId).toArrayLike(Buffer, 'le', 8)],
    PROGRAM_ID,
  )
}

export class DarkForest {
  private program: Program<Idl>
  private provider: AnchorProvider
  private perConnection: Connection | null = null

  constructor(
    provider: AnchorProvider,
    idl: Idl,
  ) {
    this.provider = provider
    this.program = new Program(idl, provider)
  }

  static fromIdl(
    provider: AnchorProvider,
    idl: Idl,
  ): DarkForest {
    return new DarkForest(provider, idl)
  }

  connectToPer(endpoint: string): void {
    this.perConnection = new Connection(endpoint, 'confirmed')
  }

  getPerConnection(): Connection {
    if (!this.perConnection) throw new Error('PER connection not established. Call connectToPer() first.')
    return this.perConnection
  }

  // ── Channel Lifecycle ─────────────────────────────────────────

  async createChannel(
    channelId: number,
    agent: PublicKey,
    depositSol: number,
    expiresInSeconds: number,
  ): Promise<string> {
    const [channelPda] = deriveChannelPda(channelId)
    const depositLamports = new BN(Math.floor(depositSol * LAMPORTS_PER_SOL))

    const tx = await this.program.methods
      .createChannel(
        new BN(channelId),
        agent,
        depositLamports,
        new BN(expiresInSeconds),
      )
      .accounts({
        channel: channelPda,
        poster: this.provider.wallet.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc()

    return tx
  }

  async fundChannel(channelId: number, amountSol: number): Promise<string> {
    const [channelPda] = deriveChannelPda(channelId)
    const amountLamports = new BN(Math.floor(amountSol * LAMPORTS_PER_SOL))

    return this.program.methods
      .fundChannel(amountLamports)
      .accounts({
        channel: channelPda,
        poster: this.provider.wallet.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc()
  }

  async delegateToTee(
    channelId: number,
    validator: PublicKey = TEE_VALIDATORS.devnet,
  ): Promise<string> {
    const [channelPda] = deriveChannelPda(channelId)

    return this.program.methods
      .delegateChannel({ channel: { channelId: new BN(channelId) } })
      .accounts({
        pda: channelPda,
        payer: this.provider.wallet.publicKey,
        validator,
      })
      .rpc()
  }

  async sendVoucher(channelId: number, cumulativeAmountSol: number): Promise<string> {
    if (!this.perConnection) throw new Error('Must connect to PER first')

    const [channelPda] = deriveChannelPda(channelId)
    const [voucherPda] = deriveVoucherPda(channelId)
    const cumulativeLamports = new BN(Math.floor(cumulativeAmountSol * LAMPORTS_PER_SOL))

    const perProvider = new AnchorProvider(
      this.perConnection,
      this.provider.wallet as Wallet,
      { commitment: 'confirmed', skipPreflight: true },
    )
    const perProgram = new Program(this.program.idl, perProvider)

    return perProgram.methods
      .sendVoucher(new BN(channelId), cumulativeLamports)
      .accounts({
        channel: channelPda,
        voucher: voucherPda,
        poster: this.provider.wallet.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc()
  }

  async claim(channelId: number, agentWallet: Wallet): Promise<string> {
    const [channelPda] = deriveChannelPda(channelId)

    return this.program.methods
      .claim(new BN(channelId))
      .accounts({
        channel: channelPda,
        agent: agentWallet.publicKey,
      })
      .signers([])
      .rpc()
  }

  async closeChannel(channelId: number, agentPubkey: PublicKey): Promise<string> {
    const [channelPda] = deriveChannelPda(channelId)

    return this.program.methods
      .closeChannel(new BN(channelId))
      .accounts({
        channel: channelPda,
        poster: this.provider.wallet.publicKey,
        agent: agentPubkey,
      })
      .rpc()
  }

  // ── PER Settlement ────────────────────────────────────────────

  async settleAndUndelegate(channelId: number): Promise<string> {
    if (!this.perConnection) throw new Error('Must connect to PER first')

    const [channelPda] = deriveChannelPda(channelId)

    const perProvider = new AnchorProvider(
      this.perConnection,
      this.provider.wallet as Wallet,
      { commitment: 'confirmed', skipPreflight: true },
    )
    const perProgram = new Program(this.program.idl, perProvider)

    return perProgram.methods
      .settleAndUndelegate()
      .accounts({
        channel: channelPda,
        payer: this.provider.wallet.publicKey,
      })
      .rpc()
  }

  async recordSettlement(channelId: number): Promise<string> {
    const [channelPda] = deriveChannelPda(channelId)
    const [settlementPda] = deriveSettlementPda(channelId)

    return this.program.methods
      .recordSettlement(new BN(channelId))
      .accounts({
        channel: channelPda,
        settlementRecord: settlementPda,
        payer: this.provider.wallet.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc()
  }

  // ── Permission Management ─────────────────────────────────────

  async createPermission(channelId: number, permissionPda: PublicKey): Promise<string> {
    const [channelPda] = deriveChannelPda(channelId)

    return this.program.methods
      .createChannelPermission(new BN(channelId))
      .accounts({
        channel: channelPda,
        permission: permissionPda,
        payer: this.provider.wallet.publicKey,
        permissionProgram: PERMISSION_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .rpc()
  }

  async addDisputePanelAccess(channelId: number, permissionPda: PublicKey, panelMember: PublicKey): Promise<string> {
    const [channelPda] = deriveChannelPda(channelId)

    return this.program.methods
      .addDisputePanelAccess(new BN(channelId), panelMember)
      .accounts({
        channel: channelPda,
        permission: permissionPda,
        payer: this.provider.wallet.publicKey,
        permissionProgram: PERMISSION_PROGRAM_ID,
      })
      .rpc()
  }

  // ── Read State ────────────────────────────────────────────────

  async getChannel(channelId: number): Promise<ChannelState | null> {
    const [channelPda] = deriveChannelPda(channelId)
    try {
      const account = await (this.program.account as Record<string, { fetch: (key: PublicKey) => Promise<Record<string, unknown>> }>).paymentChannel.fetch(channelPda)
      const statusMap: Record<number, ChannelState['status']> = { 0: 'Open', 1: 'Settling', 2: 'Closed' }
      return {
        channelId: (account.channelId as BN).toNumber(),
        poster: account.poster as PublicKey,
        agent: account.agent as PublicKey,
        deposited: (account.deposited as BN).toNumber(),
        claimed: (account.claimed as BN).toNumber(),
        voucherCount: (account.voucherCount as BN).toNumber(),
        lastVoucherAmount: (account.lastVoucherAmount as BN).toNumber(),
        status: statusMap[(account.status as { open?: unknown; settling?: unknown; closed?: unknown }).open !== undefined ? 0 : (account.status as { settling?: unknown }).settling !== undefined ? 1 : 2] ?? 'Open',
        createdAt: (account.createdAt as BN).toNumber(),
        expiresAt: (account.expiresAt as BN).toNumber(),
      }
    } catch {
      return null
    }
  }

  async getSettlement(channelId: number): Promise<SettlementState | null> {
    const [settlementPda] = deriveSettlementPda(channelId)
    try {
      const account = await (this.program.account as Record<string, { fetch: (key: PublicKey) => Promise<Record<string, unknown>> }>).settlementRecord.fetch(settlementPda)
      return {
        channelId: (account.channelId as BN).toNumber(),
        poster: account.poster as PublicKey,
        agent: account.agent as PublicKey,
        totalDeposited: (account.totalDeposited as BN).toNumber(),
        totalClaimed: (account.totalClaimed as BN).toNumber(),
        voucherCount: (account.voucherCount as BN).toNumber(),
        settledAt: (account.settledAt as BN).toNumber(),
        settlementHash: account.settlementHash as number[],
      }
    } catch {
      return null
    }
  }

  // ── PDA Helpers ───────────────────────────────────────────────

  static channelPda(channelId: number): PublicKey { return deriveChannelPda(channelId)[0] }
  static voucherPda(channelId: number): PublicKey { return deriveVoucherPda(channelId)[0] }
  static settlementPda(channelId: number): PublicKey { return deriveSettlementPda(channelId)[0] }
  static get programId(): PublicKey { return PROGRAM_ID }
}
