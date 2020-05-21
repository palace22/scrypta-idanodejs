import * as express from 'express'
import * as wallet from "./routes/Wallet"
import * as explorer from "./routes/Explorer"
import * as ipfs from "./routes/Ipfs"
import * as trustlink from "./routes/Trustlink"
import * as pdm from "./routes/Pdm"
import * as dapps from "./routes/dApps"
import * as sidechains from "./routes/SideChains"
import * as p2p from "./routes/P2PEngine"
const messages = require('./libs/p2p/messages.js')
const axios = require('axios')
var Multiaddr = require('multiaddr')
var bodyParser = require('body-parser')
var cors = require('cors')
const IPFS = require('ipfs')
const console = require('better-console')
const publicIp = require('public-ip');

global['txidcache'] = []
global['utxocache'] = []
global['sxidcache'] = []
global['usxocache'] = []
global['chunkcache'] = []
global['syncLock'] = false
global['isSyncing'] = false
global['syncTimeout'] = null
global['limit'] = 200

if(process.env.TESTNET !== undefined){
  if(process.env.TESTNET === 'true'){
    // TESTNET BLOCKCHAIN PARAMS
    global['lyraInfo'] = {
      private: 0xae,
      public: 0x7f,
      scripthash: 0x13
    }
  }else{
    // MAINNET BLOCKCHAIN PARAMS
    global['lyraInfo'] = {
      private: 0xae,
      public: 0x30,
      scripthash: 0x0d
    }
  }
}else{
  // MAINNET BLOCKCHAIN PARAMS
  global['lyraInfo'] = {
    private: 0xae,
    public: 0x30,
    scripthash: 0x0d
  }
}

class App {
  public express
  public db
  public Wallet

  constructor () {
    const app = this
    app.express = express()
    app.initIPFS()
    p2p.initP2P()
    app.express.use(bodyParser.urlencoded({extended: true, limit: global['limit'] + 'mb'}))
    app.express.use(bodyParser.json({limit: global['limit'] + 'mb'}))
    app.express.use(express.static('public'))

    var corsOptions = {
      "origin": "*",
      "methods": "GET,HEAD,PUT,PATCH,POST,DELETE,OPTION",
      "preflightContinue": true,
      "optionsSuccessStatus": 204
    }
    app.express.use(cors(corsOptions))
    app.express.options('*', cors())

    //ADDRESSES
    app.express.post('/init',wallet.init)
    app.express.post('/send',wallet.send)
    app.express.post('/sendrawtransaction', wallet.sendrawtransaction)
    app.express.post('/decoderawtransaction', wallet.decoderawtransaction)

    //WALLET
    app.express.get('/wallet/getinfo',wallet.getinfo)
    app.express.get('/wallet/getnewaddress/:internal',wallet.getnewaddress)
    app.express.get('/wallet/getnewaddress',wallet.getnewaddress)
    app.express.get('/wallet/masternodelist',wallet.getmasternodelist)
    app.express.get('/wallet/integritycheck',wallet.integritycheck)

    //PROGRESSIVE DATA MANAGEMENT
    app.express.post('/write', pdm.write)
    app.express.post('/read', pdm.read)
    app.express.post('/invalidate', pdm.invalidate)
    app.express.post('/received', pdm.received)

    //TRUSTLINK
    app.express.post('/trustlink/init', trustlink.init)
    app.express.post('/trustlink/write', trustlink.write)
    app.express.post('/trustlink/send', trustlink.send)
    app.express.post('/trustlink/invalidate', trustlink.invalidate)

    //SIDECHAINS
    app.express.post('/sidechain/issue', sidechains.issue)
    app.express.post('/sidechain/reissue', sidechains.reissue)
    app.express.post('/sidechain/send', sidechains.send)
    app.express.post('/sidechain/balance', sidechains.balance)
    app.express.post('/sidechain/shares', sidechains.shares)
    app.express.post('/sidechain/transactions', sidechains.transactions)
    app.express.post('/sidechain/transaction', sidechains.transaction)
    app.express.post('/sidechain/listunspent', sidechains.listunspent)
    app.express.get('/sidechain/list', sidechains.listchains)
    app.express.post('/sidechain/get', sidechains.getsidechain)
    app.express.post('/sidechain/scan/address', sidechains.scanaddress)
    app.express.post('/sidechain/scan', sidechains.scanchain)
    app.express.post('/sidechain/verify', sidechains.verifychain)
    app.express.post('/sidechain/validate', sidechains.validatetransaction)
    
    //DAPPS
    app.express.post('/dapps/upload', dapps.upload)

    //IPFS
    app.express.get('/ipfs/info', ipfs.info)
    app.express.post('/ipfs/add', ipfs.add)
    app.express.post('/ipfs/verify/:hash', ipfs.verify)
    app.express.get('/ipfs/type/:hash', ipfs.filetype)
    app.express.get('/ipfs/ls/:hash', ipfs.ls)
    app.express.get('/ipfs/:hash', ipfs.getfile)
    app.express.get('/ipfs/buffer/:hash', ipfs.getfilebuffer)
    app.express.get('/ipfs/:hash/:folder', ipfs.getfolder)
    app.express.get('/ipfs/pins', ipfs.pins)

    //EXPLORER 
    app.express.get('/block/last',explorer.getlastblock)
    app.express.get('/block/:block',explorer.getblock)
    app.express.get('/analyze/mempool',explorer.analyzemempool)
    app.express.get('/analyze/:block',explorer.analyzeblock)
    app.express.get('/transactions/:address', explorer.transactions)
    app.express.get('/balance/:address', explorer.balance)
    app.express.get('/validate/:address', explorer.validate)
    app.express.get('/stats/:address', explorer.stats)
    app.express.get('/unspent/:address', explorer.unspent)
    app.express.get('/cleanmempool',explorer.cleanmempool)
    app.express.get('/networkstats',explorer.networkstats)

    //P2P-NETWORK
    app.express.post('/broadcast', p2p.broadcast)
  }

  async initIPFS() {
    global['ipfs'] = new IPFS({ repo: 'ipfs_data' })
    /*
    setTimeout(async function(){
      console.info('Connecting to other peers via IPFS')
      const multiAddrs = await global['ipfs'].swarm.localAddrs()
      let listenerAddress = multiAddrs[1].toString('hex')
      await messages.signandbroadcast('ipfs-swarm', listenerAddress)
      let nodes = await axios.get('https://raw.githubusercontent.com/scryptachain/scrypta-idanode-network/master/peers')
      let bootstrap = nodes.data.split("\n")
      for(let k in bootstrap){
        let node = bootstrap[k].split(':')
        let publicip = await publicIp.v4().catch(err => {
          console.log('Public IP not available')
        })
        if (node[1] !== publicip) {
          try{
            console.info('Asking IPFS peer to ' + node[1])
            axios.get('http://' + node[1] + ':3001/ipfs/info').then(ipfsinfo => {
              if(ipfsinfo.data.peer !== undefined){
                let ipfs_peer = new Multiaddr(ipfsinfo.data.peer)
                global['ipfs'].swarm.connect(ipfs_peer)
              }else{
                console.error('No IPFS peer found at ' + node[1])
              }
            })
          }catch(e){
            console.log(e)
          }
        }
      }
    },10000)*/
  }
}

export default new App().express
