use crate::ProtocolError;

pub type ProgramResult<T> = Result<T, ProtocolError>;
