https://medium.com/datawallet-blog/how-to-deploy-a-local-private-ethereum-blockchain-c2b497f068f4

Geth account:

0xb414409E3B77Ce06f8cF0b08110E4F9682867f42
node01/keystore/UTC--2020-01-19T17-33-14.090315000Z--b414409e3b77ce06f8cf0b08110e4f9682867f42
Password: abcdef

0x2e54C39F3EaFAAa3b88b39871d79C976f1cEd22e
node01/keystore/UTC--2020-01-19T17-35-10.021618000Z--2e54c39f3eafaaa3b88b39871d79c976f1ced22e
Password: abcdef

mkdir node01 node02 node03

Run this twice, and log the results like the accounts above:
../geth-alltools-darwin-amd64-1.9.9-01744997/geth --datadir node01 account new


../geth-alltools-darwin-amd64-1.9.9-01744997/geth --datadir node01 init /PATH_TO/genesis.json

Start the node:
../geth-alltools-darwin-amd64-1.9.9-01744997/geth --identity "IDO01" --rpc --rpcport "8000" --rpccorsdomain "*" --datadir node01 --port "30303" --nodiscover --rpcapi "db,eth,net,web3,personal,miner,admin" --networkid 1900 --nat "any"

Connect to the node:
../geth-alltools-darwin-amd64-1.9.9-01744997/geth attach http://127.0.0.1:8000

Show accounts:
eth.accounts

