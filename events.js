const Web3 = require('web3');
const moment = require('moment');
const {
    contractAbi,
    contractAddress
} = require('./sample_contract');

// First one MUST be Infura - this is our source of truth for this test
const clients = [
    // {name: "Infura", url: "https://mainnet.infura.io/v3/6e3487b19a364da6965ca35a72fb6d68"}, //infura endpoint
    {
        name: "geth-7545",
        url: "http://kartoha.orbs-test.com:8545"
    }, //geth endpoint
    // {name: "geth-aws-nano-7545", url: "http://3.126.117.88:7545"}, //geth endpoint
    // {name: "parity-aws-nano-8545", url: "https://3.126.117.88:8546"}, //parity endpoint
    // {name: "parity-8545", url: "http://127.0.0.1:8545"}, //parity endpoint
    // {name: "parity-8550", url: "http://127.0.0.1:8550"}, //parity endpoint
];

let interval = 20000;

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


    let blockCache = {};
    let rows = [];
    try {
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

            // Get timestamp (with block cache)
            // let transactionBlock = blockCache[event.blockNumber];
            // if (transactionBlock == undefined) {
            //     transactionBlock = await web3.eth.getBlock(event.blockNumber);
            //     blockCache[event.blockNumber] = transactionBlock;
            // }

            // let unix_date = transactionBlock.timestamp;
            // let jsDate = new Date(unix_date * 1000);
            // let human_date = jsDate.toUTCString();
            // human_date = human_date.slice(0, 3) + human_date.slice(4);
            let unix_date, human_date;

            let amount = 0;
            let logData = [];
            console.log(`[${web3.clientName || 'NA'}] BlockNum=${event.blockNumber} Source=${sourceAddress} recipient=${receipientAddress}`);
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
    } catch (error) { // split event extraction to 2 parts
        if (error.message.includes("-32005")) {
            let interval = endBlock - startBlock;
            // try log execution
            let halfInterval = Math.floor(interval / 2);
            let startPlusHalf = startBlock + halfInterval;
            let firstHalf = await getAllPastEvents(web3, contract, startBlock, startPlusHalf - 1, eventName, requireSuccess);
            if (startPlusHalf + halfInterval < endBlock) {
                // handle odd integer division from a couple of lines back
                halfInterval++;
            }
            let secondHalf = await getAllPastEvents(web3, contract, startPlusHalf, startPlusHalf + halfInterval, eventName, requireSuccess);
            return firstHalf.concat(secondHalf);
        } else {
            console.log(error);
            return [];
        }
    }
}

async function readAndMergeEvents(web3, contract, startBlock, endBlock, eventName, requireSuccess) {
    let events = [];
    console.log('\x1b[33m%s\x1b[0m', `[${web3.clientName}] Reading from block ${startBlock} to block ${endBlock}`);

    let curBlockInt = parseFloat(startBlock);
    let endBlockInt = parseFloat(endBlock);

    while (curBlockInt < endBlockInt) {
        let targetBlock = curBlockInt + interval - 1;
        if (targetBlock > endBlockInt) {
            targetBlock = endBlockInt
        }

        let eventsInterval = await getAllPastEvents(web3, contract, curBlockInt, targetBlock, eventName, requireSuccess);
        console.log('\x1b[33m%s\x1b[0m', `Found ${eventsInterval.length} ${eventName} events of Contract Address ${contract.address} between blocks ${curBlockInt} , ${targetBlock}`);
        curBlockInt += interval;
        events = events.concat(eventsInterval);
    }
    console.log('\x1b[33m%s\x1b[0m', `[${web3.clientName}] Found total of ${events.length} ${eventName} events of Contract Address ${contract.address} between blocks ${startBlock} , ${endBlock}`);
    return events;
}

async function getEvents(web3, contract, startBlock, endBlock, eventName) {
    try {
        const eventsData = await readAndMergeEvents(web3, contract, startBlock, endBlock, eventName, false);
        return eventsData;
    } catch (err) {
        console.log(`Error extracting events: ${err}`);
        return [];
    }

}

async function main() {
    // let startBlock = "9929090";
    // let startBlock = "9402000"; //transactions start at 7437000; //contract created at 5710114
    
    for (let i = 0; i < clients.length; i++) {
        clients[i].web3 = await new Web3(new Web3.providers.HttpProvider(clients[i].url));
        clients[i].web3.clientName = clients[i].name;
    }
    console.log('Created web3 instance for all clients');

    let endBlock = await clients[0].web3.eth.getBlockNumber(); //"9402050"; // last elections as of now.. first election at 7528900    
    let startBlock = endBlock - 6500*3;

    const startBlockTimestamp = moment.unix((await clients[0].web3.eth.getBlock(startBlock)).timestamp);
    const endBlockTimestamp = moment.unix((await clients[0].web3.eth.getBlock(endBlock)).timestamp);
    
    console.log(`Time passed between blocks: ${moment.duration(endBlockTimestamp.diff(startBlockTimestamp)).as('days')} days`);

    const contract = await new clients[0].web3.eth.Contract(contractAbi, contractAddress);
    console.log('Created contract instance using Infura');

    let start = moment();
    for (let i = 0; i < clients.length; i++) {
        try {
            console.log(`>>> Getting block number from ${clients[i].url}`);
            console.log(`>>> Current block number (${clients[i].name}): ${await clients[i].web3.eth.getBlockNumber()}, getting events now..`);
            clients[i].events = await getEvents(clients[i].web3, contract, startBlock, endBlock, "Transfer");
            // clients[i].eventsStr = JSON.stringify(clients[i].events);
            console.log(`>>> Completed collection of events from ${clients[i].name}`);
        } catch (err) {
            console.log(`Error in ${clients[i].name}, skipping..`, err);
            clients[i].events = null;
            clients[i].eventsStr = null;
        }
    }
    console.log('\x1b[33m%s\x1b[0m', `Took ${moment.duration(moment().diff(start)).as('seconds')}s to process ${endBlock - startBlock} blocks from ${startBlock} to ${endBlock}`);
    // for (let i = 1; i < clients.length; i++) {
    //     console.log(`Compare ${clients[0].name} to ${clients[i].name}: `, clients[0].eventsStr === clients[i].eventsStr);
    // }
}

async function getBlockNumberFromInfura() {
    const web3 = await new Web3(new Web3.providers.HttpProvider(infuraEthereumConnectionURL));
    blockNumber = await web3.eth.getBlockNumber();
    return blockNumber;
}

main()
    .then(results => {
        console.log('\x1b[33m%s\x1b[0m', "\n\nDone!!\n");
    }).catch(console.error);