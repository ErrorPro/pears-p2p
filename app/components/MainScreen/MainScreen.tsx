import React from 'react'
import { View, StatusBar } from 'react-native'
import { usePearChat } from '../PearChatProvider'
import { JoinScreen } from '../JoinScreen'
import { RoomScreen } from '../RoomScreen'

export function MainScreen() {
  const { isConnected } = usePearChat()

  return (
    <View style={{ flex: 1 }}>
      {isConnected ? <RoomScreen /> : <JoinScreen />}
    </View>
  )
}
