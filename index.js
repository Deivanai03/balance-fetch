const express = require('express');
const axios = require('axios');
require('dotenv').config();

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
                data: `0x70a08231000000000000000000000000${address.substring(2)}`
            }, 'latest'],
            id: 1
        });
        return parseInt(response.data.result, 16) / 1e18;
    } catch (error) {
        console.error(`Error fetching token balance on ${chain}:`, error.message);
        return null;
    }
}

app.post('/balances', async (req, res) => {
    const { contracts, walletAddresses } = req.body;
    if (!walletAddresses || !contracts) return res.status(400).json({ error: 'Invalid request format' });
    
    let balances = {};
    
    for (let { networkName, contractAddresses } of contracts) {
        if (!RPC_ENDPOINTS[networkName]) continue;
        balances[networkName] = {};
        
        for (let address of walletAddresses) {
            balances[networkName][address] = {
                native: await getNativeBalance(networkName, address),
                tokens: {}
            };
            
            for (let token of contractAddresses) {
                balances[networkName][address].tokens[token] = await getTokenBalance(networkName, address, token);
            }
        }
    }
    res.json(balances);
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});