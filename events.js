const Web3 = require('web3');
const moment = require('moment');
const {
    contractAbi,
    contractAddress
} = require('./sample_contract');

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

async function getEvents(web3, contract, startBlock, endBlock, eventName) {
    try {
        return await getAllPastEvents(web3, contract, startBlock, endBlock, eventName, false);
    } catch (err) {
        console.log(`Error extracting events: ${err}`);
        return [];
    }
}

const name = "eth-light-client";
const url = "http://kartoha.orbs-test.com:8545";

async function main() {
    // let startBlock = "9929090";
    // let startBlock = "9402000"; //transactions start at 7437000; //contract created at 5710114

    const web3 = await new Web3(new Web3.providers.HttpProvider(url));
    console.log('Created web3 instance for all clients');

    let endBlock = await web3.eth.getBlockNumber(); //"9402050"; // last elections as of now.. first election at 7528900    
    let startBlock = endBlock - 6500*3;

    const startBlockTimestamp = moment.unix((await web3.eth.getBlock(startBlock)).timestamp);
    const endBlockTimestamp = moment.unix((await web3.eth.getBlock(endBlock)).timestamp);
    
    console.log(`Time passed between blocks: ${moment.duration(endBlockTimestamp.diff(startBlockTimestamp)).as('days')} days`);

    const contract = await new web3.eth.Contract(contractAbi, contractAddress);
    console.log('Created contract instance using Infura');

    let start = moment();
    let events = [];
    try {
        console.log(`>>> Getting block number from ${url}`);
        console.log(`>>> Current block number (${name}): ${await web3.eth.getBlockNumber()}, getting events now..`);
        events = await getEvents(web3, contract, startBlock, endBlock, "Transfer");

        console.log(`>>> Completed collection of events from ${name}`);
    } catch (err) {
        console.log(`Error in ${name}, skipping..`, err);
        events = [];
    }
    console.log('\x1b[33m%s\x1b[0m', `Found total of ${events.length} events of Contract Address ${contractAddress} between blocks ${startBlock} , ${endBlock}`);
    console.log('\x1b[33m%s\x1b[0m', `Took ${moment.duration(moment().diff(start)).as('seconds')}s to process ${endBlock - startBlock} blocks from ${startBlock} to ${endBlock}`);
}

main()
    .then(results => {
        console.log('\x1b[33m%s\x1b[0m', "\n\nDone!!\n");
    }).catch(console.error);