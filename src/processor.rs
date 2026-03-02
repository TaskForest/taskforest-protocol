use crate::instruction::TaskForestInstruction;
use crate::{ProtocolError, Settlement, TaskForestProtocol};

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ProcessorOutput {
    None,
    Settled(Settlement),
}

pub fn process_instruction(
    protocol: &mut TaskForestProtocol,
    instruction: TaskForestInstruction,
) -> Result<ProcessorOutput, ProtocolError> {
    match instruction {
        TaskForestInstruction::CreateJob(params) => {
            protocol.create_job(params)?;
            Ok(ProcessorOutput::None)
        }
        TaskForestInstruction::ClaimJob(params) => {
            protocol.claim_job(params)?;
            Ok(ProcessorOutput::None)
        }
        TaskForestInstruction::SubmitProof(params) => {
            protocol.submit_proof(params)?;
            Ok(ProcessorOutput::None)
        }
        TaskForestInstruction::SettleJob(params) => {
            let settlement = protocol.settle_job(params)?;
            Ok(ProcessorOutput::Settled(settlement))
        }
        TaskForestInstruction::OpenDispute(job_id) => {
            protocol.open_dispute(job_id)?;
            Ok(ProcessorOutput::None)
        }
    }
}
