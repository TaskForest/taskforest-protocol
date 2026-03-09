"use strict";
/**
 * TaskForest SDK — Privacy Helpers
 * Convenience functions for creating privacy-enhanced jobs.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PRIVACY_PER = exports.PRIVACY_ENCRYPTED = exports.PRIVACY_PUBLIC = void 0;
exports.sealBid = sealBid;
exports.generateSalt = generateSalt;
exports.generateEncryptionKeypair = generateEncryptionKeypair;
exports.encryptTaskData = encryptTaskData;
exports.decryptTaskData = decryptTaskData;
exports.encryptCredential = encryptCredential;
exports.hash32 = hash32;
exports.hashString = hashString;
exports.preparePrivateJob = preparePrivateJob;
const tweetnacl_1 = __importDefault(require("tweetnacl"));
// --- Sealed bids ---
/** Create a sealed bid hash for commit-reveal scheme. */
function sealBid(amountLamports, salt) {
    const data = new Uint8Array(8 + salt.length);
    const view = new DataView(data.buffer);
    view.setBigUint64(0, BigInt(amountLamports), true);
    data.set(salt, 8);
    return tweetnacl_1.default.hash(data).slice(0, 32);
}
/** Generate a random 32-byte salt. */
function generateSalt() {
    return tweetnacl_1.default.randomBytes(32);
}
// --- Encryption ---
/** Generate an X25519 keypair for encryption. */
function generateEncryptionKeypair() {
    return tweetnacl_1.default.box.keyPair();
}
/** Encrypt task data with NaCl box. */
function encryptTaskData(plaintext, recipientPubkey, senderSecretKey) {
    const nonce = tweetnacl_1.default.randomBytes(tweetnacl_1.default.box.nonceLength);
    const msg = new TextEncoder().encode(plaintext);
    const ct = tweetnacl_1.default.box(msg, nonce, recipientPubkey, senderSecretKey);
    if (!ct)
        throw new Error('Encryption failed');
    return { ciphertext: ct, nonce };
}
/** Decrypt task data. */
function decryptTaskData(ciphertext, nonce, senderPubkey, recipientSecretKey) {
    const pt = tweetnacl_1.default.box.open(ciphertext, nonce, senderPubkey, recipientSecretKey);
    if (!pt)
        throw new Error('Decryption failed');
    return new TextDecoder().decode(pt);
}
// --- Credential vault ---
/** Encrypt an API key for the credential vault. */
function encryptCredential(credential, vaultPubkey, posterSecretKey) {
    return encryptTaskData(credential, vaultPubkey, posterSecretKey);
}
// --- Hash helpers ---
/** SHA-512 → 32 bytes (for on-chain hashes). */
function hash32(data) {
    return Array.from(tweetnacl_1.default.hash(data).slice(0, 32));
}
/** Hash a string to 32 bytes. */
function hashString(str) {
    return hash32(new TextEncoder().encode(str));
}
// --- Privacy levels ---
exports.PRIVACY_PUBLIC = 0;
exports.PRIVACY_ENCRYPTED = 1;
exports.PRIVACY_PER = 2;
/** Prepare privacy parameters for job creation. */
function preparePrivateJob(config) {
    const encKp = config.encryptionKeypair || generateEncryptionKeypair();
    let encryptedPayload = null;
    if (config.taskData && config.privacyLevel >= exports.PRIVACY_ENCRYPTED) {
        encryptedPayload = encryptTaskData(config.taskData, encKp.publicKey, encKp.secretKey);
    }
    return {
        privacyLevel: config.privacyLevel,
        encryptionPubkey: Array.from(encKp.publicKey),
        encryptedPayload,
        encryptionKeypair: encKp,
    };
}
