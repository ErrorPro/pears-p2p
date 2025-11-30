export type Message = {
  text: string
  ts: number
  me?: boolean
}

export type PearChatState = {
  messages: Message[]
  peerCount: number
  isConnected: boolean
  isConnecting: boolean
  inviteUrl: string
}

export type PearChatActions = {
  joinRoom: (roomName: string) => void
  sendMessage: (text: string) => void
  leaveRoom: () => void
}
