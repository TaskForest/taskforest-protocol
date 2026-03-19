import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Taskforest } from "../target/types/taskforest";
import { TaskforestPayments } from "../target/types/taskforest_payments";
import { expect } from "chai";
import { Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram } from "@solana/web3.js";
import BN from "bn.js";

describe("taskforest-payments", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const coreProgram = anchor.workspace.Taskforest as Program<Taskforest>;
  const paymentsProgram = anchor.workspace.TaskforestPayments as Program<TaskforestPayments>;
  const poster = provider.wallet;

  function nowSec(): number {
    return Math.floor(Date.now() / 1000);
  }

  function hash32(fill: number): number[] {
    return Array.from({ length: 32 }, () => fill);
  }

  function pdaJob(posterKey: PublicKey, jobId: BN): PublicKey {
    return PublicKey.findProgramAddressSync(
      [Buffer.from("job"), posterKey.toBuffer(), jobId.toArrayLike(Buffer, "le", 8)],
      coreProgram.programId
    )[0];
  }

  function pdaChannel(channelId: BN): PublicKey {
    return PublicKey.findProgramAddressSync(
      [Buffer.from("channel"), channelId.toArrayLike(Buffer, "le", 8)],
      paymentsProgram.programId
    )[0];
  }

  function pdaVoucher(channelId: BN): PublicKey {
    return PublicKey.findProgramAddressSync(
      [Buffer.from("voucher"), channelId.toArrayLike(Buffer, "le", 8)],
      paymentsProgram.programId
    )[0];
  }

  function pdaSettlement(channelId: BN): PublicKey {
    return PublicKey.findProgramAddressSync(
      [Buffer.from("settlement"), channelId.toArrayLike(Buffer, "le", 8)],
      paymentsProgram.programId
    )[0];
  }

  function errToString(err: unknown): string {
    if (err instanceof Error) {
      return err.toString();
    }
    return String(err);
  }

  async function airdrop(kp: Keypair, sol = 3): Promise<void> {
    const sig = await provider.connection.requestAirdrop(kp.publicKey, sol * LAMPORTS_PER_SOL);
    const latest = await provider.connection.getLatestBlockhash("confirmed");
    await provider.connection.confirmTransaction(
      {
        signature: sig,
        blockhash: latest.blockhash,
        lastValidBlockHeight: latest.lastValidBlockHeight,
      },
      "confirmed"
    );
  }

  async function initializeAssignedJob(jobId: BN, agent: PublicKey): Promise<PublicKey> {
    const job = pdaJob(poster.publicKey, jobId);
    await coreProgram.methods
      .initializeJob(
        jobId,
        new BN(2_000_000),
        new BN(nowSec() + 1200),
        hash32(1),
        hash32(2),
        0,
        hash32(0),
        0,
        0
      )
      .accountsPartial({
        job,
        poster: poster.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    await coreProgram.methods
      .autoAssignJob(agent)
      .accountsPartial({ job, poster: poster.publicKey })
      .rpc();

    return job;
  }

  it("create_payment_channel links to job", async () => {
    const agent = Keypair.generate();
    const job = await initializeAssignedJob(new BN(2001), agent.publicKey);
    const channelId = new BN(7001);
    const channel = pdaChannel(channelId);

    await paymentsProgram.methods
      .createPaymentChannel(channelId, new BN(1_500_000), new BN(3600))
      .accountsPartial({
        job,
        channel,
        poster: poster.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const fetched = await paymentsProgram.account.paymentChannel.fetch(channel);
    expect(fetched.jobPubkey.toBase58()).to.eq(job.toBase58());
    expect(fetched.poster.toBase58()).to.eq(poster.publicKey.toBase58());
    expect(fetched.agent.toBase58()).to.eq(agent.publicKey.toBase58());
    expect(fetched.deposited.toString()).to.eq("1500000");
  });

  it("create_payment_channel fails if caller is not job poster", async () => {
    const agent = Keypair.generate();
    const attacker = Keypair.generate();
    await airdrop(attacker);
    const job = await initializeAssignedJob(new BN(2002), agent.publicKey);
    const channelId = new BN(7002);
    const channel = pdaChannel(channelId);

    try {
      await paymentsProgram.methods
        .createPaymentChannel(channelId, new BN(1_000_000), new BN(3600))
        .accountsPartial({
          job,
          channel,
          poster: attacker.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([attacker])
        .rpc();
      expect.fail("expected Unauthorized");
    } catch (err: unknown) {
      expect(errToString(err)).to.include("Unauthorized");
    }
  });

  it("fund_payment_channel increases deposit", async () => {
    const agent = Keypair.generate();
    const job = await initializeAssignedJob(new BN(2003), agent.publicKey);
    const channelId = new BN(7003);
    const channel = pdaChannel(channelId);

    await paymentsProgram.methods
      .createPaymentChannel(channelId, new BN(500_000), new BN(3600))
      .accountsPartial({ job, channel, poster: poster.publicKey, systemProgram: SystemProgram.programId })
      .rpc();

    await paymentsProgram.methods
      .fundPaymentChannel(new BN(250_000))
      .accountsPartial({
        channel,
        poster: poster.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const fetched = await paymentsProgram.account.paymentChannel.fetch(channel);
    expect(fetched.deposited.toString()).to.eq("750000");
  });

  it("send_voucher stores cumulative amount", async () => {
    const agent = Keypair.generate();
    const job = await initializeAssignedJob(new BN(2004), agent.publicKey);
    const channelId = new BN(7004);
    const channel = pdaChannel(channelId);
    const voucher = pdaVoucher(channelId);

    await paymentsProgram.methods
      .createPaymentChannel(channelId, new BN(900_000), new BN(3600))
      .accountsPartial({ job, channel, poster: poster.publicKey, systemProgram: SystemProgram.programId })
      .rpc();

    await paymentsProgram.methods
      .sendVoucher(channelId, new BN(300_000))
      .accountsPartial({
        channel,
        voucher,
        poster: poster.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const fetchedVoucher = await paymentsProgram.account.paymentVoucher.fetch(voucher);
    expect(fetchedVoucher.cumulativeAmount.toString()).to.eq("300000");
    const fetchedChannel = await paymentsProgram.account.paymentChannel.fetch(channel);
    expect(fetchedChannel.lastVoucherAmount.toString()).to.eq("300000");
  });

  it("send_voucher fails when amount is not monotonic", async () => {
    const agent = Keypair.generate();
    const job = await initializeAssignedJob(new BN(2005), agent.publicKey);
    const channelId = new BN(7005);
    const channel = pdaChannel(channelId);
    const voucher = pdaVoucher(channelId);

    await paymentsProgram.methods
      .createPaymentChannel(channelId, new BN(1_000_000), new BN(3600))
      .accountsPartial({ job, channel, poster: poster.publicKey, systemProgram: SystemProgram.programId })
      .rpc();

    await paymentsProgram.methods
      .sendVoucher(channelId, new BN(400_000))
      .accountsPartial({ channel, voucher, poster: poster.publicKey, systemProgram: SystemProgram.programId })
      .rpc();

    try {
      await paymentsProgram.methods
        .sendVoucher(channelId, new BN(400_000))
        .accountsPartial({ channel, voucher, poster: poster.publicKey, systemProgram: SystemProgram.programId })
        .rpc();
      expect.fail("expected VoucherNotMonotonic");
    } catch (err: unknown) {
      expect(errToString(err)).to.include("VoucherNotMonotonic");
    }
  });

  it("send_voucher fails when amount exceeds deposit", async () => {
    const agent = Keypair.generate();
    const job = await initializeAssignedJob(new BN(2006), agent.publicKey);
    const channelId = new BN(7006);
    const channel = pdaChannel(channelId);
    const voucher = pdaVoucher(channelId);

    await paymentsProgram.methods
      .createPaymentChannel(channelId, new BN(200_000), new BN(3600))
      .accountsPartial({ job, channel, poster: poster.publicKey, systemProgram: SystemProgram.programId })
      .rpc();

    try {
      await paymentsProgram.methods
        .sendVoucher(channelId, new BN(250_000))
        .accountsPartial({ channel, voucher, poster: poster.publicKey, systemProgram: SystemProgram.programId })
        .rpc();
      expect.fail("expected InsufficientChannelDeposit");
    } catch (err: unknown) {
      expect(errToString(err)).to.include("InsufficientChannelDeposit");
    }
  });

  it("claim_voucher transfers claimed amount to agent", async () => {
    const agent = Keypair.generate();
    await airdrop(agent, 1);
    const job = await initializeAssignedJob(new BN(2007), agent.publicKey);
    const channelId = new BN(7007);
    const channel = pdaChannel(channelId);
    const voucher = pdaVoucher(channelId);

    await paymentsProgram.methods
      .createPaymentChannel(channelId, new BN(1_000_000), new BN(3600))
      .accountsPartial({ job, channel, poster: poster.publicKey, systemProgram: SystemProgram.programId })
      .rpc();

    await paymentsProgram.methods
      .sendVoucher(channelId, new BN(450_000))
      .accountsPartial({ channel, voucher, poster: poster.publicKey, systemProgram: SystemProgram.programId })
      .rpc();

    await paymentsProgram.methods
      .claimVoucher(channelId)
      .accountsPartial({ channel, agent: agent.publicKey })
      .signers([agent])
      .rpc();

    const fetched = await paymentsProgram.account.paymentChannel.fetch(channel);
    expect(fetched.claimed.toString()).to.eq("450000");
  });

  it("close_payment_channel sends unclaimed to agent and closes channel", async () => {
    const agent = Keypair.generate();
    await airdrop(agent, 1);
    const job = await initializeAssignedJob(new BN(2008), agent.publicKey);
    const channelId = new BN(7008);
    const channel = pdaChannel(channelId);
    const voucher = pdaVoucher(channelId);

    await paymentsProgram.methods
      .createPaymentChannel(channelId, new BN(1_200_000), new BN(3600))
      .accountsPartial({ job, channel, poster: poster.publicKey, systemProgram: SystemProgram.programId })
      .rpc();

    await paymentsProgram.methods
      .sendVoucher(channelId, new BN(700_000))
      .accountsPartial({ channel, voucher, poster: poster.publicKey, systemProgram: SystemProgram.programId })
      .rpc();

    await paymentsProgram.methods
      .closePaymentChannel(channelId)
      .accountsPartial({
        channel,
        poster: poster.publicKey,
        agent: agent.publicKey,
      })
      .rpc();

    const fetched = await paymentsProgram.account.paymentChannel.fetch(channel);
    expect(fetched.claimed.toString()).to.eq("700000");
  });

  it("record_channel_settlement stores settlement hash", async () => {
    const agent = Keypair.generate();
    const job = await initializeAssignedJob(new BN(2009), agent.publicKey);
    const channelId = new BN(7009);
    const channel = pdaChannel(channelId);
    const settlement = pdaSettlement(channelId);

    await paymentsProgram.methods
      .createPaymentChannel(channelId, new BN(900_000), new BN(3600))
      .accountsPartial({ job, channel, poster: poster.publicKey, systemProgram: SystemProgram.programId })
      .rpc();

    await paymentsProgram.methods
      .recordChannelSettlement(channelId)
      .accountsPartial({
        channel,
        settlementRecord: settlement,
        payer: poster.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const fetched = await paymentsProgram.account.settlementRecord.fetch(settlement);
    expect(fetched.channelId.toString()).to.eq(channelId.toString());
    expect(fetched.settlementHash.length).to.eq(32);
  });

  it("integration full flow: job -> channel -> voucher -> claim -> close -> record", async () => {
    const agent = Keypair.generate();
    await airdrop(agent, 1);

    const job = await initializeAssignedJob(new BN(2010), agent.publicKey);
    const channelId = new BN(7010);
    const channel = pdaChannel(channelId);
    const voucher = pdaVoucher(channelId);
    const settlement = pdaSettlement(channelId);

    await paymentsProgram.methods
      .createPaymentChannel(channelId, new BN(1_500_000), new BN(3600))
      .accountsPartial({ job, channel, poster: poster.publicKey, systemProgram: SystemProgram.programId })
      .rpc();

    await paymentsProgram.methods
      .sendVoucher(channelId, new BN(500_000))
      .accountsPartial({ channel, voucher, poster: poster.publicKey, systemProgram: SystemProgram.programId })
      .rpc();

    await paymentsProgram.methods
      .sendVoucher(channelId, new BN(900_000))
      .accountsPartial({ channel, voucher, poster: poster.publicKey, systemProgram: SystemProgram.programId })
      .rpc();

    await paymentsProgram.methods
      .claimVoucher(channelId)
      .accountsPartial({ channel, agent: agent.publicKey })
      .signers([agent])
      .rpc();

    await paymentsProgram.methods
      .closePaymentChannel(channelId)
      .accountsPartial({ channel, poster: poster.publicKey, agent: agent.publicKey })
      .rpc();

    await paymentsProgram.methods
      .recordChannelSettlement(channelId)
      .accountsPartial({
        channel,
        settlementRecord: settlement,
        payer: poster.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const fetchedChannel = await paymentsProgram.account.paymentChannel.fetch(channel);
    expect(fetchedChannel.claimed.toString()).to.eq("900000");
    const fetchedSettlement = await paymentsProgram.account.settlementRecord.fetch(settlement);
    expect(fetchedSettlement.totalClaimed.toString()).to.eq("900000");
  });
});
