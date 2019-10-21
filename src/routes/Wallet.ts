import express = require("express")
import * as Crypto from '../libs/Crypto'
import * as Utilities from '../libs/Utilities'
const mongo = require('mongodb').MongoClient

export async function getinfo(req: express.Request, res: express.Response) {
    var wallet = new Crypto.Wallet;
    mongo.connect(global['db_url'], global['db_options'], async function(err, client) {
        const db = client.db(global['db_name'])
        let result = await db.collection('settings').find({setting: 'sync'}).toArray()
        client.close()
        var lastindexed = "0"
        if(result[0].value !== undefined){
            lastindexed = result[0].value
        }

        wallet.request('getinfo').then(function(info){
            info['result']['indexed'] = parseInt(lastindexed)
            var toindex = parseInt(info['result']['blocks']) - parseInt(lastindexed)
            info['result']['toindex'] = toindex
            res.json(info['result'])
        })
    })
};

export async function getmasternodelist(req: express.Request, res: express.Response) {
    var wallet = new Crypto.Wallet;

    wallet.request('masternode',['count']).then(function(count){
        wallet.request('masternode',['list']).then(function(list){
            wallet.request('masternode',['current']).then(function(current){
                var response = {
                    count: count['result'],
                    current: current['result'],
                    list: list['result']
                }
                res.json(response)
            })
        })
    })
};

export async function decoderawtransaction(req: express.Request, res: express.Response) {
    var wallet = new Crypto.Wallet;
    var parser = new Utilities.Parser
    var request = await parser.body(req)
    if(request['body']['rawtransaction'] !== undefined){
        wallet.request('decoderawtransaction',[request['body']['rawtransaction']]).then(function(decoded){
            res.json({
                transaction: decoded['result'],
                status: 200
            })
        })
    }else{
        res.json({
            data: 'Provide raw transaction (hex) first.',
            status: 402
        })
    }
};

export async function init(req: express.Request, res: express.Response) {
    var wallet = new Crypto.Wallet;
    var parser = new Utilities.Parser
    var request = await parser.body(req)
    if(request['body']['address'] !== undefined){
        var txid
        var airdrop = (request['body']['airdrop'] === 'true' || request['body']['airdrop'] === true)
        if(request['body']['airdrop'] !== undefined && airdrop === true){
            var wallet = new Crypto.Wallet;
            var balance = await wallet.request('getbalance')
            var airdrop_value = parseFloat(process.env.AIRDROP)
            if(balance['result'] > airdrop_value){
                var airdrop_tx = await wallet.request('sendtoaddress',[request['body']['address'],airdrop_value])
                txid = airdrop_tx['result']
            }else{
                console.log('Balance insufficient for airdrop')
            }
        }
        res.json({
            data: {
                dapp_address: request['body']['address'],
                airdrop_tx: txid
            },
            status: 200
        })
    }else{
        res.json({
            data: 'Provide address first.',
            status: 402
        })
    }
};

export async function send(req: express.Request, res: express.Response) {
    var wallet = new Crypto.Wallet;
    var parser = new Utilities.Parser
    var request = await parser.body(req)
    if(request['body']['from'] !== undefined && request['body']['to'] !== undefined && request['body']['amount'] !== undefined && request['body']['private_key'] !== undefined){
        var from = request['body']['from']
        var to = request['body']['to']
        var amount = request['body']['amount']
        var private_key = request['body']['private_key']
        
        var metadata
        if(request['body']['message'] !== undefined){
            metadata = request['body']['message']
        }

        wallet.request('validateaddress',[from]).then(async response => {
            var validation = response['result']
            if(validation.isvalid === true){
                wallet.request('validateaddress',[to]).then(async response => {
                    var validation = response['result']
                    if(validation.isvalid === true){
                        if(parseFloat(amount) > 0){
                            var txid = <string> await wallet.send(private_key,from,to,amount,metadata) 
                            if(txid !== 'false'){
                                res.json({
                                    data: {
                                        success: true,
                                        txid: txid
                                    },
                                    status: 200
                                })
                            }else{
                                res.json({
                                    data: {
                                        success: false
                                    },
                                    status: 501
                                })
                            }
                        }else{
                            res.json({
                                data: 'Amount must be grater than zero.',
                                status: 402
                            })
                        }
                    }else{
                        res.json({
                            data: 'Receiving address is invalid.',
                            status: 402
                        })
                    }
                })
            }else{
                res.json({
                    data: 'Sending address is invalid.',
                    status: 402
                })
            }
        })
    }else{
        res.json({
            data: 'Provide from, to, amount and private key first.',
            status: 402
        })
    }
};

export async function sendrawtransaction(req: express.Request, res: express.Response) {
    var wallet = new Crypto.Wallet;
    var parser = new Utilities.Parser
    var request = await parser.body(req)
    if(request['body']['rawtransaction'] !== undefined){
        wallet.request('sendrawtransaction',[request['body']['rawtransaction']]).then(async response => {
            res.json({
                data: response['result'],
                status: 200
            })
        })
    }else{
        res.json({
            data: 'Provide raw transaction first.',
            status: 402
        })
    }    
};