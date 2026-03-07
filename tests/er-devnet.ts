import * as anchor from "@coral-xyz/anchor";
import { Program, web3 } from "@coral-xyz/anchor";
import { Taskforest } from "../target/types/taskforest";
import {
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  sendAndConfirmTransaction,
  Connection,
} from "@solana/web3.js";

/**
 * Devnet ER Integration Test — with dynamic ER endpoint discovery
 *
 * Run:
 *   ANCHOR_PROVIDER_URL=https://devnet.helius-rpc.com/?api-key=<KEY> \
 *   ANCHOR_WALLET=keys/taskforest.json \
 *   npx ts-mocha -p ./tsconfig.json -t 120000 tests/er-devnet.ts
 */

const MAGIC_ROUTER = "https://devnet-router.magicblock.app/";

describe("taskforest — Devnet ER Integration", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.Taskforest as Program<Taskforest>;
  const wallet = anchor.Wallet.local();

  // Will be set dynamically after delegation
  let erConnection: Connection;
  let erProvider: anchor.AnchorProvider;
  let erProgram: anchor.Program<Taskforest>;

  console.log("L1 RPC:", provider.connection.rpcEndpoint);
  console.log("Wallet:", wallet.publicKey.toString());
  console.log("Program ID:", program.programId.toString());

  const [jobPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from("job"), wallet.publicKey.toBuffer()],
    program.programId
  );
  console.log("Job PDA:", jobPDA.toString());

  function randomHash(): number[] {
    return Array.from({ length: 32 }, () => Math.floor(Math.random() * 256));
  }

  async function sendTx(
    connection: Connection,
    tx: web3.Transaction,
    payer: web3.Keypair
  ): Promise<string> {
    tx.feePayer = payer.publicKey;
    tx.recentBlockhash = (
      await connection.getLatestBlockhash("confirmed")
    ).blockhash;
    return await sendAndConfirmTransaction(connection, tx, [payer], {
      skipPreflight: true,
      commitment: "confirmed",
    });
  }

  async function getDelegationEndpoint(pda: PublicKey): Promise<string | null> {
    const resp = await fetch(MAGIC_ROUTER, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "getDelegationStatus",
        params: [pda.toString()],
      }),
    });
    const result: any = await resp.json();
    if (result.result?.isDelegated && result.result?.fqdn) {
      return result.result.fqdn;
    }
    return null;
  }

  before(async function () {
    const balance = await provider.connection.getBalance(wallet.publicKey);
    console.log("Balance:", balance / LAMPORTS_PER_SOL, "SOL\n");
  });

  it("Step 1: Initialize job on L1", async () => {
    const existing = await provider.connection.getAccountInfo(jobPDA);
    if (existing) {
      console.log("  Job PDA already exists, skipping init");
      const job = await program.account.job.fetch(jobPDA);
      console.log(`  status=${job.status} reward=${job.rewardLamports.toNumber()}`);
      return;
    }

    const start = Date.now();
    const tx = await program.methods
      .initializeJob(
        new anchor.BN(100_000_000),
        new anchor.BN(Math.floor(Date.now() / 1000) + 3600),
        randomHash()
      )
      .accounts({
        job: jobPDA,
        poster: wallet.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .transaction();

    const txHash = await sendTx(provider.connection, tx, wallet.payer);
    console.log(`  ${Date.now() - start}ms — txHash: ${txHash}`);
  });

  it("Step 2: Delegate job to ER", async () => {
    // Check if already delegated
    const endpoint = await getDelegationEndpoint(jobPDA);
    if (endpoint) {
      console.log(`  Already delegated → ${endpoint}`);
      erConnection = new Connection(endpoint, { wsEndpoint: endpoint.replace("https://", "wss://") });
      erProvider = new anchor.AnchorProvider(erConnection, wallet);
      erProgram = new anchor.Program(program.idl, erProvider);
      return;
    }

    const job = await program.account.job.fetch(jobPDA);
    if (job.status !== 0) {
      console.log(`  Job status=${job.status}, not OPEN — skipping`);
      return;
    }

    const start = Date.now();
    const tx = await program.methods
      .delegateJob()
      .accounts({
        payer: wallet.publicKey,
        job: jobPDA,
      })
      .transaction();

    const txHash = await sendTx(provider.connection, tx, wallet.payer);
    console.log(`  ${Date.now() - start}ms — txHash: ${txHash}`);

    // Wait for ER to pick up delegation
    console.log("  Waiting 5s for ER pickup...");
    await new Promise((r) => setTimeout(r, 5000));

    // Discover the ER endpoint dynamically
    const erEndpoint = await getDelegationEndpoint(jobPDA);
    if (erEndpoint) {
      console.log(`  ✔ DELEGATED → ${erEndpoint}`);
      erConnection = new Connection(erEndpoint, { wsEndpoint: erEndpoint.replace("https://", "wss://") });
      erProvider = new anchor.AnchorProvider(erConnection, wallet);
      erProgram = new anchor.Program(program.idl, erProvider);
    } else {
      throw new Error("Delegation was not confirmed by the router");
    }
  });

  it("Step 3: Place bid on ER", async () => {
    if (!erProgram) throw new Error("ER not initialized — delegation failed");

    const start = Date.now();
    const stake = new anchor.BN(20_000_000);

    const tx = await erProgram.methods
      .placeBid(stake)
      .accounts({
        job: jobPDA,
        bidder: wallet.publicKey,
      })
      .transaction();

    const txHash = await sendTx(erConnection, tx, wallet.payer);
    console.log(`  ${Date.now() - start}ms — txHash: ${txHash}`);
  });

  it("Step 4: Close bidding (commit+undelegate to L1)", async () => {
    if (!erProgram) throw new Error("ER not initialized — delegation failed");

    const start = Date.now();
    const tx = await erProgram.methods
      .closeBidding()
      .accounts({
        payer: wallet.publicKey,
        job: jobPDA,
      })
      .transaction();

    const txHash = await sendTx(erConnection, tx, wallet.payer);
    console.log(`  ${Date.now() - start}ms — txHash: ${txHash}`);

    console.log("  Waiting 10s for L1 commit...");
    await new Promise((r) => setTimeout(r, 10000));

    const job = await program.account.job.fetch(jobPDA);
    console.log(`  status=${job.status} claimer=${job.claimer.toString().slice(0, 8)}...`);
  });

  it("Step 5: Submit proof on L1", async () => {
    const start = Date.now();
    const tx = await program.methods
      .submitProof(randomHash())
      .accounts({
        job: jobPDA,
        submitter: wallet.publicKey,
      })
      .transaction();

    const txHash = await sendTx(provider.connection, tx, wallet.payer);
    console.log(`  ${Date.now() - start}ms — txHash: ${txHash}`);
  });

  it("Step 6: Settle job (PASS)", async () => {
    const start = Date.now();
    const tx = await program.methods
      .settleJob(1, randomHash())
      .accounts({
        job: jobPDA,
        settler: wallet.publicKey,
      })
      .transaction();

    const txHash = await sendTx(provider.connection, tx, wallet.payer);
    console.log(`  ${Date.now() - start}ms — txHash: ${txHash}`);

    const job = await program.account.job.fetch(jobPDA);
    console.log(`  status=${job.status} 🎉 Settled!`);
  });

  it("Step 7: Archive settlement to PDA", async () => {
    const [archivePDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("archive"), jobPDA.toBuffer()],
      program.programId
    );

    const start = Date.now();
    const tx = await program.methods
      .archiveSettlement(randomHash())
      .accounts({
        payer: wallet.publicKey,
        job: jobPDA,
        archive: archivePDA,
        systemProgram: SystemProgram.programId,
      })
      .transaction();

    const txHash = await sendTx(provider.connection, tx, wallet.payer);
    console.log(`  ${Date.now() - start}ms — txHash: ${txHash}`);

    // Verify archive fields
    const archive = await program.account.settlementArchive.fetch(archivePDA);
    console.log(`  verdict=${archive.verdict} reward=${archive.rewardLamports.toNumber()}`);
    console.log(`  poster=${archive.poster.toString().slice(0, 8)}...`);
    console.log(`  claimer=${archive.claimer.toString().slice(0, 8)}...`);
    console.log(`  🗄️ Full lifecycle + archive complete!`);
  });
});
