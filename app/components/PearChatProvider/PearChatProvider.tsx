import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  ReactNode,
  useCallback,
  useMemo
} from 'react'
import { Worklet } from 'react-native-bare-kit'
import RPC from 'bare-rpc'
import b4a from 'b4a'
import * as FileSystem from 'expo-file-system'

import bundle from '../../app.bundle.mjs'
import {
  RPC_JOIN_ROOM,
  RPC_ROOM_READY,
  RPC_NEW_MESSAGE,
  RPC_SEND_MESSAGE,
  RPC_LEAVE_ROOM,
  RPC_PEER_COUNT,
  RPC_SYSTEM_MESSAGE
  // TODO: absolut imports
} from '../../../rpc-commands.mjs'
import { Message, PearChatState, PearChatActions } from './types'

type PearChatContextValue = PearChatState & PearChatActions

const PearChatContext = createContext<PearChatContextValue | undefined>(
  undefined
)

let globalRpc: any = null
let worklet: Worklet | null = null

export const PearChatProvider = ({ children }: { children: ReactNode }) => {
  const [messages, setMessages] = useState<Message[]>([])
  const [peerCount, setPeerCount] = useState(0)
  const [isConnected, setIsConnected] = useState(false)
  const [isConnecting, setIsConnecting] = useState(false)
  const [inviteUrl, setInviteUrl] = useState('')

  const rpcRef = useRef<any>(null)

  useEffect(() => {
    if (globalRpc) {
      rpcRef.current = globalRpc
      return
    }

    try {
      worklet = new Worklet()

      const docDirRaw = String(FileSystem.Paths.document.uri)
      const docDir = docDirRaw.replace(/^file:\/\//, '').replace(/\/$/, '')

      worklet.start('/app.bundle', bundle, [docDir, 'chat-4'])

      const { IPC } = worklet

      const rpc = new RPC(IPC, (req: any) => {
        switch (req.command) {
          case RPC_ROOM_READY:
            setIsConnected(true)
            setIsConnecting(false)
            break

          case RPC_NEW_MESSAGE:
            try {
              const msg: Message = JSON.parse(b4a.toString(req.data!, 'utf8'))

              if (msg) {
                setMessages((prev) => {
                  const newMessages = [...prev, msg]
                  return newMessages.sort((a, b) => a.ts - b.ts)
                })
              } else {
                console.error('Invalid message format:', msg)
              }
            } catch (e) {
              console.error('Parse error:', e)
            }
            break

          case RPC_PEER_COUNT:
            try {
              const countStr = b4a.toString(req.data!, 'utf8')
              const count = Number(countStr)
              if (!isNaN(count) && count >= 0) {
                setPeerCount(count)
              }
            } catch (e) {
              console.error('Error parsing peer count:', e)
            }
            break
          case RPC_SYSTEM_MESSAGE:
            console.log('SYSTEM MESSAGE:', b4a.toString(req.data!, 'utf8'))
            break
        }
      })

      rpcRef.current = rpc
      globalRpc = rpc
    } catch (e) {
      console.error('Error initializing worklet:', e)
    }

    return () => {
      worklet?.terminate()
      globalRpc = null
      worklet = null
    }
  }, [])

  const joinRoom = useCallback((roomName: string) => {
    if (!globalRpc) return
    const name = roomName.trim()

    if (!name) {
      console.error('Invalid room name:', name)
      return
    }

    try {
      const url = `pear://chat/?room=${encodeURIComponent(name)}`
      setInviteUrl(name)
      setIsConnecting(true)
      setIsConnected(false)
      setMessages([])
      setPeerCount(0)

      globalRpc.request(RPC_JOIN_ROOM).send(b4a.from(url))
    } catch (e) {
      console.error('Error joining room:', e)
      setIsConnecting(false)
    }
  }, [])

  const sendMessage = useCallback(
    (text: string) => {
      if (!globalRpc || !isConnected) return

      const trimmed = text.trim()
      if (!trimmed) return

      try {
        const msg: Message = { text: trimmed, ts: Date.now() }
        globalRpc.request(RPC_SEND_MESSAGE).send(b4a.from(JSON.stringify(msg)))
      } catch (e) {
        console.error('Error sending message:', e)
      }
    },
    [isConnected]
  )

  const leaveRoom = useCallback(() => {
    if (!globalRpc) return

    try {
      globalRpc.request(RPC_LEAVE_ROOM).send(b4a.from(''))
    } catch (e) {
      console.error('Error leaving room:', e)
    }

    setIsConnected(false)
    setIsConnecting(false)
    setMessages([])
    setPeerCount(0)
    setInviteUrl('')
  }, [])

  const value: PearChatContextValue = useMemo(() => {
    return {
      messages,
      peerCount,
      isConnected,
      isConnecting,
      inviteUrl,
      joinRoom,
      sendMessage,
      leaveRoom
    }
  }, [
    messages,
    peerCount,
    isConnected,
    isConnecting,
    inviteUrl,
    joinRoom,
    sendMessage,
    leaveRoom
  ])

  return (
    <PearChatContext.Provider value={value}>
      {children}
    </PearChatContext.Provider>
  )
}

export const usePearChat = (): PearChatContextValue => {
  const context = useContext(PearChatContext)
  if (!context) {
    throw new Error('usePearChat must be used within PearChatProvider')
  }
  return context
}
