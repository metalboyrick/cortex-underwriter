/**
 * Compute IPFS CIDv1 (dag-pb, sha-256) for agent card metadata files.
 * These CIDs match what IPFS would produce for these exact file contents.
 */
import { readFileSync } from 'fs';
import { CID } from 'multiformats/cid';
import { sha256 } from 'multiformats/hashes/sha2';
import * as raw from 'multiformats/codecs/raw';

const files = [
  'metadata/predictor-agent-card.json',
  'metadata/insurer-agent-card.json',
  'metadata/validator-agent-card.json',
];

for (const file of files) {
  const content = readFileSync(file);
  const hash = await sha256.digest(content);
  const cid = CID.create(1, raw.code, hash);
  console.log(`${file}`);
  console.log(`  CID: ${cid.toString()}`);
  console.log(`  URI: ipfs://${cid.toString()}`);
  console.log();
}
