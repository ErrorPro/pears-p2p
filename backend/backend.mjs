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
  const coreWatchIntervals = new Map() // Track watch intervals to prevent duplicates

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
        try {
          const msg = JSON.parse(b4a.toString(req.data, 'utf8'))
          const deviceId = await getDeviceId()
          msg.device_id = deviceId
          msg.me = true

          await myCore.append(JSON.stringify(msg))
          sendSystemMessage('Message appended to my core')
        } catch (e) {
          sendSystemMessage('Error sending message: ' + e.message)
        }
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
      // Generate fallback ID if all else fails
      DEVICE_ID = crypto.randomBytes(16).toString('hex')
      return DEVICE_ID
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

    // Clear all watch intervals
    for (const interval of coreWatchIntervals.values()) {
      if (interval) {
        clearInterval(interval)
      }
    }
    coreWatchIntervals.clear()

    currentRoom = null
    sendSystemMessage('Left room successfully')
  }

  // Sanitize room name to prevent path traversal
  function sanitizeRoomName(roomName) {
    if (!roomName || typeof roomName !== 'string') {
      return null
    }
    // Remove path traversal sequences and normalize
    const sanitized = roomName
      .replace(/\.\./g, '')
      .replace(/[\/\\]/g, '-')
      .replace(/[^a-zA-Z0-9_-]/g, '')
      .trim()
    return sanitized.length > 0 && sanitized.length <= 64 ? sanitized : null
  }

  async function joinRoom(url) {
    await leaveRoom()

    let parsedUrl
    try {
      parsedUrl = new URL(url)
    } catch (e) {
      sendSystemMessage('Error: Invalid URL format')
      return
    }

    const rawRoom = parsedUrl.searchParams.get('room')
    currentRoom = sanitizeRoomName(rawRoom)

    if (!currentRoom) {
      sendSystemMessage('Error: Invalid or missing room name')
      return
    }

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

      if (!myCore) {
        sendSystemMessage('Error: myCore is null, cannot handle connection')
        conn.destroy()
        return
      }

      let keySendTimeout = null

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
        } catch (e) {
          sendSystemMessage('Error handling peer data: ' + e.message)
        }
      })

      // Replicate MY writable core
      myCore.replicate(conn, { live: true })
      sendSystemMessage('Started replicating my core')

      // Send my core key after a small delay to ensure listener is ready
      keySendTimeout = setTimeout(() => {
        if (!conn.destroyed && myCore) {
          try {
            conn.write(myCore.key)
            sendSystemMessage('Sent my core key')
          } catch (e) {
            sendSystemMessage('Error sending core key: ' + e.message)
          }
        }
        keySendTimeout = null
      }, 100)

      conn.on('close', () => {
        if (keySendTimeout) {
          clearTimeout(keySendTimeout)
          keySendTimeout = null
        }
        connectedPeers.delete(peerId)
        sendSwarmCount()
        sendSystemMessage('Peer disconnected')
      })

      conn.on('error', (err) => {
        sendSystemMessage('Connection error: ' + err.message)
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
    // Prevent watching the same core multiple times
    const coreKey = core.key ? b4a.toString(core.key, 'hex') : 'unknown'
    if (coreWatchIntervals.has(coreKey)) {
      sendSystemMessage('Already watching this core, skipping duplicate watch')
      return
    }

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
            try {
              const entry = await core.get(i)
              const msg = JSON.parse(entry)
              const deviceId = DEVICE_ID || (await getDeviceId())
              newMessages.push({ ...msg, me: deviceId === msg.device_id })
            } catch (e) {
              sendSystemMessage(
                `Error parsing message at index ${i}: ${e.message}`
              )
              // Continue processing other messages
            }
          }

          // Sort by timestamp before sending
          newMessages.sort((a, b) => (a.ts || 0) - (b.ts || 0))

          for (const msg of newMessages) {
            try {
              const rpcMsg = rpc.request(RPC_NEW_MESSAGE)
              rpcMsg.send(b4a.from(JSON.stringify(msg)))
            } catch (e) {
              sendSystemMessage('Error sending message: ' + e.message)
            }
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

    // Track the interval
    coreWatchIntervals.set(coreKey, syncInterval)

    // Clean up interval when core closes
    core.on('close', () => {
      if (syncInterval) {
        clearInterval(syncInterval)
        syncInterval = null
        coreWatchIntervals.delete(coreKey)
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
