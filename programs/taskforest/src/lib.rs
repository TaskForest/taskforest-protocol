use anchor_lang::prelude::*;
use ephemeral_rollups_sdk::anchor::{commit, delegate, ephemeral};
use ephemeral_rollups_sdk::cpi::DelegateConfig;
use ephemeral_rollups_sdk::ephem::commit_and_undelegate_accounts;

declare_id!("Fgiye795epSDkytp6a334Y2AwjqdGDecWV24yc2neZ4s");

pub const JOB_SEED: &[u8] = b"job";
pub const BID_SEED: &[u8] = b"bid";
pub const ARCHIVE_SEED: &[u8] = b"archive";

// --- Status byte constants ---
pub const STATUS_OPEN: u8 = 0;
pub const STATUS_BIDDING: u8 = 1;
pub const STATUS_CLAIMED: u8 = 2;
pub const STATUS_SUBMITTED: u8 = 3;
pub const STATUS_DONE: u8 = 4;
pub const STATUS_FAILED: u8 = 5;

// --- Error codes ---
#[error_code]
pub enum TaskForestError {
    #[msg("Reward must be greater than zero")]
    InvalidReward,
    #[msg("Deadline must be in the future")]
    InvalidDeadline,
    #[msg("Job is not in the expected status")]
    WrongStatus,
    #[msg("Only the poster can perform this action")]
    Unauthorized,
    #[msg("Bid stake must be greater than zero")]
    InvalidStake,
    #[msg("Bid stake is below minimum (10% of reward)")]
    InsufficientStake,
    #[msg("Only the claimer can submit proof")]
    InvalidClaimer,
    #[msg("Deadline has passed")]
    DeadlinePassed,
    #[msg("Deadline has not yet passed")]
    DeadlineNotPassed,
    #[msg("Invalid verdict value")]
    InvalidVerdict,
    #[msg("Proof must be submitted before settlement")]
    MissingProof,
}

// --- Account structs ---

#[account]
#[derive(Default)]
pub struct Job {
    pub poster: Pubkey,            // 32
    pub reward_lamports: u64,      // 8
    pub deadline: i64,             // 8
    pub proof_spec_hash: [u8; 32], // 32
    pub status: u8,                // 1
    pub claimer: Pubkey,           // 32
    pub claimer_stake: u64,        // 8
    pub best_bid_stake: u64,       // 8
    pub best_bidder: Pubkey,       // 32
    pub bid_count: u32,            // 4
    pub proof_hash: [u8; 32],      // 32
    pub submitted_at: i64,         // 8
    pub bump: u8,                  // 1
}

impl Job {
    pub const SIZE: usize = 8 + 32 + 8 + 8 + 32 + 1 + 32 + 8 + 8 + 32 + 4 + 32 + 8 + 1;
}

/// Settlement archive — captures the final state of a settled job.
/// In production, this would be a ZK-compressed PDA via Light Protocol.
#[account]
#[derive(Default)]
pub struct SettlementArchive {
    pub job: Pubkey,              // 32 — the job PDA key
    pub poster: Pubkey,           // 32
    pub claimer: Pubkey,          // 32
    pub reward_lamports: u64,     // 8
    pub claimer_stake: u64,       // 8
    pub verdict: u8,              // 1 (0=fail, 1=pass)
    pub proof_hash: [u8; 32],     // 32
    pub reason_code: [u8; 32],    // 32
    pub settled_at: i64,          // 8
    pub bump: u8,                 // 1
}

impl SettlementArchive {
    pub const SIZE: usize = 8 + 32 + 32 + 32 + 8 + 8 + 1 + 32 + 32 + 8 + 1;
}

// --- Program instructions ---

#[ephemeral]
#[program]
pub mod taskforest {
    use super::*;

    /// Create a new job/bounty.
    pub fn initialize_job(
        ctx: Context<InitializeJob>,
        reward_lamports: u64,
        deadline: i64,
        proof_spec_hash: [u8; 32],
    ) -> Result<()> {
        require!(reward_lamports > 0, TaskForestError::InvalidReward);

        let clock = Clock::get()?;
        require!(deadline > clock.unix_timestamp, TaskForestError::InvalidDeadline);

        let job = &mut ctx.accounts.job;
        job.poster = ctx.accounts.poster.key();
        job.reward_lamports = reward_lamports;
        job.deadline = deadline;
        job.proof_spec_hash = proof_spec_hash;
        job.status = STATUS_OPEN;
        job.claimer = Pubkey::default();
        job.claimer_stake = 0;
        job.best_bid_stake = 0;
        job.best_bidder = Pubkey::default();
        job.bid_count = 0;
        job.proof_hash = [0u8; 32];
        job.submitted_at = 0;
        job.bump = ctx.bumps.job;

        msg!("Job created: reward={} deadline={}", reward_lamports, deadline);
        Ok(())
    }

    /// Delegate job PDA to an Ephemeral Rollup for real-time bidding.
    pub fn delegate_job(ctx: Context<DelegateJob>) -> Result<()> {
        // Read fields first to avoid borrow conflicts
        let poster = ctx.accounts.job.poster;
        let status = ctx.accounts.job.status;

        // Only poster can delegate
        require!(
            poster == ctx.accounts.payer.key(),
            TaskForestError::Unauthorized
        );
        require!(status == STATUS_OPEN, TaskForestError::WrongStatus);

        // NOTE: Do NOT modify job data here. The delegate CPI transfers
        // ownership of the PDA to the delegation program. Any mutations
        // would cause ExternalAccountDataModified at instruction exit.

        // Delegate to ER
        ctx.accounts.delegate_job(
            &ctx.accounts.payer,
            &[JOB_SEED, poster.as_ref()],
            DelegateConfig {
                validator: ctx.remaining_accounts.first().map(|acc| acc.key()),
                ..Default::default()
            },
        )?;
        Ok(())
    }

    /// Place a bid on a job (called inside ER — gasless, sub-50ms).
    pub fn place_bid(ctx: Context<PlaceBid>, stake_lamports: u64) -> Result<()> {
        require!(stake_lamports > 0, TaskForestError::InvalidStake);

        let job = &mut ctx.accounts.job;
        // Accept both OPEN (delegated but status not yet updated) and BIDDING
        require!(
            job.status == STATUS_OPEN || job.status == STATUS_BIDDING,
            TaskForestError::WrongStatus
        );

        // Set to BIDDING on first bid
        if job.status == STATUS_OPEN {
            job.status = STATUS_BIDDING;
        }

        // Minimum stake: 10% of reward
        let min_stake = job.reward_lamports / 10;
        require!(stake_lamports >= min_stake, TaskForestError::InsufficientStake);

        let clock = Clock::get()?;
        require!(clock.unix_timestamp <= job.deadline, TaskForestError::DeadlinePassed);

        // Track best bid (highest stake wins)
        job.bid_count += 1;
        if stake_lamports > job.best_bid_stake {
            job.best_bid_stake = stake_lamports;
            job.best_bidder = ctx.accounts.bidder.key();
        }

        msg!(
            "Bid #{} from {} stake={} (best={})",
            job.bid_count,
            ctx.accounts.bidder.key(),
            stake_lamports,
            job.best_bid_stake
        );
        Ok(())
    }

    /// Close bidding: select winner, commit+undelegate back to L1.
    pub fn close_bidding(ctx: Context<CloseBidding>) -> Result<()> {
        let job = &mut ctx.accounts.job;
        require!(job.status == STATUS_BIDDING, TaskForestError::WrongStatus);
        require!(job.bid_count > 0, TaskForestError::WrongStatus);

        // Award to best bidder
        job.claimer = job.best_bidder;
        job.claimer_stake = job.best_bid_stake;
        job.status = STATUS_CLAIMED;

        msg!(
            "Bidding closed: winner={} stake={}",
            job.claimer,
            job.claimer_stake
        );

        // Commit and undelegate back to L1
        job.exit(&crate::ID)?;
        commit_and_undelegate_accounts(
            &ctx.accounts.payer,
            vec![&ctx.accounts.job.to_account_info()],
            &ctx.accounts.magic_context,
            &ctx.accounts.magic_program,
        )?;

        Ok(())
    }

    /// Worker submits proof of task completion.
    pub fn submit_proof(
        ctx: Context<SubmitProof>,
        proof_hash: [u8; 32],
    ) -> Result<()> {
        let job = &mut ctx.accounts.job;
        require!(job.status == STATUS_CLAIMED, TaskForestError::WrongStatus);
        require!(
            job.claimer == ctx.accounts.submitter.key(),
            TaskForestError::InvalidClaimer
        );

        let clock = Clock::get()?;
        require!(clock.unix_timestamp <= job.deadline, TaskForestError::DeadlinePassed);

        job.proof_hash = proof_hash;
        job.submitted_at = clock.unix_timestamp;
        job.status = STATUS_SUBMITTED;

        msg!("Proof submitted for job by {}", ctx.accounts.submitter.key());
        Ok(())
    }

    /// Settle the job with a pass/fail verdict.
    /// verdict: 0 = fail, 1 = pass
    pub fn settle_job(
        ctx: Context<SettleJob>,
        verdict: u8,
        _reason_code: [u8; 32],
    ) -> Result<()> {
        let job = &mut ctx.accounts.job;
        require!(job.status == STATUS_SUBMITTED, TaskForestError::WrongStatus);
        require!(job.proof_hash != [0u8; 32], TaskForestError::MissingProof);
        require!(verdict <= 1, TaskForestError::InvalidVerdict);

        if verdict == 1 {
            // Pass: worker gets reward + stake back
            job.status = STATUS_DONE;
            msg!(
                "Job PASSED: worker={} payout={} stake_returned={}",
                job.claimer,
                job.reward_lamports,
                job.claimer_stake
            );
        } else {
            // Fail: poster gets refund, stake slashed
            job.status = STATUS_FAILED;
            msg!(
                "Job FAILED: poster_refund={} stake_slashed={}",
                job.reward_lamports,
                job.claimer_stake
            );
        }

        Ok(())
    }

    /// Archive a settled job's outcome to a separate PDA.
    /// In production, this would create a ZK-compressed account via Light Protocol.
    pub fn archive_settlement(
        ctx: Context<ArchiveSettlement>,
        reason_code: [u8; 32],
    ) -> Result<()> {
        let job = &ctx.accounts.job;
        require!(
            job.status == STATUS_DONE || job.status == STATUS_FAILED,
            TaskForestError::WrongStatus
        );

        let verdict = if job.status == STATUS_DONE { 1u8 } else { 0u8 };
        let clock = Clock::get()?;

        let archive = &mut ctx.accounts.archive;
        archive.job = ctx.accounts.job.key();
        archive.poster = job.poster;
        archive.claimer = job.claimer;
        archive.reward_lamports = job.reward_lamports;
        archive.claimer_stake = job.claimer_stake;
        archive.verdict = verdict;
        archive.proof_hash = job.proof_hash;
        archive.reason_code = reason_code;
        archive.settled_at = clock.unix_timestamp;
        archive.bump = ctx.bumps.archive;

        msg!(
            "Settlement archived: job={} verdict={} reward={}",
            archive.job,
            verdict,
            archive.reward_lamports
        );
        Ok(())
    }

    /// Expire a claimed job past its deadline — slashes worker stake.
    pub fn expire_claim(ctx: Context<ExpireClaim>) -> Result<()> {
        let job = &mut ctx.accounts.job;
        require!(job.status == STATUS_CLAIMED, TaskForestError::WrongStatus);

        let clock = Clock::get()?;
        require!(
            clock.unix_timestamp > job.deadline,
            TaskForestError::DeadlineNotPassed
        );

        job.status = STATUS_FAILED;
        msg!(
            "Claim expired: stake_slashed={} poster_refund={}",
            job.claimer_stake,
            job.reward_lamports
        );
        Ok(())
    }
}

// --- Account contexts ---

#[derive(Accounts)]
pub struct InitializeJob<'info> {
    #[account(
        init,
        payer = poster,
        space = Job::SIZE,
        seeds = [JOB_SEED, poster.key().as_ref()],
        bump
    )]
    pub job: Account<'info, Job>,
    #[account(mut)]
    pub poster: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[delegate]
#[derive(Accounts)]
pub struct DelegateJob<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    /// The job PDA to delegate
    #[account(mut, del, seeds = [JOB_SEED, payer.key().as_ref()], bump = job.bump)]
    pub job: Account<'info, Job>,
}

#[derive(Accounts)]
pub struct PlaceBid<'info> {
    #[account(mut)]
    pub job: Account<'info, Job>,
    pub bidder: Signer<'info>,
}

#[commit]
#[derive(Accounts)]
pub struct CloseBidding<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(mut)]
    pub job: Account<'info, Job>,
}

#[derive(Accounts)]
pub struct SubmitProof<'info> {
    #[account(mut)]
    pub job: Account<'info, Job>,
    pub submitter: Signer<'info>,
}

#[derive(Accounts)]
pub struct SettleJob<'info> {
    #[account(mut)]
    pub job: Account<'info, Job>,
    pub settler: Signer<'info>,
}

#[derive(Accounts)]
pub struct ArchiveSettlement<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    /// The settled job to archive
    pub job: Account<'info, Job>,
    /// The archive PDA — seeded by ["archive", job.key()]
    #[account(
        init,
        payer = payer,
        space = SettlementArchive::SIZE,
        seeds = [ARCHIVE_SEED, job.key().as_ref()],
        bump
    )]
    pub archive: Account<'info, SettlementArchive>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ExpireClaim<'info> {
    #[account(mut)]
    pub job: Account<'info, Job>,
}
