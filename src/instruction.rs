use crate::{
    ActorId, ClaimJobParams, CreateJobParams, JobId, SettleJobParams, SubmitProofParams, Verdict,
};

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum TaskForestInstruction {
    CreateJob(CreateJobParams),
    ClaimJob(ClaimJobParams),
    SubmitProof(SubmitProofParams),
    SettleJob(SettleJobParams),
    OpenDispute(JobId),
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum InstructionDecodeError {
    EmptyData,
    InvalidFormat,
    InvalidDiscriminator,
    InvalidNumber,
    InvalidVerdict,
}

impl TaskForestInstruction {
    pub fn unpack(input: &[u8]) -> Result<Self, InstructionDecodeError> {
        if input.is_empty() {
            return Err(InstructionDecodeError::EmptyData);
        }
        let text =
            core::str::from_utf8(input).map_err(|_| InstructionDecodeError::InvalidFormat)?;
        let parts: Vec<&str> = text.split('|').collect();
        if parts.is_empty() {
            return Err(InstructionDecodeError::InvalidFormat);
        }

        match parts[0] {
            "create_job" => {
                if parts.len() != 6 {
                    return Err(InstructionDecodeError::InvalidFormat);
                }
                Ok(Self::CreateJob(CreateJobParams {
                    job_id: parse_u64(parts[1])?,
                    poster: parse_actor(parts[2]),
                    reward_usdc: parse_u64(parts[3])?,
                    deadline_epoch_secs: parse_u64(parts[4])?,
                    proof_spec_hash: parts[5].to_string(),
                }))
            }
            "claim_job" => {
                if parts.len() != 5 {
                    return Err(InstructionDecodeError::InvalidFormat);
                }
                Ok(Self::ClaimJob(ClaimJobParams {
                    job_id: parse_u64(parts[1])?,
                    claimer: parse_actor(parts[2]),
                    stake_usdc: parse_u64(parts[3])?,
                    now_epoch_secs: parse_u64(parts[4])?,
                }))
            }
            "submit_proof" => {
                if parts.len() != 4 {
                    return Err(InstructionDecodeError::InvalidFormat);
                }
                Ok(Self::SubmitProof(SubmitProofParams {
                    job_id: parse_u64(parts[1])?,
                    proof_hash: parts[2].to_string(),
                    now_epoch_secs: parse_u64(parts[3])?,
                }))
            }
            "settle_job" => {
                if parts.len() != 5 {
                    return Err(InstructionDecodeError::InvalidFormat);
                }
                Ok(Self::SettleJob(SettleJobParams {
                    job_id: parse_u64(parts[1])?,
                    verdict: parse_verdict(parts[2])?,
                    reason_code: parts[3].to_string(),
                    now_epoch_secs: parse_u64(parts[4])?,
                }))
            }
            "open_dispute" => {
                if parts.len() != 2 {
                    return Err(InstructionDecodeError::InvalidFormat);
                }
                Ok(Self::OpenDispute(parse_u64(parts[1])?))
            }
            _ => Err(InstructionDecodeError::InvalidDiscriminator),
        }
    }
}

fn parse_u64(value: &str) -> Result<u64, InstructionDecodeError> {
    value
        .parse::<u64>()
        .map_err(|_| InstructionDecodeError::InvalidNumber)
}

fn parse_actor(value: &str) -> ActorId {
    value.to_string()
}

fn parse_verdict(value: &str) -> Result<Verdict, InstructionDecodeError> {
    match value {
        "pass" => Ok(Verdict::Pass),
        "fail" => Ok(Verdict::Fail),
        "needs_judge" => Ok(Verdict::NeedsJudge),
        _ => Err(InstructionDecodeError::InvalidVerdict),
    }
}
