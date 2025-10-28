import { createWalletClient, createPublicClient, http, parseEther } from 'viem';
import { base, eduChain } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import * as fs from 'fs';
import * as path from 'path';
import { quizGameABI } from '../../src/libs/quizGameABI.js';
import { getContractAddresses } from '../../src/libs/constants.js';
import dotenv from 'dotenv';
dotenv.config();

// ============================================
// CONFIGURATION - UPDATE THESE VALUES
// ============================================
const CSV_FILE_PATH = './scripts/s4nftboost/edu/nft_holders_airdrop.csv';

// Select target chain - Change this to switch networks:
// - For Base: const TARGET_CHAIN = base;
// - For EDU Chain: const TARGET_CHAIN = eduChain;
const TARGET_CHAIN = eduChain;

const PRIVATE_KEY = process.env.PRIVATE_KEY as `0x${string}`;

// Contract address is automatically loaded based on TARGET_CHAIN from constants.ts
const QUIZ_GAME_CONTRACT_ADDRESS = getContractAddresses(TARGET_CHAIN.id).quizGameContractAddress as `0x${string}`;

// ============================================
// TYPES
// ============================================
interface AirdropRecord {
  address: string;
  amount: string;
  explorerLink?: string;
  status?: 'pending' | 'success' | 'failed';
  error?: string;
}

// ============================================
// CSV PARSING & WRITING
// ============================================
function parseCSV(filePath: string): AirdropRecord[] {
  // Resolve path from project root (process.cwd())
  const fullPath = path.resolve(process.cwd(), filePath);
  const content = fs.readFileSync(fullPath, 'utf-8');
  const lines = content.split('\n').filter(line => line.trim());

  // Skip header line
  const dataLines = lines.slice(1);

  return dataLines.map(line => {
    const parts = line.split(',');
    const address = parts[0]?.trim() || '';
    const amount = parts[1]?.trim() || '0';
    const explorerLink = parts[2]?.trim() || '';

    return {
      address,
      amount,
      explorerLink: explorerLink || undefined,
      status: (explorerLink ? 'success' : 'pending') as 'pending' | 'success' | 'failed',
    };
  }).filter(record => record.address && record.amount);
}

function writeCSV(filePath: string, records: AirdropRecord[]): void {
  // Resolve path from project root (process.cwd())
  const fullPath = path.resolve(process.cwd(), filePath);

  // Create header
  const header = 'Address,Airdrop_Amount,Explorer_Link,Status';

  // Create data rows
  const rows = records.map(record => {
    const status = record.status || 'pending';
    const explorerLink = record.explorerLink || '';
    return `${record.address},${record.amount},${explorerLink},${status}`;
  });

  // Write to file
  const content = [header, ...rows].join('\n');
  fs.writeFileSync(fullPath, content, 'utf-8');
  console.log(`✅ CSV updated: ${fullPath}`);
}

// ============================================
// DISTRIBUTION LOGIC
// ============================================
async function distributeTokens() {
  // Validate private key
  if (!PRIVATE_KEY) {
    throw new Error('❌ PRIVATE_KEY environment variable is required');
  }

  console.log('🚀 Starting token distribution...\n');

  // Setup account
  const account = privateKeyToAccount(PRIVATE_KEY);
  console.log(`📍 Using account: ${account.address}\n`);

  // Setup clients
  const publicClient = createPublicClient({
    chain: TARGET_CHAIN,
    transport: http(),
  });

  const walletClient = createWalletClient({
    account,
    chain: TARGET_CHAIN,
    transport: http(),
  });

  // Get explorer base URL
  const explorerUrl = TARGET_CHAIN.blockExplorers.default.url;
  console.log(`🔍 Chain: ${TARGET_CHAIN.name} (ID: ${TARGET_CHAIN.id})`);
  console.log(`🔍 Explorer URL: ${explorerUrl}\n`);

  // Verify contract owner
  const owner = await publicClient.readContract({
    address: QUIZ_GAME_CONTRACT_ADDRESS,
    abi: quizGameABI,
    functionName: 'owner',
  });

  console.log(`👑 Contract Owner: ${owner}`);
  console.log(`👤 Your Address: ${account.address}`);

  if (owner.toLowerCase() !== account.address.toLowerCase()) {
    throw new Error('❌ You are not the contract owner. Cannot mint tokens.');
  }

  console.log('✅ Owner verification passed\n');

  // Load CSV
  const records = parseCSV(CSV_FILE_PATH);
  console.log(`📊 Loaded ${records.length} records from CSV\n`);

  // Filter out already processed records
  const pendingRecords = records.filter(r => !r.explorerLink);
  console.log(`⏳ Processing ${pendingRecords.length} pending airdrops...\n`);

  if (pendingRecords.length === 0) {
    console.log('✅ All airdrops already completed!');
    return;
  }

  // Process each record
  let successCount = 0;
  let failureCount = 0;

  for (let i = 0; i < pendingRecords.length; i++) {
    const record = pendingRecords[i];
    console.log(`\n[${i + 1}/${pendingRecords.length}] Processing ${record.address}...`);
    console.log(`   Amount: ${record.amount} tokens`);

    try {
      // Parse amount to wei (18 decimals)
      const amountInWei = parseEther(record.amount);
      console.log(`   Amount in wei: ${amountInWei.toString()}`);

      // Send transaction
      console.log('   📤 Sending transaction...');
      const hash = await walletClient.writeContract({
        address: QUIZ_GAME_CONTRACT_ADDRESS,
        abi: quizGameABI,
        functionName: 'mintToken',
        args: [record.address as `0x${string}`, amountInWei],
      });

      console.log(`   ⏳ Transaction hash: ${hash}`);
      console.log('   ⏳ Waiting for confirmation...');

      // Wait for transaction receipt
      const receipt = await publicClient.waitForTransactionReceipt({
        hash,
        confirmations: 1,
      });

      if (receipt.status === 'success') {
        const explorerLink = `${explorerUrl}/tx/${hash}`;
        record.explorerLink = explorerLink;
        record.status = 'success';
        successCount++;

        console.log(`   ✅ Success! Block: ${receipt.blockNumber}`);
        console.log(`   🔗 ${explorerLink}`);

        // Update CSV after each success
        writeCSV(CSV_FILE_PATH, records);
      } else {
        throw new Error('Transaction failed on chain');
      }
    } catch (error: any) {
      failureCount++;
      record.status = 'failed';
      record.error = error.message || 'Unknown error';

      console.log(`   ❌ Failed: ${error.message}`);

      // Update CSV to mark failure
      writeCSV(CSV_FILE_PATH, records);
    }

    // Add a small delay between transactions
    if (i < pendingRecords.length - 1) {
      console.log('   ⏸️  Waiting 2 seconds before next transaction...');
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }

  // Final summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 DISTRIBUTION SUMMARY');
  console.log('='.repeat(60));
  console.log(`✅ Successful: ${successCount}`);
  console.log(`❌ Failed: ${failureCount}`);
  console.log(`📝 Total processed: ${successCount + failureCount}`);
  console.log('='.repeat(60) + '\n');
}

// ============================================
// MAIN EXECUTION
// ============================================
distributeTokens()
  .then(() => {
    console.log('✅ Distribution complete!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Distribution failed:', error.message);
    process.exit(1);
  });
