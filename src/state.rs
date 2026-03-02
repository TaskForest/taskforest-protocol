use crate::{Claim, Job, JobStatus, Settlement};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct JobSnapshot {
    pub id: u64,
    pub status: JobStatus,
    pub poster: String,
    pub reward_usdc: u64,
    pub deadline_epoch_secs: u64,
    pub claim: Option<Claim>,
    pub settlement: Option<Settlement>,
}

impl From<&Job> for JobSnapshot {
    fn from(job: &Job) -> Self {
        Self {
            id: job.id,
            status: job.status,
            poster: job.poster.clone(),
            reward_usdc: job.reward_usdc,
            deadline_epoch_secs: job.deadline_epoch_secs,
            claim: job.claim.clone(),
            settlement: job.settlement.clone(),
        }
    }
}
