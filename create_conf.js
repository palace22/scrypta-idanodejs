const ScryptaCore = require('@scrypta/core')
const scrypta = new ScryptaCore
const fs = require('fs')
const homedir = require('os').homedir();
const lyraconf = require('path').join(homedir, '.lyra') + '/lyra.conf'
console.log('CONFIG PATH IS ' + lyraconf)
const idanodeconf = './.env'

async function create() {
    let rpcuser = await scrypta.createAddress('-')
    let idanodekey = await scrypta.createAddress('-')

    let lyraconfcontent = `rpcuser=` + rpcuser.pub + `\nrpcpassword=` + rpcuser.prv + `\nrpcallowip=127.0.0.1\nlisten=1\nserver=1\ndaemon=1\nindex=1\ntxindex=1\nlogtimestamps=1`
    let idanodeconfcontent = `RPCUSER=` + rpcuser.pub + `\nRPCPASSWORD=` + rpcuser.prv + `\nRPCPORT=42223\nRPCPORT_TESTNET=51475\nRPCADDRESS=localhost\nDEBUG=true\nDB_PORT=28015\nDB_HOST=localhost\nCOIN=LYRA\nSYNC=true\nAIRDROP=0\nSERVERMODE=true\nTESTNET=false\nP2PPORT=42226\nNODE_KEY=` + idanodekey.prv + `\nADMIN_PUBKEY=` + idanodekey.key + ``

    try {
        fs.writeFileSync(lyraconf, lyraconfcontent)
        console.log('WROTED CONFIG FILE')
        let checkLyraConf = fs.readFileSync(lyraconf, { encoding: 'utf8' })
        if (checkLyraConf === lyraconfcontent) {
            console.log('CONFIG FILE VERIFIED, CREATING IDANODE CONFIG FILE')
            fs.writeFileSync(idanodeconf, idanodeconfcontent)
            let checkIdaConf = fs.readFileSync(lyraconf, { encoding: 'utf8' })
            if (checkLyraConf === lyraconfcontent) {
                console.log('CONFIGURATIONS FILE WROTED CORRECTLY!')
            }else{
                console.log('CAN\'T VERIFY IDANODE FILE, RETRY.')
            }
        }else{
            console.log('CAN\'T VERIFY CONFIG FILE, STOPPING.')
        }
    } catch (e) {
        console.log(e)
    }
}

create()