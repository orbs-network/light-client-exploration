const Web3 = require('web3');
const moment = require('moment');
const {
    contractAbi,
    contractAddress
} = require('./sample_contract');
const { readFileSync, writeFileSync } = require("fs");

function getFromAddressAddressFromEvent(event) {
    const TOPIC_FROM_ADDR = 1;
    let topic = event.raw.topics[TOPIC_FROM_ADDR];
    return '0x' + topic.substring(26);
}

function getToAddressAddressFromEvent(event) {
    const TOPIC_TO_ADDR = 2;
    let topic = event.raw.topics[TOPIC_TO_ADDR];
    if (topic != null) {
        return '0x' + topic.substring(26);
    }
    return "NA";
}

function generateRowObject(amount, block, transactionIndex, txHash, transferFrom, transferTo, method, unix_date, human_date, logData) {
    return {
        amount,
        block,
        transactionIndex,
        txHash,
        transferFrom,
        transferTo,
        method,
        unix_date,
        human_date,
        logData
    }
}

async function getAllPastEvents(web3, contract, startBlock, endBlock, eventName, requireSuccess) {
    if (!contract) {
        throw "Missing contract";
    }
    let options = {
        fromBlock: startBlock,
        toBlock: endBlock
    };


    let rows = [];
    let events = await contract.getPastEvents(eventName, options);
    for (let i = events.length - 1; i >= 0; i--) {
        let event = events[i];
        if (requireSuccess) {
            let curTxnReceipt = await web3.eth.getTransactionReceipt(event.transactionHash);
            if (curTxnReceipt == null) {
                throw "Could not find a transaction for your id! ID you provided was " + event.transactionHash;
            } else {
                if (curTxnReceipt.status == '0x0') {
                    console.log("Transaction failed, event ignored txid: " + event.transactionHash);
                    continue;
                }
            }
        }

        let sourceAddress = getFromAddressAddressFromEvent(event);
        let receipientAddress = getToAddressAddressFromEvent(event);

        let unix_date, human_date;

        let amount = 0;
        let logData = [];
        // console.log(`BlockNum=${event.blockNumber} Source=${sourceAddress} recipient=${receipientAddress}`);
        // console.log(`EventRaw=${JSON.stringify(event)}`);
        if (event.raw.data != null) { // no data for guardians event
            if (event.event === "VoteOut") {
                logData = web3.eth.abi.decodeLog([{
                    type: 'address',
                    name: 'sender',
                    indexed: true
                }, {
                    type: 'address[]',
                    name: 'validators'
                }, {
                    type: 'uint256',
                    name: 'counter'
                }], event.raw.data, event.raw.topics[1]);

            } else {
                amount = web3.utils.toBN(event.raw.data);
            }
        }
        let obj = generateRowObject(amount, event.blockNumber, event.transactionIndex, event.transactionHash, sourceAddress, receipientAddress, event.event, unix_date, human_date, logData);
        rows.push(obj);
    }
    return rows;
}

const name = "eth-light-client";
const url = "http://kartoha.orbs-test.com:8545";

async function processBatch(web3, contract, startBlock, endBlock, eventName) {
    let start = moment();
    const events = await getAllPastEvents(web3, contract, startBlock, endBlock, eventName, false);
    return {
        startBlock, 
        endBlock,
        duration: moment.duration(moment().diff(start)).as('seconds'),
        count: events.length,
    }
}

function loadData() {
    try {
        return JSON.parse(readFileSync("./status.json"));
    } catch (e) {
        console.log(`WARN: ${e}`);
        return [];
    }
}

function saveData(persistence) {
    writeFileSync("./status.json", JSON.stringify(persistence, 2, 2));
}

async function wait(intervalInMs) {
    return new Promise((resolve, reject) => {
        setTimeout(resolve, intervalInMs);
    })
}

async function main() {
    // let startBlock = "9929090";
    // let startBlock = "9402000"; //transactions start at 7437000; //contract created at 5710114

    const web3 = await new Web3(new Web3.providers.HttpProvider(url));
    console.log('Created web3 instance for all clients');

    while(true) {
        let startBlock, endBlock;
        try {
            let persistence = loadData();

            endBlock = await web3.eth.getBlockNumber();
            startBlock = 7437000;
            // let startBlock = endBlock - 6500*3;
            if (persistence.length > 0) {
                startBlock = persistence[persistence.length - 1].endBlock;
            }
    
            const startBlockTimestamp = moment.unix((await web3.eth.getBlock(startBlock)).timestamp);
            const endBlockTimestamp = moment.unix((await web3.eth.getBlock(endBlock)).timestamp);
            
            console.log(`Time passed between blocks: ${moment.duration(endBlockTimestamp.diff(startBlockTimestamp)).as('days')} days`);
    
            const contract = await new web3.eth.Contract(contractAbi, contractAddress);
    
            const batchSize = 1000;
            for (let i = startBlock; i <= endBlock; i+=batchSize) {
                const maxEnd = i + batchSize > endBlock ? endBlock : i + batchSize;
                const status = await processBatch(web3, contract, i, maxEnd, "Transfer");
                console.log(status);
    
                persistence.push(status);
                saveData(persistence);
            }
        } catch (e) {
            console.log(`ERROR [${startBlock}:${endBlock}]: ${e}`);
        }

        const timeout = 10000;
        await wait(timeout); // 1m
        console.log(`Waiting for ${timeout}ms...`)
    }
}

main()
    .then(results => {
        console.log('\x1b[33m%s\x1b[0m', "\n\nDone!!\n");
    }).catch(console.error);