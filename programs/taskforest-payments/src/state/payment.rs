use anchor_lang::prelude::*;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq, Debug)]
pub enum ChannelStatus {
    Open,
    Settling,
    Closed,
}

impl Default for ChannelStatus {
    fn default() -> Self {
        ChannelStatus::Open
    }
}

#[account]
pub struct PaymentChannel {
    pub channel_id: u64,
    pub job_pubkey: Pubkey,
    pub poster: Pubkey,
    pub agent: Pubkey,
    pub deposited: u64,
    pub claimed: u64,
    pub voucher_count: u64,
    pub last_voucher_amount: u64,
    pub status: ChannelStatus,
    pub created_at: i64,
    pub expires_at: i64,
    pub tee_pubkey: [u8; 32],
    pub tee_verified: bool,
}

impl PaymentChannel {
    pub const SIZE: usize = 8 + 8 + 32 + 32 + 32 + 8 + 8 + 8 + 8 + 1 + 8 + 8 + 32 + 1;
}

#[account]
pub struct PaymentVoucher {
    pub channel_id: u64,
    pub sequence: u64,
    pub cumulative_amount: u64,
    pub poster: Pubkey,
    pub agent: Pubkey,
    pub timestamp: i64,
}

impl PaymentVoucher {
    pub const SIZE: usize = 8 + 8 + 8 + 8 + 32 + 32 + 8;
}

#[account]
pub struct SettlementRecord {
    pub channel_id: u64,
    pub job_pubkey: Pubkey,
    pub poster: Pubkey,
    pub agent: Pubkey,
    pub total_deposited: u64,
    pub total_claimed: u64,
    pub voucher_count: u64,
    pub settled_at: i64,
    pub settlement_hash: [u8; 32],
}

impl SettlementRecord {
    pub const SIZE: usize = 8 + 8 + 32 + 32 + 32 + 8 + 8 + 8 + 8 + 32;
}

pub struct PermissionMember {
    pub address: Pubkey,
    pub role: u8,
}
