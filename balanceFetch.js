const express = require('express');
const axios = require('axios');
require('dotenv').config();
const { Web3 } = require('web3');
const web3 = require('@solana/web3.js');
const splToken = require('@solana/spl-token');

const app = express();
app.use(express.json());
const PORT = process.env.PORT || 3000;


const RPC_ENDPOINTS = {
    sepolia: process.env.SEPOLIA_RPC,
    bnb: process.env.BNB_RPC,
    eth: process.env.ETH_RPC
};

async function getNativeBalance(chain, address) {
    try {
        const response = await axios.post(RPC_ENDPOINTS[chain], {
            jsonrpc: '2.0',
            method: 'eth_getBalance',
            params: [address, 'latest'],
            id: 1
        });
        return parseInt(response.data.result, 16) / 1e18;
    } catch (error) {
        console.error(`Error fetching native balance on ${chain}:`, error.message);
        return null;
    }
}

async function getTokenBalance(chain, address, tokenAddress) {
    try {
        const response = await axios.post(RPC_ENDPOINTS[chain], {
            jsonrpc: '2.0',
            method: 'eth_call',
            params: [{
                to: tokenAddress,
                data: `0x70a08231000000000000000000000000${address.substring(2)}` //balanceOf
            }, 'latest'],
            id: 1
        });
        return parseInt(response.data.result, 16) / 1e18;
    } catch (error) {
        console.error(`Error fetching token balance on ${chain}:`, error.message);
        return null;
    }
}

async function getSOLBalance(address) {
    try {
        // Connect to the Solana network
        const connection = new web3.Connection(web3.clusterApiUrl('devnet'), 'confirmed');

        // Parse the address
        const publicKey = new web3.PublicKey(address);

        // Get the balance
        const balance = await connection.getBalance(publicKey);

        // Convert from lamports to SOL
        const solBalance = balance / web3.LAMPORTS_PER_SOL;

        console.log(`SOL Balance for ${address}: ${solBalance} SOL`);
        return solBalance;
    } catch (error) {
        console.error('Error getting SOL balance:', error);
        throw error;
    }
}

async function getSPLTokenBalance(tokenMintAddress, walletAddress) {
    try {
        // Connect to the Solana network
        const connection = new web3.Connection(web3.clusterApiUrl('devnet'), 'confirmed');

        // Parse the addresses
        const mintPublicKey = new web3.PublicKey(tokenMintAddress);
        const walletPublicKey = new web3.PublicKey(walletAddress);

        // Get token account info
        try {
            const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
                walletPublicKey,
                { mint: mintPublicKey }
            );

            // Get token decimals
            const tokenInfo = await splToken.getMint(connection, mintPublicKey);
            const decimals = tokenInfo.decimals;

            // Sum up the balances from all accounts (usually there's just one)
            let totalBalance = 0;

            if (tokenAccounts.value.length > 0) {
                for (const account of tokenAccounts.value) {
                    const parsedInfo = account.account.data.parsed.info;
                    const tokenAmount = parsedInfo.tokenAmount;
                    totalBalance += parseInt(tokenAmount.amount) / Math.pow(10, decimals);
                }
                console.log(`Token Balance for ${walletAddress}: ${totalBalance} ${tokenMintAddress}`);
                return totalBalance;
            } else {
                console.log(`No token account found for ${walletAddress} with token ${tokenMintAddress}`);
                return 0;
            }
        } catch (error) {
            // If no token account exists
            console.log(`No token account found for ${walletAddress} with token ${tokenMintAddress}`);
            return 0;
        }
    } catch (error) {
        console.error('Error getting SPL token balance:', error);
        throw error;
    }
}

const isValidEVMAddress = (address) => Web3.utils.isAddress(address);

const isValidSolanaAddress = (address) => {
    try {
        const sol = new web3.PublicKey(address);
        return true
    } catch (error) {
        return false;
    }
};

app.post('/balances', async (req, res) => {
    const { contracts, walletAddresses } = req.body;
    if (!walletAddresses || !contracts) return res.status(400).json({ error: 'Invalid request format' });

    let balances = {};

    for (let { networkName, contractAddresses } of contracts) {

        balances[networkName] = {};

        for (let address of walletAddresses) {
            if (networkName === 'solana' && isValidSolanaAddress(address)) {
                balances[networkName][address] = {
                    native: await getSOLBalance(address),
                    tokens: {}
                };

                // Fetch SPL token balances
                for (let token of contractAddresses) {
                    balances[networkName][address].tokens[token] = await getSPLTokenBalance(token, address);
                }
            } else if (networkName !== 'solana' && isValidEVMAddress(address)) {
                balances[networkName][address] = {
                    native: RPC_ENDPOINTS[networkName] ? await getNativeBalance(networkName, address) : null,
                    tokens: {}
                };

                // Fetch EVM token balances
                for (let token of contractAddresses) {
                    balances[networkName][address].tokens[token] = await getTokenBalance(networkName, address, token);
                }
            }
        }
    }
    res.json(balances);
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});