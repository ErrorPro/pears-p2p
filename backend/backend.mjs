// backend/backend.mjs
/* global Bare, BareKit */

import RPC from 'bare-rpc'
import Hyperswarm from 'hyperswarm'
import Hypercore from 'hypercore'
import crypto from 'hypercore-crypto'
import b4a from 'b4a'
import FS from 'bare-fs'
import Path from 'bare-path'

import {
  RPC_JOIN_ROOM,
  RPC_ROOM_READY,
  RPC_NEW_MESSAGE,
  RPC_SEND_MESSAGE,
  RPC_SYSTEM_MESSAGE,
  RPC_LEAVE_ROOM,
  RPC_SERVER_READY,
  RPC_PEER_COUNT
} from '../rpc-commands.mjs'

async function initBackend() {
  const DOCUMENTS_DIR = FS.documentsDirectory || Bare.argv[0] || '/tmp/pear'

  let myCore = null // My writable core
  let peerCores = new Map() // Map of peer cores (read-only)
  let swarm = null
  let currentRoom = null

  const { IPC } = BareKit
  const rpc = new RPC(IPC, onRequest)

  // send ready signal
  rpc.request(RPC_SERVER_READY).send(b4a.from('ready'))

  async function onRequest(req) {
    sendSystemMessage('Received command: ' + req.command)

    if (req.command === RPC_JOIN_ROOM) {
      try {
        const url = b4a.toString(req.data, 'utf8')
        await joinRoom(url)
      } catch (e) {
        sendSystemMessage('Error joining room: ' + e.message)
      }
    }

    if (req.command === RPC_LEAVE_ROOM) {
      try {
        await leaveRoom()
      } catch (e) {
        sendSystemMessage('Error leaving room: ' + e.message)
      }
    }

    if (req.command === RPC_SEND_MESSAGE) {
      if (myCore) {
        const msg = JSON.parse(b4a.toString(req.data, 'utf8'))
        msg.device_id = await getDeviceId()
        msg.me = true

        await myCore.append(JSON.stringify(msg))
        sendSystemMessage('Message appended to my core')
      }
    }
  }

  function sendSystemMessage(text) {
    // TODO: disable logging in prod
    const msg = rpc.request(RPC_SYSTEM_MESSAGE)
    msg.send(b4a.from(text))
  }

  let DEVICE_ID = null
  async function getDeviceId() {
    if (DEVICE_ID) return DEVICE_ID

    try {
      const idPath = Path.join(DOCUMENTS_DIR, '.device-id')
      try {
        DEVICE_ID = await FS.promises.readFile(idPath, 'utf8')
      } catch (e) {
        // Generate new ID if doesn't exist
        DEVICE_ID = crypto.randomBytes(16).toString('hex')
        await FS.promises.writeFile(idPath, DEVICE_ID)
      }
      return DEVICE_ID
    } catch (e) {
      sendSystemMessage('Error getting device ID: ' + e.message)
    }
  }

  async function leaveRoom() {
    sendSystemMessage('Leaving room...')
    const closePromises = []

    // Close swarm
    if (swarm) {
      swarm.removeAllListeners('connection')
      swarm.removeAllListeners('peer-add')

      closePromises.push(swarm.destroy())
      swarm = null
    }

    // Close my core
    if (myCore) {
      closePromises.push(myCore.close())
      myCore = null
    }

    // Close all peer cores
    try {
      const peerClosePromises = [...peerCores.values()].map((core) =>
        core.close()
      )

      await Promise.all([...closePromises, ...peerClosePromises])
    } catch (e) {
      sendSystemMessage('Error closing peer core: ' + e.message)
    }

    peerCores.clear()

    currentRoom = null
    sendSystemMessage('Left room successfully')
  }

  async function joinRoom(url) {
    await leaveRoom()

    const parsedUrl = new URL(url)
    currentRoom = parsedUrl.searchParams.get('room')

    sendSystemMessage('Joining room: ' + currentRoom)

    const roomDir = Path.join(DOCUMENTS_DIR, currentRoom)
    await FS.promises.mkdir(roomDir, { recursive: true })

    // Each device gets its own writable core
    const deviceId = await getDeviceId()
    myCore = new Hypercore(Path.join(roomDir, `my-messages-${deviceId}`), {
      valueEncoding: 'utf-8'
    })
    await myCore.ready()

    // Setup swarm with room topic
    swarm = new Hyperswarm()
    const topic = crypto.hash(b4a.from(currentRoom))
    swarm.join(topic, {
      server: true,
      client: true
    })

    sendSystemMessage('Joined swarm for room: ' + currentRoom)

    let connectedPeers = new Set()
    function sendSwarmCount() {
      const count = connectedPeers.size + 1 // +1 for self
      rpc.request(RPC_PEER_COUNT).send(b4a.from(String(count)))
    }

    swarm.on('connection', async (conn, info) => {
      sendSystemMessage('🎉 CONNECTION EVENT FIRED!')
      const peerId = b4a.toString(info.publicKey, 'hex')
      connectedPeers.add(peerId)
      sendSwarmCount()

      conn.on('data', async (data) => {
        try {
          const peerKey = data
          const peerKeyHex = b4a.toString(peerKey, 'hex')

          sendSystemMessage('Received peer core key: ' + peerKeyHex)

          // Don't add my own core
          if (b4a.equals(peerKey, myCore.key)) {
            sendSystemMessage('Ignoring my own core key')
            return
          }

          // Check if already tracking
          if (peerCores.has(peerKeyHex)) {
            sendSystemMessage(
              'Already tracking this peer core, replicating on new connection'
            )
            const existingCore = peerCores.get(peerKeyHex)
            existingCore.replicate(conn, { live: true })
            return
          }

          // Create read-only core for peer
          const peerDir = Path.join(roomDir, 'peer-' + peerKeyHex.slice(0, 8))
          await FS.promises.mkdir(peerDir, { recursive: true })

          const peerCore = new Hypercore(
            Path.join(peerDir, 'messages'),
            peerKey,
            {
              valueEncoding: 'utf-8'
            }
          )
          await peerCore.ready()

          peerCores.set(peerKeyHex, peerCore)
          sendSystemMessage('✅ Added peer core: ' + peerKeyHex.slice(0, 8))

          // Replicate their core
          peerCore.replicate(conn, { live: true })
          sendSystemMessage('Started replicating peer core')

          // Watch for their messages
          watchCore(peerCore, false)
        } catch (e) {}
      })

      // Replicate MY writable core
      myCore.replicate(conn, { live: true })
      sendSystemMessage('Started replicating my core')

      // Send my core key after a small delay to ensure listener is ready
      setTimeout(() => {
        conn.write(myCore.key)
        sendSystemMessage('Sent my core key')
      }, 100)

      conn.on('close', () => {
        connectedPeers.delete(peerId)
        sendSwarmCount()
        sendSystemMessage('Peer disconnected')
      })
    })

    // Watch my own core
    watchCore(myCore, true)

    // Send initial count and room ready
    sendSwarmCount()

    const status = rpc.request(RPC_ROOM_READY)
    status.send(b4a.from('connected'))
  }

  function watchCore(core, isMyCore) {
    // Send only existing messages
    let lastIndex = 0
    let syncInterval = null

    const checkMessages = async () => {
      if (!core || core.closed) return

      try {
        await core.update()
        const currentLength = core.length

        if (currentLength > lastIndex) {
          sendSystemMessage(
            `New messages in ${isMyCore ? 'my' : 'peer'} core: ${lastIndex} -> ${currentLength}`
          )

          const newMessages = []
          for (let i = lastIndex; i < currentLength; i++) {
            const entry = await core.get(i)
            const msg = JSON.parse(entry)
            newMessages.push({ ...msg, me: DEVICE_ID === msg.device_id })
          }

          // Sort by timestamp before sending
          newMessages.sort((a, b) => a.ts - b.ts)

          for (const msg of newMessages) {
            const rpcMsg = rpc.request(RPC_NEW_MESSAGE)
            rpcMsg.send(b4a.from(JSON.stringify(msg)))
          }

          lastIndex = currentLength
        }
      } catch (e) {
        sendSystemMessage('Error reading messages: ' + e.message)
      }
    }

    // Initial check
    checkMessages()

    // Add periodic sync - check every 2 seconds
    syncInterval = setInterval(() => {
      checkMessages()
    }, 2000)

    // Clean up interval when core closes
    core.on('close', () => {
      if (syncInterval) {
        clearInterval(syncInterval)
        syncInterval = null
        sendSystemMessage(
          `Stopped sync interval for ${isMyCore ? 'my' : 'peer'} core`
        )
      }
    })
  }
}

;(async () => {
  try {
    await initBackend()
  } catch (e) {
    console.error('Fatal backend error:', e)
  }
})()
