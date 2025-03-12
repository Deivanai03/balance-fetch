const express = require('express');
const { ethers } = require('ethers');
require('dotenv').config();

const app = express();
app.use(express.json());
const PORT = process.env.PORT || 3002;

const RPC_ENDPOINT = process.env.RPC_ENDPOINT;
const provider = new ethers.JsonRpcProvider(RPC_ENDPOINT);

const ERC20_ABI = [
    {
        "anonymous": false,
        "inputs": [
            { "indexed": true, "name": "from", "type": "address" },
            { "indexed": true, "name": "to", "type": "address" },
            { "indexed": false, "name": "value", "type": "uint256" }
        ],
        "name": "Transfer",
        "type": "event"
    },
    {
        "anonymous": false,
        "inputs": [
            { "indexed": true, "name": "owner", "type": "address" },
            { "indexed": true, "name": "spender", "type": "address" },
            { "indexed": false, "name": "value", "type": "uint256" }
        ],
        "name": "Approval",
        "type": "event"
    }
];

async function getTransactionLogs(txHash) {
    try {
        const tx = await provider.getTransaction(txHash);

        if (!tx) {
            return { error: 'Transaction not found' };
        }

        const receipt = await provider.getTransactionReceipt(txHash);

        if (!receipt) {
            return { error: 'Transaction still pending' };
        }

        let decodedLogs = [];
        for (let log of receipt.logs) {
            try {
                const interface = new ethers.Interface(ERC20_ABI);
                if (!log.topics || log.topics.length === 0) {
                    console.warn("Skipping log with no topics: ", log);
                    continue;
                }
                const decodedLog = interface.parseLog(log);
                if (!decodedLog) {
                    console.warn("Skipping log: Unable to decode", log);
                    continue;
                }

                const parsedArgs = {};
                for (let key in decodedLog.args) {
                    parsedArgs[key] = typeof decodedLog.args[key] === 'bigint'
                        ? decodedLog.args[key].toString()
                        : decodedLog.args[key];

                }
                decodedLogs.push({ ...decodedLog, args: parsedArgs });
            } catch (error) {
                console.error('Error decoding log:', error);
            }
        }
        return decodedLogs;
    } catch (error) {
        console.error("Error fetching logs: ", error);
    }
}

app.get('/events/:txHash', async (req, res) => {
    try {
        const { txHash } = req.params;
        const logs = await getTransactionLogs(txHash);
        res.json(logs);
    } catch (error) {
        console.error('Error: ', error);
    }

});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
})