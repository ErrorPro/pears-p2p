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
            const msg = JSON.parse(b4a.toString(req.data!, 'utf8')) as Message
            setMessages((prev) =>
              [...prev, { ...msg }].sort((a, b) => a.ts - b.ts)
            )
          } catch (e) {
            console.error('Parse error:', e)
          }
          break

        case RPC_PEER_COUNT:
          setPeerCount(Number(b4a.toString(req.data!, 'utf8')))
          break
        case RPC_SYSTEM_MESSAGE:
          console.log('SYSTEM MESSAGE:', b4a.toString(req.data!, 'utf8'))
          break
      }
    })

    rpcRef.current = rpc
    globalRpc = rpc

    return () => {
      worklet?.terminate()
      globalRpc = null
      worklet = null
    }
  }, [])

  const joinRoom = useCallback(
    (roomName: string) => {
      if (!globalRpc) return
      const name = roomName.trim()
      if (!name) return

      const url = `pear://chat/?room=${encodeURIComponent(name)}`
      setInviteUrl(name)
      setIsConnecting(true)
      setIsConnected(false)
      setMessages([])
      setPeerCount(0)

      globalRpc.request(RPC_JOIN_ROOM).send(b4a.from(url))
    },
    [setInviteUrl, setIsConnecting, setIsConnected, setMessages, setPeerCount]
  )

  const sendMessage = useCallback(
    (text: string) => {
      if (!globalRpc || !isConnected) return
      const trimmed = text.trim()
      if (!trimmed) return
      const msg: Message = { text: trimmed, ts: Date.now() }
      globalRpc.request(RPC_SEND_MESSAGE).send(b4a.from(JSON.stringify(msg)))
    },
    [isConnected]
  )

  const leaveRoom = useCallback(() => {
    if (!globalRpc) return

    globalRpc.request(RPC_LEAVE_ROOM).send(b4a.from(''))

    setIsConnected(false)
    setIsConnecting(false)
    setMessages([])
    setPeerCount(0)
    setInviteUrl('')
  }, [setIsConnected, setIsConnecting, setMessages, setPeerCount, setInviteUrl])

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
