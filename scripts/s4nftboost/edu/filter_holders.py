#!/usr/bin/env python3
import csv
import os

# File paths
nft_holders_file = 'scripts/s4nftboost/nftholders.csv'
leaderboard_file = 'scripts/s4nftboost/edu/leaderboard_0x57AED70DA2c288E4a79D2ca797ED9B276db47793.csv'
output_file = 'scripts/s4nftboost/edu/nft_holders_airdrop_filtered.csv'

def main():
    # Read NFT holders
    nft_holders = set()
    with open(nft_holders_file, 'r') as f:
        reader = csv.DictReader(f)
        for row in reader:
            if 'HolderAddress' in row:
                nft_holders.add(row['HolderAddress'].lower())

    print(f"Found {len(nft_holders)} NFT holders")

    # Read leaderboard and match with NFT holders
    matched_records = []
    with open(leaderboard_file, 'r', encoding='utf-8-sig') as f:
        reader = csv.DictReader(f)
        for row in reader:
            address = row['HolderAddress'].lower()
            if address in nft_holders:
                balance = float(row['Balance'])
                airdrop_amount = round(balance * 0.1, 3)  # 10% of balance, rounded to 3 decimals
                matched_records.append({
                    'Address': row['HolderAddress'],  # Keep original case
                    'Airdrop_Amount': airdrop_amount
                })
                print(f"Matched: {row['HolderAddress']} - Balance: {balance} - Airdrop: {airdrop_amount}")

    print(f"\nTotal matches: {len(matched_records)}")

    # Write output CSV
    with open(output_file, 'w', newline='') as f:
        fieldnames = ['Address', 'Airdrop_Amount']
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(matched_records)

    print(f"\nOutput written to: {output_file}")

if __name__ == '__main__':
    main()
