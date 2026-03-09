/**
 * TaskForest SDK — Privacy Helpers
 * Convenience functions for creating privacy-enhanced jobs.
 */
import nacl from 'tweetnacl';
/** Create a sealed bid hash for commit-reveal scheme. */
export declare function sealBid(amountLamports: number, salt: Uint8Array): Uint8Array;
/** Generate a random 32-byte salt. */
export declare function generateSalt(): Uint8Array;
/** Generate an X25519 keypair for encryption. */
export declare function generateEncryptionKeypair(): nacl.BoxKeyPair;
/** Encrypt task data with NaCl box. */
export declare function encryptTaskData(plaintext: string, recipientPubkey: Uint8Array, senderSecretKey: Uint8Array): {
    ciphertext: Uint8Array;
    nonce: Uint8Array;
};
/** Decrypt task data. */
export declare function decryptTaskData(ciphertext: Uint8Array, nonce: Uint8Array, senderPubkey: Uint8Array, recipientSecretKey: Uint8Array): string;
/** Encrypt an API key for the credential vault. */
export declare function encryptCredential(credential: string, vaultPubkey: Uint8Array, posterSecretKey: Uint8Array): {
    ciphertext: Uint8Array;
    nonce: Uint8Array;
};
/** SHA-512 → 32 bytes (for on-chain hashes). */
export declare function hash32(data: Uint8Array): number[];
/** Hash a string to 32 bytes. */
export declare function hashString(str: string): number[];
export declare const PRIVACY_PUBLIC = 0;
export declare const PRIVACY_ENCRYPTED = 1;
export declare const PRIVACY_PER = 2;
export interface PrivateJobConfig {
    privacyLevel: 0 | 1 | 2;
    encryptionKeypair?: {
        publicKey: Uint8Array;
        secretKey: Uint8Array;
    };
    taskData?: string;
    credential?: string;
}
/** Prepare privacy parameters for job creation. */
export declare function preparePrivateJob(config: PrivateJobConfig): {
    privacyLevel: 0 | 2 | 1;
    encryptionPubkey: number[];
    encryptedPayload: {
        ciphertext: Uint8Array;
        nonce: Uint8Array;
    } | null;
    encryptionKeypair: nacl.BoxKeyPair;
};
