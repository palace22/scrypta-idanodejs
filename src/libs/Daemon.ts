"use strict";
import express = require("express")
import * as Crypto from './Crypto'
import * as Sidechain from './Sidechain'
require('dotenv').config()
const mongo = require('mongodb').MongoClient

var blocks = 0
var analyze = 0
var db
var analyzed = 0
const fs = require('fs')

module Daemon {

  export class Sync {
    
    public async init() {
        mongo.connect(global['db_url'], global['db_options'], async function(err, client) {
            db = client.db(global['db_name'])
            var wallet = new Crypto.Wallet
            wallet.request('getinfo').then(info => {
                blocks = info['result'].blocks
                console.log('FOUND ' + blocks + ' BLOCKS IN THE BLOCKCHAIN')
                var task = new Daemon.Sync
                task.process()
            })
        })
    }

    public async process(){
        var reset = '' //CHECK FOR RESET VALUE
        const sync = await db.collection('settings').find({setting:'sync'}).limit(1).toArray();
        var last
        if(sync[0] === undefined){
            console.log('Sync lock not found, creating')
            await db.collection('settings').insertOne({setting:'sync', value: 0});
            last = 0
        }else{
            last = sync[0].value
        }
        if(reset !== undefined && reset === ''){
            if(last !== null && last !== undefined){
                analyze = parseInt(last) + 1
            }else{
                analyze = 1
            }
        }else{
            analyze = 1
        }

        // ANALYZING MEMPOOL
        console.log('\x1b[32m%s\x1b[0m', 'ANALYZING MEMPOOL')
        var wallet = new Crypto.Wallet
        var mempool = await wallet.analyzeMempool()
        for(var address in mempool['data_written']){
            var data = mempool['data_written'][address]
            console.log('\x1b[32m%s\x1b[0m', 'FOUND WRITTEN DATA FOR ' + address + '.')
            for(var dix in data){
                var task = new Daemon.Sync
                await task.storewritten(data[dix])
            }
        }

        for(var address in mempool['data_received']){
            var data = mempool['data_received'][address]
            console.log('\x1b[32m%s\x1b[0m', 'FOUND RECEIVED DATA FOR ' + address + '.')
            for(var dix in data){
                var task = new Daemon.Sync
                await task.storereceived(data[dix])
            }
        }

        if(analyze <= blocks){
            if(global['syncLock'] === false){
                var task = new Daemon.Sync
                task.analyze()
            }
        }else{
            console.log('SYNC FINISHED, RESTART IN 10 SECONDS')
            global['syncTimeout'] = setTimeout(function(){
                var task = new Daemon.Sync
                task.init()
            },10000)
        }
    }

    public async analyze(toAnalyze = null){
        if(toAnalyze !== null){
            analyze = toAnalyze
        }
        
        // ANLYZING BLOCK
        if(analyze > 0){
            console.log('\x1b[32m%s\x1b[0m', 'ANALYZING BLOCK ' + analyze)
            
            var wallet = new Crypto.Wallet
            var blockhash = await wallet.request('getblockhash',[analyze])
            var block = await wallet.analyzeBlock(blockhash['result'])
            
            for(var txid in block['analysis']){
                for(var address in block['analysis'][txid]['balances']){
                    var tx = block['analysis'][txid]['balances'][address]
                    var movements = block['analysis'][txid]['movements']
                    var task = new Daemon.Sync
                    console.log('STORING '+ tx.type +' OF '+ tx.value + ' ' + process.env.COIN + ' FOR ADDRESS ' + address)
                    await task.store(address, block, txid, tx, movements)
                }
            }

            for(var i in block['outputs']){
                let unspent = block['outputs'][i]
                var found = false
                for(var i in block['inputs']){
                    let input = block['inputs'][i]
                    if(input['txid'] === unspent['txid'] && input['vout'] === unspent['vout']){
                        found = true
                    }
                }
                if(found === false){
                    await task.storeunspent(unspent['address'], unspent['vout'], unspent['txid'], unspent['amount'], unspent['scriptPubKey'], analyze)
                }else{
                    console.log('\x1b[35m%s\x1b[0m', 'IGNORING OUTPUS BECAUSE IT\'S USED IN THE SAME BLOCK.')
                }
            }

            for(var i in block['inputs']){
                let input = block['inputs'][i]
                await task.redeemunspent(input['txid'], input['vout'])
            }
            console.log('CLEANING UTXO CACHE')
            global['utxocache'] = []
            global['txidcache'] = []
            for(var address in block['data_written']){
                var data = block['data_written'][address]
                console.log('\x1b[32m%s\x1b[0m', 'FOUND WRITTEN DATA FOR ' + address + '.')
                for(var dix in data){
                    var task = new Daemon.Sync
                    await task.storewritten(data[dix])
                }
            }

            for(var address in block['data_received']){
                var data = block['data_received'][address]
                console.log('\x1b[32m%s\x1b[0m', 'FOUND RECEIVED DATA FOR ' + address + '.')
                for(var dix in data){
                    var task = new Daemon.Sync
                    await task.storereceived(data[dix])
                }
            }

            var remains = blocks - analyze
            console.log('\x1b[33m%s\x1b[0m', remains + ' BLOCKS UNTIL END.')
            await db.collection('settings').updateOne({setting: "sync"}, {$set: {value: block['height']}})
            setTimeout(function(){
                var task = new Daemon.Sync
                task.process()
            },10)
        }

    }

    private async store(address, block, txid, tx, movements){
        return new Promise (async response => {
            let check = await db.collection('transactions').find({address: address, txid: txid}).limit(1).toArray();
            if(check[0] === undefined){
                console.log('STORING TX NOW!')
                await db.collection("transactions").insertOne(
                    {
                        address: address,
                        txid: txid,
                        type: tx.type,
                        from: movements.from,
                        to: movements.to,
                        value: tx.value,
                        blockhash: block['hash'],
                        blockheight: block['height'],
                        time: block['time']
                    }
                )
            }else{
                console.log('TX ALREADY STORED.')
            }
            response(block['height'])
        })
    }

    private async storeunspent(address, vout, txid, amount, scriptPubKey, block){
        return new Promise (async response => {
            let check = await db.collection('unspent').find({txid: txid, vout: vout}).limit(1).toArray()
            if(check[0] === undefined){
                console.log('\x1b[36m%s\x1b[0m', 'STORING UNSPENT NOW!')
                await db.collection("unspent").insertOne(
                    {
                        address: address,
                        txid: txid,
                        scriptPubKey: scriptPubKey,
                        amount: amount,
                        vout: vout,
                        block: block
                    }
                )
            }else{
                console.log('UNSPENT ALREADY STORED.')
            }
            response(true)
        })
    }

    private async redeemunspent(txid, vout){
        return new Promise (async response => {
            console.log('\x1b[31m%s\x1b[0m', 'REDEEMING UNSPENT NOW!')
            await db.collection('unspent').deleteOne({txid: txid, vout: vout})
            response(true)
        })
    }

    private async storewritten(datastore){
        return new Promise (async response => {
            let check = await db.collection('written').find({uuid: datastore.uuid, block: datastore.block}).limit(1).toArray()
            if(check[0] === undefined){
                console.log('STORING DATA NOW!', datastore.data)
                if(JSON.stringify(datastore.data).indexOf('ipfs:') !== -1){
                    let parsed = datastore.data.split('***')
                    if(parsed[0] !== undefined){
                        let parsehash = parsed[0].split(':')
                        if(parsehash[1] !== undefined && parsehash[1] !== 'undefined'){
                            console.log('\x1b[42m%s\x1b[0m', 'PINNING IPFS HASH ' + parsehash[1])
                            global['ipfs'].pin.add(parsehash[1], function (err) {
                                if (err) {
                                    throw err
                                }
                            })
                        }
                    }
                }
                if(datastore.uuid !== undefined && datastore.uuid !== ''){
                    await db.collection("written").insertOne(datastore)
                }
            }else{
                if(datastore.block !== undefined){
                    console.log('DATA ALREADY STORED AT BLOCK '+ datastore.block +'.')
                }else{
                    console.log('DATA ALREADY STORED FROM MEMPOOL.')
                }
            }

            if(datastore.protocol === 'chain://'){
                if(datastore.data.genesis !== undefined){
                    let check = await db.collection('sc_transactions').find({sxid: datastore.data.sxid}).limit(1).toArray()
                    if(check[0] === undefined){
                        console.log('STORING GENESIS SXID NOW!')
                        await db.collection("sc_transactions").insertOne(datastore.data)
                    }else{
                        console.log('GENESIS SXID ALREADY STORED.')
                        if(datastore.block === null){
                            await db.collection("sc_unspent").updateOne({sxid: datastore.data.sxid}, {$set: {block: datastore.block}})
                        }
                    }
                }
                if(datastore.data.reissue !== undefined){
                    let check = await db.collection('sc_transactions').find({sxid: datastore.data.sxid}).limit(1).toArray()
                    if(check[0] === undefined){
                        console.log('STORING REISSUE SXID NOW!')
                        await db.collection("sc_transactions").insertOne(datastore.data)
                    }else{
                        console.log('REISSUE SXID ALREADY STORED.')
                        if(datastore.block === null){
                            await db.collection("sc_unspent").updateOne({sxid: datastore.data.sxid}, {$set: {block: datastore.block}})
                        }
                    }
                }

                if(datastore.data.transaction !== undefined){
                    var scwallet = new Sidechain.Wallet;
                    console.log('SC TRANSACTION FOUND.', JSON.stringify(datastore.data))
                    let check = await db.collection('sc_transactions').find({sxid: datastore.data.sxid}).limit(1).toArray()

                    if(check[0] === undefined){
                        let valid = true
                        var amountinput = 0
                        var amountoutput = 0
                        if(datastore.data.transaction.inputs.length > 0){
                            for(let x in datastore.data.transaction.inputs){
                                let sxid = datastore.data.transaction.inputs[x].sxid
                                let vout = datastore.data.transaction.inputs[x].vout
                                let validatesxid = await scwallet.validatesxid(sxid, vout, datastore.data.transaction.inputs[x].sidechain)
                                if(validatesxid === false){
                                    valid = false
                                }
                                amountinput += datastore.data.transaction.inputs[x].amount
                            }
                        }else{
                            valid = false
                        }

                        if(valid === true){
                            for(let x in datastore.data.transaction.outputs){
                                amountoutput += datastore.data.transaction.outputs[x]
                            }
                        }

                        if(valid === true && amountoutput > amountinput){
                            valid = false
                        }

                        var wallet = new Crypto.Wallet;
                        if(valid === true && datastore.data.pubkey !== undefined && datastore.data.signature !== undefined && datastore.data.transaction !== undefined){
                            let validatesign = await wallet.verifymessage(datastore.data.pubkey,datastore.data.signature,JSON.stringify(datastore.data.transaction))
                            if(validatesign === false){
                                valid = false
                            }
                        }else{
                            valid = false
                        }
                        
                        if(valid === true){
                            datastore.data.block = datastore.block
                            let checkTx = await db.collection('sc_transactions').find({sxid: datastore.data.sxid}).limit(1).toArray()
                            if(checkTx[0] === undefined){
                                await db.collection("sc_transactions").insertOne(datastore.data)
                            }else{
                                console.log('SXID STORED YET')
                            }

                            for(let x in datastore.data.transaction.inputs){
                                let sxid = datastore.data.transaction.inputs[x].sxid
                                let vout = datastore.data.transaction.inputs[x].vout
                                await db.collection('sc_unspent').deleteOne({sxid: sxid, vout: vout})
                            }
                            let vout = 0
                            for(let x in datastore.data.transaction.outputs){
                                let amount = datastore.data.transaction.outputs[x]
                                let unspent = {
                                    sxid: datastore.data.sxid,
                                    vout: vout,
                                    address: x,
                                    amount: amount,
                                    sidechain: datastore.data.transaction.sidechain,
                                    block: datastore.block
                                }
                                let checkUsxo = await db.collection('sc_unspent').find({sxid: datastore.data.sxid, vout: vout}).limit(1).toArray()
                                if(checkUsxo[0] === undefined){
                                    await db.collection("sc_unspent").insertOne(unspent)
                                }
                                vout++
                            }
                            console.log('SIDECHAIN TRANSACTION IS VALID')
                        }else{
                            console.log('SIDECHAIN TRANSACTION IS INVALID')
                        }
                    }else{
                        console.log('SIDECHAIN UNSPENT ALREADY STORED.')
                        let checkTx = await db.collection('sc_transactions').find({sxid: datastore.data.sxid}).limit(1).toArray()
                        console.log(checkTx)
                        if(checkTx[0].block === null){
                            await db.collection("sc_transactions").updateOne({sxid: datastore.data.sxid}, {$set: {block: datastore.block}})
                        }

                        let vout = 0
                        for(let x in datastore.data.transaction.outputs){
                            let amount = datastore.data.transaction.outputs[x]
                            let unspent = {
                                sxid: datastore.data.sxid,
                                vout: vout,
                                address: x,
                                amount: amount,
                                sidechain: datastore.data.transaction.sidechain,
                                block: datastore.block
                            }
                            let checkUsxo = await db.collection('sc_unspent').find({sxid: datastore.data.sxid, vout: vout}).limit(1).toArray()
                            if(checkUsxo[0] === undefined){
                                await db.collection("sc_unspent").insertOne(unspent)
                            }else{
                                if(checkUsxo[0].block === null){
                                    await db.collection("sc_unspent").updateOne({sxid: datastore.data.sxid, vout: vout}, {$set: {block: datastore.block}})
                                }
                            }
                            vout++
                        }
                    }
                }
            }
            response('STORED')
        })
    }

    private async storereceived(datastore){
        return new Promise (async response => {
            let check = await db.collection('received').find({txid: datastore.txid, address: datastore.address}).limit(1).toArray()
            if(check[0] === undefined){
                console.log('STORING DATA NOW!')
                await db.collection("received").insertOne(datastore)
            }else{
                console.log('DATA ALREADY STORED.')
            }
            response('STORED')
        })
    }
  }

}

export = Daemon;
