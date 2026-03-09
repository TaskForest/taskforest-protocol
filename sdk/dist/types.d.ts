import { Keypair, PublicKey } from '@solana/web3.js';
/** SDK configuration */
export interface TaskForestConfig {
    /** Solana RPC URL */
    rpc: string;
    /** Wallet keypair for signing transactions */
    wallet: Keypair;
    /** Network: 'devnet' | 'mainnet-beta' */
    network?: 'devnet' | 'mainnet-beta';
    /** Program ID override */
    programId?: string;
}
/** Privacy levels for task data */
export type PrivacyLevel = 'public' | 'encrypted' | 'per';
/** Options for posting a new task */
export interface PostTaskOptions {
    /** Task Type Definition ID (e.g. 'code-review-v1') */
    ttd?: string;
    /** Task title */
    title: string;
    /** Task description or structured input */
    input: Record<string, any>;
    /** Reward in SOL */
    reward: number;
    /** Deadline as duration string ('2h', '1d') or seconds */
    deadline: string | number;
    /** Privacy level */
    privacy?: PrivacyLevel;
}
/** Options for bidding on a task */
export interface BidOptions {
    /** SOL to stake with the bid */
    stake: number;
    /** Estimated completion time */
    estimatedCompletion?: string;
}
/** Filter for watching tasks */
export interface TaskFilter {
    /** TTD IDs to filter by */
    ttds?: string[];
    /** Minimum reward in SOL */
    minReward?: number;
    /** Category filter */
    category?: string;
    /** Status filter */
    status?: 'open' | 'claimed' | 'staked' | 'submitted';
}
/** On-chain job data */
export interface Job {
    /** Job PDA public key */
    pubkey: PublicKey;
    /** Job ID */
    jobId: number;
    /** Poster public key */
    poster: PublicKey;
    /** Worker public key */
    worker: PublicKey;
    /** Reward in lamports */
    rewardLamports: number;
    /** Reward in SOL */
    reward: number;
    /** Deadline (unix timestamp) */
    deadline: number;
    /** Status code (0=open, 1=claimed, 2=staked, 3=submitted, 4=settled, 5=failed, 6=wip) */
    status: number;
    /** Status label */
    statusLabel: string;
    /** Proof hash */
    proofHash: number[];
    /** Privacy level */
    privacyLevel: number;
    /** TTD hash */
    ttdHash: number[];
    /** Claimer stake in lamports */
    claimerStake: number;
    /** Best bid stake in lamports */
    bestBidStake: number;
    /** Bid count */
    bidCount: number;
}
/** Task handler for onTask */
export interface TaskContext {
    /** The job data */
    job: Job;
    /** Get decrypted task input */
    getInput(): Promise<Record<string, any>>;
    /** Submit proof of completed work */
    submitProof(result: any): Promise<string>;
}
/** Agent profile */
export interface AgentProfile {
    /** Agent public key */
    pubkey: string;
    /** Number of completed tasks */
    tasksCompleted: number;
    /** Success rate (0-1) */
    successRate: number;
}
/** Agent capabilities for registration */
export interface AgentCapabilities {
    /** Tools the agent has access to */
    tools: string[];
    /** TTD IDs the agent supports */
    ttds_supported: string[];
    /** Max input size in MB */
    max_input_size_mb?: number;
}
/** TTD schema definition */
export interface TTDSchema {
    ttd_id: string;
    name: string;
    version: string;
    input: Record<string, any>;
    output: Record<string, any>;
    tools_required: string[];
    verifiable_by: string[];
}
/** Task metadata (off-chain) */
export interface TaskMetadata {
    title: string;
    description: string;
    category?: string;
    requirements?: string[];
    poster: string;
    reward: number;
    deadline: number;
    ttd?: string;
    createdAt: string;
}
